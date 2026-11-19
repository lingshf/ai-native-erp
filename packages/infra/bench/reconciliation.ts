import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { availableParallelism, cpus } from "node:os";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { migrationStatusSchema } from "@erp/core/contracts";
import { LegacyImportSnapshot, type ImportChoices } from "../src/legacy/import-plan.ts";
import { checkLegacyReconciliation } from "../src/legacy/reconcile.ts";
import { executeLegacyImport } from "../src/storage/legacy-import.ts";
import { MigrationReader } from "../src/workers/migration-reader.ts";
import { createApi } from "../src/http/index.ts";
import { legacyFixture, openingItemsFile } from "../test/support/legacy-fixture.mjs";

const cleanup: (() => void)[] = [];
const f = legacyFixture({ onTestFinished: (work: () => void) => cleanup.push(work) });
const manifest = f.manifest as ConstructorParameters<typeof LegacyImportSnapshot>[1];
let snapshot: LegacyImportSnapshot | undefined;
try {
  const source = new Database(f.snapshot);
  try {
    source.exec(`DROP TRIGGER immutable_line_insert; PRAGMA cache_size=-8192; BEGIN;
      WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<50009)
      INSERT INTO journals SELECT i,'2026-01-15','Fictional reconciliation Bench','normal','posted',NULL FROM n;
      WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<50009),
        l(line) AS (SELECT 0 UNION ALL SELECT line+1 FROM l WHERE line<19)
      INSERT INTO lines SELECT (i-10)*20+10+line,i,
        CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN '1000' ELSE '4000' END,
        CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN 1 ELSE 0 END,
        CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN 0 ELSE 1 END
      FROM n CROSS JOIN l WHERE i<50009 OR line<14; COMMIT;`);
  } finally {
    source.close();
  }
  const bytes = readFileSync(f.snapshot);
  manifest.ledgers.teaching.bytes = bytes.length;
  manifest.ledgers.teaching.sha256 = createHash("sha256").update(bytes).digest("hex");
  snapshot = new LegacyImportSnapshot(f.target, manifest);
  const target = join(f.directory, "million.sqlite");
  const choices: ImportChoices = {
    drafts: "import-as-draft",
    receipts: "archive-only",
    "source-events": "archive-only",
    "transfer-queue": "archive-only",
    seals: "archive-only",
    audit: "archive-only",
  };
  const start = performance.now();
  await executeLegacyImport(snapshot, { target, choices, openingItems: openingItemsFile() });
  const importMs = performance.now() - start;
  const db = new Database(target, { readonly: true });
  try {
    assert.equal(
      (db.prepare("SELECT count(*) n FROM journal_lines").get() as { n: number }).n,
      1_000_000,
    );
  } finally {
    db.close();
  }
  const rounds: {
    checkMs: number;
    httpSamplesMs: number[];
    httpP95Ms: number;
    reportBytes: number;
  }[] = [];
  for (let round = 0; round < 3; round++) {
    const checkStart = performance.now();
    const report = await checkLegacyReconciliation(snapshot, target);
    const checkMs = performance.now() - checkStart;
    assert.equal(report.verdict, "pending");
    const migration = new MigrationReader(target);
    const api = await createApi({ migration, allowPortZero: true, environment: { ERP_PORT: "0" } });
    try {
      const origin = await api.listen();
      const sample = async () => {
        const start = performance.now();
        const response = await fetch(`${origin}/api/v1/migration`);
        assert.equal(response.status, 200);
        const bytes = await response.text();
        const status = migrationStatusSchema.parse(JSON.parse(bytes));
        assert.equal(status.run?.status, "imported");
        assert.equal(status.run?.report?.verdict, "pending");
        return { ms: performance.now() - start, bytes: Buffer.byteLength(bytes) };
      };
      for (let warmup = 0; warmup < 5; warmup++) await sample();
      const httpSamplesMs: number[] = [];
      let reportBytes = 0;
      for (let sampleIndex = 0; sampleIndex < 50; sampleIndex++) {
        const result = await sample();
        httpSamplesMs.push(result.ms);
        reportBytes = result.bytes;
      }
      const httpP95Ms = [...httpSamplesMs].sort((a, b) => a - b)[47];
      rounds.push({ checkMs, httpSamplesMs, httpP95Ms, reportBytes });
      assert.ok(checkMs < 96_000, "Reconciliation at/over D18 80% guard");
      assert.ok(httpP95Ms < 800, "Stored report HTTP at/over D18 80% guard");
    } finally {
      await api.close();
      await migration.close();
    }
  }
  const evidence = {
    fictional: true,
    lines: 1_000_000,
    importMs,
    rounds,
    thresholds: { checkMs: 120_000, httpP95Ms: 1000, d18Fraction: 0.8 },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      parallelism: availableParallelism(),
    },
    snapshotSha256: snapshot.snapshotSha256,
  };
  const output = process.argv[2];
  if (output) writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  snapshot?.close();
  for (const work of cleanup) work();
}

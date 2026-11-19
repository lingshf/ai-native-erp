import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { LegacyImportSnapshot, legacyImportPlan } from "../../src/legacy/import-plan.ts";
import { executeLegacyImport } from "../../src/storage/legacy-import.ts";
import Database from "better-sqlite3";
import { reportRepository } from "../../src/storage/reports.ts";

// Standalone opt-in Bench, not a PR unit-test timing assertion. Fictional data only.
const directory = mkdtempSync(join(tmpdir(), "erp-legacy-import-bench-"));
const execute = process.argv.includes("--execute");
const targetDirectory = execute
  ? mkdtempSync(join(tmpdir(), "erp-legacy-import-target-bench-"))
  : undefined;
const sourceLines = execute ? 1_000_002 : 1_000_000;
function metadata(file) {
  const hash = createHash("sha256");
  const fd = openSync(join(directory, file), "r");
  const buffer = Buffer.alloc(65536);
  try {
    let length = readSync(fd, buffer, 0, buffer.length, null);
    while (length) {
      hash.update(buffer.subarray(0, length));
      length = readSync(fd, buffer, 0, buffer.length, null);
    }
    return { file, bytes: statSync(join(directory, file)).size, sha256: hash.digest("hex") };
  } finally {
    closeSync(fd);
  }
}
let snapshot;
try {
  for (const [file, fixture] of [
    ["teaching.sqlite", "base.sql"],
    ["erp.sqlite", "enterprise.sql"],
  ]) {
    const db = new DatabaseSync(join(directory, file));
    try {
      db.exec(readFileSync(new URL(`./legacy-data/${fixture}`, import.meta.url), "utf8"));
      if (file === "teaching.sqlite") {
        db.exec(`
          DROP TRIGGER immutable_line_insert;
          PRAGMA cache_size=-8192;
          BEGIN;
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<${execute ? 50009 : 500005})
          INSERT INTO journals SELECT i,'2026-01-15','Fictional Bench','normal','posted',NULL FROM n;
          ${
            execute
              ? `WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<50009),
                l(line) AS (SELECT 0 UNION ALL SELECT line+1 FROM l WHERE line<19)
                INSERT INTO lines SELECT (i-10)*20+10+line,i,
                  CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN '1000' ELSE '4000' END,
                  CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN 1 ELSE 0 END,
                  CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN 0 ELSE 1 END
                FROM n CROSS JOIN l WHERE i<50009 OR line<14;`
              : `WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO lines SELECT i*2,i,'1000',1,0 FROM n;
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO lines SELECT i*2+1,i,'4000',0,1 FROM n;`
          }
          COMMIT;
        `);
        assert.equal(db.prepare("SELECT count(*) AS n FROM lines").get().n, sourceLines);
      }
    } finally {
      db.close();
    }
  }
  const manifest = {
    version: 1,
    status: "verified",
    crossDatabaseAtomic: false,
    ledgers: { teaching: metadata("teaching.sqlite"), enterprise: metadata("erp.sqlite") },
  };
  const start = performance.now();
  snapshot = new LegacyImportSnapshot(directory, manifest);
  const choices = {
    drafts: "import-as-draft",
    receipts: "archive-only",
    "source-events": "archive-only",
    "transfer-queue": "archive-only",
    seals: "archive-only",
    audit: "archive-only",
  };
  let summary, result, trialP95Ms, journals;
  const digest = createHash("sha256");
  if (execute) {
    const target = join(targetDirectory, "target.sqlite");
    result = await executeLegacyImport(
      snapshot,
      { target, choices },
      {
        beforeBatchCommit(batch) {
          const seconds = (performance.now() - start) / 1000;
          assert.ok(seconds <= 600, "Million-line import exceeded time budget.");
          if (batch % 20 === 0)
            console.error(
              JSON.stringify({
                batch,
                seconds,
                peakRssMiB: process.resourceUsage().maxRSS / 1024,
              }),
            );
        },
      },
    );
    const db = new Database(target, { readonly: true });
    try {
      assert.equal(db.prepare("SELECT count(*) n FROM journal_lines").get().n, 1_000_000);
      journals = db.prepare("SELECT count(*) n FROM journal_entries").get().n;
      assert.equal(journals, 50_003);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(db.prepare("SELECT count(*) n FROM receipts").get().n, 0);
      const reports = reportRepository({
        query: async (sql, values = []) => db.prepare(sql).all(...values),
      });
      for (let i = 0; i < 5; i++) await reports.reportBalances("TEACHING", "2026-01", "adjusted");
      const samples = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await reports.reportBalances("TEACHING", "2026-01", "adjusted");
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      trialP95Ms = samples[18];
      assert.ok(trialP95Ms <= 1000, "Imported million-line hot trial exceeded p95 1s.");
    } finally {
      db.close();
    }
  } else {
    for (const event of legacyImportPlan(snapshot, { dryRun: true, choices, batchSize: 5000 })) {
      digest.update(`${JSON.stringify(event)}\n`);
      if (event.type === "summary") summary = event;
    }
    assert.equal(summary.counts["teaching.lines"].source, sourceLines);
    assert.equal(summary.counts["teaching.lines"].mapped, sourceLines);
    assert.equal(summary.executable, true);
  }
  const seconds = (performance.now() - start) / 1000;
  const peakRssMiB = process.resourceUsage().maxRSS / 1024;
  snapshot.close();
  snapshot = undefined;
  assert.deepEqual(
    { teaching: metadata("teaching.sqlite"), enterprise: metadata("erp.sqlite") },
    manifest.ledgers,
  );
  console.log(
    JSON.stringify({
      mode: execute ? "execute" : "dry-run",
      lines: 1_000_000,
      seconds,
      peakRssMiB,
      ...(execute ? { journals, trialP95Ms } : {}),
      ...(execute ? result : { sha256: digest.digest("hex") }),
    }),
  );
  assert.ok(seconds <= (execute ? 600 : 120), "Million-line import exceeded time budget.");
  assert.ok(peakRssMiB <= 512, "Million-line import exceeded 512 MiB peak RSS.");
} finally {
  snapshot?.close();
  rmSync(directory, { recursive: true, force: true });
  if (targetDirectory) rmSync(targetDirectory, { recursive: true, force: true });
}

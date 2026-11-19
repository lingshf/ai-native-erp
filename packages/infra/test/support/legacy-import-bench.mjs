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
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { LegacyImportSnapshot, legacyImportPlan } from "../../src/legacy/import-plan.ts";

// Standalone opt-in Bench, not a PR unit-test timing assertion. Fictional data only.
const directory = mkdtempSync(resolve(".legacy-import-bench-"));
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
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO journals SELECT i,'2026-01-15','Fictional Bench','normal','posted',NULL FROM n;
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO lines SELECT i*2,i,'1000',1,0 FROM n;
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO lines SELECT i*2+1,i,'4000',0,1 FROM n;
          COMMIT;
        `);
        assert.equal(db.prepare("SELECT count(*) AS n FROM lines").get().n, 1_000_000);
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
  let summary;
  const digest = createHash("sha256");
  for (const event of legacyImportPlan(snapshot, {
    dryRun: true,
    choices: {
      drafts: "import-as-draft",
      receipts: "archive-only",
      "source-events": "archive-only",
      "transfer-queue": "archive-only",
      seals: "archive-only",
      audit: "archive-only",
    },
    batchSize: 5000,
  })) {
    digest.update(`${JSON.stringify(event)}\n`);
    if (event.type === "summary") summary = event;
  }
  const seconds = (performance.now() - start) / 1000;
  const peakRssMiB = process.resourceUsage().maxRSS / 1024;
  assert.equal(summary.counts["teaching.lines"].source, 1_000_000);
  assert.equal(summary.counts["teaching.lines"].mapped, 1_000_000);
  snapshot.close();
  snapshot = undefined;
  assert.deepEqual(
    { teaching: metadata("teaching.sqlite"), enterprise: metadata("erp.sqlite") },
    manifest.ledgers,
  );
  console.log(
    JSON.stringify({ lines: 1_000_000, seconds, peakRssMiB, sha256: digest.digest("hex") }),
  );
  assert.ok(seconds <= 120, "Million-line dry-run exceeded 120 seconds.");
  assert.ok(peakRssMiB <= 512, "Million-line dry-run exceeded 512 MiB peak RSS.");
} finally {
  snapshot?.close();
  rmSync(directory, { recursive: true, force: true });
}

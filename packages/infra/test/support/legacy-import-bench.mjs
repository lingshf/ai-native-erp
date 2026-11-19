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
const target = targetDirectory ? join(targetDirectory, "target.sqlite") : undefined;
const originalExec = Database.prototype.exec;
const originalClose = Database.prototype.close;
const profile = {
  commits: 0,
  commitMs: 0,
  commitCpuMs: 0,
  maxCommitMs: 0,
  writerCloseMs: 0,
  queries: {},
};
if (execute) {
  Database.prototype.exec = function (sql) {
    if (this.name !== target || sql !== "COMMIT") return originalExec.call(this, sql);
    const start = performance.now();
    const cpu = process.cpuUsage();
    try {
      return originalExec.call(this, sql);
    } finally {
      const ms = performance.now() - start;
      const used = process.cpuUsage(cpu);
      profile.commits++;
      profile.commitMs += ms;
      profile.commitCpuMs += (used.user + used.system) / 1000;
      profile.maxCommitMs = Math.max(profile.maxCommitMs, ms);
    }
  };
  Database.prototype.close = function () {
    const writer = this.name === target && !this.readonly;
    const start = performance.now();
    try {
      return originalClose.call(this);
    } finally {
      if (writer) profile.writerCloseMs += performance.now() - start;
    }
  };
}
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
  let summary, result, trialP95Ms, journals, importSeconds, integritySeconds;
  const trialSamplesMs = [];
  const cpu = process.cpuUsage();
  const digest = createHash("sha256");
  if (execute) {
    result = await executeLegacyImport(
      snapshot,
      { target, choices },
      {
        beforeBatchCommit(batch) {
          const seconds = (performance.now() - start) / 1000;
          if (batch % 20 === 0)
            console.error(
              JSON.stringify({
                batch,
                seconds,
                peakRssMiB: process.resourceUsage().maxRSS / 1024,
                commitMs: profile.commitMs,
                commitCpuMs: profile.commitCpuMs,
              }),
            );
        },
      },
    );
    importSeconds = (performance.now() - start) / 1000;
    const integrityStart = performance.now();
    const db = new Database(target, { readonly: true });
    try {
      assert.equal(db.prepare("SELECT count(*) n FROM journal_lines").get().n, 1_000_000);
      journals = db.prepare("SELECT count(*) n FROM journal_entries").get().n;
      assert.equal(journals, 50_003);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(db.prepare("SELECT count(*) n FROM receipts").get().n, 0);
      integritySeconds = (performance.now() - integrityStart) / 1000;
      const reports = reportRepository({
        query: async (sql, values = []) => {
          const name = sql.includes("FROM accounts a") ? "balances" : "closing";
          profile.queries[name] ??= {
            calls: 0,
            ms: 0,
            cpuMs: 0,
            maxMs: 0,
            plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values),
          };
          const metric = profile.queries[name];
          const start = performance.now();
          const cpu = process.cpuUsage();
          try {
            return db.prepare(sql).all(...values);
          } finally {
            const ms = performance.now() - start;
            const used = process.cpuUsage(cpu);
            metric.calls++;
            metric.ms += ms;
            metric.cpuMs += (used.user + used.system) / 1000;
            metric.maxMs = Math.max(metric.maxMs, ms);
          }
        },
      });
      for (let i = 0; i < 5; i++) await reports.reportBalances("TEACHING", "2026-01", "adjusted");
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await reports.reportBalances("TEACHING", "2026-01", "adjusted");
        trialSamplesMs.push(performance.now() - start);
      }
      const samples = [...trialSamplesMs].sort((a, b) => a - b);
      trialP95Ms = samples[18];
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
  const used = process.cpuUsage(cpu);
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
      ...(execute
        ? {
            journals,
            trialP95Ms,
            importSeconds,
            integritySeconds,
            trialSamplesMs,
            cpuSeconds: (used.user + used.system) / 1e6,
            profile,
          }
        : {}),
      ...(execute ? result : { sha256: digest.digest("hex") }),
    }),
  );
  assert.ok(seconds <= (execute ? 600 : 120), "Million-line import exceeded time budget.");
  assert.ok(peakRssMiB <= 512, "Million-line import exceeded 512 MiB peak RSS.");
  if (execute) assert.ok(trialP95Ms <= 1000, "Imported million-line hot trial exceeded p95 1s.");
} finally {
  Database.prototype.exec = originalExec;
  Database.prototype.close = originalClose;
  snapshot?.close();
  rmSync(directory, { recursive: true, force: true });
  if (targetDirectory) rmSync(targetDirectory, { recursive: true, force: true });
}

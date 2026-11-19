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
import { basename, join, resolve } from "node:path";
import { availableParallelism, tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { LegacyImportSnapshot, legacyImportPlan } from "../../src/legacy/import-plan.ts";
import { executeLegacyImport } from "../../src/storage/legacy-import.ts";
import { openingItemsFile } from "./legacy-fixture.mjs";
import Database from "better-sqlite3";
import { reportRepository } from "../../src/storage/reports.ts";
import { reportSchema } from "@erp/core/contracts";
import { ProductionChild } from "../../bench/reports.ts";

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
const originalSourceExec = DatabaseSync.prototype.exec;
const limits = {
  seconds: execute ? 480 : 120,
  peakRssMiB: execute ? 409.6 : 512,
  ...(execute ? { httpProcessPeakRssMiB: 409.6, trialP95Ms: 800 } : {}),
};
const profile = {
  commits: 0,
  commitMs: 0,
  commitCpuMs: 0,
  maxCommitMs: 0,
  writerCloseMs: 0,
  walFilePeakBytes: 0,
  shmFilePeakBytes: 0,
  transactions: [],
  closes: [],
  memory: [],
  sourceSqlite: [],
  queries: {},
};
function memory(label) {
  const sample = {
    label,
    batch,
    ...process.memoryUsage(),
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
  };
  profile.memory.push(sample);
  return sample;
}
function sqliteSettings(db) {
  return Object.fromEntries(
    ["cache_size", "page_size", "mmap_size", "wal_autocheckpoint", "temp_store", "cache_spill"].map(
      (key) => {
        const value = Object.values(db.prepare(`PRAGMA ${key}`).get())[0];
        return [key, typeof value === "bigint" ? Number(value) : value];
      },
    ),
  );
}
let phase = "import";
let batch = 0;
let transactionStart;
function observeWal() {
  const bytes = statSync(`${target}-wal`, { throwIfNoEntry: false })?.size ?? 0;
  profile.walFilePeakBytes = Math.max(profile.walFilePeakBytes, bytes);
  profile.shmFilePeakBytes = Math.max(
    profile.shmFilePeakBytes,
    statSync(`${target}-shm`, { throwIfNoEntry: false })?.size ?? 0,
  );
  return bytes;
}
if (execute) {
  DatabaseSync.prototype.exec = function (sql) {
    const result = originalSourceExec.call(this, sql);
    if (sql.startsWith("PRAGMA query_only=ON")) {
      profile.sourceSqlite.push({
        file: basename(this.prepare("PRAGMA database_list").get().file),
        ...sqliteSettings(this),
      });
    }
    return result;
  };
  Database.prototype.exec = function (sql) {
    if (this.name !== target) {
      const result = originalExec.call(this, sql);
      if (sql === "COMMIT" && basename(this.name) === "plan.sqlite") {
        profile.stageSqlite = sqliteSettings(this);
        memory("staged");
      }
      return result;
    }
    if (sql === "BEGIN IMMEDIATE") transactionStart = performance.now();
    if (sql !== "COMMIT") return originalExec.call(this, sql);
    const walBeforeBytes = observeWal();
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
      if (batch === 1) profile.targetSqlite = sqliteSettings(this);
      profile.transactions.push({
        phase,
        batch,
        ms,
        cpuMs: (used.user + used.system) / 1000,
        transactionMs: performance.now() - transactionStart,
        walBeforeBytes,
        walAfterBytes: observeWal(),
      });
    }
  };
  Database.prototype.close = function () {
    const writer = this.name === target && !this.readonly;
    const walBeforeBytes = writer ? observeWal() : 0;
    const start = performance.now();
    const cpu = process.cpuUsage();
    try {
      return originalClose.call(this);
    } finally {
      if (writer) {
        const ms = performance.now() - start;
        const used = process.cpuUsage(cpu);
        profile.writerCloseMs += ms;
        profile.closes.push({
          phase,
          ms,
          cpuMs: (used.user + used.system) / 1000,
          walBeforeBytes,
          walAfterBytes: observeWal(),
        });
        memory(`${phase}-writer-closed`);
      }
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
let snapshot, server;
memory("loaded");
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
  memory("fixture-ready");
  const start = performance.now();
  snapshot = new LegacyImportSnapshot(directory, manifest);
  memory("snapshot-validated");
  const choices = {
    drafts: "import-as-draft",
    receipts: "archive-only",
    "source-events": "archive-only",
    "transfer-queue": "archive-only",
    seals: "archive-only",
    audit: "archive-only",
  };
  let summary, result, trialP95Ms, journals, importSeconds, integritySeconds, http;
  const trialSamplesMs = [];
  const cpu = process.cpuUsage();
  const digest = createHash("sha256");
  if (execute) {
    result = await executeLegacyImport(
      snapshot,
      { target, choices, openingItems: openingItemsFile() },
      {
        beforeBatchCommit(number) {
          batch = number;
          const current = memory("before-commit");
          const seconds = (performance.now() - start) / 1000;
          if (batch % 20 === 0)
            console.error(
              JSON.stringify({
                batch,
                seconds,
                peakRssMiB: process.resourceUsage().maxRSS / 1024,
                commitMs: profile.commitMs,
                commitCpuMs: profile.commitCpuMs,
                walMiB: observeWal() / 1024 ** 2,
                rssMiB: current.rss / 1024 ** 2,
                heapUsedMiB: current.heapUsed / 1024 ** 2,
                heapTotalMiB: current.heapTotal / 1024 ** 2,
                externalMiB: current.external / 1024 ** 2,
              }),
            );
        },
      },
    );
    importSeconds = (performance.now() - start) / 1000;
    memory("import-returned");
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
      await reports.reportBalances("TEACHING", "2026-01", "adjusted");
    } finally {
      db.close();
    }
    phase = "http-preparation";
    const preparation = new Database(target);
    try {
      const sequence = preparation.prepare("SELECT value FROM write_seq WHERE id=1").get().value;
      // Only this disposable synthetic fixture is marked reconciled; runtime admission stays intact.
      assert.equal(
        preparation
          .prepare(
            "UPDATE legacy_import_runs SET status='reconciled' WHERE id=? AND tool='legacy.import.v2' AND status='imported'",
          )
          .run(result.runId).changes,
        1,
      );
      assert.equal(
        preparation.prepare("SELECT value FROM write_seq WHERE id=1").get().value,
        sequence,
      );
    } finally {
      preparation.close();
    }
    phase = "http";
    const readers = Math.max(2, Math.min(3, availableParallelism() - 1));
    const startup = performance.now();
    server = await ProductionChild.start(target, resolve("."), "candidate", readers);
    const startupMs = performance.now() - startup;
    const httpMemory = { startup: await server.control("memory") };
    memory("http-started");
    async function readTrial() {
      const response = await server.read(
        "reports/trial?company=TEACHING&month=2026-01&stage=adjusted",
        reportSchema,
      );
      assert.equal(response.data.company, "TEACHING");
      assert.equal(response.data.month, "2026-01");
      assert.equal(response.data.stage, "adjusted");
      assert.equal(response.data.watermark, journals);
      assert.ok(response.data.trial.debit > 0);
      assert.equal(response.data.trial.debit, response.data.trial.credit);
      assert.equal(response.data.reconciliation.allPass, true);
      return response.ms;
    }
    const coldRequestMs = await readTrial();
    for (let i = 0; i < 5; i++) await readTrial();
    httpMemory.warmed = await server.control("memory");
    const guard = await server.control("start");
    assert.equal(guard.guarded, true);
    assert.equal(guard.nativeLoads, 0);
    try {
      for (let i = 0; i < 50; i++) trialSamplesMs.push(await readTrial());
    } finally {
      http = {
        readers,
        startupMs,
        coldRequestMs,
        warmup: 5,
        samples: 50,
        guard,
        window: await server.control("stop"),
        memory: { ...httpMemory, sampled: await server.control("memory") },
      };
    }
    const trace = await server.control("trace");
    assert.equal(trace.nativeLoads, 0);
    assert.equal(trace.readerWorkerIds.length, readers);
    http.readerWorkerIds = trace.readerWorkerIds;
    const samples = [...trialSamplesMs].sort((a, b) => a - b);
    trialP95Ms = samples[Math.ceil(samples.length * 0.95) - 1];
    memory("http-sampled");
    await server.close();
    server = undefined;
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
      limits,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        parallelism: availableParallelism(),
      },
      sourceSha256: {
        teaching: manifest.ledgers.teaching.sha256,
        enterprise: manifest.ledgers.enterprise.sha256,
      },
      ...(execute
        ? {
            journals,
            trialP95Ms,
            importSeconds,
            integritySeconds,
            trialSamplesMs,
            http,
            cpuSeconds: (used.user + used.system) / 1e6,
            profile,
          }
        : {}),
      ...(execute ? result : { sha256: digest.digest("hex") }),
    }),
  );
  assert.ok(seconds <= limits.seconds, "Million-line import exceeded time acceptance limit.");
  assert.ok(peakRssMiB < limits.peakRssMiB, "Million-line import exceeded RSS acceptance limit.");
  if (execute) {
    assert.ok(trialP95Ms <= limits.trialP95Ms, "Hot HTTP trial exceeded p95 acceptance limit.");
    assert.ok(
      http.memory.sampled.peakRssMiB < limits.httpProcessPeakRssMiB,
      "Production HTTP process exceeded RSS acceptance limit.",
    );
  }
} finally {
  Database.prototype.exec = originalExec;
  Database.prototype.close = originalClose;
  DatabaseSync.prototype.exec = originalSourceExec;
  await server?.close();
  snapshot?.close();
  rmSync(directory, { recursive: true, force: true });
  if (targetDirectory) rmSync(targetDirectory, { recursive: true, force: true });
}

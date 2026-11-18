import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setImmediate as immediate } from "node:timers/promises";
import Database from "better-sqlite3";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";
import { targetStorage } from "../../src/storage/core.ts";
import { barrier, plan, scope } from "./storage-contract.mjs";

export function sqliteCases(directory) {
  let serial = 0;
  const config = () => ({ filename: resolve(directory, `sqlite-case-${serial++}.sqlite`) });
  async function ready(configuration = config()) {
    const storage = createSqliteStorage(configuration);
    await storage.migrate();
    await storage.provision(scope);
    return storage;
  }

  test("normalized UNC and device filenames are rejected without filesystem probes", () => {
    for (const filename of [
      "//srv/share/never-open.sqlite",
      "\\\\srv\\share\\never-open.sqlite",
      "//?/C:/never-open.sqlite",
      "//./C:/never-open.sqlite",
      "\\\\?\\C:\\never-open.sqlite",
      "\\\\.\\C:\\never-open.sqlite",
      "/??/C:/never-open.sqlite",
      "\\??\\C:\\never-open.sqlite",
    ])
      assert.throws(() => createSqliteStorage({ filename }), { code: "INVALID_INPUT" });
  });

  test("construction is inert and unknown files rejected before opening/writable PRAGMA", async () => {
    const c = config();
    const storage = createSqliteStorage(c);
    try {
      await assert.rejects(readFile(c.filename), { code: "ENOENT" });
      await assert.rejects(storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
      await assert.rejects(readFile(c.filename), { code: "ENOENT" });
      assert.throws(() => createSqliteStorage({ filename: "relative.sqlite" }), {
        code: "INVALID_INPUT",
      });
    } finally {
      await storage.close();
    }
    const old = config();
    const db = new Database(old.filename);
    db.exec(
      "CREATE TABLE protected_original(value TEXT); INSERT INTO protected_original VALUES('untouched fixture')",
    );
    db.close();
    const digest = async () =>
      createHash("sha256")
        .update(await readFile(old.filename))
        .digest("hex");
    const before = await digest();
    const names = await readdir(directory);
    const refused = createSqliteStorage(old);
    try {
      await assert.rejects(refused.verifySchema(), { code: "SCHEMA_MISMATCH" });
      await assert.rejects(refused.migrate(), { code: "SCHEMA_MISMATCH" });
      assert.equal(await digest(), before);
      assert.deepEqual(await readdir(directory), names);
    } finally {
      await refused.close();
    }
    const empty = config();
    await writeFile(empty.filename, "");
    const emptyStorage = createSqliteStorage(empty);
    try {
      await assert.rejects(emptyStorage.migrate(), { code: "SCHEMA_MISMATCH" });
    } finally {
      await emptyStorage.close();
    }
  });

  test("namespace is persisted in DELETE main header before WAL; incomplete restart needs explicit migration", async () => {
    const c = config();
    const backend = sqliteBackend(c);
    const connection = await backend.acquire(false, true);
    const header = await readFile(c.filename);
    assert.equal(header.readUInt32BE(68), 0x45525032);
    await connection.release();
    await backend.close();
    const storage = createSqliteStorage(c);
    try {
      await assert.rejects(storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
      await assert.rejects(storage.provision(scope), { code: "SCHEMA_MISMATCH" });
      await storage.migrate();
      await storage.verifySchema();
    } finally {
      await storage.close();
    }
    const reopen = createSqliteStorage(c);
    try {
      await reopen.verifySchema();
    } finally {
      await reopen.close();
    }
  });

  test("concurrent explicit initialization has one owner or bounded BUSY, repeated migration is inert", async () => {
    const c = config();
    const first = createSqliteStorage(c);
    const second = createSqliteStorage(c);
    try {
      const results = await Promise.allSettled([first.migrate(), second.migrate()]);
      assert.ok(results.some((result) => result.status === "fulfilled"));
      for (const result of results)
        if (result.status === "rejected") assert.equal(result.reason.code, "BUSY");
      await first.migrate();
      await second.migrate();
      await first.verifySchema();
      await second.verifySchema();
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("read mutex spans WAL snapshots, separate writer remains independent", async () => {
    const storage = await ready();
    const r1Entered = barrier();
    const r1Exit = barrier();
    const r2Entered = barrier();
    const r2Exit = barrier();
    let r2Started = false;
    try {
      const r1 = storage.read(scope, async (s) => {
        assert.equal(await s.revisions.get(scope), 0);
        r1Entered.release();
        await r1Exit.promise;
        assert.equal(await s.revisions.get(scope), 0);
        assert.equal(r2Started, false);
      });
      await r1Entered.promise;
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
      const r2 = storage.read(scope, async (s) => {
        r2Started = true;
        assert.equal(await s.revisions.get(scope), 1);
        r2Entered.release();
        await r2Exit.promise;
        assert.equal(await s.revisions.get(scope), 1);
      });
      r1Exit.release();
      await r1;
      await r2Entered.promise;
      await storage.write(plan, (s) => s.revisions.advance(scope, 1));
      r2Exit.release();
      await r2;
      assert.equal(await storage.read(scope, (s) => s.revisions.get(scope)), 2);
    } finally {
      r1Exit.release();
      r2Exit.release();
      await storage.close();
    }
  });

  for (const kind of ["read", "write"]) {
    test(`${kind} queue bounded to 64 waiters and close rejects queued work`, async () => {
      const storage = await ready();
      const entered = barrier();
      const exit = barrier();
      const run = (work) =>
        kind === "read" ? storage.read(scope, work) : storage.write(plan, work);
      const held = run(async () => {
        entered.release();
        await exit.promise;
      });
      await entered.promise;
      const queued = Array.from({ length: 64 }, () => run(() => undefined));
      const settled = Promise.allSettled(queued);
      await immediate();
      await assert.rejects(
        run(() => undefined),
        { code: "BUSY" },
      );
      const closing = storage.close();
      exit.release();
      await held;
      await closing;
      assert.equal(
        (await settled).every(
          (result) => result.status === "rejected" && result.reason.code === "CLOSED",
        ),
        true,
      );
    });
    test(`${kind} queue has one-second wait budget, separate from callback budget`, async () => {
      const storage = await ready();
      const entered = barrier();
      const exit = barrier();
      const run = (work) =>
        kind === "read" ? storage.read(scope, work) : storage.write(plan, work);
      const held = run(async () => {
        entered.release();
        await exit.promise;
      });
      await entered.promise;
      const start = performance.now();
      try {
        await assert.rejects(
          run(() => assert.fail("expired waiter entered callback")),
          { code: "BUSY" },
        );
        console.info(JSON.stringify({ kind, queueElapsedMs: performance.now() - start }));
      } finally {
        exit.release();
        await held;
        await storage.close();
      }
    });
  }

  test("new target connections use WAL, NORMAL, foreign keys and a five-second busy timeout", async () => {
    const c = config();
    const storage = await ready(c);
    const backend = sqliteBackend(c);
    try {
      for (const readOnly of [false, true]) {
        const connection = await backend.acquire(readOnly, false);
        try {
          for (const [name, expected] of [
            ["journal_mode", "wal"],
            ["synchronous", 1n],
            ["foreign_keys", 1n],
            ["busy_timeout", 5000n],
          ])
            assert.equal(
              Object.values((await connection.query(`PRAGMA ${name}`))[0])[0],
              expected,
              name,
            );
        } finally {
          await connection.release();
        }
      }
    } finally {
      await backend.close();
      await storage.close();
    }
  });

  test("external BEGIN IMMEDIATE contention returns BUSY without replay and recovers after release", async () => {
    const c = config();
    const original = await ready(c);
    await original.close();
    const raw = new Database(c.filename);
    raw.pragma("busy_timeout=0");
    raw.exec("BEGIN IMMEDIATE");
    const backend = sqliteBackend(c);
    let attempts = 0;
    const storage = targetStorage({
      ...backend,
      async acquire(...args) {
        const connection = await backend.acquire(...args);
        // Exercise BUSY without spending the production five-second wait budget in CI.
        await connection.query("PRAGMA busy_timeout=1");
        return {
          ...connection,
          async begin(...settings) {
            attempts++;
            return connection.begin(...settings);
          },
        };
      },
    });
    const start = performance.now();
    try {
      await assert.rejects(
        storage.write(plan, () => assert.fail("BUSY transaction entered callback")),
        { code: "BUSY" },
      );
      assert.equal(attempts, 1);
      console.info(
        JSON.stringify({ beginAttempts: attempts, elapsedMs: performance.now() - start }),
      );
      raw.exec("ROLLBACK");
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
    } finally {
      if (raw.inTransaction) raw.exec("ROLLBACK");
      raw.close();
      await storage.close();
    }
  });

  test("bounded local statements and event loop timing evidence (not a hard realtime claim)", async () => {
    const c = config();
    const backend = sqliteBackend(c);
    const durations = [];
    const storage = targetStorage({
      ...backend,
      async acquire(...args) {
        const connection = await backend.acquire(...args);
        return {
          ...connection,
          async query(...query) {
            const start = performance.now();
            try {
              return await connection.query(...query);
            } finally {
              durations.push(performance.now() - start);
            }
          },
        };
      },
    });
    const lag = monitorEventLoopDelay({ resolution: 1 });
    lag.enable();
    try {
      await storage.migrate();
      await storage.provision(scope);
      await immediate();
      for (let batch = 0; batch < 5; batch++) {
        await storage.write(plan, async (s) => {
          for (let row = 0; row < 20; row++)
            await s.audit.append({
              scope,
              operation: "adapter.contract",
              reference: `${batch}-${row}`,
              principal: "contract-user",
              details: { row },
            });
        });
        await immediate();
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      console.info(
        JSON.stringify({
          boundedRows: 100,
          measuredQueryCount: durations.length,
          maxQueryMs: Math.max(...durations),
          eventLoopMaxMs: lag.max / 1e6,
          note: "awaited driver query timing includes scheduling; synchronous native IO is not cancellable realtime",
        }),
      );
    } finally {
      lag.disable();
      await storage.close();
    }
  });
}

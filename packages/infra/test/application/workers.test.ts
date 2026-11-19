import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { channel } from "node:diagnostics_channel";
import { spawnSync } from "node:child_process";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { accountsPageSchema, errorSchema, reportSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { SqliteExecutor } from "../../src/workers/executor.ts";
import type { SchedulerEvent } from "../../src/workers/protocol.ts";
import { createApi } from "../../src/http/index.ts";

let directory: string;
let executor: SqliteExecutor;
let api: Awaited<ReturnType<typeof createApi>>;
let base: string;
const gate = new Int32Array(new SharedArrayBuffer(8));
const events: SchedulerEvent[] = [];
const diagnostics = channel("erp.sqlite.scheduler");
const observe = (value: unknown) => events.push(value as SchedulerEvent);
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-worker-test-"));
  const filename = join(directory, "ledger.sqlite");
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  gate.fill(0);
  events.length = 0;
  diagnostics.subscribe(observe);
  executor = await SqliteExecutor.create({
    filename,
    readers: 2,
    testGate: gate.buffer as SharedArrayBuffer,
  });
  await executor.execute("masterData", "initialize", [2026]);
  api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    ...executor.services(),
    logError: () => {},
  });
  base = await api.listen();
});
afterEach(async () => {
  Atomics.store(gate, 1, 1);
  Atomics.notify(gate, 1);
  await api?.close();
  await executor?.close();
  diagnostics.unsubscribe(observe);
  await rm(directory, { recursive: true, force: true });
});
it("reserves a read worker for real HTTP SQLite light reads while a signalled heavy SQLite query runs", async () => {
  const path = `${base}/api/v1/reports/trial?company=DEFAULT&month=2026-01`;
  const first = fetch(path);
  const second = fetch(path);
  await vi.waitFor(
    () => {
      expect(Atomics.load(gate, 0)).toBe(1);
      expect(events.some((event) => event.runningHeavy === 1 && event.queuedHeavy === 1)).toBe(
        true,
      );
    },
    { interval: 1 },
  );
  const health = await fetch(`${base}/api/v1/health`);
  expect(health.status).toBe(200);
  await health.arrayBuffer();
  const accounts = await fetch(`${base}/api/v1/accounts?company=DEFAULT&limit=5`);
  expect(accounts.status).toBe(200);
  expect(accountsPageSchema.parse(await accounts.json()).items).toHaveLength(5);
  expect(Atomics.load(gate, 0)).toBe(1);
  const starts = events.filter((event) => event.event === "start" && event.lane === "heavy");
  expect(starts).toHaveLength(1);
  const lightFinished = events.find((event) => event.event === "finish" && event.lane === "light");
  expect(lightFinished).toBeDefined();
  expect(lightFinished?.workerId).not.toBe(starts[0]?.workerId);
  Atomics.store(gate, 1, 1);
  Atomics.notify(gate, 1);
  for (const response of await Promise.all([first, second])) {
    expect(response.status).toBe(200);
    expect(reportSchema.parse(await response.json()).reconciliation.allPass).toBe(true);
  }
  const guard = new URL("../../src/workers/main-thread-guard.ts", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(guard)}); const {createRequire}=await import('node:module'); try {createRequire(import.meta.url)('better-sqlite3'); process.exitCode=1;} catch(error) {if(error.message!=='SQLite is restricted to storage workers') throw error;}`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
}, 15000);
it("returns a safe HTTP 503 after writer loss without replay, then rebuilds and accepts the next write", async () => {
  await executor.terminateWriterForTest();
  const command = {
    code: "RECOVER",
    name: "Synthetic",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual",
  };
  const write = () =>
    fetch(`${base}/api/v1/companies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
  const failed = await write();
  expect(failed.status).toBe(503);
  expect(errorSchema.parse(await failed.json())).toMatchObject({
    code: "UNAVAILABLE",
    retryable: true,
  });
  const recovered = await write();
  expect(recovered.status).toBe(201);
  expect(await recovered.json()).toMatchObject({ code: "RECOVER", revision: 1 });
  const accounts = await fetch(`${base}/api/v1/accounts?company=RECOVER&limit=5`);
  expect(accounts.status).toBe(200);
  expect(accountsPageSchema.parse(await accounts.json()).items).toHaveLength(5);
}, 15000);

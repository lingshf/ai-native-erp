// TORD-03 / PG-05: hot-read p95 of GET /api/v1/trade/orders on 10,000 synthetic orders with
// 1–20 lines each. Standalone evidence (not part of the PR fast suite):
//   node packages/infra/bench/trade-order-list.ts
// The seed writes only the two order tables directly, with foreign keys off on the seeding
// connection (no parties, products or tax codes are needed by the list read path).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MasterDataService } from "@erp/core/application";
import { tradeOrderPageSchema } from "@erp/core/contracts";
import { createApi } from "../src/http/index.ts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { tradeOrderPageSql } from "../src/storage/trade-documents.ts";
import { SqliteExecutor } from "../src/workers/executor.ts";

const orders = 10_000;
const warmups = 10;
const samples = 60;
const budgetMs = 1_000;
const limit = 100;
const orderId = (index: number) => `PO-${String(index).padStart(6, "0")}`;

// Deterministic 1–20 lines per order.
const lineCount = (index: number) => 1 + ((index * 7919) % 20);

async function seed(filename: string) {
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const store = createMasterDataStore({ filename });
  try {
    await new MasterDataService(store).initialize(2026);
  } finally {
    await store.close();
  }
  const db = new Database(filename);
  let lines = 0;
  try {
    db.pragma("foreign_keys = OFF");
    const order = db.prepare(
      `INSERT INTO trade_orders VALUES('DEFAULT',?,?,?,'CNY','2026-01-15',0,'line',?,'2026-01-15T08:00:00.000Z')`,
    );
    const line = db.prepare(
      `INSERT INTO trade_order_lines VALUES('DEFAULT',?,?,?,'EXPENSE','VAT','1','100','0','0',10000,1300,11300)`,
    );
    db.transaction(() => {
      for (let index = 0; index < orders; index++) {
        const id = orderId(index);
        const side = index % 2 ? "AR" : "AP";
        order.run(id, side, side === "AP" ? "V1" : "C1", "a".repeat(64));
        for (let n = 1; n <= lineCount(index); n++) {
          line.run(id, `L${n}`, n);
          lines++;
        }
      }
    })();
  } finally {
    db.close();
  }
  return lines;
}

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.ceil(sorted.length * fraction) - 1] as number;
}

async function measure(origin: string, path: string) {
  const once = async () => {
    const started = performance.now();
    const response = await fetch(`${origin}${path}`);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    const page = tradeOrderPageSchema.parse(JSON.parse(text));
    return { ms: performance.now() - started, page, bytes: Buffer.byteLength(text) };
  };
  for (let index = 0; index < warmups; index++) await once();
  const rawMs: number[] = [];
  let last: Awaited<ReturnType<typeof once>> | undefined;
  for (let index = 0; index < samples; index++) {
    last = await once();
    rawMs.push(last.ms);
  }
  const sorted = [...rawMs].sort((a, b) => a - b);
  assert.ok(last);
  return {
    path,
    warmups,
    samples,
    items: last.page.items.length,
    firstOrderId: last.page.items[0]?.orderId,
    nextCursor: last.page.nextCursor,
    responseBytes: last.bytes,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    maxMs: Number((sorted.at(-1) as number).toFixed(2)),
    budgetMs,
    pass: percentile(sorted, 0.95) <= budgetMs,
    rawMs: rawMs.map((value) => Number(value.toFixed(2))),
  };
}

const directory = await mkdtemp(join(tmpdir(), "erp-tord03-bench-"));
try {
  const filename = join(directory, "ledger.sqlite");
  const seededAt = performance.now();
  const lines = await seed(filename);
  console.info(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      release: release(),
      cpu: cpus()[0]?.model,
      orders,
      lines,
      seedMs: Math.round(performance.now() - seededAt),
    }),
  );
  const raw = new Database(filename, { readonly: true });
  try {
    for (const cursor of ["", orderId(9_500)])
      console.info(
        JSON.stringify({
          plan: cursor ? "continuation" : "first",
          detail: raw
            .prepare(`EXPLAIN QUERY PLAN ${tradeOrderPageSql}`)
            .all("DEFAULT", cursor, limit + 1)
            .map((row) => (row as { detail: string }).detail),
        }),
      );
  } finally {
    raw.close();
  }
  const executor = await SqliteExecutor.create({ filename, readers: 2 });
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    ...executor.services(),
    logError: () => undefined,
  });
  try {
    const origin = new URL(await api.listen()).origin;
    const results = [
      await measure(origin, `/api/v1/trade/orders?company=DEFAULT&limit=${limit}`),
      // Deep continuation: cursor at order 9,500 of 10,000 (inside the last 10%).
      await measure(
        origin,
        `/api/v1/trade/orders?company=DEFAULT&limit=${limit}&cursor=${orderId(9_500)}`,
      ),
    ];
    for (const result of results) console.info(JSON.stringify(result));
    assert.equal(results[0]?.firstOrderId, orderId(0));
    assert.equal(results[1]?.firstOrderId, orderId(9_501));
    assert.ok(results.every((result) => result.items === limit && result.pass));
  } finally {
    await api.close();
    await executor.close();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

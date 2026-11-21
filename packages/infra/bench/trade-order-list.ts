// TORD-03 / TORD-05 / PG-05: hot-read p95 of GET /api/v1/trade/orders on 10,000 synthetic orders
// with 1–20 lines each, unfiltered and filtered. Standalone evidence (not part of the PR fast suite):
//   node packages/infra/bench/trade-order-list.ts
// The seed writes only the two order tables directly, with foreign keys off on the seeding
// connection (no parties, products or tax codes are needed by the list read path).
// TORD-05 fixture (deterministic, by order index n = 1..10,000, orderId PO-00000n):
//   party: P01 when n % 100 === 0 (exactly 100 orders, evenly spread), otherwise P02..P50 as
//          P{2 + n % 49}; 50 parties in total;
//   side:  AP for odd n, AR for even n (alternating by orderId);
//   date:  2026-12-15 for n > 9,950 (PO-009951..PO-010000, the 50 largest orderIds), otherwise
//          2026-01-01 + ((n - 1) % 334) days, i.e. within 2026-01-01..2026-11-30.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MasterDataService, type TradeOrderListQuery } from "@erp/core/application";
import { tradeOrderPageSchema } from "@erp/core/contracts";
import { createApi } from "../src/http/index.ts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { tradeOrderPageStatement } from "../src/storage/trade-documents.ts";
import { SqliteExecutor } from "../src/workers/executor.ts";

const orders = 10_000;
const warmups = 10;
const samples = 60;
const budgetMs = 1_000;
const limit = 100;
const orderId = (index: number) => `PO-${String(index).padStart(6, "0")}`;

// Deterministic 1–20 lines per order.
const lineCount = (index: number) => 1 + ((index * 7919) % 20);
const partyOf = (index: number) =>
  index % 100 === 0 ? "P01" : `P${String(2 + (index % 49)).padStart(2, "0")}`;
const sideOf = (index: number) => (index % 2 ? "AP" : "AR");
const dateOf = (index: number) =>
  index > 9_950
    ? "2026-12-15"
    : new Date(Date.UTC(2026, 0, 1 + ((index - 1) % 334))).toISOString().slice(0, 10);

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
      `INSERT INTO trade_orders VALUES('DEFAULT',?,?,?,'CNY',?,0,'line',?,'2026-01-15T08:00:00.000Z')`,
    );
    const line = db.prepare(
      `INSERT INTO trade_order_lines VALUES('DEFAULT',?,?,?,'EXPENSE','VAT','1','100','0','0',10000,1300,11300)`,
    );
    db.transaction(() => {
      for (let index = 1; index <= orders; index++) {
        const id = orderId(index);
        order.run(id, sideOf(index), partyOf(index), dateOf(index), "a".repeat(64));
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

interface Scenario {
  readonly name: string;
  readonly query: TradeOrderListQuery;
  readonly expected: {
    readonly items: number;
    readonly first: string;
    readonly next: string | null;
  };
}
const pathOf = ({ query }: Scenario) => {
  const params = new URLSearchParams({ company: "DEFAULT", limit: String(query.limit) });
  for (const key of ["cursor", "party", "side", "from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) params.set(key, value);
  }
  return `/api/v1/trade/orders?${params}`;
};

async function measure(origin: string, scenario: Scenario) {
  const path = pathOf(scenario);
  const once = async () => {
    const started = performance.now();
    const response = await fetch(`${origin}${path}`);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    const page = tradeOrderPageSchema.parse(JSON.parse(text));
    return { ms: performance.now() - started, page, bytes: Buffer.byteLength(text) };
  };
  // The page must be the expected one before anything is timed (scenario (c) scans to the end).
  const check = (page: Awaited<ReturnType<typeof once>>["page"]) => {
    assert.equal(page.items.length, scenario.expected.items, scenario.name);
    assert.equal(page.items[0]?.orderId, scenario.expected.first, scenario.name);
    assert.equal(page.nextCursor, scenario.expected.next, scenario.name);
  };
  check((await once()).page);
  for (let index = 0; index < warmups; index++) await once();
  const rawMs: number[] = [];
  let last: Awaited<ReturnType<typeof once>> | undefined;
  for (let index = 0; index < samples; index++) {
    last = await once();
    rawMs.push(last.ms);
  }
  const sorted = [...rawMs].sort((a, b) => a - b);
  assert.ok(last);
  check(last.page);
  return {
    scenario: scenario.name,
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

// Deep continuation: cursor at order 9,500 of 10,000 (inside the last 10%).
const deep = orderId(9_500);
const scenarios: readonly Scenario[] = [
  {
    name: "(a) party=P01 first page",
    query: { limit, party: "P01" },
    expected: { items: 100, first: orderId(100), next: null },
  },
  {
    name: "(b) side=AR deep continuation",
    query: { limit, side: "AR", cursor: deep },
    expected: { items: 100, first: orderId(9_502), next: orderId(9_700) },
  },
  {
    name: "(c) December date long scan, limit 100",
    query: { limit, from: "2026-12-01", to: "2026-12-31" },
    expected: { items: 50, first: orderId(9_951), next: null },
  },
  {
    name: "(d) unfiltered first page",
    query: { limit },
    expected: { items: 100, first: orderId(1), next: orderId(100) },
  },
  {
    name: "(d) unfiltered deep continuation",
    query: { limit, cursor: deep },
    expected: { items: 100, first: orderId(9_501), next: orderId(9_600) },
  },
];

const directory = await mkdtemp(join(tmpdir(), "erp-tord05-bench-"));
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
    const fixture = raw
      .prepare(
        "SELECT count(DISTINCT party_id) AS parties,sum(party_id='P01') AS p01,sum(order_date>='2026-12-01') AS december,min(CASE WHEN order_date>='2026-12-01' THEN order_id END) AS firstDecember,max(CASE WHEN order_date<'2026-12-01' THEN order_date END) AS lastBefore,min(order_date) AS firstDate,sum(side='AP') AS ap FROM trade_orders",
      )
      .get();
    console.info(JSON.stringify({ fixture }));
    assert.deepEqual(fixture, {
      parties: 50,
      p01: 100,
      december: 50,
      firstDecember: orderId(9_951),
      lastBefore: "2026-11-30",
      firstDate: "2026-01-01",
      ap: orders / 2,
    });
    for (const scenario of scenarios) {
      const statement = tradeOrderPageStatement("DEFAULT", {
        ...scenario.query,
      });
      console.info(
        JSON.stringify({
          plan: scenario.name,
          detail: raw
            .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
            .all(...statement.values)
            .map((row) => (row as { detail: string }).detail),
        }),
      );
    }
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
    const results = [];
    for (const scenario of scenarios) {
      const result = await measure(origin, scenario);
      console.info(JSON.stringify(result));
      results.push(result);
    }
    console.info(
      JSON.stringify({
        summary: results.map(({ scenario, p50Ms, p95Ms, maxMs, pass }) => ({
          scenario,
          p50Ms,
          p95Ms,
          maxMs,
          pass,
        })),
      }),
    );
    assert.ok(results.every((result) => result.pass));
  } finally {
    await api.close();
    await executor.close();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

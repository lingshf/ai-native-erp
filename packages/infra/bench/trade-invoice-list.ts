// TINV-05 / PG-05: hot-read p95 of GET /api/v1/trade/invoices on 10,000 invoices, unfiltered and
// filtered. Standalone evidence (not part of the PR fast suite):
//   node packages/infra/bench/trade-invoice-list.ts
// Rows are written by seedInvoiceList (test/support/trade-invoice-list-fixture.ts) with foreign
// keys ON and checked with PRAGMA foreign_key_check. Fixture (deterministic, by sequence
// n = 1..10,000; the list is ordered by sequence descending):
//   party: P01 when n % 100 === 0 (exactly 100 invoices, evenly spread), otherwise P02..P50 as
//          P{2 + n % 49}; 50 parties in total;
//   side:  AP for odd n, AR for even n (alternating by sequence);
//   accounting date: 2025-12-15 for n <= 50, otherwise 2026-01-01 + ((n - 51) % 334) days,
//          i.e. within 2026-01-01..2026-11-30.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { TradeInvoiceListQuery } from "@erp/core/application";
import { tradeInvoicePageSchema } from "@erp/core/contracts";
import { createApi } from "../src/http/index.ts";
import { tradeDocumentPageStatement } from "../src/storage/trade-documents.ts";
import { SqliteExecutor } from "../src/workers/executor.ts";
import {
  fixtureDocumentId,
  type InvoiceListRow,
  seedInvoiceList,
} from "../test/support/trade-invoice-list-fixture.ts";

const invoices = 10_000;
const warmups = 10;
const samples = 60;
const budgetMs = 1_000;
const limit = 100;

const partyOf = (n: number) =>
  n % 100 === 0 ? "P01" : `P${String(2 + (n % 49)).padStart(2, "0")}`;
const sideOf = (n: number) => (n % 2 ? "AP" : "AR");
const dateOf = (n: number) =>
  n <= 50
    ? "2025-12-15"
    : new Date(Date.UTC(2026, 0, 1 + ((n - 51) % 334))).toISOString().slice(0, 10);
const parties = Array.from({ length: 50 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
function* rows(): Generator<InvoiceListRow> {
  for (let n = 1; n <= invoices; n++)
    yield { sequence: n, side: sideOf(n), party: partyOf(n), accountingDate: dateOf(n) };
}

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.ceil(sorted.length * fraction) - 1] as number;
}

interface Scenario {
  readonly name: string;
  readonly query: Omit<TradeInvoiceListQuery, "limit"> & { readonly limit: number };
  readonly expected: {
    readonly items: number;
    readonly first: number;
    readonly next: string | null;
  };
}
const pathOf = ({ query }: Scenario) => {
  const params = new URLSearchParams({ company: "DEFAULT", limit: String(query.limit) });
  for (const key of ["cursor", "party", "side", "from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) params.set(key, value);
  }
  return `/api/v1/trade/invoices?${params}`;
};

async function measure(origin: string, scenario: Scenario) {
  const path = pathOf(scenario);
  const once = async () => {
    const started = performance.now();
    const response = await fetch(`${origin}${path}`);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    const page = tradeInvoicePageSchema.parse(JSON.parse(text));
    return { ms: performance.now() - started, page, bytes: Buffer.byteLength(text) };
  };
  // The page must be the expected one before anything is timed (scenario (c) scans to the end).
  const check = (page: Awaited<ReturnType<typeof once>>["page"]) => {
    const { query, expected, name } = scenario;
    assert.equal(page.items.length, expected.items, name);
    assert.equal(page.items[0]?.documentId, fixtureDocumentId(expected.first), name);
    assert.equal(page.nextCursor, expected.next, name);
    for (const item of page.items) {
      const n = Number(item.documentId.slice(-12));
      if (query.cursor !== undefined) assert.ok(n < Number(query.cursor), name);
      assert.equal(item.party, partyOf(n), name);
      assert.equal(item.side, sideOf(n), name);
      assert.equal(item.accountingDate, dateOf(n), name);
      if (query.party !== undefined) assert.equal(item.party, query.party, name);
      if (query.side !== undefined) assert.equal(item.side, query.side, name);
      if (query.from !== undefined) assert.ok(item.accountingDate >= query.from, name);
      if (query.to !== undefined) assert.ok(item.accountingDate <= query.to, name);
    }
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
    firstDocumentId: last.page.items[0]?.documentId,
    nextCursor: last.page.nextCursor,
    responseBytes: last.bytes,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 0.99).toFixed(2)),
    maxMs: Number((sorted.at(-1) as number).toFixed(2)),
    budgetMs,
    pass: percentile(sorted, 0.95) <= budgetMs,
    rawMs: rawMs.map((value) => Number(value.toFixed(2))),
  };
}

// Deep continuation: cursor at sequence 1,000, so the page lies in the oldest 10%.
const deep = "1000";
const scenarios: readonly Scenario[] = [
  {
    name: "(a) party=P01 first page",
    query: { limit, party: "P01" },
    expected: { items: 100, first: 10_000, next: null },
  },
  {
    name: "(b) side=AR deep continuation",
    query: { limit, side: "AR", cursor: deep },
    expected: { items: 100, first: 998, next: "800" },
  },
  {
    name: "(c) December 2025 accounting dates long scan, limit 100",
    query: { limit, from: "2025-12-01", to: "2025-12-31" },
    expected: { items: 50, first: 50, next: null },
  },
  {
    name: "(d) unfiltered first page",
    query: { limit },
    expected: { items: 100, first: 10_000, next: "9901" },
  },
  {
    name: "(d) unfiltered deep continuation",
    query: { limit, cursor: deep },
    expected: { items: 100, first: 999, next: "900" },
  },
];

const directory = await mkdtemp(join(tmpdir(), "erp-tinv05-bench-"));
try {
  const filename = join(directory, "ledger.sqlite");
  const seededAt = performance.now();
  const seeded = await seedInvoiceList(filename, parties, rows());
  assert.equal(seeded, invoices);
  console.info(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      release: release(),
      cpu: cpus()[0]?.model,
      invoices,
      seedMs: Math.round(performance.now() - seededAt),
    }),
  );
  const raw = new Database(filename, { readonly: true });
  try {
    const fixture = raw
      .prepare(
        "SELECT count(*) AS invoices,min(sequence) AS firstSequence,max(sequence) AS lastSequence,count(DISTINCT party_id) AS parties,sum(party_id='P01') AS p01,sum(side='AP') AS ap,sum(accounting_date<'2026-01-01') AS december,max(CASE WHEN accounting_date<'2026-01-01' THEN sequence END) AS lastDecember,min(CASE WHEN accounting_date>='2026-01-01' THEN accounting_date END) AS firstAfter,max(accounting_date) AS lastDate FROM trade_documents WHERE company_id='DEFAULT'",
      )
      .get();
    console.info(JSON.stringify({ fixture }));
    assert.deepEqual(fixture, {
      invoices,
      firstSequence: 1,
      lastSequence: invoices,
      parties: 50,
      p01: 100,
      ap: invoices / 2,
      december: 50,
      lastDecember: 50,
      firstAfter: "2026-01-01",
      lastDate: "2026-11-30",
    });
    for (const scenario of scenarios) {
      const statement = tradeDocumentPageStatement("DEFAULT", scenario.query);
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
        summary: results.map(({ scenario, p50Ms, p95Ms, p99Ms, maxMs, pass }) => ({
          scenario,
          p50Ms,
          p95Ms,
          p99Ms,
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

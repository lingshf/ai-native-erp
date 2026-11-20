// TORD-04 / PG-05: p95 of POST /api/v1/trade/orders/preview for a 100-line order with prices
// including tax and per-document rounding, through real local HTTP to a contract-parsed response.
// Standalone evidence (not part of the PR fast suite):
//   node packages/infra/bench/trade-order-preview.ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { join } from "node:path";
import {
  JournalService,
  MasterDataService,
  TradeDocumentService,
  TradeMasterService,
} from "@erp/core/application";
import { tradeOrderPreviewSchema, tradeOrderSchema } from "@erp/core/contracts";
import type { TradeOrderCommand, TradeWrite } from "@erp/core/domain";
import { createApi } from "../src/http/index.ts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { journalTools } from "../src/storage/journals.ts";
import { createMasterDataStore, masterDataRepository } from "../src/storage/master-data.ts";
import { sqliteBackend } from "../src/storage/sqlite.ts";
import type { Connection } from "../src/storage/types.ts";
import { SqliteExecutor } from "../src/workers/executor.ts";

const warmups = 10;
const samples = 60;
const budgetMs = 2_000;
const window = { name: "Fictional", from: "2026-01-01", to: "2026-12-31" };
const base = { company: "DEFAULT", active: true, expectedRevision: 0 };
const configs: TradeWrite[] = [
  {
    ...base,
    kind: "tradeTerms",
    code: "N30",
    data: {
      ...window,
      dueDays: 30,
      discountDays: 0,
      discountPercent: "0",
      allowPartialDiscount: false,
    },
  },
  {
    ...base,
    kind: "taxCode",
    code: "VAT",
    data: {
      ...window,
      mode: "ordinary",
      deductiblePercent: "100",
      inputAccount: "1400",
      outputAccount: "2200",
      rates: [{ id: "R13", from: "2026-01-01", to: "2026-12-31", ratePercent: "13" }],
    },
  },
  {
    ...base,
    kind: "tradeProfile",
    code: "PAY",
    data: {
      ...window,
      side: "AP",
      controlAccount: "2100",
      advanceAccount: "1250",
      cashAccount: "1000",
      discountAccount: "4000",
    },
  },
  {
    ...base,
    kind: "tradeParty",
    code: "V1",
    data: {
      ...window,
      role: "vendor",
      apProfile: "PAY",
      arProfile: null,
      terms: "N30",
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
  ...(["RENT", "WAGE"] as const).map(
    (code, index): TradeWrite => ({
      ...base,
      kind: "tradeProduct",
      code,
      data: {
        ...window,
        type: "expense",
        expenseAccount: index ? "5100" : "5000",
        revenueAccount: null,
        allowedTaxCodes: ["VAT"],
        defaultDimensions: {},
      },
    }),
  ),
];

async function seed(filename: string) {
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const store = createMasterDataStore({ filename });
  try {
    const master = new MasterDataService(store);
    await master.initialize(2026);
    await master.setPeriod("DEFAULT", "2026-01", 1, "open", "Enable fictional trade", true, [
      "trade",
      "tax",
    ]);
    for (const [code, category, reportGroup, controlModule] of [
      ["2100", "LIABILITY", "payables", "AP"],
      ["1250", "ASSET", "prepayments", "AP"],
      ["1400", "ASSET", "otherAssets", "TAX"],
      ["2200", "LIABILITY", "taxLiabilities", "TAX"],
    ] as const)
      await master.saveAccount(
        "DEFAULT",
        {
          code,
          name: `Control ${code}`,
          category,
          reportGroup,
          controlModule,
          purpose: "control",
          normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
          contraOf: null,
          active: true,
          manualAllowed: false,
        },
        0,
      );
    const trade = new TradeMasterService(store);
    for (const command of configs) await trade.save(command);
  } finally {
    await store.close();
  }
}

const command = (lines: number, orderId = "PO-BENCH"): TradeOrderCommand => ({
  company: "DEFAULT",
  orderId,
  side: "AP",
  party: "V1",
  currency: "CNY",
  orderDate: "2026-01-15",
  priceIncludesTax: true,
  rounding: "document",
  lines: Array.from({ length: lines }, (_, n) => ({
    lineId: `L${n + 1}`,
    product: n % 2 ? "WAGE" : "RENT",
    taxCode: "VAT",
    quantity: String(1 + (n % 7)),
    unitPrice: `${10 + n}.${String((n * 37) % 100).padStart(2, "0")}`,
    discountPercent: n % 5 ? "0" : "2.5",
    taxableCharge: n % 9 ? "0" : "1.25",
  })),
});

// SQL statements of one previewOrder against createOrder's statements before its first INSERT.
async function statementCounts(filename: string) {
  const backend = sqliteBackend({ filename });
  const statements: string[] = [];
  const counted = (db: Connection) =>
    masterDataRepository({
      ...db,
      query: (sql: string, values: Parameters<Connection["query"]>[1] = []) => {
        statements.push(sql);
        return db.query(sql, values);
      },
    } as Connection);
  const reader = await backend.acquire(true, false);
  const writer = await backend.acquire(false, false);
  const store = {
    read: <T>(work: (repo: ReturnType<typeof counted>) => Promise<T>) => work(counted(reader)),
  };
  const writing = {
    read: store.read,
    write: async <T>(work: (repo: ReturnType<typeof counted>) => Promise<T>) => {
      await writer.begin();
      try {
        return await work(counted(writer));
      } finally {
        await writer.rollback();
      }
    },
  };
  try {
    const journals = new JournalService(writing, journalTools);
    const previewing = new TradeDocumentService(
      { ...store, write: () => Promise.reject(new Error("preview must not write")) },
      journals,
      journalTools,
    );
    const creating = new TradeDocumentService(writing, journals, journalTools);
    const rows = [];
    for (const lines of [1, 10, 50, 100]) {
      statements.length = 0;
      await previewing.previewOrder(command(lines));
      const preview = statements.length;
      statements.length = 0;
      await creating.createOrder(command(lines));
      const resolve = statements.findIndex((sql) => /^\s*INSERT/i.test(sql));
      rows.push({ lines, previewStatements: preview, createOrderBeforeInsert: resolve });
    }
    return rows;
  } finally {
    await writer.release();
    await reader.release();
    await backend.close();
  }
}

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.ceil(sorted.length * fraction) - 1] as number;
}

const directory = await mkdtemp(join(tmpdir(), "erp-tord04-bench-"));
try {
  const filename = join(directory, "ledger.sqlite");
  await seed(filename);
  console.info(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      release: release(),
      cpu: cpus()[0]?.model,
    }),
  );
  const counts = await statementCounts(filename);
  for (const row of counts) console.info(JSON.stringify({ sql: row }));
  assert.equal(new Set(counts.map((row) => row.previewStatements)).size, 1);
  // createOrder's resolve segment = preview + its single orderId lookup.
  assert.ok(counts.every((row) => row.createOrderBeforeInsert === row.previewStatements + 1));

  const executor = await SqliteExecutor.create({ filename, readers: 2 });
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    ...executor.services(),
    logError: () => undefined,
  });
  try {
    const origin = new URL(await api.listen()).origin;
    const body = JSON.stringify(command(100));
    const post = (path: string) =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    const once = async () => {
      const started = performance.now();
      const response = await post("/api/v1/trade/orders/preview");
      const text = await response.text();
      assert.equal(response.status, 200, text);
      const preview = tradeOrderPreviewSchema.parse(JSON.parse(text));
      return { ms: performance.now() - started, preview, bytes: Buffer.byteLength(text) };
    };
    for (let index = 0; index < warmups; index++) await once();
    const rawMs: number[] = [];
    let last: Awaited<ReturnType<typeof once>> | undefined;
    for (let index = 0; index < samples; index++) {
      last = await once();
      rawMs.push(last.ms);
    }
    assert.ok(last);
    const saved = tradeOrderSchema.parse(await (await post("/api/v1/trade/orders")).json());
    assert.deepEqual(
      last.preview.lines,
      saved.lines.map(({ lineId, lineNo, net, tax, gross }) => ({
        lineId,
        lineNo,
        net,
        tax,
        gross,
      })),
    );
    const sorted = [...rawMs].sort((a, b) => a - b);
    const result = {
      path: "POST /api/v1/trade/orders/preview",
      lines: last.preview.lines.length,
      priceIncludesTax: true,
      rounding: "document",
      warmups,
      samples,
      gross: last.preview.gross,
      responseBytes: last.bytes,
      sameAsSave: true,
      p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
      maxMs: Number((sorted.at(-1) as number).toFixed(2)),
      budgetMs,
      pass: percentile(sorted, 0.95) <= budgetMs,
      rawMs: rawMs.map((value) => Number(value.toFixed(2))),
    };
    console.info(JSON.stringify(result));
    assert.ok(result.lines === 100 && result.pass);
  } finally {
    await api.close();
    await executor.close();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MasterDataService, TradeMasterService } from "@erp/core/application";
import { tradePageSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { SqliteExecutor } from "../src/workers/executor.ts";
import { createApi } from "../src/http/index.ts";

export async function tradeMasterBenchmark() {
  const directory = await mkdtemp(join(tmpdir(), "erp-trade-master-bench-"));
  const filename = join(directory, "synthetic.sqlite");
  let executor: SqliteExecutor | undefined;
  let api: Awaited<ReturnType<typeof createApi>> | undefined;
  try {
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
      for (const [code, category, reportGroup] of [
        ["2100", "LIABILITY", "payables"],
        ["1250", "ASSET", "prepayments"],
      ] as const)
        await master.saveAccount(
          "DEFAULT",
          {
            code,
            name: code,
            category,
            reportGroup,
            normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
            purpose: "control",
            controlModule: "AP",
            contraOf: null,
            active: true,
            manualAllowed: false,
          },
          0,
        );
      const trade = new TradeMasterService(store);
      const common = { company: "DEFAULT", code: "SEED", expectedRevision: 0, active: true };
      const range = { name: "Synthetic seed", from: "2026-01-01", to: "2026-12-31" };
      await trade.save({
        ...common,
        kind: "tradeTerms",
        data: {
          ...range,
          dueDays: 30,
          discountDays: 7,
          discountPercent: "1.5",
          allowPartialDiscount: true,
        },
      });
      await trade.save({
        ...common,
        kind: "taxCode",
        data: {
          ...range,
          mode: "zero",
          rates: [{ id: "R", from: range.from, to: range.to, ratePercent: "0" }],
          deductiblePercent: "100",
          inputAccount: null,
          outputAccount: null,
        },
      });
      await trade.save({
        ...common,
        kind: "tradeProfile",
        data: {
          ...range,
          side: "AP",
          controlAccount: "2100",
          advanceAccount: "1250",
          cashAccount: "1000",
          discountAccount: "4000",
        },
      });
      await trade.save({
        ...common,
        kind: "tradeParty",
        data: {
          ...range,
          role: "vendor",
          apProfile: "SEED",
          arProfile: null,
          terms: "SEED",
          allowedTaxCodes: ["SEED"],
          defaultDimensions: {},
        },
      });
      await trade.save({
        ...common,
        kind: "tradeProduct",
        data: {
          ...range,
          type: "expense",
          expenseAccount: "5000",
          revenueAccount: null,
          allowedTaxCodes: ["SEED"],
          defaultDimensions: {},
        },
      });
    } finally {
      await store.close();
    }
    const fixture = new Database(filename);
    try {
      fixture.pragma("foreign_keys = ON");
      const party = fixture.prepare(
        "INSERT INTO trade_parties SELECT company_id,?, ?, active,revision,valid_from,valid_to,role,ap_profile,ar_profile,terms,allowed_tax_codes,default_dimensions FROM trade_parties WHERE company_id='DEFAULT' AND code='SEED'",
      );
      const product = fixture.prepare(
        "INSERT INTO trade_products SELECT company_id,?, ?, active,revision,valid_from,valid_to,type,expense_account,revenue_account,allowed_tax_codes,default_dimensions FROM trade_products WHERE company_id='DEFAULT' AND code='SEED'",
      );
      fixture.transaction(() => {
        for (let index = 1; index < 10000; index++) {
          const code = `N${String(index).padStart(5, "0")}`;
          party.run(code, `Partner ${index}`);
          product.run(code, `Product ${index}`);
        }
      })();
      for (const table of ["trade_parties", "trade_products"]) {
        const row = fixture.prepare<[], { n: number }>(`SELECT count(*) n FROM ${table}`).get();
        if (row?.n !== 10000)
          throw new Error("Trade benchmark requires exactly 10,000 rows per kind");
      }
    } finally {
      fixture.close();
    }
    executor = await SqliteExecutor.create({ filename, readers: 2 });
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      ...executor.services(),
    });
    const base = await api.listen();
    const measurements: {
      kind: string;
      operation: string;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
      rawMs: number[];
    }[] = [];
    for (const kind of ["tradeParty", "tradeProduct"]) {
      for (const operation of ["list", "search"]) {
        const times: number[] = [];
        for (let index = 0; index < 110; index++) {
          const start = performance.now();
          const response = await fetch(
            `${base}/api/v1/trade/${kind}?company=DEFAULT&limit=100${operation === "search" ? "&search=P" : ""}`,
          );
          if (!response.ok) throw new Error(`Trade benchmark HTTP ${response.status}`);
          const page = tradePageSchema.parse(await response.json());
          if (
            page.items.length !== 100 ||
            !page.nextCursor ||
            page.items.some((item) => item.kind !== kind)
          )
            throw new Error("Trade benchmark returned an invalid bounded page");
          if (index >= 10) times.push(performance.now() - start);
        }
        const sorted = [...times].sort((a, b) => a - b);
        const measurement = {
          kind,
          operation,
          p50Ms: sorted[49],
          p95Ms: sorted[94],
          p99Ms: sorted[98],
          rawMs: times,
        };
        measurements.push(measurement);
        if (measurement.p95Ms > 1000)
          throw new Error(`${kind} ${operation} exceeds the 1000ms p95 budget`);
      }
    }
    return {
      kind: "production-worker-loopback-http-with-client-contract-parse",
      rowsPerKind: 10000,
      warmupPerPath: 10,
      samplesPerPath: 100,
      pageRows: 100,
      readWorkers: executor.readers,
      p95BudgetMs: 1000,
      measurements,
      note: "Independent synthetic ledger; each partner/product list/search path measured separately through real HTTP, production worker dispatch, SQLite, complete JSON body and DTO parse. Not a multi-user capacity claim.",
    };
  } finally {
    await api?.close();
    await executor?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  const result = await tradeMasterBenchmark();
  const output = process.argv[2];
  if (!output) throw new Error("Usage: node packages/infra/bench/trade-master.ts OUTPUT.json");
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify({
      output,
      measurements: result.measurements.map(({ rawMs: _, ...summary }) => summary),
    }),
  );
}

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { MasterDataService, ReportService, PeriodCloseService } from "@erp/core/application";
import {
  reportSchema,
  ledgerSchema,
  closePreviewSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { generateLedgerFixture } from "./generate-ledger.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { createApi } from "../src/http/index.ts";
import { REPORT_BALANCES_SQL, LEDGER_ROWS_SQL } from "../src/storage/reports.ts";
import { journalTools } from "../src/storage/journals.ts";
export async function reportsBenchmark() {
  const directory = await mkdtemp(join(tmpdir(), "erp-million-gl-")),
    filename = join(directory, "synthetic.sqlite");
  let store: ReturnType<typeof createMasterDataStore> | undefined,
    api: Awaited<ReturnType<typeof createApi>> | undefined;
  const lag = monitorEventLoopDelay({ resolution: 10 });
  try {
    const fixture = await generateLedgerFixture(filename);
    store = createMasterDataStore({ filename });
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData: new MasterDataService(store),
      reports: new ReportService(store),
      closing: new PeriodCloseService(store, journalTools),
    });
    const base = await api.listen();
    async function read<T>(path: string, schema: ContractSchema<T>, body?: unknown) {
      const response = await fetch(
        `${base}/api/v1/${path}`,
        body === undefined
          ? undefined
          : {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
      );
      if (!response.ok) throw new Error(`Capacity HTTP ${response.status}`);
      const decoded = schema.safeParse(await response.json());
      if (!decoded.success) throw new Error("Invalid capacity client contract");
      return decoded.data;
    }
    const scope = "company=DEFAULT&month=2026-12",
      rawMs: Record<string, number[]> = {};
    lag.enable();
    for (const kind of ["trial", "income", "balance-sheet", "ledger", "close-preview"]) {
      const samples: number[] = [];
      for (let index = 0; index < 55; index++) {
        const start = performance.now();
        if (kind === "ledger") {
          const result = await read(`ledger?${scope}&account=1000&limit=100`, ledgerSchema);
          if (result.total !== 100000 || result.items.length !== 100 || !result.nextCursor)
            throw new Error("Invalid capacity ledger page");
        } else if (kind === "close-preview") {
          const result = await read("periods/2026-12/close-preview", closePreviewSchema, {
            company: "DEFAULT",
            revision: 1,
            commandId: "00000000-0000-4000-8000-000000000001",
          });
          if (
            result.action !== "close" ||
            result.lines.length === 0 ||
            result.snapshot.watermark !== 1000
          )
            throw new Error("Invalid capacity close preview");
        } else {
          const result = await read(`reports/${kind}?${scope}`, reportSchema);
          if (result.trial.rows.length !== 200 || !result.reconciliation.allPass)
            throw new Error("Capacity report does not reconcile");
        }
        if (index >= 5) samples.push(performance.now() - start);
      }
      rawMs[kind] = samples;
    }
    const db = new Database(filename, { readonly: true });
    let queryPlans: Record<string, unknown>;
    try {
      queryPlans = {
        trial: db
          .prepare(`EXPLAIN QUERY PLAN ${REPORT_BALANCES_SQL}`)
          .all("2026-12", "2026-12", "2026-12", "2026-01", "DEFAULT", "2026-12", "DEFAULT"),
        ledger: db
          .prepare(
            `EXPLAIN QUERY PLAN ${LEDGER_ROWS_SQL} ORDER BY e.accounting_date,e.id,l.line_no LIMIT ?`,
          )
          .all("DEFAULT", "2026-12", 1000, "1000", 101),
      };
    } finally {
      db.close();
    }
    const metrics = Object.fromEntries(
      Object.entries(rawMs).map(([name, samples]) => {
        const sorted = [...samples].sort((a, b) => a - b);
        return [
          name,
          {
            p50Ms: sorted[24],
            p95Ms: sorted[47],
            p99Ms: sorted[49],
            maxMs: sorted[49],
            budgetMs: name === "close-preview" ? 2000 : 1000,
            pass: sorted[47] <= (name === "close-preview" ? 2000 : 1000),
          },
        ];
      }),
    );
    return {
      kind: "million-GL-loopback-http-with-client-contract-parse",
      fixture,
      warmup: 5,
      samples: 50,
      budgetMs: 1000,
      metrics,
      allPass: Object.values(metrics).every((metric) => metric.pass),
      eventLoopMaxMs: lag.max / 1e6,
      queryPlans,
      rawMs,
      note: "Hot reads of the actual million-row database. Fetch, complete JSON and shared client DTO decoding included; no materialized balance table. Close preview computes the complete transfer plan/fingerprint without writes; priorPeriods is expected on this fixture of open periods. Budgets: existing paths 1000 ms, close-preview 2000 ms. Misses are reported, not hidden or replaced by a small fixture.",
    };
  } finally {
    lag.disable();
    try {
      await api?.close();
    } finally {
      try {
        await store?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
}

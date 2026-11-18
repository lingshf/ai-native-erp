import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import Database from "better-sqlite3";
import { DimensionService, JournalService, MasterDataService } from "@erp/core/application";
import {
  journalDraftSchema,
  journalPreviewSchema,
  journalReceiptSchema,
  journalPageSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { createApi } from "../src/http/index.ts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { journalTools } from "../src/storage/journals.ts";

export async function journalBenchmark() {
  const directory = await mkdtemp(join(tmpdir(), "erp-journal-bench-"));
  const config = { filename: join(directory, "fixture.sqlite") };
  const storage = createSqliteStorage(config);
  let store: ReturnType<typeof createMasterDataStore> | undefined;
  let api: Awaited<ReturnType<typeof createApi>> | undefined;
  const lag = monitorEventLoopDelay({ resolution: 10 });
  try {
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore(config);
    const masterData = new MasterDataService(store),
      dimensions = new DimensionService(store);
    await masterData.initialize(2026);
    for (const code of ["DEPT", "COST", "SITE"]) {
      const common = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
      await dimensions.save("DEFAULT", { ...common, kind: "dimension", code, name: code });
      await dimensions.save("DEFAULT", {
        ...common,
        kind: "value",
        dimension: code,
        code: "A",
        name: "A",
      });
    }
    const db = new Database(config.filename, { readonly: true });
    let initialGlRows: number;
    try {
      initialGlRows = db
        .prepare<[], { n: number }>(
          "SELECT count(*) AS n FROM journal_lines WHERE company_id='DEFAULT'",
        )
        .get()!.n;
    } finally {
      db.close();
    }
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData,
      dimensions,
      journals: new JournalService(store, journalTools),
    });
    const base = await api.listen();
    async function post<T>(path: string, body: unknown, schema: ContractSchema<T>): Promise<T> {
      const response = await fetch(`${base}/api/v1/journals/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Journal benchmark HTTP ${response.status}`);
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Invalid journal benchmark response contract");
      return parsed.data;
    }
    const previews: number[] = [],
      confirms: number[] = [];
    lag.enable();
    for (let sample = 0; sample < 110; sample++) {
      const id = randomUUID();
      const draft = await post(
        "drafts",
        {
          company: "DEFAULT",
          draft: {
            id,
            revision: 0,
            sourceRef: `BENCH-${id}`,
            date: "2026-01-15",
            memo: "100 business lines with three dimensions",
            operation: "journal",
            kind: "normal",
            originalId: null,
            headerDimensions: {},
            lines: Array.from({ length: 100 }, (_, index) => ({
              account: index < 50 ? "1000" : "3000",
              debit: index < 50 ? "1.01" : "0",
              credit: index < 50 ? "0" : "1.01",
              dimensions: { DEPT: "A", COST: "A", SITE: "A" },
              suspense: null,
            })),
          },
        },
        journalDraftSchema,
      );
      let start = performance.now();
      const plan = await post("preview", { company: "DEFAULT", draft }, journalPreviewSchema);
      const previewMs = performance.now() - start;
      if (plan.plan.journals[0].lines.length !== 100 || plan.plan.journals[0].debit !== 5050)
        throw new Error("Invalid journal benchmark plan");
      start = performance.now();
      const receipt = await post(
        "confirm",
        {
          company: "DEFAULT",
          draftId: id,
          revision: draft.revision,
          fingerprint: plan.fingerprint,
          idempotencyKey: randomUUID(),
          confirmation: "POST",
        },
        journalReceiptSchema,
      );
      const confirmMs = performance.now() - start;
      if (receipt.journalIds[0] !== id) throw new Error("Invalid journal benchmark receipt");
      if (sample >= 10) {
        previews.push(previewMs);
        confirms.push(confirmMs);
      }
    }
    const reads: number[] = [];
    for (let sample = 0; sample < 110; sample++) {
      const start = performance.now();
      const response = await fetch(
        `${base}/api/v1/journals?company=DEFAULT&status=posted&limit=100`,
      );
      if (!response.ok) throw new Error(`Journal read benchmark HTTP ${response.status}`);
      const page = journalPageSchema.safeParse(await response.json());
      if (!page.success || page.data.items.length !== 100 || !page.data.nextCursor)
        throw new Error("Invalid journal read benchmark page");
      if (sample >= 10) reads.push(performance.now() - start);
    }
    const percentiles = (samples: number[]) => {
      samples.sort((a, b) => a - b);
      return { p50Ms: samples[49], p95Ms: samples[94], p99Ms: samples[98] };
    };
    const preview = percentiles(previews),
      confirm = percentiles(confirms),
      list = percentiles(reads);
    const verification = new Database(config.filename, { readonly: true });
    let finalGlRows: number;
    try {
      finalGlRows = verification
        .prepare<[], { n: number }>(
          "SELECT count(*) AS n FROM journal_lines WHERE company_id='DEFAULT'",
        )
        .get()!.n;
      if (finalGlRows - initialGlRows !== 11_000)
        throw new Error("Journal benchmark did not persist every measured posting");
    } finally {
      verification.close();
    }
    if (preview.p95Ms > 2000 || confirm.p95Ms > 2000)
      throw new Error("Journal HTTP p95 exceeds 2 seconds");
    if (list.p95Ms > 1000) throw new Error("Journal paged HTTP read p95 exceeds 1 second");
    return {
      kind: "loopback-http-with-client-contract-parse",
      initialGlRows,
      finalGlRows,
      millionGlBaselineVerified: initialGlRows >= 1_000_000,
      businessLines: 100,
      dimensionsPerLine: 3,
      warmup: 10,
      samples: 100,
      preview,
      confirm,
      list,
      listRows: 100,
      readBudgetMs: 1000,
      budgetMs: 2000,
      eventLoopMaxMs: lag.max / 1e6,
      note: "Fresh temporary ledger only. M0-12 must seed 1M GL rows before this becomes capacity acceptance. Confirm includes current-state checks, the atomic transaction and configured WAL/NORMAL commit.",
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

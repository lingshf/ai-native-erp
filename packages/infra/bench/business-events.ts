import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { BusinessEventService, MasterDataService } from "@erp/core/application";
import {
  businessEventsPageSchema,
  businessPreviewSchema,
  businessResultSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { createApi } from "../src/http/index.ts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { journalTools } from "../src/storage/journals.ts";

export async function businessEventBenchmark() {
  const directory = await mkdtemp(join(tmpdir(), "erp-business-bench-"));
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
    const masterData = new MasterDataService(store);
    await masterData.initialize(2026);
    const events = new BusinessEventService(store, journalTools);
    await events.saveMaster("DEFAULT", "service", {
      code: "S",
      name: "Synthetic service",
      group: "G",
      revision: 0,
      active: true,
      dimensions: {},
    });
    const fixture = new Database(config.filename);
    try {
      fixture.pragma("foreign_keys = ON");
      const insert = fixture.prepare(
        "INSERT INTO posting_rules(company_id,code,active,revision,direction,meaning,object_scope,object_code,party_scope,party_code,account_code,dimensions,valid_from,valid_to) VALUES('DEFAULT',?,1,1,'receive',?,?,?,'all','*',?,'{}','2026-01-01','2026-12-31')",
      );
      fixture.transaction(() => {
        insert.run("CASH", "cash", "all", "*", "1000");
        insert.run("OFFSET", "offset", "all", "*", "4000");
        for (let index = 0; index < 4998; index++)
          insert.run(
            `R${index}`,
            index % 2 ? "cash" : "offset",
            "group",
            `OTHER${index}`,
            index % 2 ? "1000" : "4000",
          );
      })();
      const count = fixture
        .prepare<[], { n: number }>("SELECT count(*) AS n FROM posting_rules")
        .get();
      if (count?.n !== 5000) throw new Error("Business benchmark requires exactly 5000 rules");
    } finally {
      fixture.close();
    }
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData,
      events,
    });
    const base = await api.listen();
    async function request<T>(path: string, schema: ContractSchema<T>, body?: unknown): Promise<T> {
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
      if (!response.ok) throw new Error(`Business benchmark HTTP ${response.status}`);
      const result = schema.safeParse(await response.json());
      if (!result.success) throw new Error("Invalid business benchmark client contract");
      return result.data;
    }
    const previews: number[] = [],
      confirms: number[] = [],
      reads: number[] = [];
    lag.enable();
    for (let index = 0; index < 110; index++) {
      const id = randomUUID();
      const event = {
        id,
        sourceRef: `BENCH-${id}`,
        date: "2026-01-15",
        memo: "5000-rule cash event",
        operation: "cash_service",
        direction: "receive",
        service: "S",
        party: null,
        currency: "CNY",
        amount: "12.34",
        dimensions: {},
      };
      let start = performance.now();
      const preview = await request("events/preview", businessPreviewSchema, {
        company: "DEFAULT",
        event,
      });
      const previewMs = performance.now() - start;
      if (
        preview.matches.map((match) => match.rule).join(",") !== "CASH,OFFSET" ||
        preview.plan.journals[0].debit !== 1234 ||
        preview.plan.journals[0].lines.length !== 2
      )
        throw new Error("Invalid business benchmark winning rules/plan");
      start = performance.now();
      const result = await request("events/confirm", businessResultSchema, {
        company: "DEFAULT",
        event,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      });
      const confirmMs = performance.now() - start;
      if (result.status !== "posted" || result.journalIds[0] !== id)
        throw new Error("Business benchmark event was not posted");
      if (index >= 10) {
        previews.push(previewMs);
        confirms.push(confirmMs);
      }
    }
    for (let index = 0; index < 110; index++) {
      const start = performance.now();
      const page = await request("events?company=DEFAULT&limit=100", businessEventsPageSchema);
      if (page.items.length !== 100 || !page.nextCursor)
        throw new Error("Invalid business benchmark page");
      if (index >= 10) reads.push(performance.now() - start);
    }
    const verification = new Database(config.filename, { readonly: true });
    try {
      const count = verification
        .prepare<[], { n: number }>("SELECT count(*) AS n FROM journal_lines")
        .get();
      if (count?.n !== 220) throw new Error("Business benchmark postings were not all persisted");
    } finally {
      verification.close();
    }
    const percentiles = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { p50Ms: sorted[49], p95Ms: sorted[94], p99Ms: sorted[98], maxMs: sorted[99] };
    };
    const preview = percentiles(previews),
      confirm = percentiles(confirms),
      list = percentiles(reads);
    if (preview.p95Ms > 2000 || confirm.p95Ms > 2000 || list.p95Ms > 1000)
      throw new Error("Business benchmark exceeds HTTP p95 budget");
    return {
      kind: "loopback-http-with-client-contract-parse",
      rules: 5000,
      warmup: 10,
      samples: 100,
      initialGlRows: 0,
      finalGlRows: 220,
      millionGlBaselineVerified: false,
      preview,
      confirm,
      list,
      budgetMs: 2000,
      readBudgetMs: 1000,
      listRows: 100,
      eventLoopMaxMs: lag.max / 1e6,
      rawMs: { previews, confirms, reads },
      note: "Independent synthetic ledger; HTTP fetch through complete JSON and shared DTO parse. Index compilation and current-state checks included; confirm includes atomic WAL/NORMAL commit. Not million-GL capacity acceptance.",
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

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import {
  JournalService,
  MasterDataService,
  TradeDocumentService,
  TradeMasterService,
} from "@erp/core/application";
import type { AccountInput, TradeActionCommand } from "@erp/core/domain";
import { createSqliteStorage } from "../src/storage/index.ts";
import { journalTools } from "../src/storage/journals.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";

const warmup = 4;
const samples = 24;
const directory = await mkdtemp(join(tmpdir(), "erp-trade-action-sample-"));
const filename = join(directory, "sample.sqlite");
const storage = createSqliteStorage({ filename });
const store = createMasterDataStore({ filename });
try {
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const master = new MasterDataService(store);
  await master.initialize(2026);
  for (const [code, category, reportGroup, controlModule] of [
    ["2100", "LIABILITY", "payables", "AP"],
    ["1250", "ASSET", "prepayments", "AP"],
    ["1300", "ASSET", "receivables", "AR"],
    ["2300", "LIABILITY", "otherLiabilities", "AR"],
  ] as const) {
    const account: AccountInput = {
      code,
      name: `Fictional control ${code}`,
      category,
      reportGroup,
      controlModule,
      purpose: "control",
      normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
      contraOf: null,
      active: true,
      manualAllowed: false,
    };
    await master.saveAccount("DEFAULT", account, 0);
  }
  const base = { company: "DEFAULT", active: true, expectedRevision: 0 };
  const window = { name: "Fictional", from: "2026-01-01", to: "2026-12-31" };
  const trade = new TradeMasterService(store);
  await trade.save({
    ...base,
    kind: "tradeTerms",
    code: "N0",
    data: {
      ...window,
      dueDays: 0,
      discountDays: 0,
      discountPercent: "0",
      allowPartialDiscount: false,
    },
  });
  for (const side of ["AP", "AR"] as const)
    await trade.save({
      ...base,
      kind: "tradeProfile",
      code: side,
      data: {
        ...window,
        side,
        controlAccount: side === "AP" ? "2100" : "1300",
        advanceAccount: side === "AP" ? "1250" : "2300",
        cashAccount: "1000",
        discountAccount: "4000",
      },
    });
  await trade.save({
    ...base,
    kind: "tradeParty",
    code: "PARTY",
    data: {
      ...window,
      role: "both",
      apProfile: "AP",
      arProfile: "AR",
      terms: "N0",
      allowedTaxCodes: [],
      defaultDimensions: {},
    },
  });
  const service = new TradeDocumentService(
    store,
    new JournalService(store, journalTools),
    journalTools,
  );
  const raw: Record<"AP" | "AR", Record<"advance" | "cancel", number[]>> = {
    AP: { advance: [], cancel: [] },
    AR: { advance: [], cancel: [] },
  };
  const header = () => ({
    company: "DEFAULT",
    actionId: randomUUID(),
    accountingDate: "2026-01-20",
    documentDate: "2026-01-20",
    taxDate: "2026-01-20",
  });
  async function confirm(command: TradeActionCommand) {
    const preview = await service.previewAction(command);
    const envelope = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    };
    const started = performance.now();
    const receipt = await service.confirmAction(envelope);
    const elapsed = performance.now() - started;
    if (receipt.actionId !== command.actionId || receipt.kind !== command.kind)
      throw new Error("Invalid confirmation sample result");
    return elapsed;
  }
  for (const side of ["AP", "AR"] as const) {
    for (let index = 0; index < warmup + samples; index++) {
      const command: TradeActionCommand = {
        ...header(),
        kind: "advance",
        side,
        party: "PARTY",
        currency: "CNY",
        gross: 100,
        dimensions: {},
      };
      const advance = await confirm(command);
      const cancel = await confirm({
        ...header(),
        kind: "cancel",
        itemId: command.actionId,
        revision: 1,
        relatedRevision: null,
        reason: "Fictional standalone sample",
      });
      if (index >= warmup) {
        raw[side].advance.push(advance);
        raw[side].cancel.push(cancel);
      }
    }
  }
  const scenarios = (["AP", "AR"] as const).flatMap((side) =>
    (["advance", "cancel"] as const).map((kind) => {
      const values = [...raw[side][kind]].sort((a, b) => a - b);
      return {
        side,
        kind,
        warmup,
        samples,
        rawMs: raw[side][kind],
        p50Ms: values[Math.ceil(samples * 0.5) - 1],
        p95Ms: values[Math.ceil(samples * 0.95) - 1],
        p99Ms: values[Math.ceil(samples * 0.99) - 1],
      };
    }),
  );
  console.info(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      parallelism: availableParallelism(),
      gating: false,
      scope:
        "Synthetic application confirmation including transaction/commit; excludes preview, HTTP and setup; not a production SLA.",
      scenarios,
    }),
  );
} finally {
  try {
    await store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

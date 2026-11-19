import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import {
  JournalService,
  MasterDataService,
  TradeDocumentService,
  TradeMasterService,
} from "@erp/core/application";
import type { AccountInput, TradeActionCommand, TradeSettlementCommand } from "@erp/core/domain";
import { createSqliteStorage } from "../src/storage/index.ts";
import { journalTools } from "../src/storage/journals.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";

const warmup = 4;
const samples = 24;
const items = 100;
const directory = await mkdtemp(join(tmpdir(), "erp-trade-settlement-sample-"));
const filename = join(directory, "template.sqlite");
const storage = createSqliteStorage({ filename });
let store = createMasterDataStore({ filename });
try {
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const master = new MasterDataService(store);
  await master.initialize(2026);
  for (const period of (await master.periods("DEFAULT", { limit: 100 })).items)
    await master.setPeriod(
      "DEFAULT",
      period.month,
      period.revision,
      "open",
      "Enable fictional trade",
      true,
      ["trade", "tax"],
    );
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
  const open = () =>
    new TradeDocumentService(store, new JournalService(store, journalTools), journalTools);
  const raw: Record<"AP" | "AR", Record<"preview" | "confirm", number[]>> = {
    AP: { preview: [], confirm: [] },
    AR: { preview: [], confirm: [] },
  };
  const header = () => ({
    company: "DEFAULT",
    accountingDate: "2026-01-20",
    documentDate: "2026-01-20",
    taxDate: "2026-01-20",
  });
  // Every sample settles the same 100 advances in a fresh copy of one template ledger.
  const ids: Record<"AP" | "AR", string[]> = { AP: [], AR: [] };
  const setup = open();
  for (const side of ["AP", "AR"] as const)
    for (let item = 0; item < items; item++) {
      const command: TradeActionCommand = {
        ...header(),
        actionId: randomUUID(),
        kind: "advance",
        side,
        party: "PARTY",
        currency: "CNY",
        gross: 100,
        dimensions: {},
      };
      const preview = await setup.previewAction(command);
      await setup.confirmAction({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      });
      ids[side].push(command.actionId);
    }
  await store.close();
  for (const side of ["AP", "AR"] as const) {
    for (let index = 0; index < warmup + samples; index++) {
      const copy = join(directory, `sample-${side}-${index}.sqlite`);
      await copyFile(filename, copy);
      await copyFile(`${filename}-wal`, `${copy}-wal`).catch(() => undefined);
      store = createMasterDataStore({ filename: copy });
      try {
        const service = open();
        const command: TradeSettlementCommand = {
          ...header(),
          paymentId: randomUUID(),
          side,
          party: "PARTY",
          currency: "CNY",
          items: ids[side].map((itemId) => ({
            itemId,
            revision: 1,
            gross: 100,
            takeDiscount: false,
          })),
        };
        let started = performance.now();
        const preview = await service.previewSettlement(command);
        const previewMs = performance.now() - started;
        started = performance.now();
        const receipt = await service.confirmSettlement({
          command,
          fingerprint: preview.fingerprint,
          idempotencyKey: randomUUID(),
          confirmation: "POST",
        });
        const confirmMs = performance.now() - started;
        if (receipt.paymentId !== command.paymentId)
          throw new Error("Invalid settlement sample result");
        if (index >= warmup) {
          raw[side].preview.push(previewMs);
          raw[side].confirm.push(confirmMs);
        }
      } finally {
        await store.close();
        for (const suffix of ["", "-wal", "-shm"]) await rm(`${copy}${suffix}`, { force: true });
      }
    }
  }
  const scenarios = (["AP", "AR"] as const).flatMap((side) =>
    (["preview", "confirm"] as const).map((kind) => {
      const values = [...raw[side][kind]].sort((a, b) => a - b);
      return {
        side,
        kind,
        items,
        warmup,
        samples,
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
        "Synthetic M1 payment settlement of 100 open items: application preview and confirmation (including commit); excludes HTTP and setup; not a production SLA.",
      scenarios,
    }),
  );
} finally {
  try {
    await store.close().catch(() => undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

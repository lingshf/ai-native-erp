import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  JournalService,
  DimensionService,
  MasterDataService,
  TradeDocumentService,
  TradeMasterService,
} from "@erp/core/application";
import {
  normalizeExternalInvoice,
  parseAiCandidate,
  type AccountInput,
  type TradeInvoiceCommand,
  type TradeInvoiceLineInput,
  type TradeOrderCommand,
  type TradeWrite,
  type TradeSettlementCommand,
  type TradeActionCommand,
} from "@erp/core/domain";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { latestMigrationVersion, normalizeMigration } from "../../src/storage/migrations.ts";
import { schemaFingerprint } from "../../src/storage/schema.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";
import { createApi } from "../../src/http/index.ts";
import { SqliteExecutor } from "../../src/workers/executor.ts";

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
      discountDays: 7,
      discountPercent: "1.5",
      allowPartialDiscount: true,
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
      rates: [
        { id: "OLD", from: "2026-01-01", to: "2026-03-14", ratePercent: "13" },
        { id: "NEW", from: "2026-03-15", to: "2026-12-31", ratePercent: "9" },
      ],
    },
  },
  {
    ...base,
    kind: "taxCode",
    code: "EXEMPT",
    data: {
      ...window,
      mode: "exempt",
      deductiblePercent: "0",
      inputAccount: null,
      outputAccount: null,
      rates: [{ id: "E", from: "2026-01-01", to: "2026-12-31", ratePercent: "0" }],
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
    kind: "tradeProfile",
    code: "REC",
    data: {
      ...window,
      side: "AR",
      controlAccount: "1300",
      advanceAccount: "2300",
      cashAccount: "1000",
      discountAccount: "4000",
    },
  },
  ...(["V1", "V2"] as const).map(
    (code): TradeWrite => ({
      ...base,
      kind: "tradeParty",
      code,
      data: {
        ...window,
        role: "vendor",
        apProfile: "PAY",
        arProfile: null,
        terms: "N30",
        allowedTaxCodes: ["VAT", "EXEMPT"],
        defaultDimensions: {},
      },
    }),
  ),
  {
    ...base,
    kind: "tradeParty",
    code: "C1",
    data: {
      ...window,
      role: "customer",
      apProfile: null,
      arProfile: "REC",
      terms: "N30",
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
  {
    ...base,
    kind: "tradeProduct",
    code: "RENT",
    data: {
      ...window,
      type: "expense",
      expenseAccount: "5000",
      revenueAccount: null,
      allowedTaxCodes: ["VAT", "EXEMPT"],
      defaultDimensions: {},
    },
  },
  {
    ...base,
    kind: "tradeProduct",
    code: "WAGE",
    data: {
      ...window,
      type: "expense",
      expenseAccount: "5100",
      revenueAccount: null,
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
  {
    ...base,
    kind: "tradeProduct",
    code: "CONSULT",
    data: {
      ...window,
      type: "service",
      expenseAccount: null,
      revenueAccount: "4000",
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
];
function line(changes: Partial<TradeInvoiceLineInput> = {}): TradeInvoiceLineInput {
  return {
    lineId: "L1",
    product: "RENT",
    taxCode: "VAT",
    quantity: "10",
    unitPrice: "10.00",
    discountPercent: "0",
    taxableCharge: "0",
    orderLineId: null,
    dimensions: {},
    ...changes,
  };
}
function invoice(changes: Partial<TradeInvoiceCommand> = {}): TradeInvoiceCommand {
  return {
    company: "DEFAULT",
    documentId: randomUUID(),
    side: "AP",
    party: "V1",
    externalInvoice: `INV-${randomUUID().slice(0, 8)}`,
    currency: "CNY",
    accountingDate: "2026-01-20",
    documentDate: "2026-01-18",
    taxDate: "2026-01-19",
    orderId: null,
    priceIncludesTax: false,
    rounding: "line",
    headerDimensions: {},
    matchingException: null,
    lines: [line()],
    ...changes,
  };
}
function order(changes: Partial<TradeOrderCommand> = {}): TradeOrderCommand {
  return {
    company: "DEFAULT",
    orderId: "PO-1",
    side: "AP",
    party: "V1",
    currency: "CNY",
    orderDate: "2026-01-05",
    priceIncludesTax: false,
    rounding: "line",
    lines: [
      {
        lineId: "OL1",
        product: "RENT",
        taxCode: "VAT",
        quantity: "10",
        unitPrice: "10.00",
        discountPercent: "0",
        taxableCharge: "0",
      },
      {
        lineId: "OL2",
        product: "WAGE",
        taxCode: "VAT",
        quantity: "4",
        unitPrice: "25.00",
        discountPercent: "0",
        taxableCharge: "0",
      },
    ],
    ...changes,
  };
}

describe("trade invoices on real SQLite", () => {
  let templateDirectory: string, template: string;
  let directory: string, filename: string;
  let store: ReturnType<typeof createMasterDataStore>;
  let master: MasterDataService, journals: JournalService, service: TradeDocumentService;
  beforeAll(async () => {
    templateDirectory = await mkdtemp(join(tmpdir(), "erp-trade-template-"));
    template = join(templateDirectory, "template.sqlite");
    const storage = createSqliteStorage({ filename: template });
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    const seedStore = createMasterDataStore({ filename: template });
    const master = new MasterDataService(seedStore);
    try {
      await master.initialize(2026);
      for (let month = 1; month <= 12; month++)
        await master.setPeriod(
          "DEFAULT",
          `2026-${String(month).padStart(2, "0")}`,
          1,
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
        ["1400", "ASSET", "otherAssets", "TAX"],
        ["2200", "LIABILITY", "taxLiabilities", "TAX"],
      ] as const) {
        const account: AccountInput = {
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
        };
        await master.saveAccount("DEFAULT", account, 0);
      }
      const trade = new TradeMasterService(seedStore);
      for (const command of configs) await trade.save(command);
    } finally {
      await seedStore.close();
    }
  });
  afterAll(async () => {
    if (templateDirectory) await rm(templateDirectory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-trade-docs-"));
    filename = join(directory, "ledger.sqlite");
    await copyFile(template, filename);
    store = createMasterDataStore({ filename });
    master = new MasterDataService(store);
    journals = new JournalService(store, journalTools);
    service = new TradeDocumentService(store, journals, journalTools);
  });
  afterEach(async () => {
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const tables = [
    "trade_actions",
    "trade_item_sources",
    "trade_credit_lines",
    "trade_action_items",
    "trade_payments",
    "settlements",
    "journal_entries",
    "journal_lines",
    "receipts",
    "audit",
    "trade_orders",
    "trade_order_lines",
    "trade_documents",
    "trade_document_lines",
    "open_items",
  ];
  function counts() {
    const db = new Database(filename, { readonly: true });
    try {
      return Object.fromEntries(
        tables.map((table) => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]),
      );
    } finally {
      db.close();
    }
  }
  async function post(command: TradeInvoiceCommand, key = randomUUID()) {
    const preview = await service.preview(command);
    const receipt = await service.confirm({
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: key,
      confirmation: "POST",
    });
    return { preview, receipt, key };
  }
  async function rejects(command: TradeInvoiceCommand, issue: Record<string, unknown>) {
    const before = counts();
    await expect(service.preview(command)).rejects.toMatchObject({ issue });
    expect(counts()).toEqual(before);
  }
  function payment(
    document: TradeInvoiceCommand,
    gross: number,
    takeDiscount = false,
    revision = 1,
  ): TradeSettlementCommand {
    return {
      company: "DEFAULT",
      paymentId: randomUUID(),
      side: document.side,
      party: document.party,
      currency: document.currency,
      accountingDate: "2026-01-25",
      documentDate: "2026-01-25",
      taxDate: "2026-01-25",
      items: [{ itemId: document.documentId, revision, gross, takeDiscount }],
    };
  }
  async function settle(command: TradeSettlementCommand, key = randomUUID()) {
    const preview = await service.previewSettlement(command);
    const envelope = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: key,
      confirmation: "POST" as const,
    };
    return { preview, receipt: await service.confirmSettlement(envelope), envelope };
  }
  const actionHeader = () => ({
    company: "DEFAULT",
    actionId: randomUUID(),
    accountingDate: "2026-01-25",
    documentDate: "2026-01-25",
    taxDate: "2026-01-25",
  });
  function advance(side: "AP" | "AR" = "AP", gross = 5650): TradeActionCommand {
    return {
      ...actionHeader(),
      kind: "advance",
      side,
      party: side === "AP" ? "V1" : "C1",
      currency: "CNY",
      gross,
      dimensions: {},
    };
  }
  async function act(command: TradeActionCommand) {
    const before = counts();
    const preview = await service.previewAction(command);
    expect(counts()).toEqual(before);
    const envelope = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    };
    const receipt = await service.confirmAction(envelope);
    return { preview, receipt, envelope };
  }
  async function current(itemId: string) {
    const page = await service.openItems("DEFAULT", { limit: 500 });
    const item = page.items.find((item) => item.itemId === itemId);
    if (!item) throw new Error("Missing test item");
    return item;
  }
  async function undo(settlementId: string, ids: string[], day = "2026-01-25") {
    return act({
      ...actionHeader(),
      kind: "reverse",
      settlementId,
      reason: "Fictional correction",
      accountingDate: day,
      items: await Promise.all(
        ids.map(async (itemId) => ({ itemId, revision: (await current(itemId)).revision })),
      ),
    });
  }
  async function cancel(itemId: string, relatedId?: string, day = "2026-01-25") {
    return act({
      ...actionHeader(),
      kind: "cancel",
      itemId,
      revision: (await current(itemId)).revision,
      relatedRevision: relatedId ? (await current(relatedId)).revision : null,
      accountingDate: day,
      reason: "Fictional cancellation",
    });
  }
  it("keeps TC-T10 January history after February settlement, with independent credits/advances and saved inactive accounts", async () => {
    const command = invoice({
      accountingDate: "2026-01-05",
      documentDate: "2026-01-05",
      taxDate: "2026-01-05",
      priceIncludesTax: true,
      lines: [line({ quantity: "81.97", unitPrice: "1" })],
    });
    await post(command);
    await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: command.documentId,
      revision: 1,
      accountingDate: "2026-01-06",
      lines: [{ sourceLineId: "L1", quantity: "10" }],
    });
    await act({ ...advance("AP", 500), accountingDate: "2026-01-06" });
    const january = await service.report("DEFAULT", { month: "2026-01", limit: 1 });
    expect(january.totals).toEqual({
      invoiceGrossMinor: 8197,
      notDue: 8197,
      overdue1_30: 0,
      overdue31_60: 0,
      overdue61_90: 0,
      overdue91Plus: 0,
      creditGrossMinor: 1000,
      advanceGrossMinor: 500,
    });
    const first = await current(command.documentId);
    const paid = await settle({
      ...payment(command, 4099, false, first.revision),
      accountingDate: "2026-02-12",
    });
    const trade = new TradeMasterService(store);
    const party = await trade.get("DEFAULT", "tradeParty", "V1");
    await trade.save({
      ...party,
      company: "DEFAULT",
      expectedRevision: party.revision,
      active: false,
    });
    const account = await master.account("DEFAULT", "2100");
    await master.saveAccount("DEFAULT", { ...account, active: false }, account.revision);
    const historical = await service.report("DEFAULT", { month: "2026-01", limit: 100 });
    expect(historical.totals).toEqual(january.totals);
    expect(historical.items.find((i) => i.documentId === command.documentId)).toMatchObject({
      remainingGrossMinor: 8197,
      dueDate: "2026-02-04",
      overdueDays: 0,
      ageingBucket: "notDue",
      controlAccount: "2100",
    });
    expect(historical.items.filter((i) => i.kind !== "invoice")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "credit",
          dueDate: null,
          overdueDays: null,
          ageingBucket: null,
        }),
        expect.objectContaining({
          kind: "advance",
          dueDate: null,
          overdueDays: null,
          ageingBucket: null,
        }),
      ]),
    );
    const february = await service.report("DEFAULT", { month: "2026-02", limit: 100 });
    expect(february.totals).toMatchObject({
      invoiceGrossMinor: 4098,
      overdue1_30: 4098,
      notDue: 0,
      creditGrossMinor: 1000,
      advanceGrossMinor: 500,
    });
    const detail = await service.itemDetail("DEFAULT", command.documentId, "2026-01");
    expect(detail.current.remainingGross).toBe(4098);
    expect(detail.selected.remainingGrossMinor).toBe(8197);
    expect(detail.current.revision).toBeGreaterThan(detail.selected.version);
    expect(detail.settlements).toEqual([]);
    expect(
      (await service.itemDetail("DEFAULT", command.documentId, "2026-02")).settlements[0].paymentId,
    ).toBe(paid.receipt.paymentId);
    expect(
      (await service.reconciliation("DEFAULT", "2026-01")).rows.every(
        (r) => r.differenceMinor === 0,
      ),
    ).toBe(true);
    await store.close();
    store = createMasterDataStore({ filename });
    service = new TradeDocumentService(
      store,
      new JournalService(store, journalTools),
      journalTools,
    );
    expect((await service.report("DEFAULT", { month: "2026-01", limit: 100 })).totals).toEqual(
      january.totals,
    );
  });

  it("puts the exact due date and 1/30/31/60/61/90/91 day edges in disjoint invoice buckets", async () => {
    const dates = [
      "2026-03-31",
      "2026-03-30",
      "2026-03-01",
      "2026-02-28",
      "2026-01-30",
      "2026-01-29",
      "2025-12-31",
      "2025-12-30",
    ];
    const ids: string[] = [];
    for (const documentDate of dates) {
      const command = invoice({
        accountingDate: "2026-04-30",
        documentDate,
        lines: [line({ quantity: "1", unitPrice: "1", taxCode: "EXEMPT" })],
      });
      await post(command);
      ids.push(command.documentId);
    }
    const report = await service.report("DEFAULT", { month: "2026-04", limit: 100 });
    expect(ids.map((id) => report.items.find((r) => r.documentId === id)?.overdueDays)).toEqual([
      0, 1, 30, 31, 60, 61, 90, 91,
    ]);
    expect(report.totals).toEqual({
      invoiceGrossMinor: 800,
      notDue: 100,
      overdue1_30: 200,
      overdue31_60: 200,
      overdue61_90: 200,
      overdue91Plus: 100,
      creditGrossMinor: 0,
      advanceGrossMinor: 0,
    });
  });

  it("aggregates applications, reversals, refunds and cancellations at their own accounting dates, including no-GL actions", async () => {
    const command = invoice();
    await post(command);
    const credited = await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: command.documentId,
      revision: 1,
      lines: [{ sourceLineId: "L1", quantity: "10" }],
    });
    const creditId = credited.receipt.actionId;
    const applied = await act({
      ...actionHeader(),
      kind: "apply",
      sourceId: creditId,
      sourceRevision: 1,
      targetId: command.documentId,
      targetRevision: (await current(command.documentId)).revision,
      gross: 11300,
    });
    expect(applied.receipt.journalIds).toEqual([]);
    expect((await service.report("DEFAULT", { month: "2026-01", limit: 100 })).items).toEqual([]);
    await undo(applied.receipt.actionId, [creditId, command.documentId], "2026-02-01");
    const february = await service.report("DEFAULT", { month: "2026-02", limit: 100 });
    expect(february.totals).toMatchObject({ invoiceGrossMinor: 11300, creditGrossMinor: 11300 });
    const refundCommand: TradeSettlementCommand = {
      ...payment(command, 11300, false, (await current(creditId)).revision),
      accountingDate: "2026-03-01",
      items: [
        {
          itemId: creditId,
          revision: (await current(creditId)).revision,
          gross: 11300,
          takeDiscount: false,
        },
      ],
    };
    const refund = await settle(refundCommand);
    expect(
      (await service.report("DEFAULT", { month: "2026-03", limit: 100 })).totals.creditGrossMinor,
    ).toBe(0);
    await undo(refund.receipt.paymentId, [creditId], "2026-04-01");
    await cancel(creditId, command.documentId, "2026-04-01");
    await cancel(command.documentId, undefined, "2026-05-01");
    expect((await service.report("DEFAULT", { month: "2026-02", limit: 100 })).totals).toEqual(
      february.totals,
    );
    expect(
      (await service.report("DEFAULT", { month: "2026-04", limit: 100 })).totals,
    ).toMatchObject({ invoiceGrossMinor: 11300, creditGrossMinor: 0 });
    expect((await service.report("DEFAULT", { month: "2026-05", limit: 100 })).items).toEqual([]);
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"])
      expect(
        (await service.reconciliation("DEFAULT", month)).rows.every((r) => r.differenceMinor === 0),
      ).toBe(true);
  });

  it("keeps other-source GL and true trade differences visible on saved control accounts", async () => {
    await post(invoice());
    const draft = {
      id: randomUUID(),
      revision: 0,
      sourceRef: "FICTIONAL-IMPORT",
      date: "2026-01-25",
      memo: "Other source on saved AP",
      kind: "normal" as const,
      operation: "journal" as const,
      originalId: null,
      headerDimensions: {},
      lines: [
        { account: "2100", debit: "", credit: "7.00", dimensions: {}, suspense: null },
        { account: "5000", debit: "7.00", credit: "", dimensions: {}, suspense: null },
      ],
    };
    const saved = await journals.save("DEFAULT", draft);
    const imported = new JournalService(store, journalTools, { IMPORT: ["AP"] }).adapter("IMPORT");
    const preview = await imported.preview("DEFAULT", saved);
    await imported.confirm({
      company: "DEFAULT",
      draftId: saved.id,
      revision: saved.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    });
    expect(
      (await service.reconciliation("DEFAULT", "2026-01")).rows.find((r) => r.account === "2100"),
    ).toEqual({
      account: "2100",
      subledgerMinor: -11300,
      tradeGlMinor: -11300,
      otherSourceMinor: -700,
      glMinor: -12000,
      tradeDifferenceMinor: 0,
      differenceMinor: -700,
    });
    const orphan = await journals.save("DEFAULT", {
      ...draft,
      id: randomUUID(),
      sourceRef: "FICTIONAL-UNLINKED-TRADE",
    });
    const adapter = journals.adapter("TRADE");
    const orphanPreview = await adapter.preview("DEFAULT", orphan);
    await adapter.confirm({
      company: "DEFAULT",
      draftId: orphan.id,
      revision: orphan.revision,
      fingerprint: orphanPreview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    });
    expect(
      (await service.reconciliation("DEFAULT", "2026-01")).rows.find((r) => r.account === "2100"),
    ).toMatchObject({
      subledgerMinor: -11300,
      tradeGlMinor: -12000,
      otherSourceMinor: -700,
      tradeDifferenceMinor: -700,
      differenceMinor: -1400,
    });
    const raw = new Database(filename);
    try {
      raw
        .prepare(
          "UPDATE open_items SET remaining_gross_minor=10000,remaining_net_minor=9000,remaining_tax_minor=1000,revision=revision+1",
        )
        .run();
    } finally {
      raw.close();
    }
    // Historical/current reads derive from immutable facts, not a damaged mutable balance cache.
    expect((await service.report("DEFAULT", { limit: 100 })).totals.invoiceGrossMinor).toBe(11300);
  });

  it("pins keyset pages to scope and facts while computing full unpaged totals and isolating companies/parties/sides", async () => {
    const ap = invoice();
    await post(ap);
    await post(invoice({ party: "V2" }));
    await post(invoice({ side: "AR", party: "C1", lines: [line({ product: "CONSULT" })] }));
    const first = await service.report("DEFAULT", { month: "2026-01", limit: 1 });
    if (first.nextCursor === null) throw new Error("Missing continuation cursor");
    expect(first.items).toHaveLength(1);
    expect(first.totals.invoiceGrossMinor).toBe(33900);
    const second = await service.report("DEFAULT", {
      month: "2026-01",
      limit: 2,
      cursor: first.nextCursor,
      snapshot: first.snapshot,
    });
    expect(new Set([...first.items, ...second.items].map((r) => r.documentId)).size).toBe(3);
    expect(second.totals).toEqual(first.totals);
    await expect(
      service.report("DEFAULT", { month: "2026-02", limit: 1, snapshot: first.snapshot }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await service.report("DEFAULT", { limit: 100, side: "AR", party: "C1" })).totals
        .invoiceGrossMinor,
    ).toBe(11300);
    await master.createCompany({
      code: "OTHER",
      name: "Other fictional",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    expect((await service.report("OTHER", { month: "2026-01", limit: 100 })).items).toEqual([]);
    await expect(service.itemDetail("OTHER", ap.documentId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await settle(payment(ap, 1000));
    await expect(
      service.report("DEFAULT", {
        month: "2026-01",
        limit: 2,
        cursor: first.nextCursor,
        snapshot: first.snapshot,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    for (const bad of [{ month: "2026-13", limit: 10 }, { limit: 10, cursor: "bad" }, { limit: 0 }])
      await expect(service.report("DEFAULT", bad)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const db = new Database(filename, { readonly: true });
    try {
      expect(
        JSON.stringify(
          db
            .prepare(
              "EXPLAIN QUERY PLAN SELECT sum(applied_gross_minor) FROM settlements WHERE company_id=? AND item_id=? AND accounting_date<=?",
            )
            .all("DEFAULT", ap.documentId, "2026-01-31"),
        ),
      ).toContain("settlements_item");
    } finally {
      db.close();
    }
  });

  it.each([{ modules: ["trade"] }, { modules: ["tax"] }, { modules: [] }] as const)(
    "rejects trade writes when admissions are $modules, invalidates ABA previews, and preserves completed retry",
    async ({ modules }) => {
      const original = invoice();
      const posted = await post(original);
      const command = invoice();
      const preview = await service.preview(command);
      await master.setPeriod(
        "DEFAULT",
        "2026-01",
        2,
        "open",
        "Explicit module change",
        true,
        modules,
      );
      await expect(service.preview(command)).rejects.toMatchObject({ issue: { rule: "period" } });
      expect(
        await service.confirm({
          command: original,
          fingerprint: posted.preview.fingerprint,
          idempotencyKey: posted.key,
          confirmation: "POST",
        }),
      ).toEqual(posted.receipt);
      await master.setPeriod("DEFAULT", "2026-01", 3, "open", "Restore module admission", true, [
        "trade",
        "tax",
      ]);
      await expect(
        service.confirm({
          command,
          fingerprint: preview.fingerprint,
          idempotencyKey: randomUUID(),
          confirmation: "POST",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", issue: { rule: "stale" } });
    },
  );
  it("applies module admission to no-GL reversals without writing any partial evidence", async () => {
    const command = invoice();
    await post(command);
    const credit = await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: command.documentId,
      revision: 1,
      lines: [{ sourceLineId: "L1", quantity: "10" }],
    });
    const application = await act({
      ...actionHeader(),
      kind: "apply",
      sourceId: credit.receipt.actionId,
      sourceRevision: 1,
      targetId: command.documentId,
      targetRevision: (await current(command.documentId)).revision,
      gross: 11300,
    });
    expect(application.receipt.journalIds).toEqual([]);
    await master.setPeriod("DEFAULT", "2026-01", 2, "open", "Revoke tax admission", true, [
      "trade",
    ]);
    const before = counts();
    await expect(
      undo(application.receipt.actionId, [credit.receipt.actionId, command.documentId]),
    ).rejects.toMatchObject({ issue: { path: "accountingDate", rule: "reference" } });
    expect(counts()).toEqual(before);
  });
  async function departments() {
    const dimensions = new DimensionService(store);
    const range = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
    await dimensions.save("DEFAULT", {
      ...range,
      kind: "dimension",
      code: "DEPT",
      name: "Department",
    });
    for (const code of ["D1", "D2", "D3"])
      await dimensions.save("DEFAULT", {
        ...range,
        kind: "value",
        dimension: "DEPT",
        code,
        name: code,
      });
    return { dimensions, range };
  }
  it("allocates TC-T07 control segments 2/3/2 as 1/1/1 then 1/2/1 and restores the actual first allocation after a later settlement", async () => {
    await departments();
    const inv = invoice({
      lines: ["0.02", "0.03", "0.02"].map((unitPrice, index) =>
        line({
          lineId: `L${index}`,
          quantity: "1",
          unitPrice,
          dimensions: { DEPT: `D${index + 1}` },
        }),
      ),
    });
    await post(inv);
    expect((await current(inv.documentId)).segments.map((s) => s.remainingGross)).toEqual([
      2, 3, 2,
    ]);
    const first = await settle(payment(inv, 3));
    expect(first.receipt.allocations[0].segments?.map((s) => s.gross)).toEqual([1, 1, 1]);
    expect((await current(inv.documentId)).segments.map((s) => s.remainingGross)).toEqual([
      1, 2, 1,
    ]);
    const last = await settle(payment(inv, 4, false, 2));
    expect(last.receipt.allocations[0].segments?.map((s) => s.gross)).toEqual([1, 2, 1]);
    await undo(first.receipt.paymentId, [inv.documentId]);
    expect((await current(inv.documentId)).segments.map((s) => s.remainingGross)).toEqual([
      1, 1, 1,
    ]);
    await undo(last.receipt.paymentId, [inv.documentId]);
    expect((await current(inv.documentId)).segments.map((s) => s.remainingGross)).toEqual([
      2, 3, 2,
    ]);
  });
  it("keeps a real same-account cross-dimension application and allows only historical reversal after fixed dimensions change", async () => {
    const { dimensions, range } = await departments();
    const source = invoice({
      side: "AR",
      party: "C1",
      lines: [
        line({ product: "CONSULT", quantity: "1", unitPrice: "0.05", dimensions: { DEPT: "D1" } }),
      ],
    });
    const target = invoice({
      side: "AR",
      party: "C1",
      lines: [
        line({ product: "CONSULT", quantity: "1", unitPrice: "0.05", dimensions: { DEPT: "D2" } }),
      ],
    });
    await post(source);
    await post(target);
    const credit = await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: source.documentId,
      revision: 1,
      lines: [{ sourceLineId: "L1", quantity: "1" }],
    });
    const applied = await act({
      ...actionHeader(),
      kind: "apply",
      sourceId: credit.receipt.actionId,
      sourceRevision: 1,
      targetId: target.documentId,
      targetRevision: 1,
      gross: 5,
    });
    const entry = (await journals.entry("DEFAULT", applied.receipt.journalIds[0])).entry;
    expect(entry.lines.map((l) => [l.account, l.debit, l.credit, l.dimensions])).toEqual([
      ["1300", 5, 0, { DEPT: "D1" }],
      ["1300", 0, 5, { DEPT: "D2" }],
    ]);
    await dimensions.save("DEFAULT", {
      ...range,
      kind: "structure",
      code: "1300",
      required: ["DEPT"],
      optional: [],
      forbidden: [],
      allowed: [],
      fixed: { DEPT: "D3" },
      conditionals: [],
    });
    await undo(applied.receipt.actionId, [credit.receipt.actionId, target.documentId]);
    await expect(
      service.previewAction({
        ...actionHeader(),
        kind: "apply",
        sourceId: credit.receipt.actionId,
        sourceRevision: 3,
        targetId: target.documentId,
        targetRevision: 3,
        gross: 5,
      }),
    ).rejects.toMatchObject({ issue: { scope: "dimensions", rule: "conflict" } });
    await cancel(credit.receipt.actionId, source.documentId);
  });
  it.each(["AP", "AR"] as const)(
    "posts %s advances separately, applies partial amounts on both revisions, refunds and reverses the saved original amounts",
    async (side) => {
      const inv = invoice(
        side === "AR" ? { side, party: "C1", lines: [line({ product: "CONSULT" })] } : {},
      );
      await post(inv);
      const a = await act(advance(side));
      const entry = (await journals.entry("DEFAULT", a.receipt.journalIds[0])).entry;
      expect(entry.lines.map((l) => [l.account, l.debit, l.credit])).toEqual(
        side === "AP"
          ? [
              ["1250", 5650, 0],
              ["1000", 0, 5650],
            ]
          : [
              ["2300", 0, 5650],
              ["1000", 5650, 0],
            ],
      );
      expect(entry.lines.some((l) => l.account === "4000" || l.account === "2200")).toBe(false);
      const apply: TradeActionCommand = {
        ...actionHeader(),
        kind: "apply",
        sourceId: a.receipt.actionId,
        sourceRevision: 1,
        targetId: inv.documentId,
        targetRevision: 1,
        gross: 3001,
      };
      const applied = await act(apply);
      expect((await current(a.receipt.actionId)).remainingGross).toBe(2649);
      expect(await current(inv.documentId)).toMatchObject({
        remainingGross: 8299,
        remainingNet: 7344,
        remainingTax: 955,
      });
      expect(await service.confirmAction(applied.envelope)).toEqual(applied.receipt);
      await expect(
        service.previewAction({ ...apply, actionId: randomUUID() }),
      ).rejects.toMatchObject({ issue: { rule: "stale" } });
      const refunded = await settle(
        payment({ ...inv, documentId: a.receipt.actionId }, 2649, false, 2),
      );
      const refundEntry = (await journals.entry("DEFAULT", refunded.receipt.journalIds[0])).entry;
      expect(refundEntry.lines[0]).toMatchObject(
        side === "AP" ? { account: "1250", credit: 2649 } : { account: "2300", debit: 2649 },
      );
      await undo(refunded.receipt.paymentId, [a.receipt.actionId]);
      await undo(applied.receipt.actionId, [a.receipt.actionId, inv.documentId]);
      expect((await current(a.receipt.actionId)).remainingGross).toBe(5650);
      expect((await current(inv.documentId)).remainingGross).toBe(11300);
      const final = await act({
        ...apply,
        actionId: randomUUID(),
        sourceRevision: (await current(a.receipt.actionId)).revision,
        targetRevision: (await current(inv.documentId)).revision,
        gross: 5650,
      });
      expect(final.receipt.changes[0].after).toMatchObject({
        remainingGross: 0,
        remainingNet: 0,
        remainingTax: 0,
      });
    },
  );
  it("rejects foreign/missing/non-invoice targets, over-application, reused identities and stale confirmations without partial writes", async () => {
    const inv = invoice(),
      other = invoice({ party: "V2" });
    await post(inv);
    await post(other);
    const a = await act(advance());
    const command: Extract<TradeActionCommand, { kind: "apply" }> = {
      ...actionHeader(),
      kind: "apply",
      sourceId: a.receipt.actionId,
      sourceRevision: 1,
      targetId: inv.documentId,
      targetRevision: 1,
      gross: 5650,
    };
    for (const patch of [
      { gross: 5651 },
      { targetId: other.documentId },
      { targetId: a.receipt.actionId },
      { sourceId: inv.documentId },
      { sourceId: randomUUID() },
      { targetRevision: 2 },
      { accountingDate: "2026-01-24" },
    ]) {
      const before = counts();
      await expect(service.previewAction({ ...command, ...patch })).rejects.toBeDefined();
      expect(counts()).toEqual(before);
    }
    const preview = await service.previewAction(command);
    await settle(payment(inv, 1));
    const before = counts();
    await expect(
      service.confirmAction({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      }),
    ).rejects.toMatchObject({ issue: { rule: "stale" } });
    expect(counts()).toEqual(before);
    const invalidAdvance = advance();
    await expect(
      service.previewAction({ ...invalidAdvance, currency: "USD" } as TradeActionCommand),
    ).rejects.toMatchObject({ issue: { rule: "currency" } });
    await expect(
      service.previewAction({ ...advance(), actionId: inv.documentId }),
    ).rejects.toMatchObject({ issue: { rule: "duplicate" } });
  });
  it("D30 role relaxation never applies to M1 items: a swapped same-side account role is still rejected", async () => {
    const inv = invoice();
    await post(inv);
    const a = await act(advance());
    const db = new Database(filename);
    try {
      // Each M1 item's account now only satisfies the *other* same-side trade role.
      db.prepare(
        "UPDATE accounts SET category=?,report_group=?,normal_side=? WHERE company_id='DEFAULT' AND code=?",
      ).run("LIABILITY", "payables", "CREDIT", "1250");
      db.prepare(
        "UPDATE accounts SET category=?,report_group=?,normal_side=? WHERE company_id='DEFAULT' AND code=?",
      ).run("ASSET", "prepayments", "DEBIT", "2100");
    } finally {
      db.close();
    }
    const before = counts();
    await expect(
      service.previewSettlement(payment({ ...inv, documentId: a.receipt.actionId }, 1)),
    ).rejects.toMatchObject({ issue: { rule: "account" } });
    await expect(service.previewSettlement(payment(inv, 1))).rejects.toMatchObject({
      issue: { rule: "account" },
    });
    await expect(
      service.previewAction({
        ...actionHeader(),
        kind: "apply",
        sourceId: a.receipt.actionId,
        sourceRevision: 1,
        targetId: inv.documentId,
        targetRevision: 1,
        gross: 1,
      }),
    ).rejects.toMatchObject({ issue: { rule: "account" } });
    expect(counts()).toEqual(before);
  });
  it("M1 apply, settlement and credit never query legacy opening markers on the hot path", async () => {
    const inv = invoice();
    await post(inv);
    const a = await act(advance("AP", 100));
    const lookups: string[] = [];
    const counted = <T>(work: (repo: MasterDataRepository) => Promise<T>) =>
      ((repo: MasterDataRepository) =>
        work(
          new Proxy(repo, {
            get(target, key, receiver) {
              if (key === "tradeOpeningItems" || key === "tradeItemSource") lookups.push(key);
              return Reflect.get(target, key, receiver);
            },
          }),
        )) as (repo: MasterDataRepository) => Promise<T>;
    const original = service;
    service = new TradeDocumentService(
      { read: (work) => store.read(counted(work)), write: (work) => store.write(counted(work)) },
      journals,
      journalTools,
    );
    try {
      await act({
        ...actionHeader(),
        kind: "apply",
        sourceId: a.receipt.actionId,
        sourceRevision: 1,
        targetId: inv.documentId,
        targetRevision: 1,
        gross: 100,
      });
      await settle(payment(inv, 200, false, 2));
      await act({
        ...actionHeader(),
        kind: "credit",
        invoiceId: inv.documentId,
        revision: 3,
        lines: [{ sourceLineId: "L1", quantity: "1" }],
      });
    } finally {
      service = original;
    }
    expect(lookups).toEqual([]);
  });
  it.each(["AP", "AR"] as const)(
    "allocates %s credits from original prices/tax cumulatively, preserves the paid invoice and supports explicit credit refunds",
    async (side) => {
      const inv = invoice({
        ...(side === "AR" ? { side, party: "C1" } : {}),
        lines: [
          line({
            quantity: "3",
            unitPrice: "24.396667",
            product: side === "AP" ? "RENT" : "CONSULT",
          }),
        ],
      });
      await post(inv);
      await settle(payment(inv, 8197));
      let revision = 2;
      const credits = [];
      for (let index = 0; index < 3; index++) {
        credits.push(
          await act({
            ...actionHeader(),
            kind: "credit",
            invoiceId: inv.documentId,
            revision: revision++,
            lines: [{ sourceLineId: "L1", quantity: "1" }],
          }),
        );
      }
      const original = await service.detail("DEFAULT", inv.documentId);
      expect(original.openItem.remainingGross).toBe(original.document.gross - 8197);
      expect(credits.reduce((n, c) => n + c.receipt.gross, 0)).toBe(original.document.gross);
      expect(credits.reduce((n, c) => n + c.receipt.creditLines[0].tax, 0)).toBe(
        original.document.tax,
      );
      await expect(
        service.previewAction({
          ...actionHeader(),
          kind: "credit",
          invoiceId: inv.documentId,
          revision,
          lines: [{ sourceLineId: "L1", quantity: "0.000001" }],
        }),
      ).rejects.toMatchObject({ issue: { rule: "quantity" } });
      const creditId = credits[0].receipt.actionId;
      await expect(
        service.previewSettlement(
          payment({ ...inv, documentId: creditId }, credits[0].receipt.gross, true),
        ),
      ).rejects.toMatchObject({ issue: { path: "items.0.takeDiscount" } });
      const refunded = await settle(
        payment({ ...inv, documentId: creditId }, credits[0].receipt.gross),
      );
      expect((await current(creditId)).status).toBe("settled");
      await undo(refunded.receipt.paymentId, [creditId]);
      await cancel(creditId, inv.documentId);
      await act({
        ...actionHeader(),
        kind: "credit",
        invoiceId: inv.documentId,
        revision: (await current(inv.documentId)).revision,
        lines: [{ sourceLineId: "L1", quantity: "1" }],
      });
    },
  );
  it("records same-account same-dimension credit applications without GL, reverses them without current account availability, and never loses either side", async () => {
    const inv = invoice();
    await post(inv);
    const credit = await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: inv.documentId,
      revision: 1,
      lines: [{ sourceLineId: "L1", quantity: "5" }],
    });
    const applied = await act({
      ...actionHeader(),
      kind: "apply",
      sourceId: credit.receipt.actionId,
      sourceRevision: 1,
      targetId: inv.documentId,
      targetRevision: 2,
      gross: 5650,
    });
    expect(applied.receipt.journalIds).toEqual([]);
    expect(applied.preview.journal.journals).toEqual([]);
    const control = await master.account("DEFAULT", "2100");
    const { builtin: _, revision, ...input } = control;
    await master.saveAccount("DEFAULT", { ...input, active: false }, revision);
    const reversed = await undo(applied.receipt.actionId, [
      credit.receipt.actionId,
      inv.documentId,
    ]);
    expect(reversed.receipt.journalIds).toEqual([]);
    expect((await current(credit.receipt.actionId)).remainingGross).toBe(5650);
    expect((await current(inv.documentId)).remainingGross).toBe(11300);
    const canceled = await cancel(credit.receipt.actionId, inv.documentId);
    const historical = (await journals.entry("DEFAULT", canceled.receipt.journalIds[0])).entry;
    expect(historical.lines.every((l) => l.role === "historical")).toBe(true);
  });
  it("requires dependency undo, restores credited and order quantities, and rejects duplicate cancellations and inverse dates", async () => {
    await service.createOrder(order());
    const inv = invoice({ orderId: "PO-1", lines: [line({ orderLineId: "OL1" })] });
    await post(inv);
    const credit = await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: inv.documentId,
      revision: 1,
      lines: [{ sourceLineId: "L1", quantity: "1" }],
    });
    await expect(cancel(inv.documentId)).rejects.toMatchObject({ issue: { rule: "reference" } });
    const refunded = await settle(payment({ ...inv, documentId: credit.receipt.actionId }, 1130));
    await expect(cancel(credit.receipt.actionId, inv.documentId)).rejects.toMatchObject({
      issue: { rule: "reference" },
    });
    await undo(refunded.receipt.paymentId, [credit.receipt.actionId], "2026-02-01");
    await expect(cancel(credit.receipt.actionId, inv.documentId)).rejects.toMatchObject({
      issue: { path: "accountingDate" },
    });
    await cancel(credit.receipt.actionId, inv.documentId, "2026-02-01");
    await cancel(inv.documentId, undefined, "2026-02-01");
    await expect(cancel(inv.documentId, undefined, "2026-02-01")).rejects.toBeDefined();
    expect((await current(inv.documentId)).status).toBe("cancelled");
    await post({
      ...inv,
      documentId: randomUUID(),
      externalInvoice: "REPLACEMENT",
      accountingDate: "2026-02-01",
    });
    expect((await service.actions("DEFAULT", inv.documentId)).map((r) => r.command.kind)).toEqual(
      expect.arrayContaining(["credit", "cancel"]),
    );
  });
  it("cancels full unapplied AP and AR advances by exact history after configuration is disabled and prevents refund/cancel double use", async () => {
    const ap = await act(advance()),
      ar = await act(advance("AR"));
    for (const code of ["1250", "2300"]) {
      const { builtin: _, revision, ...input } = await master.account("DEFAULT", code);
      await master.saveAccount("DEFAULT", { ...input, active: false }, revision);
    }
    for (const a of [ap, ar]) {
      const canceled = await cancel(a.receipt.actionId);
      const source = (await journals.entry("DEFAULT", a.receipt.journalIds[0])).entry;
      const reverse = (await journals.entry("DEFAULT", canceled.receipt.journalIds[0])).entry;
      expect(reverse.lines.map((l) => [l.account, l.debit, l.credit, l.dimensions])).toEqual(
        source.lines.map((l) => [l.account, l.credit, l.debit, l.dimensions]),
      );
      expect(await service.confirmAction(a.envelope)).toEqual(a.receipt);
    }
  });
  it("rolls back both application balances, receipts, GL and evidence on a late failure and survives reopen with immutable retry", async () => {
    const inv = invoice();
    await post(inv);
    const a = await act(advance());
    const command: TradeActionCommand = {
      ...actionHeader(),
      kind: "apply",
      sourceId: a.receipt.actionId,
      sourceRevision: 1,
      targetId: inv.documentId,
      targetRevision: 1,
      gross: 1,
    };
    const preview = await service.previewAction(command);
    const failing = new TradeDocumentService(
      {
        read: store.read,
        write: (work) =>
          store.write((repo) =>
            work({
              ...repo,
              insertTradeAction: async () => {
                throw new Error("injected late failure");
              },
            }),
          ),
      },
      journals,
      journalTools,
    );
    const before = counts();
    await expect(
      failing.confirmAction({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      }),
    ).rejects.toMatchObject({ code: "STORAGE_FAILURE" });
    expect(counts()).toEqual(before);
    expect((await current(a.receipt.actionId)).revision).toBe(1);
    expect((await current(inv.documentId)).revision).toBe(1);
    const accepted = await act(command);
    await store.close();
    store = createMasterDataStore({ filename });
    journals = new JournalService(store, journalTools);
    service = new TradeDocumentService(store, journals, journalTools);
    expect(await service.confirmAction(accepted.envelope)).toEqual(accepted.receipt);
    expect((await current(inv.documentId)).remainingGross).toBe(11299);
    const db = new Database(filename);
    try {
      expect(db.pragma("foreign_key_check")).toEqual([]);
      expect(() => db.prepare("DELETE FROM trade_actions").run()).toThrow("immutable");
    } finally {
      db.close();
    }
  });
  it("serializes competing application confirmations from independent SQLite handles and preserves the successful original envelope", async () => {
    const inv = invoice();
    await post(inv);
    const a = await act(advance());
    const command: TradeActionCommand = {
      ...actionHeader(),
      kind: "apply",
      sourceId: a.receipt.actionId,
      sourceRevision: 1,
      targetId: inv.documentId,
      targetRevision: 1,
      gross: 5650,
    };
    const otherExecutor = await SqliteExecutor.create({ filename, readers: 2 });
    const other = otherExecutor.services().tradeDocs;
    try {
      const competing = { ...command, actionId: randomUUID() };
      const [first, second] = await Promise.all([
        service.previewAction(command),
        other.previewAction(competing),
      ]);
      const envelope = {
        command,
        fingerprint: first.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST" as const,
      };
      const next = {
        ...envelope,
        command: competing,
        fingerprint: second.fingerprint,
        idempotencyKey: randomUUID(),
      };
      const results = await Promise.allSettled([
        service.confirmAction(envelope),
        other.confirmAction(next),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toMatchObject([
        { reason: { code: "CONFLICT" } },
      ]);
      expect((await current(inv.documentId)).remainingGross).toBe(5650);
      expect((await current(a.receipt.actionId)).remainingGross).toBe(0);
    } finally {
      await otherExecutor.close();
    }
  });
  it("allocates non-deductible tax without a negative expense slice, uses original tax after rate changes and rejects inactive new-write accounts", async () => {
    const trade = new TradeMasterService(store);
    const tax = await trade.get("DEFAULT", "taxCode", "VAT");
    if (tax.kind !== "taxCode") throw new Error("Missing tax");
    await trade.save({
      ...base,
      kind: tax.kind,
      code: tax.code,
      expectedRevision: tax.revision,
      data: { ...tax.data, deductiblePercent: "50" },
    });
    const inv = invoice({ lines: [line({ quantity: "3", unitPrice: "0.05" })] });
    await post(inv);
    const credits = [];
    for (let revision = 1; revision <= 3; revision++)
      credits.push(
        await act({
          ...actionHeader(),
          accountingDate: "2026-03-16",
          taxDate: "2026-03-16",
          kind: "credit",
          invoiceId: inv.documentId,
          revision,
          lines: [{ sourceLineId: "L1", quantity: "1" }],
        }),
      );
    expect(credits.map((c) => c.receipt.creditLines[0].tax)).toEqual([1, 0, 1]);
    expect(credits.reduce((n, c) => n + c.receipt.creditLines[0].deductibleTax, 0)).toBe(1);
    await cancel(credits[0].receipt.actionId, inv.documentId, "2026-03-16");
    const control = await master.account("DEFAULT", "2100");
    const { builtin: _, revision, ...input } = control;
    await master.saveAccount("DEFAULT", { ...input, active: false }, revision);
    await expect(
      service.previewAction({
        ...actionHeader(),
        accountingDate: "2026-03-16",
        kind: "credit",
        invoiceId: inv.documentId,
        revision: 5,
        lines: [{ sourceLineId: "L1", quantity: "1" }],
      }),
    ).rejects.toMatchObject({ issue: { rule: "account" } });
  });
  it("requires new undo identities, reasons, exact object revisions and an open accounting period, including no-GL reversals", async () => {
    const inv = invoice();
    await post(inv);
    const credit = await act({
      ...actionHeader(),
      kind: "credit",
      invoiceId: inv.documentId,
      revision: 1,
      lines: [{ sourceLineId: "L1", quantity: "1" }],
    });
    const applied = await act({
      ...actionHeader(),
      kind: "apply",
      sourceId: credit.receipt.actionId,
      sourceRevision: 1,
      targetId: inv.documentId,
      targetRevision: 2,
      gross: 1130,
    });
    const command: TradeActionCommand = {
      ...actionHeader(),
      kind: "reverse",
      settlementId: applied.receipt.actionId,
      reason: "Correction",
      items: [
        { itemId: credit.receipt.actionId, revision: 2 },
        { itemId: inv.documentId, revision: 3 },
      ],
    };
    for (const invalid of [
      { ...command, reason: "" },
      { ...command, reason: " " },
      { ...command, actionId: applied.receipt.actionId },
      { ...command, items: [command.items[0]] },
      { ...command, items: [{ itemId: inv.documentId, revision: 2 }, command.items[0]] },
    ]) {
      const before = counts();
      await expect(service.previewAction(invalid)).rejects.toBeDefined();
      expect(counts()).toEqual(before);
    }
    const preview = await service.previewAction(command);
    await master.setPeriod("DEFAULT", "2026-01", 2, "frozen", "Fictional hold", true);
    await expect(
      service.confirmAction({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      }),
    ).rejects.toBeDefined();
    expect((await current(credit.receipt.actionId)).remainingGross).toBe(0);
    expect(await service.confirmAction(applied.envelope)).toEqual(applied.receipt);
  });
  it("allocates TC-T06 net/tax exactly, takes an explicit inclusive-deadline discount and consumes the final remainder without changing invoice tax", async () => {
    const trade = new TradeMasterService(store);
    await trade.save({
      ...base,
      kind: "taxCode",
      code: "VAT",
      expectedRevision: 1,
      data: {
        ...window,
        mode: "ordinary",
        deductiblePercent: "100",
        inputAccount: "1400",
        outputAccount: "2200",
        rates: [{ id: "RATE", from: "2026-01-01", to: "2026-12-31", ratePercent: "12" }],
      },
    });
    const command = invoice({
      accountingDate: "2026-01-05",
      documentDate: "2026-01-05",
      taxDate: "2026-01-05",
      lines: [line({ quantity: "1", unitPrice: "73.19" })],
    });
    await post(command);
    const first = payment(command, 4099, true);
    const partial = { ...first, accountingDate: "2026-01-12" };
    const before = counts();
    const planned = await service.previewSettlement(partial);
    expect(counts()).toEqual(before);
    expect(planned).toMatchObject({
      gross: 4099,
      discount: 55,
      cash: 4044,
      allocations: [
        {
          net: 3660,
          tax: 439,
          remainingGross: 4098,
          remainingNet: 3659,
          remainingTax: 439,
          discountAvailable: true,
        },
      ],
    });
    const { receipt, envelope } = await settle(partial);
    expect((await journals.entry("DEFAULT", receipt.journalIds[0])).entry.lines).toMatchObject([
      { account: "2100", debit: 4099, credit: 0 },
      { account: "1000", debit: 0, credit: 4044 },
      { account: "4000", debit: 0, credit: 55 },
    ]);
    expect(await service.confirmSettlement(envelope)).toEqual(receipt);
    await expect(
      service.previewSettlement({
        ...partial,
        paymentId: randomUUID(),
        accountingDate: "2026-01-13",
        documentDate: "2026-01-12",
        items: [{ ...partial.items[0], revision: 2, gross: 4098 }],
      }),
    ).rejects.toMatchObject({ issue: { path: "items.0.takeDiscount", rule: "reference" } });
    const final = await settle({
      ...partial,
      paymentId: randomUUID(),
      accountingDate: "2026-01-13",
      items: [{ ...partial.items[0], revision: 2, gross: 4098, takeDiscount: false }],
    });
    expect(final.receipt).toMatchObject({
      discount: 0,
      cash: 4098,
      allocations: [
        {
          net: 3659,
          tax: 439,
          settledGross: 8197,
          remainingGross: 0,
          remainingNet: 0,
          remainingTax: 0,
        },
      ],
    });
    const detail = await service.detail("DEFAULT", command.documentId);
    expect(detail.document).toMatchObject({ net: 7319, tax: 878, gross: 8197 });
    expect(detail.openItem).toMatchObject({ remainingGross: 0, status: "settled", revision: 3 });
    expect(detail.settlements).toHaveLength(2);
    const full = { ...command, documentId: randomUUID(), externalInvoice: "FULL" };
    await post(full);
    expect(
      (await settle({ ...payment(full, 8197, true), accountingDate: "2026-01-12" })).receipt,
    ).toMatchObject({ discount: 110, cash: 8087 });
  });

  it("freezes invoice discount terms, prohibits partial discounts when disabled, and never automatically takes an available discount", async () => {
    const terms = configs.find((c) => c.kind === "tradeTerms");
    if (terms?.kind !== "tradeTerms") throw new Error("Missing terms fixture");
    const trade = new TradeMasterService(store);
    await trade.save({
      ...terms,
      expectedRevision: 1,
      data: { ...terms.data, allowPartialDiscount: false },
    });
    const command = invoice();
    await post(command);
    await trade.save({
      ...terms,
      expectedRevision: 2,
      data: { ...terms.data, discountPercent: "50", allowPartialDiscount: true },
    });
    await expect(service.previewSettlement(payment(command, 5650, true))).rejects.toMatchObject({
      issue: { path: "items.0.takeDiscount", rule: "reference" },
    });
    const full = await service.previewSettlement(payment(command, 11300, true));
    expect(full).toMatchObject({ discount: 150, cash: 11150 });
    await settle(payment(command, 5650));
    await expect(service.previewSettlement(payment(command, 5650, true, 2))).rejects.toMatchObject({
      issue: { path: "items.0.takeDiscount", rule: "reference" },
    });
    expect((await settle(payment(command, 5650, false, 2))).receipt.discount).toBe(0);
  });

  it("rejects overpayment, foreign party/currency/side, duplicate or missing selections, backdating, and stale concurrent revisions atomically", async () => {
    const command = invoice();
    await post(command);
    const valid = payment(command, 1000);
    const before = counts();
    for (const invalid of [
      { ...valid, items: [] },
      { ...valid, items: [{ ...valid.items[0], gross: 11301 }] },
      { ...valid, party: "V2" },
      { ...valid, currency: "USD" },
      { ...valid, side: "AR" as const },
      { ...valid, items: [valid.items[0], valid.items[0]] },
      { ...valid, items: [{ ...valid.items[0], itemId: randomUUID() }] },
      { ...valid, accountingDate: "2026-01-19" },
    ])
      await expect(service.previewSettlement(invalid)).rejects.toBeDefined();
    expect(counts()).toEqual(before);
    const competing = { ...valid, paymentId: randomUUID() };
    const [a, b] = await Promise.all([
      service.previewSettlement(valid),
      service.previewSettlement(competing),
    ]);
    const envelope = (c: TradeSettlementCommand, fingerprint: string) => ({
      command: c,
      fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    });
    const results = await Promise.allSettled([
      service.confirmSettlement(envelope(valid, a.fingerprint)),
      service.confirmSettlement(envelope(competing, b.fingerprint)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toMatchObject([
      { reason: { code: "CONFLICT", issue: { rule: "stale" } } },
    ]);
    expect(counts()).toMatchObject({ trade_payments: 1, settlements: 1 });
    const after = counts();
    await expect(
      service.previewSettlement({
        ...valid,
        paymentId: randomUUID(),
        accountingDate: "2026-01-24",
        items: [{ ...valid.items[0], revision: 2 }],
      }),
    ).rejects.toMatchObject({ issue: { path: "accountingDate" } });
    expect(counts()).toEqual(after);
  });

  it("posts AR collections in the opposite direction and rejects identity reuse while preserving retry after restart or configuration edits", async () => {
    const command = invoice({ side: "AR", party: "C1", lines: [line({ product: "CONSULT" })] });
    await post(command);
    const result = await settle(payment(command, 11300, true));
    expect(
      (await journals.entry("DEFAULT", result.receipt.journalIds[0])).entry.lines,
    ).toMatchObject([
      { account: "1300", debit: 0, credit: 11300 },
      { account: "1000", debit: 11150, credit: 0 },
      { account: "4000", debit: 150, credit: 0 },
    ]);
    const other = invoice({ side: "AR", party: "C1", lines: [line({ product: "CONSULT" })] });
    await post(other);
    await expect(
      service.previewSettlement({ ...payment(other, 100), paymentId: result.receipt.paymentId }),
    ).rejects.toMatchObject({ issue: { rule: "duplicate" } });
    await expect(
      service.confirmSettlement({
        ...result.envelope,
        command: { ...result.envelope.command, documentDate: "2026-01-24" },
      }),
    ).rejects.toMatchObject({ issue: { rule: "idempotency" } });
    await store.close();
    store = createMasterDataStore({ filename });
    service = new TradeDocumentService(
      store,
      new JournalService(store, journalTools),
      journalTools,
    );
    expect(await service.confirmSettlement(result.envelope)).toEqual(result.receipt);
  });

  it("preserves original control dimensions and account after partner edits, uses current cash profile, and rejects structural redirection or inactive original accounts", async () => {
    const dimensions = new DimensionService(store);
    const range = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
    await dimensions.save("DEFAULT", {
      ...range,
      kind: "dimension",
      code: "DEPT",
      name: "Department",
    });
    for (const code of ["A", "B"])
      await dimensions.save("DEFAULT", {
        ...range,
        kind: "value",
        dimension: "DEPT",
        code,
        name: code,
      });
    const command = invoice({ headerDimensions: { DEPT: "A" } });
    await post(command);
    const trade = new TradeMasterService(store);
    const party = await trade.get("DEFAULT", "tradeParty", "V1");
    const profile = await trade.get("DEFAULT", "tradeProfile", "PAY");
    if (party.kind !== "tradeParty" || profile.kind !== "tradeProfile")
      throw new Error("Fixture kind");
    const cash = await master.account("DEFAULT", "1000");
    await master.saveAccount("DEFAULT", { ...cash, code: "1010", name: "Second cash" }, 0);
    const control = await master.account("DEFAULT", "2100");
    await master.saveAccount("DEFAULT", { ...control, code: "2110", name: "New control" }, 0);
    await trade.save({
      ...base,
      kind: party.kind,
      code: party.code,
      expectedRevision: party.revision,
      data: { ...party.data, defaultDimensions: { DEPT: "B" } },
    });
    await trade.save({
      ...base,
      kind: profile.kind,
      code: profile.code,
      expectedRevision: profile.revision,
      data: { ...profile.data, controlAccount: "2110", cashAccount: "1010" },
    });
    const selection = payment(command, 1000);
    const preview = await service.previewSettlement(selection);
    expect(preview.journal.journals[0].lines).toMatchObject([
      { account: "2100", debit: 1000, dimensions: { DEPT: "A" } },
      { account: "1010", credit: 1000 },
    ]);
    await dimensions.save("DEFAULT", {
      ...range,
      kind: "structure",
      code: "2100",
      required: ["DEPT"],
      optional: [],
      forbidden: [],
      allowed: [],
      fixed: { DEPT: "B" },
      conditionals: [],
    });
    await expect(service.previewSettlement(selection)).rejects.toBeDefined();
    await master.saveAccount("DEFAULT", { ...control, active: false }, control.revision);
    await expect(service.previewSettlement(selection)).rejects.toMatchObject({
      issue: { rule: "account" },
    });
  });

  it("settles explicitly selected multiple invoices atomically and rolls back GL, receipts, links and all balances on a late failure", async () => {
    const first = invoice(),
      second = invoice();
    await post(first);
    await post(second);
    const command = {
      ...payment(first, 1000, true),
      items: [payment(first, 1000, true).items[0], payment(second, 2000, true).items[0]],
    };
    const preview = await service.previewSettlement(command);
    const envelope = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    };
    const before = counts();
    const original = store.write.bind(store);
    let reachedFailure = false;
    store.write = (operation) =>
      original((repo) =>
        operation({
          ...repo,
          settleOpenItem: async (...args) => {
            await repo.settleOpenItem(...args);
            if (args[6].itemId === second.documentId) {
              reachedFailure = true;
              throw new Error("Synthetic late failure");
            }
          },
        }),
      );
    await expect(service.confirmSettlement(envelope)).rejects.toMatchObject({
      code: "STORAGE_FAILURE",
    });
    expect(reachedFailure).toBe(true);
    store.write = original;
    expect(counts()).toEqual(before);
    expect((await service.detail("DEFAULT", first.documentId)).openItem).toMatchObject({
      remainingGross: 11300,
      revision: 1,
    });
    const receipt = await service.confirmSettlement(envelope);
    expect(receipt).toMatchObject({ gross: 3000, discount: 40, cash: 2960 });
    expect(counts()).toMatchObject({ trade_payments: 1, settlements: 2 });
    const raw = new Database(filename);
    try {
      raw.pragma("foreign_keys = ON");
      expect(() =>
        raw
          .prepare(
            "INSERT INTO settlements SELECT company_id,?,item_id,side,accounting_date,applied_gross_minor,applied_net_minor,applied_tax_minor,discount_minor,receipt_key,NULL,recorded_at FROM settlements LIMIT 1",
          )
          .run(randomUUID()),
      ).toThrow("settlement requires trade payment source");
    } finally {
      raw.close();
    }
  });

  it("posts an AP expense invoice through the TRADE adapter with GL, open item, receipt and audit in one transaction", async () => {
    const command = invoice({ externalInvoice: " inv-7  a " });
    const before = counts();
    const preview = await service.preview(command);
    expect(counts()).toEqual(before);
    expect(preview).toMatchObject({
      poMatch: "notApplicable",
      dueDate: "2026-02-17",
      discountDate: "2026-01-25",
      controlAccount: "2100",
      calculation: { net: 10000, tax: 1300, gross: 11300 },
      journal: {
        module: "TRADE",
        date: "2026-01-20",
        documentDate: "2026-01-18",
        taxDate: "2026-01-19",
      },
    });
    const key = randomUUID();
    const confirm = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: key,
      confirmation: "POST" as const,
    };
    const receipt = await service.confirm(confirm);
    expect(receipt).toMatchObject({
      documentId: command.documentId,
      poMatch: "notApplicable",
      gross: 11300,
    });
    const { entry } = await journals.entry("DEFAULT", receipt.journalIds[0]);
    expect(entry).toMatchObject({
      module: "TRADE",
      sourceRef: `TRADE-AP-INV:${command.documentId}`,
      lines: [
        { account: "2100", debit: 0, credit: 11300 },
        { account: "5000", debit: 10000, credit: 0 },
        { account: "1400", debit: 1300, credit: 0 },
      ],
    });
    const detail = await service.detail("DEFAULT", command.documentId);
    expect(detail.document).toMatchObject({
      externalNo: "inv-7  a",
      externalNoNormalized: "INV-7  A",
      journalId: receipt.journalIds[0],
      poMatch: "notApplicable",
      gross: 11300,
    });
    expect(detail.openItem).toMatchObject({
      side: "AP",
      party: "V1",
      controlAccount: "2100",
      gross: 11300,
      remainingGross: 11300,
      remainingNet: 10000,
      remainingTax: 1300,
      status: "open",
      dueDate: "2026-02-17",
    });
    expect(detail.receipt).toEqual(receipt);
    const after = counts();
    expect(after).toMatchObject({
      journal_entries: before.journal_entries + 1,
      receipts: before.receipts + 1,
      trade_documents: 1,
      trade_document_lines: 1,
      open_items: 1,
    });
    // Same envelope retry returns the original receipt without another write.
    expect(await service.confirm(confirm)).toEqual(receipt);
    expect(counts()).toEqual(after);
    // The same key with a different command is a conflict, never a second posting.
    await expect(
      service.confirm({ ...confirm, command: { ...command, externalInvoice: "OTHER" } }),
    ).rejects.toMatchObject({ code: "CONFLICT", issue: { rule: "idempotency" } });
    // A manual journal reusing the trade receipt key is rejected too.
    const draft = await journals.save("DEFAULT", {
      id: randomUUID(),
      revision: 0,
      sourceRef: "MANUAL-REUSE",
      date: "2026-01-20",
      memo: "Manual",
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines: [
        { account: "5000", debit: "1.00", credit: "", dimensions: {}, suspense: null },
        { account: "1000", debit: "", credit: "1.00", dimensions: {}, suspense: null },
      ],
    });
    const manual = await journals.preview("DEFAULT", draft);
    await expect(
      journals.confirm({
        company: "DEFAULT",
        draftId: draft.id,
        revision: draft.revision,
        fingerprint: manual.fingerprint,
        idempotencyKey: key,
        confirmation: "POST",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(counts()).toEqual({ ...after, audit: after.audit });
    expect(
      (await service.list("DEFAULT", { limit: 10 })).items.map((item) => item.documentId),
    ).toEqual([command.documentId]);
    expect(
      (await service.openItems("DEFAULT", { limit: 10, party: "V1", status: "open" })).items,
    ).toHaveLength(1);
  });

  it("posts an AR service invoice debiting the AR control account while manual, AI and reversal routes stay closed", async () => {
    const command = invoice({
      side: "AR",
      party: "C1",
      lines: [line({ product: "CONSULT", quantity: "2", unitPrice: "150.00" })],
    });
    const { receipt } = await post(command);
    const { entry } = await journals.entry("DEFAULT", receipt.journalIds[0]);
    expect(entry).toMatchObject({
      module: "TRADE",
      lines: [
        { account: "1300", debit: 33900, credit: 0 },
        { account: "4000", debit: 0, credit: 30000 },
        { account: "2200", debit: 0, credit: 3900 },
      ],
    });
    expect((await service.detail("DEFAULT", command.documentId)).openItem).toMatchObject({
      side: "AR",
      controlAccount: "1300",
      remainingGross: 33900,
    });
    const before = counts();
    for (const account of ["1300", "2100", "2200"]) {
      const draft = await journals.save("DEFAULT", {
        id: randomUUID(),
        revision: 0,
        sourceRef: `MANUAL-${account}`,
        date: "2026-01-20",
        memo: "Manual control",
        kind: "normal",
        operation: "journal",
        originalId: null,
        headerDimensions: {},
        lines: [
          { account, debit: "5.00", credit: "", dimensions: {}, suspense: null },
          { account: "4000", debit: "", credit: "5.00", dimensions: {}, suspense: null },
        ],
      });
      await expect(journals.preview("DEFAULT", draft)).rejects.toMatchObject({
        issue: { rule: "manual" },
      });
      const candidate = parseAiCandidate(
        JSON.stringify({
          date: draft.date,
          memo: draft.memo,
          kind: draft.kind,
          rationale: "Untrusted AI",
          lines: draft.lines.map(({ account, debit, credit }) => ({ account, debit, credit })),
        }),
        randomUUID(),
      );
      if (!candidate) throw new Error("Missing fictional AI candidate");
      await expect(journals.preview("DEFAULT", candidate.draft)).rejects.toMatchObject({
        issue: { rule: "manual" },
      });
      await journals.remove("DEFAULT", draft.id, draft.revision);
    }
    const reversal = await journals.save("DEFAULT", {
      id: randomUUID(),
      revision: 0,
      sourceRef: "MANUAL-REVERSE-TRADE",
      date: "2026-01-21",
      memo: "Generic reversal",
      kind: "normal",
      operation: "reverse",
      originalId: receipt.journalIds[0],
      headerDimensions: {},
      lines: [],
    });
    await expect(journals.preview("DEFAULT", reversal)).rejects.toMatchObject({
      issue: { path: "originalId", rule: "source" },
    });
    await journals.remove("DEFAULT", reversal.id, reversal.revision);
    expect(counts()).toEqual(before);
  });

  it("keeps posted documents, lines, orders and open-item identity immutable in SQLite", async () => {
    await service.createOrder(order());
    const { receipt } = await post(invoice());
    const db = new Database(filename);
    try {
      for (const statement of [
        "UPDATE trade_documents SET external_no='X'",
        "DELETE FROM trade_documents",
        "UPDATE trade_document_lines SET quantity='1'",
        "DELETE FROM trade_document_lines",
        "UPDATE trade_orders SET party_id='V2'",
        "DELETE FROM trade_order_lines",
        "DELETE FROM open_items",
        "UPDATE open_items SET gross_minor=1",
        "UPDATE open_items SET remaining_gross_minor=0,remaining_net_minor=0,remaining_tax_minor=0,status='settled'",
      ])
        expect(() => db.prepare(statement).run()).toThrow();
      db.prepare(
        "UPDATE open_items SET remaining_gross_minor=0,remaining_net_minor=0,remaining_tax_minor=0,status='settled',revision=revision+1",
      ).run();
      expect(
        db
          .prepare("SELECT status,revision FROM open_items WHERE item_id=?")
          .get(receipt.documentId),
      ).toEqual({
        status: "settled",
        revision: 2,
      });
    } finally {
      db.close();
    }
  });

  it("normalizes external invoice numbers (NFKC, trim, upper, internal blanks kept) and enforces per-party uniqueness in the database", async () => {
    expect(normalizeExternalInvoice("  ｉｎｖ－００１　a ")).toBe("INV-001 A");
    await post(invoice({ externalInvoice: "inv-001 a" }));
    for (const duplicate of ["  ｉｎｖ－００１ a ", "INV-001 A", "Inv-001 a"]) {
      const command = invoice({ externalInvoice: duplicate });
      const before = counts();
      await expect(service.preview(command)).rejects.toMatchObject({
        code: "CONFLICT",
        issue: { path: "externalInvoice", rule: "duplicate" },
      });
      // A precomputed fingerprint cannot bypass the duplicate rule either.
      await expect(
        service.confirm({
          command,
          fingerprint: "0".repeat(64),
          idempotencyKey: randomUUID(),
          confirmation: "POST",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", issue: { rule: "duplicate" } });
      expect(counts()).toEqual(before);
    }
    await post(invoice({ externalInvoice: "INV-001  A" }));
    await post(invoice({ externalInvoice: "INV-001A" }));
    await post(invoice({ externalInvoice: "INV-001 A", party: "V2" }));
    const db = new Database(filename);
    try {
      expect(() =>
        db
          .prepare(
            "INSERT INTO trade_documents(company_id,document_id,kind,side,party_id,external_no,external_no_normalized,currency,accounting_date,document_date,tax_date,due_date,order_id,po_match,exception_reason,net_minor,tax_minor,gross_minor,journal_id,receipt_key,fingerprint,command_hash,snapshot,posted_at) SELECT company_id,?,kind,side,party_id,external_no,external_no_normalized,currency,accounting_date,document_date,tax_date,due_date,order_id,po_match,exception_reason,net_minor,tax_minor,gross_minor,journal_id,?,fingerprint,command_hash,snapshot,posted_at FROM trade_documents WHERE party_id='V1' AND external_no_normalized='INV-001 A'",
          )
          .run(randomUUID(), randomUUID()),
      ).toThrow(/UNIQUE/u);
    } finally {
      db.close();
    }
  });

  it("matches order lines by prorated stored net with an inclusive 1% tolerance and requires explicit exceptions for price variance only", async () => {
    const created = await service.createOrder(order());
    expect(created.lines.map((item) => item.net)).toEqual([10000, 10000]);
    expect(await service.createOrder(order())).toEqual(created);
    await expect(service.createOrder(order({ party: "V2" }))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const matched = (changes: Partial<TradeInvoiceLineInput>[]) =>
      invoice({
        orderId: "PO-1",
        lines: changes.map((change, index) =>
          line({
            lineId: `L${index + 1}`,
            orderLineId: "OL1",
            quantity: "5",
            unitPrice: "10.10",
            ...change,
          }),
        ),
      });
    // E = 5000 minor for half the order line; 5050 is exactly 1% above (inclusive boundary).
    const boundary = await post(matched([{}]));
    expect(boundary.preview.matches).toEqual([
      expect.objectContaining({
        expectedNet: 5000,
        invoiceNet: 5050,
        variance: 50,
        withinTolerance: true,
      }),
    ]);
    expect(boundary.receipt.poMatch).toBe("matched");
    // Remaining 5 units: 10.11 overprices beyond 1% and needs an explicit exception.
    await rejects(matched([{ unitPrice: "10.11" }]), { path: "matchingException", rule: "price" });
    // Underpricing beyond 1% is also a variance that needs explicit approval.
    await rejects(matched([{ unitPrice: "9.89" }]), { path: "matchingException", rule: "price" });
    // An exception without any variance is rejected instead of being recorded as approval.
    await rejects(
      invoice({ ...matched([{}]), matchingException: { confirmed: true, reason: "Not needed" } }),
      { rule: "exception" },
    );
    // Order identity rules can never be excepted.
    const exception = { confirmed: true as const, reason: "Fictional supplier surcharge approved" };
    for (const [command, issue] of [
      [matched([{ quantity: "6" }]), { path: "lines.0.quantity", rule: "quantity" }],
      [matched([{ orderLineId: "OL2" }]), { path: "lines.0.orderLineId", rule: "orderLine" }],
      [matched([{ orderLineId: "MISSING" }]), { path: "lines.0.orderLineId", rule: "orderLine" }],
      [matched([{ orderLineId: null }]), { path: "lines.0.orderLineId", rule: "orderLine" }],
      [matched([{ quantity: "1" }, { quantity: "1" }]), { path: "lines", rule: "orderLine" }],
      [invoice({ ...matched([{}]), party: "V2" }), { path: "orderId", rule: "order" }],
      [invoice({ ...matched([{}]), orderId: "PO-NONE" }), { path: "orderId", rule: "order" }],
      [
        invoice({ lines: [line({ orderLineId: "OL1" })] }),
        { path: "matchingException", rule: "exception" },
      ],
    ] as const)
      await rejects({ ...command, matchingException: exception }, issue);
    await rejects(invoice({ lines: [line({ orderLineId: "OL1" })] }), {
      path: "lines.0.orderLineId",
      rule: "orderLine",
    });
    const excepted = await post({
      ...matched([{ unitPrice: "10.11" }]),
      matchingException: exception,
    });
    expect(excepted.receipt.poMatch).toBe("exception");
    const detail = await service.detail("DEFAULT", excepted.receipt.documentId);
    expect(detail.document).toMatchObject({
      poMatch: "exception",
      exceptionReason: exception.reason,
    });
    expect(detail.document.lines[0]).toMatchObject({
      expectedNet: 5000,
      net: 5055,
      matchStatus: "exception",
    });
    // Cumulative quantity is now exhausted on OL1.
    await rejects(
      { ...matched([{ quantity: "1" }]), matchingException: exception },
      { rule: "quantity" },
    );
    // A different line of the same order still matches independently.
    const wage = await post(
      invoice({
        orderId: "PO-1",
        lines: [line({ product: "WAGE", orderLineId: "OL2", quantity: "4", unitPrice: "25.00" })],
      }),
    );
    expect(wage.receipt.poMatch).toBe("matched");
  });

  it("re-validates account roles at confirm when an account is reclassified after preview", async () => {
    const command = invoice();
    const preview = await service.preview(command);
    const before = counts();
    const payable = await master.account("DEFAULT", "2100");
    await master.saveAccount(
      "DEFAULT",
      {
        code: "2100",
        name: "Reclassified 2100",
        category: "LIABILITY",
        reportGroup: "otherLiabilities",
        controlModule: null,
        purpose: "general",
        normalSide: "CREDIT",
        contraOf: null,
        active: true,
        manualAllowed: true,
      },
      payable.revision,
    );
    const confirm = service.confirm({
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    });
    await expect(confirm).rejects.toMatchObject({ issue: { path: "party", rule: "account" } });
    expect(counts()).toEqual(before);
    await rejects(command, { path: "party", rule: "account" });
  });

  it("resolves repeated products and tax codes once and matches against partial order history", async () => {
    const mixed = await post(
      invoice({
        lines: [
          line({ lineId: "A" }),
          line({ lineId: "B", quantity: "2" }),
          line({ lineId: "C", product: "WAGE" }),
          line({ lineId: "D", taxCode: "EXEMPT" }),
        ],
      }),
    );
    const { entry } = await journals.entry("DEFAULT", mixed.receipt.journalIds[0]);
    expect(entry.lines.map((item) => [item.account, item.debit, item.credit])).toEqual([
      ["2100", 0, 11300],
      ["2100", 0, 2260],
      ["2100", 0, 11300],
      ["2100", 0, 10000],
      ["5000", 10000, 0],
      ["1400", 1300, 0],
      ["5000", 2000, 0],
      ["1400", 260, 0],
      ["5100", 10000, 0],
      ["1400", 1300, 0],
      ["5000", 10000, 0],
    ]);
    await service.createOrder(order());
    const partial = (quantity: string, wage: string | null) =>
      invoice({
        orderId: "PO-1",
        lines: [
          line({ lineId: "L1", orderLineId: "OL1", quantity }),
          ...(wage
            ? [
                line({
                  lineId: "L2",
                  product: "WAGE",
                  orderLineId: "OL2",
                  quantity: wage,
                  unitPrice: "25.00",
                }),
              ]
            : []),
        ],
      });
    expect((await post(partial("3", "1"))).receipt.poMatch).toBe("matched");
    expect((await post(partial("2.5", null))).receipt.poMatch).toBe("matched");
    // Remaining is exactly OL1 10-3-2.5=4.5 and OL2 4-1=3, summed from prior invoices.
    await rejects(partial("4.6", "3"), { path: "lines.0.quantity", rule: "quantity" });
    await rejects(partial("4.5", "3.5"), { path: "lines.1.quantity", rule: "quantity" });
    expect((await post(partial("4.5", "3"))).receipt.poMatch).toBe("matched");
  });

  it("is all-or-nothing when a later write fails and rejects stale fingerprints without writing", async () => {
    const command = invoice();
    const preview = await service.preview(command);
    const before = counts();
    const db = new Database(filename);
    try {
      db.exec(
        "CREATE TRIGGER test_fail BEFORE INSERT ON open_items BEGIN SELECT RAISE(ABORT,'fictional failure'); END",
      );
    } finally {
      db.close();
    }
    const key = randomUUID();
    await expect(
      service.confirm({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: key,
        confirmation: "POST",
      }),
    ).rejects.toThrow();
    expect(counts()).toEqual(before);
    const cleanup = new Database(filename);
    try {
      cleanup.exec("DROP TRIGGER test_fail");
    } finally {
      cleanup.close();
    }
    await expect(
      service.confirm({
        command: { ...command, documentDate: "2026-01-17" },
        fingerprint: preview.fingerprint,
        idempotencyKey: key,
        confirmation: "POST",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", issue: { rule: "stale" } });
    expect(counts()).toEqual(before);
    expect(
      (
        await service.confirm({
          command,
          fingerprint: preview.fingerprint,
          idempotencyKey: key,
          confirmation: "POST",
        })
      ).documentId,
    ).toBe(command.documentId);
  });

  it("selects tax rates by taxDate and posts GL by accountingDate across periods", async () => {
    const before = await post(
      invoice({ taxDate: "2026-03-14", accountingDate: "2026-03-20", documentDate: "2026-03-14" }),
    );
    const after = await post(
      invoice({ taxDate: "2026-03-15", accountingDate: "2026-03-20", documentDate: "2026-03-15" }),
    );
    expect(before.preview.calculation.tax).toBe(1300);
    expect(after.preview.calculation.tax).toBe(900);
    expect(
      (await service.detail("DEFAULT", before.receipt.documentId)).document.lines[0],
    ).toMatchObject({
      taxRateId: "OLD",
      ratePercent: "13",
    });
    expect(
      (await service.detail("DEFAULT", after.receipt.documentId)).document.lines[0],
    ).toMatchObject({
      taxRateId: "NEW",
      ratePercent: "9",
    });
    await master.setPeriod("DEFAULT", "2026-02", 2, "frozen", "Fictional tax month closed", true);
    const crossed = await post(
      invoice({ taxDate: "2026-02-27", documentDate: "2026-02-26", accountingDate: "2026-03-02" }),
    );
    const { entry } = await journals.entry("DEFAULT", crossed.receipt.journalIds[0]);
    expect(entry).toMatchObject({
      date: "2026-03-02",
      taxDate: "2026-02-27",
      documentDate: "2026-02-26",
    });
    expect(crossed.preview.calculation.tax).toBe(1300);
    expect((await service.detail("DEFAULT", crossed.receipt.documentId)).openItem).toMatchObject({
      accountingDate: "2026-03-02",
      dueDate: "2026-03-28",
    });
    await rejects(
      invoice({ taxDate: "2026-03-02", accountingDate: "2026-02-27", documentDate: "2026-02-26" }),
      {
        path: "date",
        rule: "period",
      },
    );
  });

  it.each([
    { version: 12, fault: "none" },
    { version: 9, fault: "none" },
    { version: 11, fault: "none" },
    { version: 10, fault: "none" },
    { version: 10, fault: "missing" },
    { version: 10, fault: "ambiguous" },
    { version: 10, fault: "clockRollback" },
    { version: 10, fault: "sameMillisecondSameSemantics" },
    { version: 10, fault: "partialPolicy" },
    { version: 10, fault: "revisionGap" },
    { version: 10, fault: "differentTermDates" },
    { version: 10, fault: "differentDueDays" },
    { version: 10, fault: "differentDiscountDays" },
  ])(
    "upgrades authentic version $version with $fault term history safely",
    async ({ version, fault }) => {
      const oldInvoice = invoice();
      const dateEvidence = [
        "differentTermDates",
        "differentDueDays",
        "differentDiscountDays",
      ].includes(fault);
      let legacyPaymentId: string | null = null;
      if (version >= 10) {
        const old = await post(oldInvoice);
        if (version === 11)
          legacyPaymentId = (await settle(payment(oldInvoice, 1130))).receipt.paymentId;
        if (
          [
            "ambiguous",
            "clockRollback",
            "sameMillisecondSameSemantics",
            "partialPolicy",
            "revisionGap",
          ].includes(fault) ||
          dateEvidence
        ) {
          expect(
            (await service.detail("DEFAULT", oldInvoice.documentId)).openItem.discountPercent,
          ).toBe("1.5");
          const at =
            fault === "clockRollback"
              ? new Date(Date.parse(old.receipt.postedAt) - 1).toISOString()
              : old.receipt.postedAt;
          const trade = new TradeMasterService(store, () => at);
          const terms = await trade.get("DEFAULT", "tradeTerms", "N30");
          if (terms.kind !== "tradeTerms") throw new Error("Missing terms");
          await trade.save({
            ...base,
            kind: terms.kind,
            code: terms.code,
            expectedRevision: terms.revision,
            data: {
              ...terms.data,
              name: "Revised description only unless discount semantics explicitly change",
              dueDays:
                fault === "differentTermDates" || fault === "differentDueDays"
                  ? 60
                  : terms.data.dueDays,
              discountDays:
                fault === "differentTermDates" || fault === "differentDiscountDays"
                  ? 14
                  : terms.data.discountDays,
              discountPercent:
                fault === "clockRollback" || dateEvidence
                  ? "9"
                  : fault === "ambiguous"
                    ? "50"
                    : "1.500000",
              allowPartialDiscount: fault !== "partialPolicy",
            },
          });
          if (fault === "sameMillisecondSameSemantics") {
            const party = await trade.get("DEFAULT", "tradeParty", "V1");
            if (party.kind !== "tradeParty") throw new Error("Missing party");
            await trade.save({
              ...base,
              kind: party.kind,
              code: party.code,
              expectedRevision: party.revision,
              data: { ...party.data, name: "Partner description changed" },
            });
          }
        }
      }
      const historical = await journals.save("DEFAULT", {
        id: randomUUID(),
        revision: 0,
        sourceRef: "PRE-010-JOURNAL",
        date: "2026-01-15",
        memo: "Historical capital",
        kind: "normal",
        operation: "journal",
        originalId: null,
        headerDimensions: {},
        lines: [
          { account: "1000", debit: "50.00", credit: "", dimensions: {}, suspense: null },
          { account: "3000", debit: "", credit: "50.00", dimensions: {}, suspense: null },
        ],
      });
      const plan = await journals.preview("DEFAULT", historical);
      await journals.confirm({
        company: "DEFAULT",
        draftId: historical.id,
        revision: historical.revision,
        fingerprint: plan.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      });
      const upgradeFile = join(directory, `upgrade-${version}.sqlite`);
      const backend = sqliteBackend({ filename: upgradeFile });
      const db = await backend.acquire(false, true);
      try {
        await db.begin();
        const migrations = (await readdir(new URL("../../migrations/sqlite/", import.meta.url)))
          .filter((name) => /^\d{3}-.*\.sql$/u.test(name))
          .sort()
          .slice(0, version);
        expect(migrations).toHaveLength(version);
        for (const [index, name] of migrations.entries()) {
          const sql = normalizeMigration(
            await readFile(new URL(`../../migrations/sqlite/${name}`, import.meta.url), "utf8"),
          );
          await db.script(sql);
          await db.query(
            "INSERT INTO schema_migrations(version,dialect,checksum,schema_fingerprint) VALUES(?,'sqlite',?,?)",
            [
              index + 1,
              createHash("sha256").update(sql).digest("hex"),
              await schemaFingerprint(db),
            ],
          );
        }
        await db.query("ATTACH DATABASE ? AS existing", [filename]);
        const copied = (await db.query(
          "SELECT name FROM main.sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name<>'schema_migrations' ORDER BY CASE name WHEN 'settlements' THEN 1 ELSE 0 END,rowid",
        )) as { name: string }[];
        expect(copied.map((row) => row.name)).toEqual(
          expect.arrayContaining(["journal_entries", "trade_parties", "trade_config_history"]),
        );
        if (version === 9) expect(copied.map((row) => row.name)).not.toContain("trade_documents");
        for (const { name } of copied) {
          if (name === "trade_item_sources") continue;
          if (name === "periods")
            await db.query(
              "INSERT INTO main.periods SELECT company_id,month,status,revision FROM existing.periods",
            );
          else if (name === "trade_documents") {
            const columns = await db.query("PRAGMA main.table_info(trade_documents)");
            const selections = columns.map((column) =>
              column.name === "snapshot"
                ? version === 10
                  ? "json_remove(snapshot,'$.settlementTerms','$.controlSegments')"
                  : "json_remove(snapshot,'$.controlSegments')"
                : String(column.name),
            );
            await db.query(
              `INSERT INTO main.${name} SELECT ${selections.join(",")} FROM existing.${name}`,
            );
          } else if (name === "trade_payments")
            await db.query(
              "INSERT INTO main.trade_payments SELECT company_id,payment_id,receipt_key,command_hash,fingerprint,json_remove(receipt,'$.allocations[0].segments') FROM existing.trade_payments",
            );
          else {
            const columns = (await db.query(`PRAGMA main.table_info(${name})`))
              .map((column) => `"${column.name}"`)
              .join(",");
            await db.query(
              `INSERT INTO main.${name} SELECT ${columns} FROM existing.${name}${name === "trade_config_history" && fault === "missing" ? " WHERE kind<>'tradeTerms'" : name === "trade_config_history" && fault === "revisionGap" ? " WHERE NOT(kind='tradeTerms' AND revision=1)" : ""}`,
            );
          }
        }
        await db.commit();
      } finally {
        await db.release();
        await backend.close();
      }
      const storage = createSqliteStorage({ filename: upgradeFile });
      const upgraded = createMasterDataStore({ filename: upgradeFile });
      const beforeUpgrade = new Database(upgradeFile, { readonly: true });
      const oldFacts =
        version >= 10
          ? Object.fromEntries(
              ["trade_documents", "trade_document_lines", "open_items"].map((table) => [
                table,
                beforeUpgrade.prepare(`SELECT * FROM ${table}`).all(),
              ]),
            )
          : {};
      beforeUpgrade.close();
      try {
        await expect(storage.verifySchema()).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
        if (fault !== "none" && fault !== "sameMillisecondSameSemantics" && !dateEvidence) {
          await expect(storage.migrate()).rejects.toMatchObject({
            code: "CONFLICT",
            message: expect.stringContaining(oldInvoice.documentId),
          });
          const raw = new Database(upgradeFile, { readonly: true });
          try {
            expect(
              raw.prepare("SELECT MAX(version) AS version FROM schema_migrations").get(),
            ).toEqual({ version: 10 });
            expect(
              raw.prepare("SELECT name FROM sqlite_schema WHERE name='trade_payments'").all(),
            ).toEqual([]);
            expect(
              raw.prepare("SELECT remaining_gross_minor AS remaining FROM open_items").get(),
            ).toEqual({ remaining: 11300 });
          } finally {
            raw.close();
          }
          return;
        }
        await storage.migrate();
        await storage.verifySchema();
        const check = new Database(upgradeFile, { readonly: true });
        const source = new Database(filename, { readonly: true });
        try {
          expect(
            check.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
          ).toEqual(
            Array.from({ length: latestMigrationVersion }, (_, index) => ({ version: index + 1 })),
          );
          expect(
            check
              .prepare(
                "SELECT version,dialect,checksum,schema_fingerprint FROM schema_migrations WHERE version<=? ORDER BY version",
              )
              .all(version),
          ).toEqual(
            source
              .prepare(
                "SELECT version,dialect,checksum,schema_fingerprint FROM schema_migrations WHERE version<=? ORDER BY version",
              )
              .all(version),
          );
          for (const [table, facts] of Object.entries(oldFacts))
            expect(check.prepare(`SELECT * FROM ${table}`).all()).toEqual(facts);
          for (const [table, order] of Object.entries({
            journal_entries: "sequence",
            journal_lines: "company_id,entry_id,line_no",
            trade_config_history: "company_id,kind,config_key,revision",
          }))
            expect(check.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()).toEqual(
              source.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all(),
            );
        } finally {
          check.close();
          source.close();
        }
        const upgradedJournals = new JournalService(upgraded, journalTools);
        const docs = new TradeDocumentService(upgraded, upgradedJournals, journalTools);
        const upgradedMaster = new MasterDataService(upgraded);
        const migratedPeriods = await upgradedMaster.periods("DEFAULT", { limit: 100 });
        expect(migratedPeriods.items.every((p) => p.modules.length === 0)).toBe(true);
        await expect(docs.preview(invoice())).rejects.toMatchObject({ issue: { rule: "period" } });
        await upgradedMaster.setPeriod(
          "DEFAULT",
          "2026-01",
          2,
          "open",
          "Explicit post-upgrade admission",
          true,
          ["trade", "tax"],
        );
        if (version === 11 && legacyPaymentId) {
          expect((await docs.detail("DEFAULT", oldInvoice.documentId)).openItem).toMatchObject({
            remainingGross: 10170,
            revision: 2,
            segments: [{ gross: 11300, remainingGross: 10170 }],
          });
          const command: TradeActionCommand = {
            ...actionHeader(),
            kind: "reverse",
            settlementId: legacyPaymentId,
            reason: "Reverse pre-012 settlement",
            items: [{ itemId: oldInvoice.documentId, revision: 2 }],
          };
          const preview = await docs.previewAction(command);
          await docs.confirmAction({
            command,
            fingerprint: preview.fingerprint,
            idempotencyKey: randomUUID(),
            confirmation: "POST",
          });
          expect(
            (await docs.detail("DEFAULT", oldInvoice.documentId)).openItem.remainingGross,
          ).toBe(11300);
        }
        if (version === 10) {
          if (dateEvidence)
            expect((await docs.detail("DEFAULT", oldInvoice.documentId)).openItem).toMatchObject({
              documentDate: "2026-01-18",
              dueDate: "2026-02-17",
              discountDate: "2026-01-25",
              discountPercent: "1.5",
              allowPartialDiscount: true,
            });
          const command = payment(oldInvoice, 11300, true);
          const preview = await docs.previewSettlement(command);
          const receipt = await docs.confirmSettlement({
            command,
            fingerprint: preview.fingerprint,
            idempotencyKey: randomUUID(),
            confirmation: "POST",
          });
          expect(receipt).toMatchObject({ discount: 150, cash: 11150 });
          expect(
            (await docs.detail("DEFAULT", oldInvoice.documentId)).openItem.remainingGross,
          ).toBe(0);
        }
        const command = invoice();
        const preview = await docs.preview(command);
        const receipt = await docs.confirm({
          command,
          fingerprint: preview.fingerprint,
          idempotencyKey: randomUUID(),
          confirmation: "POST",
        });
        expect((await docs.detail("DEFAULT", receipt.documentId)).openItem).toMatchObject({
          remainingGross: 11300,
        });
        expect((await upgradedJournals.entry("DEFAULT", historical.id)).entry.sourceRef).toBe(
          "PRE-010-JOURNAL",
        );
      } finally {
        await upgraded.close();
        await storage.close();
      }
    },
  );

  it("serves orders, preview, confirm, list, detail and open items over HTTP through production worker lanes", async () => {
    const executor = await SqliteExecutor.create({ filename, readers: 2 });
    const api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      ...executor.services(),
      logError: () => undefined,
    });
    try {
      const host = new URL(await api.listen()).host;
      const send = (method: "GET" | "POST", url: string, payload?: unknown) =>
        api.app.inject({
          method,
          url,
          headers: { host },
          ...(payload === undefined ? {} : { payload }),
        });
      const created = await send("POST", "/api/v1/trade/orders", order());
      expect(created.statusCode).toBe(201);
      expect((await send("GET", "/api/v1/trade/orders/PO-1?company=DEFAULT")).json()).toEqual(
        created.json(),
      );
      const command = invoice({
        orderId: "PO-1",
        lines: [line({ orderLineId: "OL1", quantity: "10", unitPrice: "10.20" })],
      });
      const variance = await send("POST", "/api/v1/trade/invoices/preview", command);
      expect(variance.statusCode).toBe(400);
      expect(variance.json().fieldErrors).toEqual([
        { path: "matchingException", messageKey: "api.error.tradeDocument.price" },
      ]);
      const excepted = {
        ...command,
        matchingException: { confirmed: true, reason: "Fictional freight" },
      };
      const preview = await send("POST", "/api/v1/trade/invoices/preview", excepted);
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ poMatch: "exception", journal: { module: "TRADE" } });
      const envelope = {
        command: excepted,
        fingerprint: preview.json().fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      };
      const [first, retry] = await Promise.all([
        send("POST", "/api/v1/trade/invoices", envelope),
        send("POST", "/api/v1/trade/invoices", envelope),
      ]);
      expect([first.statusCode, retry.statusCode]).toEqual([201, 201]);
      expect(retry.json()).toEqual(first.json());
      expect(counts()).toMatchObject({ trade_documents: 1, open_items: 1 });
      const duplicate = await send("POST", "/api/v1/trade/invoices/preview", {
        ...excepted,
        documentId: randomUUID(),
      });
      expect(duplicate.statusCode).toBe(409);
      const list = await send("GET", "/api/v1/trade/invoices?company=DEFAULT&limit=5");
      expect(list.json().items).toEqual([
        expect.objectContaining({ documentId: command.documentId, poMatch: "exception" }),
      ]);
      const detail = await send(
        "GET",
        `/api/v1/trade/invoices/${command.documentId}?company=DEFAULT`,
      );
      expect(detail.json()).toMatchObject({
        document: {
          exceptionReason: "Fictional freight",
          lines: [{ expectedNet: 10000, net: 10200 }],
        },
        openItem: { remainingGross: 11526 },
      });
      const items = await send(
        "GET",
        "/api/v1/trade/open-items?company=DEFAULT&party=V1&status=open",
      );
      expect(items.json().items).toEqual([expect.objectContaining({ itemId: command.documentId })]);
      const historical = await send(
        "GET",
        "/api/v1/trade/reports/open-items?company=DEFAULT&month=2026-01&limit=1",
      );
      expect(historical.statusCode).toBe(200);
      expect(historical.headers["cache-control"]).toContain("no-store");
      expect(historical.json()).toMatchObject({
        asOf: "2026-01-31",
        totals: { invoiceGrossMinor: 11526 },
      });
      const reportDetail = await send(
        "GET",
        `/api/v1/trade/reports/open-items/${command.documentId}?company=DEFAULT&month=2026-01`,
      );
      expect(reportDetail.statusCode).toBe(200);
      expect(reportDetail.json()).toMatchObject({
        selected: { journalId: first.json().journalIds[0] },
        document: { documentId: command.documentId },
      });
      expect(
        (
          await send("GET", "/api/v1/trade/reports/reconciliation?company=DEFAULT&month=2026-01")
        ).json().rows,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ account: "2100", differenceMinor: 0 })]),
      );
      expect(
        (await send("GET", "/api/v1/trade/reports/reconciliation?company=DEFAULT&party=V1"))
          .statusCode,
      ).toBe(400);
      expect((await send("POST", "/api/v1/trade/reports/open-items", {})).statusCode).toBe(405);
      expect(
        (await send("GET", "/api/v1/trade/reports/open-items?company=DEFAULT&month=2026-13"))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await api.app.inject({
            url: "/api/v1/trade/reports/open-items?company=DEFAULT",
            headers: { host, origin: "https://external.invalid" },
          })
        ).statusCode,
      ).toBe(403);
      const settlement = payment(command, 5000, true);
      const plannedPayment = await send("POST", "/api/v1/trade/settlements/preview", settlement);
      expect(plannedPayment.statusCode).toBe(200);
      expect(plannedPayment.json()).toMatchObject({ gross: 5000, discount: 66, cash: 4934 });
      const paymentEnvelope = {
        command: settlement,
        fingerprint: plannedPayment.json().fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      };
      const paid = await send("POST", "/api/v1/trade/settlements", paymentEnvelope);
      expect(paid.statusCode).toBe(201);
      expect((await send("POST", "/api/v1/trade/settlements", paymentEnvelope)).json()).toEqual(
        paid.json(),
      );
      const paidDetail = await send(
        "GET",
        `/api/v1/trade/invoices/${command.documentId}?company=DEFAULT`,
      );
      expect(paidDetail.json()).toMatchObject({
        openItem: { remainingGross: 6526, revision: 2 },
        settlements: [{ paymentId: settlement.paymentId }],
      });
      expect(
        (await send("GET", `/api/v1/trade/invoices/${randomUUID()}?company=DEFAULT`)).statusCode,
      ).toBe(404);
      expect((await send("GET", "/api/v1/trade/invoices/preview?company=DEFAULT")).statusCode).toBe(
        405,
      );
      expect(
        (await send("POST", "/api/v1/trade/invoices/preview", { ...excepted, extra: 1 }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await api.app.inject({
            method: "POST",
            url: "/api/v1/trade/invoices/preview",
            headers: { host, "content-type": "text/plain" },
            payload: "{}",
          })
        ).statusCode,
      ).toBe(415);
      expect(
        (await send("GET", "/api/v1/trade/tradeParty?company=DEFAULT&limit=5")).statusCode,
      ).toBe(200);
    } finally {
      await api.close();
      await executor.close();
    }
  });

  it("serves typed advances, credits, applications and precise corrections through production worker lanes", async () => {
    const command = invoice();
    await post(command);
    await settle(payment(command, 1000));
    const executor = await SqliteExecutor.create({ filename, readers: 2 });
    const api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      ...executor.services(),
      logError: () => undefined,
    });
    try {
      const host = new URL(await api.listen()).host;
      const send = (method: "GET" | "POST", url: string, payload?: unknown) =>
        api.app.inject({
          method,
          url,
          headers: { host },
          ...(payload === undefined ? {} : { payload }),
        });
      const action = async (command: TradeActionCommand) => {
        const preview = await send("POST", "/api/v1/trade/actions/preview", command);
        expect(preview.statusCode).toBe(200);
        const envelope = {
          command,
          fingerprint: preview.json().fingerprint,
          idempotencyKey: randomUUID(),
          confirmation: "POST",
        };
        const posted = await send("POST", "/api/v1/trade/actions", envelope);
        expect(posted.statusCode).toBe(201);
        expect((await send("POST", "/api/v1/trade/actions", envelope)).json()).toEqual(
          posted.json(),
        );
        return posted.json();
      };
      const advanceReceipt = await action(advance());
      const application = await action({
        ...actionHeader(),
        kind: "apply",
        sourceId: advanceReceipt.actionId,
        sourceRevision: 1,
        targetId: command.documentId,
        targetRevision: 2,
        gross: 1000,
      });
      await action({
        ...actionHeader(),
        kind: "reverse",
        settlementId: application.actionId,
        reason: "HTTP correction",
        items: [
          { itemId: advanceReceipt.actionId, revision: 2 },
          { itemId: command.documentId, revision: 3 },
        ],
      });
      await action({
        ...actionHeader(),
        kind: "cancel",
        itemId: advanceReceipt.actionId,
        revision: 3,
        relatedRevision: null,
        reason: "HTTP cancel advance",
      });
      const credit = await action({
        ...actionHeader(),
        kind: "credit",
        invoiceId: command.documentId,
        revision: 4,
        lines: [{ sourceLineId: "L1", quantity: "1" }],
      });
      const sameControl = await action({
        ...actionHeader(),
        kind: "apply",
        sourceId: credit.actionId,
        sourceRevision: 1,
        targetId: command.documentId,
        targetRevision: 5,
        gross: credit.gross,
      });
      expect(sameControl.journalIds).toEqual([]);
      await action({
        ...actionHeader(),
        kind: "reverse",
        settlementId: sameControl.actionId,
        reason: "Undo no-GL application",
        items: [
          { itemId: credit.actionId, revision: 2 },
          { itemId: command.documentId, revision: 6 },
        ],
      });
      await action({
        ...actionHeader(),
        kind: "cancel",
        itemId: credit.actionId,
        revision: 3,
        relatedRevision: 7,
        reason: "HTTP cancel credit",
      });
      const chain = await send(
        "GET",
        `/api/v1/trade/open-items/${command.documentId}/actions?company=DEFAULT`,
      );
      expect(chain.statusCode).toBe(200);
      expect(chain.json().map((r: { command: { kind: string } }) => r.command.kind)).toEqual(
        expect.arrayContaining(["apply", "reverse", "credit", "cancel"]),
      );
      expect(
        (await send("POST", "/api/v1/trade/actions/preview", { ...advance(), arbitraryGl: [] }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await send("POST", "/api/v1/trade/actions/preview", {
            ...actionHeader(),
            kind: "cancel",
            itemId: command.documentId,
            revision: 8,
            relatedRevision: null,
            reason: " ",
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await api.close();
      await executor.close();
    }
  });

  it("rejects invalid parties, products, currencies and exempt tax produces no GL tax line", async () => {
    await rejects(invoice({ party: "C1" }), { path: "party", rule: "party" });
    await rejects(invoice({ lines: [line({ product: "CONSULT" })] }), {
      path: "lines.0.product",
      rule: "product",
    });
    await rejects(invoice({ side: "AR", party: "C1" }), {
      path: "lines.0.product",
      rule: "product",
    });
    await rejects(invoice({ currency: "USD" }), { rule: "currency" });
    await rejects(invoice({ lines: [line(), line()] }), { path: "lines", rule: "duplicate" });
    await rejects(invoice({ accountingDate: "2027-01-05" }), { path: "party", rule: "reference" });
    const exempt = await post(invoice({ lines: [line({ taxCode: "EXEMPT" })] }));
    const { entry } = await journals.entry("DEFAULT", exempt.receipt.journalIds[0]);
    expect(entry.lines.map((item) => item.account)).toEqual(["2100", "5000"]);
    expect(
      (await service.detail("DEFAULT", exempt.receipt.documentId)).document.lines[0],
    ).toMatchObject({
      taxCode: "EXEMPT",
      tax: 0,
    });
  });
});

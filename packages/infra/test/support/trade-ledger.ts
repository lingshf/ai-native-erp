// Shared real-SQLite trade ledger for the application tests: the fictional 2026 company and
// trade configuration seeded once into a template, document builders, the posting / action steps
// driven through TradeDocumentService, and the TORD-06 stored-invoicing-status checks.
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { expect } from "vitest";
import {
  type JournalService,
  MasterDataService,
  TradeDocumentService,
  TradeMasterService,
} from "@erp/core/application";
import type {
  AccountInput,
  TradeActionCommand,
  TradeInvoiceCommand,
  TradeInvoiceLineInput,
  TradeOrderCommand,
  TradeWrite,
} from "@erp/core/domain";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore, masterDataRepository } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";
import { tradeOrderStatuses } from "../../src/storage/trade-documents.ts";
import type { Connection } from "../../src/storage/types.ts";

export const configWindow = { name: "Fictional", from: "2026-01-01", to: "2026-12-31" };
export const configBase = { company: "DEFAULT", active: true, expectedRevision: 0 };
export const configs: TradeWrite[] = [
  {
    ...configBase,
    kind: "tradeTerms",
    code: "N30",
    data: {
      ...configWindow,
      dueDays: 30,
      discountDays: 7,
      discountPercent: "1.5",
      allowPartialDiscount: true,
    },
  },
  {
    ...configBase,
    kind: "taxCode",
    code: "VAT",
    data: {
      ...configWindow,
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
    ...configBase,
    kind: "taxCode",
    code: "EXEMPT",
    data: {
      ...configWindow,
      mode: "exempt",
      deductiblePercent: "0",
      inputAccount: null,
      outputAccount: null,
      rates: [{ id: "E", from: "2026-01-01", to: "2026-12-31", ratePercent: "0" }],
    },
  },
  {
    ...configBase,
    kind: "tradeProfile",
    code: "PAY",
    data: {
      ...configWindow,
      side: "AP",
      controlAccount: "2100",
      advanceAccount: "1250",
      cashAccount: "1000",
      discountAccount: "4000",
    },
  },
  {
    ...configBase,
    kind: "tradeProfile",
    code: "REC",
    data: {
      ...configWindow,
      side: "AR",
      controlAccount: "1300",
      advanceAccount: "2300",
      cashAccount: "1000",
      discountAccount: "4000",
    },
  },
  ...(["V1", "V2"] as const).map(
    (code): TradeWrite => ({
      ...configBase,
      kind: "tradeParty",
      code,
      data: {
        ...configWindow,
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
    ...configBase,
    kind: "tradeParty",
    code: "C1",
    data: {
      ...configWindow,
      role: "customer",
      apProfile: null,
      arProfile: "REC",
      terms: "N30",
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
  {
    ...configBase,
    kind: "tradeProduct",
    code: "RENT",
    data: {
      ...configWindow,
      type: "expense",
      expenseAccount: "5000",
      revenueAccount: null,
      allowedTaxCodes: ["VAT", "EXEMPT"],
      defaultDimensions: {},
    },
  },
  {
    ...configBase,
    kind: "tradeProduct",
    code: "WAGE",
    data: {
      ...configWindow,
      type: "expense",
      expenseAccount: "5100",
      revenueAccount: null,
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
  {
    ...configBase,
    kind: "tradeProduct",
    code: "CONSULT",
    data: {
      ...configWindow,
      type: "service",
      expenseAccount: null,
      revenueAccount: "4000",
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    },
  },
];
export function line(changes: Partial<TradeInvoiceLineInput> = {}): TradeInvoiceLineInput {
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
export function invoice(changes: Partial<TradeInvoiceCommand> = {}): TradeInvoiceCommand {
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
export function order(changes: Partial<TradeOrderCommand> = {}): TradeOrderCommand {
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
export const orderLine = (lineId: string, quantity: string, unitPrice: string) => ({
  lineId,
  product: "RENT",
  taxCode: "VAT",
  quantity,
  unitPrice,
  discountPercent: "0",
  taxableCharge: "0",
});

/** Migrates `filename`, opens every 2026 period for trade, saves the control accounts and `configs`. */
export async function seedTradeTemplate(filename: string): Promise<void> {
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const seedStore = createMasterDataStore({ filename });
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
}

/** The ledger of the running test; the steps always act through its current `service`. */
export interface TradeLedger {
  readonly filename: string;
  readonly journals: JournalService;
  service: TradeDocumentService;
}

const countedTables = [
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

/** Row counts, posting, typed actions and cancellation through the ledger's service. */
export function tradeSteps(ledger: TradeLedger) {
  function counts() {
    const db = new Database(ledger.filename, { readonly: true });
    try {
      return Object.fromEntries(
        countedTables.map((table) => [
          table,
          (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
        ]),
      );
    } finally {
      db.close();
    }
  }
  async function post(command: TradeInvoiceCommand, key = randomUUID()) {
    const preview = await ledger.service.preview(command);
    const receipt = await ledger.service.confirm({
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: key,
      confirmation: "POST",
    });
    return { preview, receipt, key };
  }
  const actionHeader = () => ({
    company: "DEFAULT",
    actionId: randomUUID(),
    accountingDate: "2026-01-25",
    documentDate: "2026-01-25",
    taxDate: "2026-01-25",
  });
  async function act(command: TradeActionCommand) {
    const before = counts();
    const preview = await ledger.service.previewAction(command);
    expect(counts()).toEqual(before);
    const envelope = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    };
    const receipt = await ledger.service.confirmAction(envelope);
    return { preview, receipt, envelope };
  }
  async function current(itemId: string) {
    const page = await ledger.service.openItems("DEFAULT", { limit: 500 });
    const item = page.items.find((item) => item.itemId === itemId);
    if (!item) throw new Error("Missing test item");
    return item;
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
  return { counts, post, actionHeader, act, current, cancel };
}

// TORD-06: the stored status (trade_order_invoicing) is written by the posting and cancelling
// transactions and is what the list column shows (B6a). After every step it must equal the
// TINV-03 status recomputed from the invoice lines (net of credit notes since TINV-09).
export const storedStatusesIn = (raw: Database.Database) =>
  Object.fromEntries(
    (
      raw
        .prepare(
          "SELECT order_id,status FROM trade_order_invoicing WHERE company_id='DEFAULT' ORDER BY order_id",
        )
        .all() as { order_id: string; status: string }[]
    ).map((row) => [row.order_id, row.status]),
  );
/** The TINV-03 recomputation run directly on a raw ledger handle. */
export async function recomputedStatusesIn(raw: Database.Database, orderIds: readonly string[]) {
  const reader: Pick<Connection, "query"> = {
    query: async (sql, values = []) => raw.prepare(sql).all(...values) as Record<string, unknown>[],
  };
  return Object.fromEntries(await tradeOrderStatuses(reader, "DEFAULT", orderIds));
}

/** An AP invoice on one order line, dated 2026-04-20. */
export const invoiceOn = (
  orderId: string,
  orderLineId: string,
  quantity: string,
  changes: Partial<TradeInvoiceCommand> = {},
  lineChanges: Partial<TradeInvoiceLineInput> = {},
) =>
  invoice({
    orderId,
    accountingDate: "2026-04-20",
    documentDate: "2026-04-20",
    taxDate: "2026-04-20",
    lines: [line({ orderLineId, quantity, unitPrice: "3.00", ...lineChanges })],
    ...changes,
  });

/** Stored-status checks, credit notes and failing status writes on top of `tradeSteps`. */
export function orderInvoicingSteps(ledger: TradeLedger) {
  const { counts, act, actionHeader, current, cancel } = tradeSteps(ledger);
  const storedStatuses = () => {
    const raw = new Database(ledger.filename, { readonly: true });
    try {
      return storedStatusesIn(raw);
    } finally {
      raw.close();
    }
  };
  const recomputedStatuses = async () => {
    const raw = new Database(ledger.filename, { readonly: true });
    try {
      const orderIds = raw
        .prepare("SELECT order_id FROM trade_orders WHERE company_id='DEFAULT' ORDER BY order_id")
        .pluck()
        .all() as string[];
      return await recomputedStatusesIn(raw, orderIds);
    } finally {
      raw.close();
    }
  };
  const listedStatuses = async () =>
    Object.fromEntries(
      (await ledger.service.listOrders("DEFAULT", { limit: 500 })).items.map((item) => [
        item.orderId,
        item.invoicing,
      ]),
    );
  /** Stored, recomputed and listed statuses all equal `expected`. */
  async function expectStored(expected: Record<string, string>) {
    expect(storedStatuses()).toEqual(expected);
    expect(await recomputedStatuses()).toEqual(expected);
    expect(await listedStatuses()).toEqual(expected);
  }
  /** TINV-09: credit note on line L1 of an invoice, the day after invoiceOn's date. */
  async function creditOn(invoiceId: string, quantity: string) {
    return act({
      ...actionHeader(),
      kind: "credit",
      invoiceId,
      revision: (await current(invoiceId)).revision,
      accountingDate: "2026-04-21",
      documentDate: "2026-04-21",
      taxDate: "2026-04-21",
      lines: [{ sourceLineId: "L1", quantity }],
    });
  }
  const cancelCredit = (credit: Awaited<ReturnType<typeof act>>, invoiceId: string) =>
    cancel(credit.receipt.actionId, invoiceId, "2026-04-22");
  /** A service on the real store whose stored-status UPDATE fails inside the write transaction. */
  function blockingStatusWrites() {
    const backend = sqliteBackend({ filename: ledger.filename });
    const run = async <T>(
      write: boolean,
      work: (repo: ReturnType<typeof masterDataRepository>) => Promise<T>,
    ) => {
      const db = await backend.acquire(!write, false);
      try {
        await db.begin();
        const failing = {
          ...db,
          query: (sql: string, values: Parameters<Connection["query"]>[1] = []) =>
            sql.startsWith("UPDATE trade_order_invoicing")
              ? Promise.reject(new Error("blocked"))
              : db.query(sql, values),
        } as Connection;
        try {
          const result = await work(masterDataRepository(failing));
          await db.commit();
          return result;
        } catch (error) {
          await db.rollback();
          throw error;
        }
      } finally {
        await db.release();
      }
    };
    const blocked = new TradeDocumentService(
      { read: (work) => run(false, work), write: (work) => run(true, work) },
      ledger.journals,
      journalTools,
    );
    return { blocked, close: () => backend.close() };
  }
  /** Runs `write` through `blocked`: it must fail and leave every counted table unchanged. */
  async function expectRolledBack(blocked: TradeDocumentService, write: () => Promise<unknown>) {
    const original = ledger.service;
    const before = counts();
    ledger.service = blocked;
    try {
      await expect(write()).rejects.toThrow("blocked");
    } finally {
      ledger.service = original;
    }
    expect(counts()).toEqual(before);
  }
  return { expectStored, creditOn, cancelCredit, blockingStatusWrites, expectRolledBack };
}

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JournalService,
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
} from "@erp/core/domain";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { normalizeMigration } from "../../src/storage/migrations.ts";
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
  let directory: string, filename: string;
  let store: ReturnType<typeof createMasterDataStore>;
  let master: MasterDataService, journals: JournalService, service: TradeDocumentService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-trade-docs-"));
    filename = join(directory, "ledger.sqlite");
    const storage = createSqliteStorage({ filename });
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore({ filename });
    master = new MasterDataService(store);
    journals = new JournalService(store, journalTools);
    service = new TradeDocumentService(store, journals, journalTools);
    await master.initialize(2026);
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
    const trade = new TradeMasterService(store);
    for (const command of configs) await trade.save(command);
  });
  afterEach(async () => {
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const tables = [
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
      ["2100", 0, 34860],
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
    await master.setPeriod("DEFAULT", "2026-02", 1, "frozen", "Fictional tax month closed", true);
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

  it("upgrades an authentic populated 009 ledger to 010 and then posts trade invoices on it", async () => {
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
    const upgradeFile = join(directory, "upgrade-009.sqlite");
    const backend = sqliteBackend({ filename: upgradeFile });
    const db = await backend.acquire(false, true);
    try {
      await db.begin();
      const migrations = (await readdir(new URL("../../migrations/sqlite/", import.meta.url)))
        .filter((name) => /^00\d-.*\.sql$/u.test(name))
        .sort();
      expect(migrations).toHaveLength(9);
      for (const [index, name] of migrations.entries()) {
        const sql = normalizeMigration(
          await readFile(new URL(`../../migrations/sqlite/${name}`, import.meta.url), "utf8"),
        );
        await db.script(sql);
        await db.query(
          "INSERT INTO schema_migrations(version,dialect,checksum,schema_fingerprint) VALUES(?,'sqlite',?,?)",
          [index + 1, createHash("sha256").update(sql).digest("hex"), await schemaFingerprint(db)],
        );
      }
      await db.query("ATTACH DATABASE ? AS existing", [filename]);
      const copied = (await db.query(
        "SELECT name FROM main.sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name<>'schema_migrations' ORDER BY rowid",
      )) as { name: string }[];
      expect(copied.map((row) => row.name)).toEqual(
        expect.arrayContaining(["journal_entries", "trade_parties", "trade_config_history"]),
      );
      expect(copied.map((row) => row.name)).not.toContain("trade_documents");
      for (const { name } of copied)
        await db.query(`INSERT INTO main.${name} SELECT * FROM existing.${name}`);
      await db.commit();
    } finally {
      await db.release();
      await backend.close();
    }
    const storage = createSqliteStorage({ filename: upgradeFile });
    const upgraded = createMasterDataStore({ filename: upgradeFile });
    try {
      await expect(storage.verifySchema()).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
      await storage.migrate();
      await storage.verifySchema();
      const check = new Database(upgradeFile, { readonly: true });
      const source = new Database(filename, { readonly: true });
      try {
        expect(
          check.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
        ).toEqual(Array.from({ length: 10 }, (_, index) => ({ version: index + 1 })));
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
  });

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

import {
  DomainError,
  addTradeDays,
  calculateTrade,
  checkedCode,
  checkedJournalId,
  checkedPage,
  checkedTradeInvoice,
  checkedTradeOrder,
  formatMinor,
  matchTradeOrderLine,
  normalizeExternalInvoice,
  quantityMicros,
  selectTradeTax,
  tradeDocumentError,
  tradeEffective,
  type Company,
  type DimensionMap,
  type JournalDraft,
  type JournalInputLine,
  type OpenItem,
  type Page,
  type PageQuery,
  type PoMatch,
  type TradeCalculation,
  type TradeConfig,
  type TradeDocumentLine,
  type TradeDocumentRecord,
  type TradeDocumentSummary,
  type TradeInvoiceCommand,
  type TradeInvoiceConfirm,
  type TradeInvoiceReceipt,
  type TradeLineMatch,
  type TradeOrder,
  type TradeOrderCommand,
  type TradeSide,
} from "@erp/core/domain";
import type { JournalPreview, JournalService, JournalTools } from "./journals.ts";
import type { MasterDataRepository, MasterDataStore } from "./master-data.ts";

export interface OpenItemQuery extends PageQuery {
  readonly party?: string;
  readonly status?: "open" | "settled";
}
export interface TradeDocumentRepository {
  tradeOrder(company: string, orderId: string): Promise<TradeOrder | null>;
  insertTradeOrder(company: string, order: TradeOrder): Promise<void>;
  tradeOrderInvoiced(
    company: string,
    orderId: string,
  ): Promise<readonly { readonly orderLineId: string; readonly quantity: string }[]>;
  tradeDocument(company: string, documentId: string): Promise<TradeDocumentRecord | null>;
  tradeDocumentByReceipt(company: string, key: string): Promise<TradeDocumentRecord | null>;
  tradeDocumentByExternal(
    company: string,
    party: string,
    normalized: string,
  ): Promise<string | null>;
  insertTradeDocument(company: string, document: TradeDocumentRecord): Promise<void>;
  tradeDocumentPage(company: string, query: PageQuery): Promise<Page<TradeDocumentSummary>>;
  openItem(company: string, itemId: string): Promise<OpenItem | null>;
  openItemPage(company: string, query: OpenItemQuery): Promise<Page<OpenItem>>;
}
export interface TradeInvoicePreview {
  readonly fingerprint: string;
  readonly side: TradeSide;
  readonly externalNoNormalized: string;
  readonly calculation: TradeCalculation;
  readonly poMatch: PoMatch;
  readonly matches: readonly TradeLineMatch[];
  readonly dueDate: string;
  readonly discountDate: string;
  readonly controlAccount: string;
  readonly journal: JournalPreview["plan"];
}
export interface TradeInvoiceDetail {
  readonly document: Omit<TradeDocumentRecord, "snapshot">;
  readonly calculation: TradeCalculation;
  readonly matches: readonly TradeLineMatch[];
  readonly receipt: TradeInvoiceReceipt;
  readonly openItem: OpenItem;
}
interface Prepared {
  readonly preview: TradeInvoicePreview;
  readonly journal: JournalPreview;
  readonly commandHash: string;
  readonly lines: readonly TradeDocumentLine[];
  readonly controlIndex: number;
}
function required<T>(value: T | null): T {
  if (value === null) throw new DomainError("NOT_FOUND");
  return value;
}
function cursorNumber(cursor: string | undefined): void {
  if (cursor !== undefined && !/^[1-9]\d{0,15}$/u.test(cursor))
    tradeDocumentError("cursor", "shape");
}
type Repo = MasterDataRepository;

export class TradeDocumentService {
  private readonly store: MasterDataStore;
  private readonly journals: JournalService;
  private readonly tools: JournalTools;
  constructor(store: MasterDataStore, journals: JournalService, tools: JournalTools) {
    this.store = store;
    this.journals = journals;
    this.tools = tools;
  }
  private async config<K extends TradeConfig["kind"]>(
    repo: Repo,
    company: string,
    kind: K,
    code: string,
    day: string,
    path: string,
  ): Promise<TradeConfig<K>> {
    const found = (await repo.tradeConfig(company, kind, code)) as TradeConfig<K> | null;
    if (!found || !tradeEffective(found as TradeConfig, day)) tradeDocumentError(path, "reference");
    return found;
  }
  private async party(repo: Repo, company: string, side: TradeSide, code: string, day: string) {
    const party = await this.config(repo, company, "tradeParty", code, day, "party");
    const profileCode = side === "AP" ? party.data.apProfile : party.data.arProfile;
    if (profileCode === null) tradeDocumentError("party", "party");
    const profile = await this.config(repo, company, "tradeProfile", profileCode, day, "party");
    if (profile.data.side !== side) tradeDocumentError("party", "party");
    const terms = await this.config(repo, company, "tradeTerms", party.data.terms, day, "party");
    return { party, profile, terms };
  }
  private async product(
    repo: Repo,
    company: string,
    side: TradeSide,
    code: string,
    day: string,
    path: string,
  ) {
    const product = await this.config(repo, company, "tradeProduct", code, day, path);
    const account = side === "AP" ? product.data.expenseAccount : product.data.revenueAccount;
    if (product.data.type !== (side === "AP" ? "expense" : "service") || account === null)
      tradeDocumentError(path, "product");
    return { product, account };
  }
  private async taxes(
    repo: Repo,
    company: string,
    party: TradeConfig<"tradeParty">,
    product: TradeConfig<"tradeProduct">,
  ) {
    const codes = party.data.allowedTaxCodes.filter((code) =>
      product.data.allowedTaxCodes.includes(code),
    );
    const found: TradeConfig<"taxCode">[] = [];
    for (const code of codes) {
      const tax = await repo.tradeConfig(company, "taxCode", code);
      if (tax?.kind === "taxCode") found.push(tax);
    }
    return found;
  }
  private select(
    party: TradeConfig<"tradeParty">,
    product: TradeConfig<"tradeProduct">,
    taxes: readonly TradeConfig<"taxCode">[],
    day: string,
    selected: string | null,
    path: string,
  ) {
    try {
      return selectTradeTax(party, product, taxes, day, selected ?? undefined);
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.issue &&
        "scope" in error.issue &&
        error.issue.scope === "trade"
      )
        throw new DomainError(error.code, { ...error.issue, path: `${path}.${error.issue.path}` });
      throw error;
    }
  }
  private async company(repo: Repo, code: string, currency: string): Promise<Company> {
    const company = required(await repo.company(code));
    if (company.currency !== currency) tradeDocumentError("currency", "currency");
    return company;
  }

  async createOrder(command: TradeOrderCommand): Promise<TradeOrder> {
    checkedTradeOrder(command);
    const commandHash = this.tools.hash(["trade-order-v1", command]);
    return this.store.write(async (repo) => {
      const company = await this.company(repo, command.company, command.currency);
      const existing = await repo.tradeOrder(command.company, command.orderId);
      if (existing) {
        if (existing.commandHash !== commandHash) tradeDocumentError("orderId", "duplicate", true);
        return existing;
      }
      const day = command.orderDate;
      const { party } = await this.party(repo, command.company, command.side, command.party, day);
      const taxes: ReturnType<typeof selectTradeTax>[] = [];
      for (const [index, line] of command.lines.entries()) {
        const { product } = await this.product(
          repo,
          command.company,
          command.side,
          line.product,
          day,
          `lines.${index}.product`,
        );
        const all = await this.taxes(repo, command.company, party, product);
        taxes.push(this.select(party, product, all, day, line.taxCode, `lines.${index}`));
      }
      const calculation = calculateTrade({
        side: command.side === "AP" ? "ap" : "ar",
        currency: command.currency,
        accountingCurrency: company.currency,
        scale: company.scale,
        priceMode: command.priceIncludesTax ? "inclusive" : "exclusive",
        rounding: command.rounding,
        lines: command.lines.map((line, index) => ({
          id: line.lineId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          taxableCharges: line.taxableCharge,
          tax: {
            code: taxes[index].tax.code,
            treatment:
              taxes[index].tax.data.mode === "ordinary" ? "standard" : taxes[index].tax.data.mode,
            ratePercent: taxes[index].rate.ratePercent,
            deductiblePercent: taxes[index].tax.data.deductiblePercent,
          },
        })),
      });
      const { company: _, lines, ...header } = command;
      const order: TradeOrder = {
        ...header,
        commandHash,
        recordedAt: this.tools.now(),
        lines: lines.map((line, index) => ({
          ...line,
          lineNo: index + 1,
          net: calculation.lines[index].net,
          tax: calculation.lines[index].tax,
          gross: calculation.lines[index].gross,
        })),
      };
      await repo.insertTradeOrder(command.company, order);
      await repo.businessAudit(
        command.company,
        `TRADE-ORDER:${command.orderId}`,
        "trade.order.create",
        { commandHash, side: command.side, party: command.party, lines: lines.length },
        order.recordedAt,
      );
      return order;
    });
  }

  private async prepare(repo: Repo, command: TradeInvoiceCommand): Promise<Prepared> {
    const commandHash = this.tools.hash(["trade-invoice-v1", command]);
    const company = await this.company(repo, command.company, command.currency);
    const day = command.accountingDate;
    const { party, profile, terms } = await this.party(
      repo,
      command.company,
      command.side,
      command.party,
      day,
    );
    const resolved: {
      product: TradeConfig<"tradeProduct">;
      account: string;
      tax: ReturnType<typeof selectTradeTax>;
      taxes: readonly TradeConfig<"taxCode">[];
    }[] = [];
    for (const [index, line] of command.lines.entries()) {
      const path = `lines.${index}`;
      const { product, account } = await this.product(
        repo,
        command.company,
        command.side,
        line.product,
        day,
        `${path}.product`,
      );
      const all = await this.taxes(repo, command.company, party, product);
      // Tax rates follow taxDate; accounts and other configuration follow accountingDate.
      const tax = this.select(party, product, all, command.taxDate, line.taxCode, path);
      resolved.push({ product, account, tax, taxes: all });
    }
    const calculation = calculateTrade({
      side: command.side === "AP" ? "ap" : "ar",
      currency: command.currency,
      accountingCurrency: company.currency,
      scale: company.scale,
      priceMode: command.priceIncludesTax ? "inclusive" : "exclusive",
      rounding: command.rounding,
      lines: command.lines.map((line, index) => ({
        id: line.lineId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxableCharges: line.taxableCharge,
        tax: {
          code: resolved[index].tax.tax.code,
          treatment:
            resolved[index].tax.tax.data.mode === "ordinary"
              ? "standard"
              : resolved[index].tax.tax.data.mode,
          ratePercent: resolved[index].tax.rate.ratePercent,
          deductiblePercent: resolved[index].tax.tax.data.deductiblePercent,
        },
      })),
    });
    if (calculation.gross <= 0) tradeDocumentError("lines", "shape");
    let order: TradeOrder | null = null;
    const matches: TradeLineMatch[] = [];
    if (command.orderId !== null) {
      order = await repo.tradeOrder(command.company, command.orderId);
      if (!order) tradeDocumentError("orderId", "order");
      if (
        order.side !== command.side ||
        order.party !== command.party ||
        order.currency !== command.currency
      )
        tradeDocumentError("orderId", "order");
      const invoiced = new Map<string, bigint>();
      for (const row of await repo.tradeOrderInvoiced(command.company, order.orderId))
        invoiced.set(
          row.orderLineId,
          (invoiced.get(row.orderLineId) ?? 0n) + quantityMicros(row.quantity),
        );
      for (const [index, line] of command.lines.entries()) {
        const orderLine = order.lines.find((item) => item.lineId === line.orderLineId);
        if (!orderLine || orderLine.product !== line.product)
          tradeDocumentError(`lines.${index}.orderLineId`, "orderLine");
        matches.push(
          matchTradeOrderLine({
            lineId: line.lineId,
            path: `lines.${index}`,
            order: orderLine,
            previouslyInvoiced: invoiced.get(orderLine.lineId) ?? 0n,
            quantity: line.quantity,
            invoiceNet: calculation.lines[index].net,
          }),
        );
      }
    }
    const outside = matches.some((match) => !match.withinTolerance);
    if (outside !== (command.matchingException !== null))
      tradeDocumentError("matchingException", outside ? "price" : "exception");
    const poMatch: PoMatch = order === null ? "notApplicable" : outside ? "exception" : "matched";
    const scale = company.scale;
    const journalLines: JournalInputLine[] = [];
    const master: DimensionMap[] = [];
    const push = (
      account: string,
      side: "debit" | "credit",
      minor: number,
      dims: DimensionMap,
      defaults: DimensionMap,
    ) => {
      if (minor === 0) return;
      const money = formatMinor(minor, scale);
      journalLines.push({
        account,
        debit: side === "debit" ? money : "",
        credit: side === "credit" ? money : "",
        dimensions: dims,
        suspense: null,
      });
      master.push(defaults);
    };
    const controlSide = command.side === "AP" ? "credit" : "debit",
      lineSide = command.side === "AP" ? "debit" : "credit";
    const controlIndex = 0;
    push(
      profile.data.controlAccount,
      controlSide,
      calculation.gross,
      {},
      party.data.defaultDimensions,
    );
    const lines: TradeDocumentLine[] = command.lines.map((line, index) => {
      const calc = calculation.lines[index];
      const { product, account, tax } = resolved[index];
      const defaults = { ...party.data.defaultDimensions, ...product.data.defaultDimensions };
      push(
        account,
        lineSide,
        command.side === "AP" ? calc.expense : calc.net,
        line.dimensions,
        defaults,
      );
      const taxMinor = command.side === "AP" ? calc.deductibleTax : calc.tax;
      const taxAccount =
        command.side === "AP" ? tax.tax.data.inputAccount : tax.tax.data.outputAccount;
      if (taxMinor > 0) {
        if (taxAccount === null) tradeDocumentError(`lines.${index}.taxCode`, "account");
        push(taxAccount, lineSide, taxMinor, line.dimensions, defaults);
      }
      const match = matches[index];
      return {
        lineId: line.lineId,
        lineNo: index + 1,
        product: product.code,
        account,
        taxCode: tax.tax.code,
        taxRateId: tax.rate.id,
        ratePercent: tax.rate.ratePercent,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxableCharge: line.taxableCharge,
        net: calc.net,
        tax: calc.tax,
        gross: calc.gross,
        deductibleTax: calc.deductibleTax,
        orderId: command.orderId,
        orderLineId: line.orderLineId,
        expectedNet: match ? match.expectedNet : null,
        matchStatus: match ? (match.withinTolerance ? "matched" : "exception") : "notApplicable",
      };
    });
    const external = normalizeExternalInvoice(command.externalInvoice);
    const draft: JournalDraft = {
      id: command.documentId,
      revision: 0,
      sourceRef: `TRADE-${command.side}-INV:${command.documentId}`,
      date: command.accountingDate,
      documentDate: command.documentDate,
      taxDate: command.taxDate,
      memo: `${command.side} invoice ${external}`.slice(0, 200),
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: command.headerDimensions,
      lines: journalLines,
    };
    const journal = await this.journals.adapter("TRADE").plan(repo, command.company, draft, master);
    const dueDate = addTradeDays(command.documentDate, terms.data.dueDays);
    const discountDate = addTradeDays(command.documentDate, terms.data.discountDays);
    const fingerprint = this.tools.hash([
      "trade-invoice-preview-v1",
      commandHash,
      journal.fingerprint,
      party,
      profile,
      terms,
      ...resolved.flatMap((item) => [item.product, ...item.taxes]),
      order,
      matches,
    ]);
    return {
      commandHash,
      journal,
      lines,
      controlIndex,
      preview: {
        fingerprint,
        side: command.side,
        externalNoNormalized: external,
        calculation,
        poMatch,
        matches,
        dueDate,
        discountDate,
        controlAccount: profile.data.controlAccount,
        journal: journal.plan,
      },
    };
  }
  private async unique(repo: Repo, command: TradeInvoiceCommand) {
    if (await repo.tradeDocument(command.company, command.documentId))
      tradeDocumentError("documentId", "duplicate", true);
    if (
      await repo.tradeDocumentByExternal(
        command.company,
        command.party,
        normalizeExternalInvoice(command.externalInvoice),
      )
    )
      tradeDocumentError("externalInvoice", "duplicate", true);
    if (
      await repo.journalSourceExists(
        command.company,
        `TRADE-${command.side}-INV:${command.documentId}`,
      )
    )
      tradeDocumentError("documentId", "duplicate", true);
  }

  async preview(command: TradeInvoiceCommand): Promise<TradeInvoicePreview> {
    checkedTradeInvoice(command);
    return this.store.read(async (repo) => {
      await this.unique(repo, command);
      return (await this.prepare(repo, command)).preview;
    });
  }

  async confirm(input: TradeInvoiceConfirm): Promise<TradeInvoiceReceipt> {
    if (
      !input ||
      typeof input !== "object" ||
      input.confirmation !== "POST" ||
      typeof input.fingerprint !== "string" ||
      !/^[0-9a-f]{64}$/u.test(input.fingerprint)
    )
      tradeDocumentError("fingerprint", "shape");
    try {
      checkedJournalId(input.idempotencyKey);
    } catch {
      tradeDocumentError("idempotencyKey", "shape");
    }
    checkedTradeInvoice(input.command);
    const command = input.command;
    return this.store.write(async (repo) => {
      const previous = await repo.tradeDocumentByReceipt(command.company, input.idempotencyKey);
      if (previous) {
        if (
          previous.commandHash !== this.tools.hash(["trade-invoice-v1", command]) ||
          previous.fingerprint !== input.fingerprint
        )
          tradeDocumentError("idempotencyKey", "idempotency", true);
        return previous.snapshot.receipt;
      }
      if (await repo.journalReceipt(command.company, input.idempotencyKey))
        tradeDocumentError("idempotencyKey", "idempotency", true);
      await this.unique(repo, command);
      const prepared = await this.prepare(repo, command);
      if (prepared.preview.fingerprint !== input.fingerprint)
        tradeDocumentError("fingerprint", "stale", true);
      const journal = await this.journals.commit(repo, prepared.journal, input.idempotencyKey);
      const preview = prepared.preview;
      const controlLine = journal.journalIds.length
        ? prepared.journal.plan.journals[0].lines[prepared.controlIndex]
        : null;
      const receipt: TradeInvoiceReceipt = {
        company: command.company,
        documentId: command.documentId,
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        sourceRef: journal.sourceRef,
        journalIds: journal.journalIds,
        poMatch: preview.poMatch,
        gross: preview.calculation.gross,
        postedAt: journal.postedAt,
      };
      const record: TradeDocumentRecord = {
        documentId: command.documentId,
        side: command.side,
        party: command.party,
        externalNo: command.externalInvoice.trim(),
        externalNoNormalized: preview.externalNoNormalized,
        currency: command.currency,
        accountingDate: command.accountingDate,
        documentDate: command.documentDate,
        taxDate: command.taxDate,
        dueDate: preview.dueDate,
        discountDate: preview.discountDate,
        orderId: command.orderId,
        poMatch: preview.poMatch,
        exceptionReason: command.matchingException?.reason.trim() ?? null,
        net: preview.calculation.net,
        tax: preview.calculation.tax,
        gross: preview.calculation.gross,
        journalId: journal.journalIds[0],
        receiptKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        commandHash: prepared.commandHash,
        postedAt: journal.postedAt,
        controlAccount: preview.controlAccount,
        controlDimensions: controlLine?.dimensions ?? {},
        lines: prepared.lines,
        snapshot: {
          version: 1,
          command,
          calculation: preview.calculation,
          matches: preview.matches,
          receipt,
        },
      };
      await repo.insertTradeDocument(command.company, record);
      await repo.businessAudit(
        command.company,
        journal.sourceRef,
        "trade.invoice.confirm",
        {
          documentId: command.documentId,
          journalIds: journal.journalIds,
          fingerprint: input.fingerprint,
          poMatch: preview.poMatch,
          exceptionReason: record.exceptionReason,
        },
        journal.postedAt,
      );
      return receipt;
    });
  }

  async list(company: string, query: PageQuery): Promise<Page<TradeDocumentSummary>> {
    checkedCode(company);
    checkedPage(query);
    cursorNumber(query.cursor);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.tradeDocumentPage(company, query);
    });
  }
  async detail(company: string, documentId: string): Promise<TradeInvoiceDetail> {
    checkedCode(company);
    if (typeof documentId !== "string" || !/^[0-9a-f-]{36}$/u.test(documentId))
      tradeDocumentError("documentId", "shape");
    return this.store.read(async (repo) => {
      const record = required(await repo.tradeDocument(company, documentId));
      const { snapshot, ...document } = record;
      return {
        document,
        calculation: snapshot.calculation,
        matches: snapshot.matches,
        receipt: snapshot.receipt,
        openItem: required(await repo.openItem(company, documentId)),
      };
    });
  }
  async order(company: string, orderId: string): Promise<TradeOrder> {
    checkedCode(company);
    checkedCode(orderId);
    return this.store.read(async (repo) => required(await repo.tradeOrder(company, orderId)));
  }
  async openItems(company: string, query: OpenItemQuery): Promise<Page<OpenItem>> {
    checkedCode(company);
    checkedPage(query);
    if (query.party !== undefined) checkedCode(query.party);
    if (query.status !== undefined && query.status !== "open" && query.status !== "settled")
      tradeDocumentError("status", "shape");
    if (query.cursor !== undefined && !/^\d{4}-\d\d-\d\d\|[0-9a-f-]{36}$/u.test(query.cursor))
      tradeDocumentError("cursor", "shape");
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.openItemPage(company, query);
    });
  }
}

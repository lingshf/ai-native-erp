import {
  DomainError,
  addTradeDays,
  assertTradeAccount,
  calculateTrade,
  checkedCode,
  checkedJournalId,
  checkedPage,
  checkedTradeInvoice,
  checkedTradeOrder,
  checkedTradeSettlement,
  checkedTradeAction,
  tradeSegments,
  formatMicros,
  normalizeExternalInvoice,
  selectTradeTax,
  tradeDocumentError,
  tradeEffective,
  tradeOrderInvoicingStatuses,
  type Account,
  type Company,
  type OpenItem,
  type Page,
  type PageQuery,
  type PoMatch,
  type TradeAccountRole,
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
  type TradeOrderInvoicingStatus,
  type TradeOrderPreview,
  type TradeOrderSummary,
  type TradeSide,
  type TradeSettlementCommand,
  type TradeSettlementAllocation,
  type TradeSettlementReceipt,
  type TradePaymentRecord,
  type TradeActionCommand,
  type TradeActionConfirm,
  type TradeActionPreview,
  type TradeActionReceipt,
  type TradeActionRecord,
  type TradeCreditLine,
  type TradeReportQuery,
} from "@erp/core/domain";
import { readTradeReport, readTradeReconciliation, tradeReportDates } from "./trade-reporting.ts";
import { prepareTradeAction } from "./trade-adjustments.ts";
import { invoiceAccountRoleInputs } from "./trade-invoice-account-roles.ts";
import { calculateInvoice } from "./trade-invoice-calculation.ts";
import { invoiceDraft, invoiceJournalLines } from "./trade-invoice-journal.ts";
import { invoicePoMatch, matchInvoiceOrder } from "./trade-invoice-order-match.ts";
import {
  assertNewSettlementPayment,
  settlementSelections,
  settlementTotals,
} from "./trade-settlement-allocation.ts";
import {
  checkSettlementDimensions,
  settlementAccountRoleInputs,
  settlementDraft,
  settlementJournalLines,
} from "./trade-settlement-journal.ts";
import type { JournalPreview, JournalService, JournalTools } from "./journals.ts";
import type { MasterDataRepository, MasterDataStore } from "./master-data.ts";

export interface OpenItemQuery extends PageQuery {
  readonly party?: string;
  readonly status?: OpenItem["status"];
}
/** TORD-05: optional filters, combined with AND; the keyset stays on orderId. */
export interface TradeOrderListQuery extends PageQuery {
  readonly party?: string;
  readonly side?: TradeSide;
  readonly from?: string;
  readonly to?: string;
  /** TORD-06: stored invoicing status of the order. */
  readonly invoicing?: TradeOrderInvoicingStatus;
}
/** TINV-05: optional filters, combined with AND; the keyset stays on the sequence cursor. */
export interface TradeInvoiceListQuery extends PageQuery {
  readonly party?: string;
  readonly side?: TradeSide;
  /** Inclusive accounting-date range. */
  readonly from?: string;
  readonly to?: string;
}
function checkedListFilters(query: TradeOrderListQuery | TradeInvoiceListQuery): void {
  if (query.party !== undefined) checkedCode(query.party);
  if (query.side !== undefined && query.side !== "AP" && query.side !== "AR")
    tradeDocumentError("side", "shape");
  if (query.from !== undefined) checkedOrderDay(query.from, "from");
  if (query.to !== undefined) checkedOrderDay(query.to, "to");
  if (query.from !== undefined && query.to !== undefined && query.from > query.to)
    tradeDocumentError("to", "shape");
}
function checkedOrderDay(day: string, path: string): void {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d\d-\d\d$/u.test(day) ||
    Number.isNaN(time) ||
    new Date(time).toISOString().slice(0, 10) !== day
  )
    tradeDocumentError(path, "shape");
}
export interface TradeDocumentRepository {
  tradeAction(company: string, id: string, byReceipt?: boolean): Promise<TradeActionRecord | null>;
  tradeItemActions(company: string, itemId: string): Promise<readonly TradeActionRecord[]>;
  tradeUndo(company: string, kind: "cancel" | "reverse", relatedId: string): Promise<boolean>;
  tradeItemSource(
    company: string,
    itemId: string,
  ): Promise<{
    readonly journalId: string;
    readonly originalId: string | null;
    /** M2-03b legacy opening item: no trade document; only settlement and apply may use it. */
    readonly opening: boolean;
  } | null>;
  /** Subset of itemIds that are M2-03b legacy opening items, in one query. */
  tradeOpeningItems(company: string, itemIds: readonly string[]): Promise<ReadonlySet<string>>;
  tradeCreditLines(company: string, invoiceId: string): Promise<readonly TradeCreditLine[]>;
  insertTradeItem(
    company: string,
    item: OpenItem,
    journalId: string,
    originalId: string | null,
  ): Promise<void>;
  changeOpenItem(company: string, before: OpenItem, after: OpenItem): Promise<void>;
  insertTradeAction(company: string, record: TradeActionRecord): Promise<void>;
  tradeOrder(company: string, orderId: string): Promise<TradeOrder | null>;
  tradeOrderLatestDate(company: string, orderId: string): Promise<string>;
  insertTradeOrder(company: string, order: TradeOrder): Promise<void>;
  /** One statement per page: keyset on orderId (party filter via trade_orders_party), line totals grouped in storage. */
  tradeOrderPage(company: string, query: TradeOrderListQuery): Promise<Page<TradeOrderSummary>>;
  /**
   * Exact invoiced quantity in micros per requested order line, aggregated in storage, net of credit
   * notes; creditedMicros is the credited quantity already subtracted (TORD-08).
   */
  tradeOrderInvoiced(
    company: string,
    orderId: string,
    orderLineIds: readonly string[],
  ): Promise<
    readonly {
      readonly orderLineId: string;
      readonly micros: bigint;
      readonly creditedMicros: bigint;
    }[]
  >;
  tradeConfigsByCodes<K extends TradeConfig["kind"]>(
    company: string,
    kind: K,
    codes: readonly string[],
  ): Promise<readonly TradeConfig<K>[]>;
  tradeDocument(company: string, documentId: string): Promise<TradeDocumentRecord | null>;
  tradeDocumentByReceipt(company: string, key: string): Promise<TradeDocumentRecord | null>;
  tradeDocumentByExternal(
    company: string,
    party: string,
    normalized: string,
  ): Promise<string | null>;
  insertTradeDocument(company: string, document: TradeDocumentRecord): Promise<void>;
  /** One statement per page: sequence keyset (party filter via trade_documents_party). */
  tradeDocumentPage(
    company: string,
    query: TradeInvoiceListQuery,
  ): Promise<Page<TradeDocumentSummary>>;
  openItem(company: string, itemId: string): Promise<OpenItem | null>;
  openItemPage(company: string, query: OpenItemQuery): Promise<Page<OpenItem>>;
  tradePayment(
    company: string,
    paymentId: string,
    byReceipt?: boolean,
  ): Promise<TradePaymentRecord | null>;
  insertTradePayment(company: string, record: TradePaymentRecord): Promise<void>;
  settleOpenItem(
    company: string,
    paymentId: string,
    receiptKey: string,
    journalId: string,
    day: string,
    at: string,
    allocation: TradeSettlementAllocation,
  ): Promise<void>;
  itemSettlements(company: string, itemId: string): Promise<readonly TradeSettlementReceipt[]>;
  latestSettlementDate(company: string, itemId: string): Promise<string>;
}
export interface TradeOrderInvoicing {
  readonly order: TradeOrder;
  readonly invoiced: readonly {
    readonly lineId: string;
    readonly invoicedQuantity: string;
    readonly creditedQuantity: string;
  }[];
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
  readonly actions: readonly TradeActionRecord[];
  readonly document: Omit<TradeDocumentRecord, "snapshot">;
  readonly calculation: TradeCalculation;
  readonly matches: readonly TradeLineMatch[];
  readonly receipt: TradeInvoiceReceipt;
  readonly openItem: OpenItem;
  readonly settlements: readonly TradeSettlementReceipt[];
}
export interface TradeSettlementPreview {
  readonly fingerprint: string;
  readonly gross: number;
  readonly cash: number;
  readonly discount: number;
  readonly allocations: readonly TradeSettlementAllocation[];
  readonly journal: JournalPreview["plan"];
}
interface Prepared {
  readonly preview: TradeInvoicePreview;
  readonly journal: JournalPreview;
  readonly commandHash: string;
  readonly lines: readonly TradeDocumentLine[];
  readonly controlIndexes: readonly number[];
  readonly settlementTerms: {
    readonly discountPercent: string;
    readonly allowPartialDiscount: boolean;
  };
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
  report(company: string, query: TradeReportQuery) {
    return this.store.read((repo) => readTradeReport(repo, this.tools, company, query));
  }
  reconciliation(company: string, month?: string) {
    return this.store.read((repo) => readTradeReconciliation(repo, this.tools, company, month));
  }
  itemDetail(company: string, id: string, month?: string) {
    checkedCode(company);
    checkedJournalId(id);
    const dates = tradeReportDates(month, this.tools.now());
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      const selected = required(
        await repo.tradeReportItem(company, id, dates.cutoff, dates.ageingDate),
      );
      const current = required(await repo.openItem(company, id));
      const source = required(await repo.tradeItemSource(company, id));
      const record =
        selected.kind === "invoice" && !source.opening
          ? required(await repo.tradeDocument(company, id))
          : null;
      let document: TradeInvoiceDetail["document"] | null = null;
      if (record !== null) {
        const { snapshot: _, ...saved } = record;
        document = saved;
      }
      const actions = (await repo.tradeItemActions(company, id)).filter(
        (a) => a.command.accountingDate <= dates.cutoff,
      );
      const settlements = (await repo.itemSettlements(company, id)).filter((s) =>
        s.allocations.some((a) => a.itemId === id),
      );
      // Payment dates come from immutable linked journals, not postedAt wall-clock time.
      const dated = await Promise.all(
        settlements.map(async (s) => ({
          receipt: s,
          date: required(await repo.journalEntry(company, s.journalIds[0])).date,
        })),
      );
      return {
        company,
        asOf: dates.asOf,
        selected,
        current,
        actions,
        document,
        originalDocumentId: source.originalId,
        settlements: dated.filter((s) => s.date <= dates.cutoff).map((s) => s.receipt),
      };
    });
  }
  async previewAction(command: TradeActionCommand): Promise<TradeActionPreview> {
    checkedTradeAction(command);
    return this.store.read(
      async (repo) => (await prepareTradeAction(repo, this.journals, this.tools, command)).preview,
    );
  }
  async confirmAction(input: TradeActionConfirm): Promise<TradeActionReceipt> {
    if (
      input?.confirmation !== "POST" ||
      typeof input.fingerprint !== "string" ||
      !/^[0-9a-f]{64}$/u.test(input.fingerprint)
    )
      tradeDocumentError("fingerprint", "shape");
    checkedJournalId(input.idempotencyKey);
    checkedTradeAction(input.command);
    const command = input.command;
    return this.store.write(async (repo) => {
      const commandHash = this.tools.hash(["trade-action-v1", command]);
      const previous = await repo.tradeAction(command.company, input.idempotencyKey, true);
      if (previous) {
        if (
          previous.commandHash !== commandHash ||
          previous.receipt.fingerprint !== input.fingerprint
        )
          tradeDocumentError("idempotencyKey", "idempotency", true);
        return previous.receipt;
      }
      if (await repo.journalReceipt(command.company, input.idempotencyKey))
        tradeDocumentError("idempotencyKey", "idempotency", true);
      const prepared = await prepareTradeAction(repo, this.journals, this.tools, command);
      if (prepared.preview.fingerprint !== input.fingerprint)
        tradeDocumentError("fingerprint", "stale", true);
      const posted = await this.journals.commit(repo, prepared.journal, input.idempotencyKey);
      const { journal: _, ...preview } = prepared.preview;
      const receipt: TradeActionReceipt = {
        ...preview,
        company: command.company,
        actionId: command.actionId,
        idempotencyKey: input.idempotencyKey,
        sourceRef: posted.sourceRef,
        journalIds: posted.journalIds,
        postedAt: posted.postedAt,
      };
      for (const change of receipt.changes) {
        if (change.before) await repo.changeOpenItem(command.company, change.before, change.after);
        else
          await repo.insertTradeItem(
            command.company,
            change.after,
            posted.journalIds[0],
            command.kind === "credit" ? command.invoiceId : null,
          );
      }
      await repo.insertTradeAction(command.company, { command, commandHash, receipt });
      await repo.businessAudit(
        command.company,
        posted.sourceRef,
        `trade.${command.kind}.confirm`,
        {
          actionId: command.actionId,
          links: receipt.links,
          reason: "reason" in command ? command.reason : null,
        },
        posted.postedAt,
      );
      return receipt;
    });
  }
  async actions(company: string, itemId: string): Promise<readonly TradeActionRecord[]> {
    checkedCode(company);
    checkedJournalId(itemId);
    return this.store.read(async (repo) => {
      required(await repo.openItem(company, itemId));
      return repo.tradeItemActions(company, itemId);
    });
  }
  private async prepareSettlement(repo: Repo, command: TradeSettlementCommand) {
    await assertNewSettlementPayment(repo, command);
    const company = await this.company(repo, command.company, command.currency);
    const party = await this.config(
      repo,
      command.company,
      "tradeParty",
      command.party,
      command.accountingDate,
      "party",
    );
    const profileCode = command.side === "AP" ? party.data.apProfile : party.data.arProfile;
    if (profileCode === null) tradeDocumentError("party", "party");
    const profile = await this.config(
      repo,
      command.company,
      "tradeProfile",
      profileCode,
      command.accountingDate,
      "party",
    );
    if (profile.data.side !== command.side) tradeDocumentError("party", "party");
    if (await repo.journalSourceExists(command.company, `TRADE-PAY:${command.paymentId}`))
      tradeDocumentError("paymentId", "duplicate", true);
    const selections = await settlementSelections(repo, command);
    const { allocations, controls } = selections;
    const totals = settlementTotals(allocations);
    const { gross, cash, discount } = totals;
    const accounts = await this.accountRoles(
      repo,
      command.company,
      settlementAccountRoleInputs(command, profile, controls, totals),
    );
    const { lines, controlLines } = settlementJournalLines(
      command,
      profile,
      selections,
      totals,
      company.scale,
    );
    const journal = await this.journals.adapter("TRADE").plan(
      repo,
      command.company,
      settlementDraft(command, lines),
      lines.map(() => ({})),
    );
    checkSettlementDimensions(journal, controlLines);
    const commandHash = this.tools.hash(["trade-settlement-v1", command]);
    const fingerprint = this.tools.hash([
      "trade-settlement-preview-v1",
      commandHash,
      journal.fingerprint,
      controls,
      party,
      profile,
      accounts,
    ]);
    const preview: TradeSettlementPreview = {
      fingerprint,
      gross,
      cash,
      discount,
      allocations,
      journal: journal.plan,
    };
    return { journal, commandHash, preview };
  }
  async previewSettlement(command: TradeSettlementCommand): Promise<TradeSettlementPreview> {
    checkedTradeSettlement(command);
    return this.store.read(async (repo) => (await this.prepareSettlement(repo, command)).preview);
  }
  async confirmSettlement(input: {
    readonly command: TradeSettlementCommand;
    readonly fingerprint: string;
    readonly idempotencyKey: string;
    readonly confirmation: "POST";
  }): Promise<TradeSettlementReceipt> {
    if (
      input?.confirmation !== "POST" ||
      typeof input.fingerprint !== "string" ||
      !/^[0-9a-f]{64}$/u.test(input.fingerprint)
    )
      tradeDocumentError("fingerprint", "shape");
    checkedJournalId(input.idempotencyKey);
    checkedTradeSettlement(input.command);
    const command = input.command;
    return this.store.write(async (repo) => {
      const previous = await repo.tradePayment(command.company, input.idempotencyKey, true);
      if (previous) {
        if (
          previous.commandHash !== this.tools.hash(["trade-settlement-v1", command]) ||
          previous.receipt.fingerprint !== input.fingerprint
        )
          tradeDocumentError("idempotencyKey", "idempotency", true);
        return previous.receipt;
      }
      if (await repo.journalReceipt(command.company, input.idempotencyKey))
        tradeDocumentError("idempotencyKey", "idempotency", true);
      const prepared = await this.prepareSettlement(repo, command);
      if (prepared.preview.fingerprint !== input.fingerprint)
        tradeDocumentError("fingerprint", "stale", true);
      const posted = await this.journals.commit(repo, prepared.journal, input.idempotencyKey);
      const { journal: _, ...preview } = prepared.preview;
      const receipt: TradeSettlementReceipt = {
        ...preview,
        company: command.company,
        paymentId: command.paymentId,
        idempotencyKey: input.idempotencyKey,
        sourceRef: posted.sourceRef,
        journalIds: posted.journalIds,
        postedAt: posted.postedAt,
      };
      await repo.insertTradePayment(command.company, {
        commandHash: prepared.commandHash,
        receipt,
      });
      for (const a of preview.allocations)
        await repo.settleOpenItem(
          command.company,
          command.paymentId,
          input.idempotencyKey,
          posted.journalIds[0],
          command.accountingDate,
          posted.postedAt,
          a,
        );
      await repo.businessAudit(
        command.company,
        posted.sourceRef,
        "trade.settlement.confirm",
        {
          paymentId: command.paymentId,
          gross: preview.gross,
          cash: preview.cash,
          discount: preview.discount,
        },
        posted.postedAt,
      );
      return receipt;
    });
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
  /** Resolves every line with one batched read per config kind, keyed by distinct codes. */
  private async resolveLines(
    repo: Repo,
    company: string,
    side: TradeSide,
    party: TradeConfig<"tradeParty">,
    lines: readonly { readonly product: string; readonly taxCode: string | null }[],
    day: string,
    taxDay: string,
  ) {
    const products = new Map(
      (
        await repo.tradeConfigsByCodes(company, "tradeProduct", [
          ...new Set(lines.map((line) => line.product)),
        ])
      ).map((product) => [product.code, product]),
    );
    const checked = new Map<string, { product: TradeConfig<"tradeProduct">; account: string }>();
    for (const [index, line] of lines.entries()) {
      if (checked.has(line.product)) continue;
      const path = `lines.${index}.product`;
      const product = products.get(line.product);
      if (!product || !tradeEffective(product, day)) tradeDocumentError(path, "reference");
      const account = side === "AP" ? product.data.expenseAccount : product.data.revenueAccount;
      if (product.data.type !== (side === "AP" ? "expense" : "service") || account === null)
        tradeDocumentError(path, "product");
      checked.set(line.product, { product, account });
    }
    const taxCodes = new Set(
      [...checked.values()].flatMap(({ product }) =>
        party.data.allowedTaxCodes.filter((code) => product.data.allowedTaxCodes.includes(code)),
      ),
    );
    const taxes = await repo.tradeConfigsByCodes(company, "taxCode", [...taxCodes].sort());
    const resolved = lines.map((line, index) => {
      const { product, account } = checked.get(line.product) as {
        product: TradeConfig<"tradeProduct">;
        account: string;
      };
      return {
        product,
        account,
        tax: this.select(party, product, taxes, taxDay, line.taxCode, `lines.${index}`),
      };
    });
    return {
      resolved,
      configs: [...[...checked.values()].map((item) => item.product), ...taxes],
    };
  }
  /** Re-checks account roles at use time: accounts may be edited after configuration is saved. */
  private async accountRoles(
    repo: Repo,
    company: string,
    uses: readonly {
      code: string;
      role: TradeAccountRole;
      /** The alternate role applies only when this item is a legacy opening item. */
      alternate?: TradeAccountRole;
      openingItem?: string;
      side?: TradeSide;
      path: string;
    }[],
  ): Promise<readonly Account[]> {
    const accounts = await repo.accountsByCodes(company, [...new Set(uses.map((use) => use.code))]);
    const byCode = new Map(accounts.map((account) => [account.code, account]));
    // Looked up once and only after a primary role mismatch, so M1 items cost no extra query.
    let opening: ReadonlySet<string> | undefined;
    for (const use of uses) {
      try {
        try {
          assertTradeAccount(byCode.get(use.code) ?? null, use.role, use.side);
        } catch (error) {
          if (!(error instanceof DomainError) || !use.alternate || !use.openingItem) throw error;
          opening ??= await repo.tradeOpeningItems(
            company,
            uses.flatMap((item) => (item.openingItem ? [item.openingItem] : [])),
          );
          if (!opening.has(use.openingItem)) throw error;
          assertTradeAccount(byCode.get(use.code) ?? null, use.alternate, use.side);
        }
      } catch (error) {
        if (error instanceof DomainError) tradeDocumentError(use.path, "account");
        throw error;
      }
    }
    return accounts;
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

  /**
   * The resolve-and-calculate step shared by createOrder and previewOrder, so a preview and the
   * save that follows it get their amounts from the same code (TORD-04).
   */
  private async calculateOrder(repo: Repo, command: TradeOrderCommand, company: Company) {
    const day = command.orderDate;
    const { party } = await this.party(repo, command.company, command.side, command.party, day);
    const taxes = (
      await this.resolveLines(repo, command.company, command.side, party, command.lines, day, day)
    ).resolved.map((item) => item.tax);
    return calculateTrade({
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
  }

  /** Read-only: never checks or reserves orderId; saving still answers 409 for a taken number. */
  async previewOrder(command: TradeOrderCommand): Promise<TradeOrderPreview> {
    checkedTradeOrder(command);
    return this.store.read(async (repo) => {
      const company = await this.company(repo, command.company, command.currency);
      const calculation = await this.calculateOrder(repo, command, company);
      const lines = command.lines.map((line, index) => ({
        lineId: line.lineId,
        lineNo: index + 1,
        net: calculation.lines[index].net,
        tax: calculation.lines[index].tax,
        gross: calculation.lines[index].gross,
      }));
      const total = (key: "net" | "tax" | "gross") =>
        lines.reduce((sum, line) => sum + line[key], 0);
      return { lines, net: total("net"), tax: total("tax"), gross: total("gross") };
    });
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
      const calculation = await this.calculateOrder(repo, command, company);
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
    // Tax rates follow taxDate; accounts and other configuration follow accountingDate.
    const { resolved, configs } = await this.resolveLines(
      repo,
      command.company,
      command.side,
      party,
      command.lines,
      day,
      command.taxDate,
    );
    const calculation = calculateInvoice(command, company, resolved);
    const { order, matches } = await matchInvoiceOrder(repo, command, calculation);
    const poMatch = invoicePoMatch(command, order, matches);
    const { journalLines, master, controlIndexes, lines } = invoiceJournalLines({
      command,
      party,
      profile,
      resolved,
      calculation,
      matches,
      scale: company.scale,
    });
    const external = normalizeExternalInvoice(command.externalInvoice);
    const accounts = await this.accountRoles(
      repo,
      command.company,
      invoiceAccountRoleInputs(command, profile, resolved, calculation),
    );
    const draft = invoiceDraft(command, external, journalLines);
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
      configs,
      accounts,
      order,
      matches,
    ]);
    return {
      commandHash,
      journal,
      lines,
      controlIndexes,
      settlementTerms: {
        discountPercent: terms.data.discountPercent,
        allowPartialDiscount: terms.data.allowPartialDiscount,
      },
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
    if (
      (await repo.openItem(command.company, command.documentId)) ||
      (await repo.tradeAction(command.company, command.documentId)) ||
      (await repo.tradePayment(command.company, command.documentId))
    )
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
        ? prepared.journal.plan.journals[0].lines[prepared.controlIndexes[0]]
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
          settlementTerms: prepared.settlementTerms,
          controlSegments: tradeSegments(
            prepared.controlIndexes.map((index) => {
              const line = prepared.journal.plan.journals[0].lines[index];
              return { dimensions: line.dimensions, gross: line.debit + line.credit };
            }),
          ),
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

  async list(company: string, query: TradeInvoiceListQuery): Promise<Page<TradeDocumentSummary>> {
    checkedCode(company);
    checkedPage(query);
    cursorNumber(query.cursor);
    checkedListFilters(query);
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
        actions: await repo.tradeItemActions(company, documentId),
        document,
        calculation: snapshot.calculation,
        matches: snapshot.matches,
        receipt: snapshot.receipt,
        openItem: required(await repo.openItem(company, documentId)),
        settlements: await repo.itemSettlements(company, documentId),
      };
    });
  }
  async order(company: string, orderId: string): Promise<TradeOrder> {
    checkedCode(company);
    checkedCode(orderId);
    return this.store.read(async (repo) => required(await repo.tradeOrder(company, orderId)));
  }
  /**
   * TINV-01: invoiced quantity per order line from the same tradeOrderInvoiced used by matching.
   * TORD-08: plus the credited quantity already netted out of it.
   */
  async orderInvoicing(company: string, orderId: string): Promise<TradeOrderInvoicing> {
    checkedCode(company);
    checkedCode(orderId);
    return this.store.read(async (repo) => {
      const order = required(await repo.tradeOrder(company, orderId));
      const invoiced = new Map(
        (
          await repo.tradeOrderInvoiced(
            company,
            order.orderId,
            order.lines.map((line) => line.lineId),
          )
        ).map((row) => [row.orderLineId, row]),
      );
      return {
        order,
        invoiced: order.lines.map((line) => {
          const row = invoiced.get(line.lineId);
          return {
            lineId: line.lineId,
            invoicedQuantity: formatMicros(row?.micros ?? 0n),
            creditedQuantity: formatMicros(row?.creditedMicros ?? 0n),
          };
        }),
      };
    });
  }
  async listOrders(company: string, query: TradeOrderListQuery): Promise<Page<TradeOrderSummary>> {
    checkedCode(company);
    checkedPage(query);
    if (query.cursor !== undefined) checkedCode(query.cursor);
    checkedListFilters(query);
    if (
      query.invoicing !== undefined &&
      !(tradeOrderInvoicingStatuses as readonly string[]).includes(query.invoicing)
    )
      tradeDocumentError("invoicing", "shape");
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.tradeOrderPage(company, query);
    });
  }
  async openItems(company: string, query: OpenItemQuery): Promise<Page<OpenItem>> {
    checkedCode(company);
    checkedPage(query);
    if (query.party !== undefined) checkedCode(query.party);
    if (query.status !== undefined && !["open", "settled", "cancelled"].includes(query.status))
      tradeDocumentError("status", "shape");
    if (query.cursor !== undefined && !/^\d{4}-\d\d-\d\d\|[0-9a-f-]{36}$/u.test(query.cursor))
      tradeDocumentError("cursor", "shape");
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.openItemPage(company, query);
    });
  }
}

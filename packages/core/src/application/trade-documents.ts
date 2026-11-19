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
  roundTradeRatio,
  formatMinor,
  matchTradeOrderLine,
  normalizeExternalInvoice,
  quantityMicros,
  selectTradeTax,
  tradeDocumentError,
  tradeEffective,
  type Account,
  type Company,
  type DimensionMap,
  type JournalDraft,
  type JournalInputLine,
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
  type TradeSide,
  type TradeSettlementCommand,
  type TradeSettlementAllocation,
  type TradeSettlementReceipt,
  type TradePaymentRecord,
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
  /** Exact invoiced quantity in micros per requested order line, aggregated in storage. */
  tradeOrderInvoiced(
    company: string,
    orderId: string,
    orderLineIds: readonly string[],
  ): Promise<readonly { readonly orderLineId: string; readonly micros: bigint }[]>;
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
  tradeDocumentPage(company: string, query: PageQuery): Promise<Page<TradeDocumentSummary>>;
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
  readonly controlIndex: number;
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
  private async prepareSettlement(repo: Repo, command: TradeSettlementCommand) {
    if (await repo.tradePayment(command.company, command.paymentId))
      tradeDocumentError("paymentId", "duplicate", true);
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
    const allocations: TradeSettlementAllocation[] = [];
    const controls: OpenItem[] = [];
    const lines: JournalInputLine[] = [];
    const ap = command.side === "AP";
    const push = (account: string, debit: boolean, amount: number, dimensions: DimensionMap) => {
      if (amount === 0) return;
      lines.push({
        account,
        debit: debit ? formatMinor(amount, company.scale) : "",
        credit: debit ? "" : formatMinor(amount, company.scale),
        dimensions,
        suspense: null,
      });
    };
    for (const [index, selection] of command.items.entries()) {
      const path = `items.${index}`;
      const item = await repo.openItem(command.company, selection.itemId);
      if (!item) tradeDocumentError(path, "reference");
      if (item.party !== command.party || item.side !== command.side)
        tradeDocumentError(path, "party");
      if (item.currency !== command.currency) tradeDocumentError(path, "currency");
      if (item.revision !== selection.revision) tradeDocumentError(path, "stale", true);
      if (selection.gross > item.remainingGross || item.status !== "open")
        tradeDocumentError(path, "quantity");
      if (command.accountingDate < item.accountingDate)
        tradeDocumentError("accountingDate", "reference");
      // Accounting dates, not wall-clock acceptance times, define the dependency chain.
      if ((await repo.latestSettlementDate(command.company, item.itemId)) > command.accountingDate)
        tradeDocumentError("accountingDate", "reference");
      const gross = selection.gross;
      const net =
        gross === item.remainingGross
          ? item.remainingNet
          : roundTradeRatio(BigInt(item.remainingNet) * BigInt(gross), BigInt(item.remainingGross));
      const tax = gross - net;
      const discountAvailable =
        command.accountingDate >= item.documentDate &&
        command.accountingDate <= item.discountDate &&
        quantityMicros(item.discountPercent) > 0n &&
        (item.allowPartialDiscount || (item.revision === 1 && gross === item.gross));
      if (selection.takeDiscount && !discountAvailable)
        tradeDocumentError(`${path}.takeDiscount`, "reference");
      const discount = selection.takeDiscount
        ? roundTradeRatio(BigInt(net) * quantityMicros(item.discountPercent), 100_000_000n)
        : 0;
      allocations.push({
        itemId: item.itemId,
        revision: item.revision,
        gross,
        net,
        tax,
        discount,
        cash: gross - discount,
        discountAvailable,
        discountDate: item.discountDate,
        settledGross: item.gross - item.remainingGross + gross,
        remainingGross: item.remainingGross - gross,
        remainingNet: item.remainingNet - net,
        remainingTax: item.remainingTax - tax,
      });
      controls.push(item);
      push(item.controlAccount, ap, gross, item.dimensions);
    }
    const sum = (key: "gross" | "cash" | "discount") => {
      const value = allocations.reduce((n, a) => n + BigInt(a[key]), 0n);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) tradeDocumentError("items", "shape");
      return Number(value);
    };
    const gross = sum("gross"),
      cash = sum("cash"),
      discount = sum("discount");
    const accounts = await this.accountRoles(repo, command.company, [
      ...controls.map((item) => ({
        code: item.controlAccount,
        role: "controlAccount" as const,
        side: command.side,
        path: "items",
      })),
      ...(cash
        ? [{ code: profile.data.cashAccount, role: "cashAccount" as const, path: "party" }]
        : []),
      ...(discount
        ? [{ code: profile.data.discountAccount, role: "discountAccount" as const, path: "party" }]
        : []),
    ]);
    push(profile.data.cashAccount, !ap, cash, {});
    push(profile.data.discountAccount, !ap, discount, {});
    const draft: JournalDraft = {
      id: command.paymentId,
      revision: 0,
      sourceRef: `TRADE-PAY:${command.paymentId}`,
      date: command.accountingDate,
      documentDate: command.documentDate,
      taxDate: command.taxDate,
      memo: `${command.side} book settlement ${command.party}`,
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines,
    };
    const journal = await this.journals.adapter("TRADE").plan(
      repo,
      command.company,
      draft,
      lines.map(() => ({})),
    );
    for (const [index, item] of controls.entries()) {
      if (
        this.tools.hash([journal.plan.journals[0].lines[index].dimensions]) !==
        this.tools.hash([item.dimensions])
      )
        tradeDocumentError(`items.${index}.dimensions`, "account");
    }
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
    uses: readonly { code: string; role: TradeAccountRole; side?: TradeSide; path: string }[],
  ): Promise<readonly Account[]> {
    const accounts = await repo.accountsByCodes(company, [...new Set(uses.map((use) => use.code))]);
    const byCode = new Map(accounts.map((account) => [account.code, account]));
    for (const use of uses) {
      try {
        assertTradeAccount(byCode.get(use.code) ?? null, use.role, use.side);
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
      const taxes = (
        await this.resolveLines(repo, command.company, command.side, party, command.lines, day, day)
      ).resolved.map((item) => item.tax);
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
      const referenced = [
        ...new Set(command.lines.flatMap((line) => (line.orderLineId ? [line.orderLineId] : []))),
      ];
      const invoiced = new Map(
        (await repo.tradeOrderInvoiced(command.company, order.orderId, referenced)).map((row) => [
          row.orderLineId,
          row.micros,
        ]),
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
    const accounts = await this.accountRoles(repo, command.company, [
      {
        code: profile.data.controlAccount,
        role: "controlAccount",
        side: command.side,
        path: "party",
      },
      ...resolved.flatMap(({ account, tax }, index) => {
        const calc = calculation.lines[index];
        const taxAccount =
          command.side === "AP" ? tax.tax.data.inputAccount : tax.tax.data.outputAccount;
        const taxMinor = command.side === "AP" ? calc.deductibleTax : calc.tax;
        return [
          {
            code: account,
            role: (command.side === "AP" ? "expenseAccount" : "revenueAccount") as TradeAccountRole,
            path: `lines.${index}.product`,
          },
          ...(taxMinor > 0 && taxAccount !== null
            ? [
                {
                  code: taxAccount,
                  role: (command.side === "AP"
                    ? "inputAccount"
                    : "outputAccount") as TradeAccountRole,
                  path: `lines.${index}.taxCode`,
                },
              ]
            : []),
        ];
      }),
    ]);
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
      configs,
      accounts,
      order,
      matches,
    ]);
    return {
      commandHash,
      journal,
      lines,
      controlIndex,
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
          settlementTerms: prepared.settlementTerms,
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
        settlements: await repo.itemSettlements(company, documentId),
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

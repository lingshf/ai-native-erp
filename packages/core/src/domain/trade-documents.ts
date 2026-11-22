import {
  DomainError,
  checkedJournalDay,
  checkedJournalId,
  roundTradeRatio,
  type DimensionMap,
  type TradeCalculation,
  type JournalPlan,
} from "./index.ts";

export interface TradeDocumentIssue {
  readonly scope: "tradeDocument";
  readonly path: string;
  readonly rule:
    | "shape"
    | "reference"
    | "party"
    | "product"
    | "currency"
    | "account"
    | "duplicate"
    | "order"
    | "orderLine"
    | "quantity"
    | "price"
    | "exception"
    | "idempotency"
    | "stale";
}
export function tradeDocumentError(
  path: string,
  rule: TradeDocumentIssue["rule"],
  conflict = false,
): never {
  throw new DomainError(conflict ? "CONFLICT" : "INVALID_INPUT", {
    scope: "tradeDocument",
    path,
    rule,
  });
}

export type TradeSide = "AP" | "AR";
export type PoMatch = "notApplicable" | "matched" | "exception";
export interface TradeOrderLineInput {
  readonly lineId: string;
  readonly product: string;
  readonly taxCode: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  readonly taxableCharge: string;
}
export interface TradeOrderCommand {
  readonly company: string;
  readonly orderId: string;
  readonly side: TradeSide;
  readonly party: string;
  readonly currency: string;
  readonly orderDate: string;
  readonly priceIncludesTax: boolean;
  readonly rounding: "line" | "document";
  readonly lines: readonly TradeOrderLineInput[];
}
export interface TradeOrderLine extends TradeOrderLineInput {
  readonly lineNo: number;
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
}
export interface TradeOrder extends Omit<TradeOrderCommand, "company" | "lines"> {
  readonly commandHash: string;
  readonly recordedAt: string;
  readonly lines: readonly TradeOrderLine[];
}
/** TORD-04 read-only preview: the amounts createOrder would store; totals add up the lines. */
export interface TradeOrderPreview {
  readonly lines: readonly Pick<TradeOrderLine, "lineId" | "lineNo" | "net" | "tax" | "gross">[];
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
}
/** TORD-03 list row: order header plus stored line totals; no lines. TINV-03 adds invoicing. */
export interface TradeOrderSummary extends Omit<TradeOrder, "commandHash" | "lines"> {
  readonly lineCount: number;
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
  readonly invoicing: "none" | "partial" | "full";
}
export interface TradeInvoiceLineInput {
  readonly lineId: string;
  readonly product: string;
  /** Optional explicit selection among the party/product allowed tax codes. */
  readonly taxCode: string | null;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  readonly taxableCharge: string;
  readonly orderLineId: string | null;
  readonly dimensions: DimensionMap;
}
export interface MatchingException {
  readonly confirmed: true;
  readonly reason: string;
}
export interface TradeInvoiceCommand {
  readonly company: string;
  readonly documentId: string;
  readonly side: TradeSide;
  readonly party: string;
  readonly externalInvoice: string;
  readonly currency: string;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly orderId: string | null;
  readonly priceIncludesTax: boolean;
  readonly rounding: "line" | "document";
  readonly headerDimensions: DimensionMap;
  readonly matchingException: MatchingException | null;
  readonly lines: readonly TradeInvoiceLineInput[];
}
export interface TradeInvoiceConfirm {
  readonly command: TradeInvoiceCommand;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly confirmation: "POST";
}
export interface TradeLineMatch {
  readonly lineId: string;
  readonly orderLineId: string;
  readonly orderQuantity: string;
  readonly previouslyInvoiced: string;
  readonly quantity: string;
  readonly expectedNet: number;
  readonly invoiceNet: number;
  readonly variance: number;
  readonly withinTolerance: boolean;
}
export interface TradeDocumentLine {
  readonly lineId: string;
  readonly lineNo: number;
  readonly product: string;
  readonly account: string;
  readonly taxCode: string;
  readonly taxRateId: string;
  readonly ratePercent: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  readonly taxableCharge: string;
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
  readonly deductibleTax: number;
  readonly orderId: string | null;
  readonly orderLineId: string | null;
  readonly expectedNet: number | null;
  readonly matchStatus: PoMatch;
}
export interface OpenItem {
  readonly kind: "invoice" | "advance" | "credit";
  readonly segments: readonly TradeControlSegment[];
  readonly discountPercent: string;
  readonly allowPartialDiscount: boolean;
  readonly itemId: string;
  readonly side: TradeSide;
  readonly party: string;
  readonly externalNo: string;
  readonly controlAccount: string;
  readonly dimensions: DimensionMap;
  readonly currency: string;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly dueDate: string;
  readonly discountDate: string;
  readonly gross: number;
  readonly net: number;
  readonly tax: number;
  readonly remainingGross: number;
  readonly remainingNet: number;
  readonly remainingTax: number;
  readonly status: "open" | "settled" | "cancelled";
  readonly revision: number;
}
export interface TradeInvoiceReceipt {
  readonly company: string;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly sourceRef: string;
  readonly journalIds: readonly string[];
  readonly poMatch: PoMatch;
  readonly gross: number;
  readonly postedAt: string;
}
export interface TradeDocumentSummary {
  readonly documentId: string;
  readonly side: TradeSide;
  readonly party: string;
  readonly externalNo: string;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly dueDate: string;
  readonly poMatch: PoMatch;
  readonly gross: number;
  readonly currency: string;
  readonly journalId: string;
  readonly orderId: string | null;
  readonly cursor: string;
}
export interface TradeDocumentRecord {
  readonly documentId: string;
  readonly side: TradeSide;
  readonly party: string;
  readonly externalNo: string;
  readonly externalNoNormalized: string;
  readonly currency: string;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly dueDate: string;
  readonly discountDate: string;
  readonly orderId: string | null;
  readonly poMatch: PoMatch;
  readonly exceptionReason: string | null;
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
  readonly journalId: string;
  readonly receiptKey: string;
  readonly fingerprint: string;
  readonly commandHash: string;
  readonly postedAt: string;
  readonly controlAccount: string;
  readonly controlDimensions: DimensionMap;
  readonly lines: readonly TradeDocumentLine[];
  readonly snapshot: TradeDocumentSnapshot;
}
export interface TradeDocumentSnapshot {
  readonly version: 1;
  readonly command: TradeInvoiceCommand;
  readonly calculation: TradeCalculation;
  readonly matches: readonly TradeLineMatch[];
  readonly receipt: TradeInvoiceReceipt;
  readonly controlSegments?: readonly TradeControlSegment[];
  readonly settlementTerms?: {
    readonly discountPercent: string;
    readonly allowPartialDiscount: boolean;
  };
}

export interface TradeSettlementCommand {
  readonly company: string;
  readonly paymentId: string;
  readonly side: TradeSide;
  readonly party: string;
  readonly currency: string;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly items: readonly {
    readonly itemId: string;
    readonly revision: number;
    readonly gross: number;
    readonly takeDiscount: boolean;
  }[];
}
export interface TradeSettlementAllocation {
  readonly segments?: readonly TradeSegmentAllocation[];
  readonly itemId: string;
  readonly revision: number;
  readonly gross: number;
  readonly net: number;
  readonly tax: number;
  readonly discount: number;
  readonly cash: number;
  readonly discountAvailable: boolean;
  readonly discountDate: string;
  readonly settledGross: number;
  readonly remainingGross: number;
  readonly remainingNet: number;
  readonly remainingTax: number;
}
export interface TradeSettlementReceipt {
  readonly company: string;
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly sourceRef: string;
  readonly journalIds: readonly string[];
  readonly postedAt: string;
  readonly gross: number;
  readonly cash: number;
  readonly discount: number;
  readonly allocations: readonly TradeSettlementAllocation[];
}
export interface TradePaymentRecord {
  readonly commandHash: string;
  readonly receipt: TradeSettlementReceipt;
}
export interface TradeSegmentAllocation {
  readonly dimensions: DimensionMap;
  readonly gross: number;
}
export interface TradeControlSegment extends TradeSegmentAllocation {
  readonly remainingGross: number;
}
export function tradeDimensionKey(dimensions: DimensionMap): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(dimensions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
}
export function tradeSegments(
  lines: readonly TradeSegmentAllocation[],
): readonly TradeControlSegment[] {
  const grouped = new Map<string, TradeControlSegment>();
  for (const line of lines) {
    const key = tradeDimensionKey(line.dimensions);
    const gross = (grouped.get(key)?.gross ?? 0) + line.gross;
    if (!Number.isSafeInteger(gross)) tradeDocumentError("segments", "shape");
    grouped.set(key, { dimensions: JSON.parse(key) as DimensionMap, gross, remainingGross: gross });
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value);
}
export function allocateTradeSegments(
  item: OpenItem,
  amount: number,
): readonly TradeSegmentAllocation[] {
  let remaining = amount,
    total = item.remainingGross;
  const result: TradeSegmentAllocation[] = [];
  for (const segment of item.segments) {
    if (!segment.remainingGross) continue;
    const gross =
      segment.remainingGross === total
        ? remaining
        : roundTradeRatio(BigInt(remaining) * BigInt(segment.remainingGross), BigInt(total));
    if (gross) result.push({ dimensions: segment.dimensions, gross });
    remaining -= gross;
    total -= segment.remainingGross;
  }
  if (remaining !== 0) tradeDocumentError("segments", "quantity");
  return result;
}
export function changeTradeSegments(
  item: OpenItem,
  allocations: readonly TradeSegmentAllocation[],
  reverse = false,
): readonly TradeControlSegment[] {
  if (
    allocations.some(
      (a) =>
        !item.segments.some(
          (s) => tradeDimensionKey(s.dimensions) === tradeDimensionKey(a.dimensions),
        ),
    )
  )
    tradeDocumentError("segments", "reference");
  return item.segments.map((segment) => {
    const amount = allocations
      .filter((a) => tradeDimensionKey(a.dimensions) === tradeDimensionKey(segment.dimensions))
      .reduce((n, a) => n + a.gross, 0);
    const remainingGross = segment.remainingGross + (reverse ? amount : -amount);
    if (
      !Number.isSafeInteger(remainingGross) ||
      remainingGross < 0 ||
      remainingGross > segment.gross
    )
      tradeDocumentError("segments", "quantity");
    return { ...segment, remainingGross };
  });
}
interface TradeActionHeader {
  readonly company: string;
  readonly actionId: string;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly taxDate: string;
}
export type TradeActionCommand = TradeActionHeader &
  (
    | {
        readonly kind: "advance";
        readonly side: TradeSide;
        readonly party: string;
        readonly currency: string;
        readonly gross: number;
        readonly dimensions: DimensionMap;
      }
    | {
        readonly kind: "credit";
        readonly invoiceId: string;
        readonly revision: number;
        readonly lines: readonly {
          readonly sourceLineId: string;
          readonly quantity: string;
        }[];
      }
    | {
        readonly kind: "apply";
        readonly sourceId: string;
        readonly sourceRevision: number;
        readonly targetId: string;
        readonly targetRevision: number;
        readonly gross: number;
      }
    | {
        readonly kind: "cancel";
        readonly itemId: string;
        readonly revision: number;
        readonly relatedRevision: number | null;
        readonly reason: string;
      }
    | {
        readonly kind: "reverse";
        readonly settlementId: string;
        readonly items: readonly { readonly itemId: string; readonly revision: number }[];
        readonly reason: string;
      }
  );
export interface TradeItemChange {
  readonly before: OpenItem | null;
  readonly after: OpenItem;
}
export interface TradeCreditLine {
  readonly sourceLineId: string;
  readonly quantity: string;
  readonly net: number;
  readonly tax: number;
  readonly deductibleTax: number;
}
export interface TradeActionPreview {
  readonly fingerprint: string;
  readonly kind: TradeActionCommand["kind"];
  readonly gross: number;
  readonly changes: readonly TradeItemChange[];
  readonly creditLines: readonly TradeCreditLine[];
  readonly links: readonly string[];
  readonly journal: JournalPlan;
}
export interface TradeActionReceipt extends Omit<TradeActionPreview, "journal"> {
  readonly company: string;
  readonly actionId: string;
  readonly idempotencyKey: string;
  readonly sourceRef: string;
  readonly journalIds: readonly string[];
  readonly postedAt: string;
}
export interface TradeActionRecord {
  readonly command: TradeActionCommand;
  readonly commandHash: string;
  readonly receipt: TradeActionReceipt;
}
export interface TradeActionConfirm {
  readonly command: TradeActionCommand;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly confirmation: "POST";
}
export function checkedTradeAction(command: TradeActionCommand): void {
  const shared = ["company", "actionId", "kind", "accountingDate", "documentDate", "taxDate"];
  if (!command || typeof command !== "object") tradeDocumentError("command", "shape");
  switch (command.kind) {
    case "advance":
      plain(command, [...shared, "side", "party", "currency", "gross", "dimensions"], "command");
      if (command.side !== "AP" && command.side !== "AR") tradeDocumentError("side", "shape");
      text(command.party, orderCode, "party");
      text(command.currency, /^[A-Z]{3}$/u, "currency");
      dimensions(command.dimensions, "dimensions");
      positive(command.gross, "gross");
      break;
    case "credit":
      plain(command, [...shared, "invoiceId", "revision", "lines"], "command");
      checkedJournalId(command.invoiceId);
      positive(command.revision, "revision");
      if (!Array.isArray(command.lines) || command.lines.length < 1 || command.lines.length > 100)
        tradeDocumentError("lines", "shape");
      if (new Set(command.lines.map((l) => l.sourceLineId)).size !== command.lines.length)
        tradeDocumentError("lines", "duplicate");
      command.lines.forEach((line, index) => {
        plain(line, ["sourceLineId", "quantity"], `lines.${index}`);
        text(line.sourceLineId, identifier, `lines.${index}.sourceLineId`);
        quantity(line.quantity, `lines.${index}.quantity`);
      });
      break;
    case "apply":
      plain(
        command,
        [...shared, "sourceId", "sourceRevision", "targetId", "targetRevision", "gross"],
        "command",
      );
      checkedJournalId(command.sourceId);
      checkedJournalId(command.targetId);
      positive(command.sourceRevision, "sourceRevision");
      positive(command.targetRevision, "targetRevision");
      positive(command.gross, "gross");
      break;
    case "cancel":
      plain(command, [...shared, "itemId", "revision", "relatedRevision", "reason"], "command");
      checkedJournalId(command.itemId);
      positive(command.revision, "revision");
      if (command.relatedRevision !== null) positive(command.relatedRevision, "relatedRevision");
      break;
    case "reverse":
      plain(command, [...shared, "settlementId", "items", "reason"], "command");
      checkedJournalId(command.settlementId);
      if (!Array.isArray(command.items) || command.items.length < 1 || command.items.length > 100)
        tradeDocumentError("items", "shape");
      if (new Set(command.items.map((i) => i.itemId)).size !== command.items.length)
        tradeDocumentError("items", "duplicate");
      for (const item of command.items) {
        plain(item, ["itemId", "revision"], "items");
        checkedJournalId(item.itemId);
        positive(item.revision, "revision");
      }
      break;
    default:
      tradeDocumentError("kind", "shape");
  }
  text(command.company, orderCode, "company");
  checkedJournalId(command.actionId);
  for (const key of ["accountingDate", "documentDate", "taxDate"] as const)
    checkedJournalDay(command[key], key);
  if (command.kind === "cancel" || command.kind === "reverse") {
    if (
      typeof command.reason !== "string" ||
      control.test(command.reason) ||
      command.reason.trim().length < 1 ||
      command.reason.length > 160
    )
      tradeDocumentError("reason", "shape");
  }
}
function positive(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) tradeDocumentError(path, "shape");
}
export function checkedTradeSettlement(command: TradeSettlementCommand): void {
  plain(
    command,
    [
      "company",
      "paymentId",
      "side",
      "party",
      "currency",
      "accountingDate",
      "documentDate",
      "taxDate",
      "items",
    ],
    "command",
  );
  text(command.company, orderCode, "company");
  checkedJournalId(command.paymentId);
  text(command.party, orderCode, "party");
  text(command.currency, /^[A-Z]{3}$/u, "currency");
  if (command.side !== "AP" && command.side !== "AR") tradeDocumentError("side", "shape");
  for (const key of ["accountingDate", "documentDate", "taxDate"] as const)
    checkedJournalDay(command[key], key);
  if (!Array.isArray(command.items) || command.items.length < 1 || command.items.length > 100)
    tradeDocumentError("items", "shape");
  const seen = new Set<string>();
  for (const [index, item] of command.items.entries()) {
    const path = `items.${index}`;
    plain(item, ["itemId", "revision", "gross", "takeDiscount"], path);
    checkedJournalId(item.itemId);
    if (seen.has(item.itemId)) tradeDocumentError(path, "duplicate");
    seen.add(item.itemId);
    if (
      !Number.isSafeInteger(item.revision) ||
      item.revision < 1 ||
      !Number.isSafeInteger(item.gross) ||
      item.gross <= 0 ||
      typeof item.takeDiscount !== "boolean"
    )
      tradeDocumentError(path, "shape");
  }
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/u;
const orderCode = /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u;
const amount = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u;
const control = /\p{Cc}/u;

export function normalizeExternalInvoice(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}
export function quantityMicros(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function formatMicros(value: bigint): string {
  const whole = value / 1_000_000n,
    fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
export function formatMinor(value: number, scale: number): string {
  const text = Math.abs(value)
    .toString()
    .padStart(scale + 1, "0");
  const result = scale ? `${text.slice(0, -scale)}.${text.slice(-scale)}` : text;
  return value < 0 ? `-${result}` : result;
}
export function addTradeDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function plain(value: unknown, keys: readonly string[], path: string): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    tradeDocumentError(path, "shape");
}
function text(value: unknown, pattern: RegExp, path: string): void {
  if (typeof value !== "string" || !pattern.test(value)) tradeDocumentError(path, "shape");
}
function quantity(value: unknown, path: string): void {
  text(value, amount, path);
  if (quantityMicros(value as string) === 0n) tradeDocumentError(path, "quantity");
}
function dimensions(value: unknown, path: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    tradeDocumentError(path, "shape");
  const entries = Object.entries(value);
  if (entries.length > 32) tradeDocumentError(path, "shape");
  for (const [key, item] of entries)
    if (
      !orderCode.test(key) ||
      (item !== null && (typeof item !== "string" || !orderCode.test(item)))
    )
      tradeDocumentError(`${path}.${key}`, "shape");
}
function commonLine(line: Record<string, unknown>, path: string): void {
  text(line.lineId, identifier, `${path}.lineId`);
  text(line.product, orderCode, `${path}.product`);
  quantity(line.quantity, `${path}.quantity`);
  text(line.unitPrice, amount, `${path}.unitPrice`);
  if (typeof line.discountPercent !== "string")
    tradeDocumentError(`${path}.discountPercent`, "shape");
  if (typeof line.taxableCharge !== "string") tradeDocumentError(`${path}.taxableCharge`, "shape");
}
function header(command: TradeOrderCommand | TradeInvoiceCommand): void {
  text(command.company, orderCode, "company");
  if (command.side !== "AP" && command.side !== "AR") tradeDocumentError("side", "shape");
  text(command.party, orderCode, "party");
  text(command.currency, /^[A-Z]{3}$/u, "currency");
  if (typeof command.priceIncludesTax !== "boolean")
    tradeDocumentError("priceIncludesTax", "shape");
  if (command.rounding !== "line" && command.rounding !== "document")
    tradeDocumentError("rounding", "shape");
  if (!Array.isArray(command.lines) || command.lines.length < 1 || command.lines.length > 100)
    tradeDocumentError("lines", "shape");
  if (new Set(command.lines.map((line) => line.lineId)).size !== command.lines.length)
    tradeDocumentError("lines", "duplicate");
}
export function checkedTradeOrder(command: TradeOrderCommand): void {
  plain(
    command,
    [
      "company",
      "orderId",
      "side",
      "party",
      "currency",
      "orderDate",
      "priceIncludesTax",
      "rounding",
      "lines",
    ],
    "command",
  );
  text(command.orderId, orderCode, "orderId");
  checkedJournalDay(command.orderDate, "orderDate");
  header(command);
  command.lines.forEach((line, index) => {
    const path = `lines.${index}`;
    plain(
      line,
      ["lineId", "product", "taxCode", "quantity", "unitPrice", "discountPercent", "taxableCharge"],
      path,
    );
    commonLine(line as unknown as Record<string, unknown>, path);
    text(line.taxCode, orderCode, `${path}.taxCode`);
  });
}
export function checkedTradeInvoice(command: TradeInvoiceCommand): void {
  plain(
    command,
    [
      "company",
      "documentId",
      "side",
      "party",
      "externalInvoice",
      "currency",
      "accountingDate",
      "documentDate",
      "taxDate",
      "orderId",
      "priceIncludesTax",
      "rounding",
      "headerDimensions",
      "matchingException",
      "lines",
    ],
    "command",
  );
  try {
    checkedJournalId(command.documentId);
  } catch {
    tradeDocumentError("documentId", "shape");
  }
  if (
    typeof command.externalInvoice !== "string" ||
    command.externalInvoice.length > 100 ||
    control.test(command.externalInvoice)
  )
    tradeDocumentError("externalInvoice", "shape");
  const normalized = normalizeExternalInvoice(command.externalInvoice);
  if (normalized.length < 1 || normalized.length > 100)
    tradeDocumentError("externalInvoice", "shape");
  for (const day of ["accountingDate", "documentDate", "taxDate"] as const)
    checkedJournalDay(command[day], day);
  header(command);
  if (command.orderId !== null) text(command.orderId, orderCode, "orderId");
  dimensions(command.headerDimensions, "headerDimensions");
  if (command.matchingException !== null) {
    plain(command.matchingException, ["confirmed", "reason"], "matchingException");
    const reason = command.matchingException.reason;
    if (
      command.matchingException.confirmed !== true ||
      typeof reason !== "string" ||
      control.test(reason) ||
      reason.trim().length < 1 ||
      reason.trim().length > 160
    )
      tradeDocumentError("matchingException", "exception");
    if (command.orderId === null) tradeDocumentError("matchingException", "exception");
  }
  command.lines.forEach((line, index) => {
    const path = `lines.${index}`;
    plain(
      line,
      [
        "lineId",
        "product",
        "taxCode",
        "quantity",
        "unitPrice",
        "discountPercent",
        "taxableCharge",
        "orderLineId",
        "dimensions",
      ],
      path,
    );
    commonLine(line as unknown as Record<string, unknown>, path);
    if (line.taxCode !== null) text(line.taxCode, orderCode, `${path}.taxCode`);
    dimensions(line.dimensions, `${path}.dimensions`);
    if (command.orderId === null) {
      if (line.orderLineId !== null) tradeDocumentError(`${path}.orderLineId`, "orderLine");
    } else {
      if (line.orderLineId === null) tradeDocumentError(`${path}.orderLineId`, "orderLine");
      text(line.orderLineId, identifier, `${path}.orderLineId`);
    }
  });
  if (
    command.orderId !== null &&
    new Set(command.lines.map((line) => line.orderLineId)).size !== command.lines.length
  )
    tradeDocumentError("lines", "orderLine");
}

/**
 * D-TRADE-A order-line matching: the expected net is the stored order-line net prorated by
 * quantity (half-up); a line passes when |invoice - expected| is at most 1% of expected.
 */
export function matchTradeOrderLine(input: {
  readonly lineId: string;
  readonly path: string;
  readonly order: TradeOrderLine;
  readonly previouslyInvoiced: bigint;
  readonly quantity: string;
  readonly invoiceNet: number;
}): TradeLineMatch {
  const ordered = quantityMicros(input.order.quantity),
    invoiced = quantityMicros(input.quantity);
  if (input.previouslyInvoiced + invoiced > ordered)
    tradeDocumentError(`${input.path}.quantity`, "quantity");
  const expectedNet = roundTradeRatio(BigInt(input.order.net) * invoiced, ordered);
  const variance = input.invoiceNet - expectedNet;
  return {
    lineId: input.lineId,
    orderLineId: input.order.lineId,
    orderQuantity: input.order.quantity,
    previouslyInvoiced: formatMicros(input.previouslyInvoiced),
    quantity: input.quantity,
    expectedNet,
    invoiceNet: input.invoiceNet,
    variance,
    withinTolerance: 100n * BigInt(Math.abs(variance)) <= BigInt(expectedNet),
  };
}

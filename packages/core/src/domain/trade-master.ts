import {
  DomainError,
  checkedCode,
  checkedName,
  checkedExpectedRevision,
  checkedJournalDay,
  type Account,
  type DimensionMap,
} from "./index.ts";

export const tradeKinds = [
  "tradeParty",
  "tradeProduct",
  "tradeProfile",
  "tradeTerms",
  "taxCode",
] as const;
export type TradeKind = (typeof tradeKinds)[number];
export interface TradeWindow {
  readonly name: string;
  readonly from: string;
  readonly to: string;
}
export interface TradePartyData extends TradeWindow {
  readonly role: "vendor" | "customer" | "both";
  readonly apProfile: string | null;
  readonly arProfile: string | null;
  readonly terms: string;
  readonly allowedTaxCodes: readonly string[];
  readonly defaultDimensions: DimensionMap;
}
export interface TradeProductData extends TradeWindow {
  readonly type: "expense" | "service";
  readonly expenseAccount: string | null;
  readonly revenueAccount: string | null;
  readonly allowedTaxCodes: readonly string[];
  readonly defaultDimensions: DimensionMap;
}
export interface TradeProfileData extends TradeWindow {
  readonly side: "AP" | "AR";
  readonly controlAccount: string;
  readonly advanceAccount: string;
  readonly cashAccount: string;
  readonly discountAccount: string;
}
export interface TradeTermsData extends TradeWindow {
  readonly dueDays: number;
  readonly discountDays: number;
  readonly discountPercent: string;
  readonly allowPartialDiscount: boolean;
}
export interface TradeTaxRate {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly ratePercent: string;
}
export interface TradeTaxData extends TradeWindow {
  readonly mode: "ordinary" | "zero" | "exempt";
  readonly rates: readonly TradeTaxRate[];
  readonly deductiblePercent: string;
  readonly inputAccount: string | null;
  readonly outputAccount: string | null;
}
export interface TradeData {
  readonly tradeParty: TradePartyData;
  readonly tradeProduct: TradeProductData;
  readonly tradeProfile: TradeProfileData;
  readonly tradeTerms: TradeTermsData;
  readonly taxCode: TradeTaxData;
}
export type TradeConfig<K extends TradeKind = TradeKind> = {
  [P in K]: {
    readonly kind: P;
    readonly code: string;
    readonly active: boolean;
    readonly revision: number;
    readonly data: TradeData[P];
  };
}[K];
export type TradeWrite = {
  [K in TradeKind]: {
    readonly company: string;
    readonly kind: K;
    readonly code: string;
    readonly expectedRevision: number;
    readonly active: boolean;
    readonly data: TradeData[K];
  };
}[TradeKind];
export interface TradeIssue {
  readonly scope: "trade";
  readonly path: string;
  readonly rule: "shape" | "window" | "reference" | "account" | "missingTax" | "ambiguousTax";
}
export function tradeError(path: string, rule: TradeIssue["rule"]): never {
  throw new DomainError("INVALID_INPUT", { scope: "trade", path, rule });
}
export function checkedTradePercent(value: string, path: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u.test(value))
    tradeError(path, "shape");
  const [whole, fraction = ""] = value.split(".");
  const exact = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (exact > 100_000_000n) tradeError(path, "shape");
  return exact;
}
export function checkedTradeWindow(range: { from: string; to: string }, path = "data"): void {
  checkedJournalDay(range.from, `${path}.from`);
  checkedJournalDay(range.to, `${path}.to`);
  if (range.from > range.to) tradeError(path, "window");
}
export function tradeEffective(config: TradeConfig, day: string): boolean {
  return config.active && config.data.from <= day && day <= config.data.to;
}
export function validateTradeConfig(config: TradeConfig): void {
  checkedCode(config.code);
  checkedExpectedRevision(config.revision - 1);
  if (!tradeKinds.includes(config.kind) || typeof config.active !== "boolean")
    tradeError("kind", "shape");
  checkedName(config.data.name, 160);
  checkedTradeWindow(config.data);
  const taxes = (codes: readonly string[]) => {
    if (!Array.isArray(codes) || codes.length > 100 || new Set(codes).size !== codes.length)
      tradeError("data.allowedTaxCodes", "shape");
    for (const code of codes) checkedCode(code);
  };
  switch (config.kind) {
    case "tradeParty": {
      const d = config.data;
      if (
        !["vendor", "customer", "both"].includes(d.role) ||
        (d.role !== "customer") !== (d.apProfile !== null) ||
        (d.role !== "vendor") !== (d.arProfile !== null)
      )
        tradeError("data.role", "shape");
      if (d.apProfile !== null) checkedCode(d.apProfile);
      if (d.arProfile !== null) checkedCode(d.arProfile);
      checkedCode(d.terms);
      taxes(d.allowedTaxCodes);
      break;
    }
    case "tradeProduct": {
      const d = config.data;
      if (
        !["expense", "service"].includes(d.type) ||
        (d.type === "expense") !== (d.expenseAccount !== null) ||
        (d.type === "service") !== (d.revenueAccount !== null)
      )
        tradeError("data.type", "shape");
      taxes(d.allowedTaxCodes);
      break;
    }
    case "tradeProfile":
      if (!["AP", "AR"].includes(config.data.side)) tradeError("data.side", "shape");
      break;
    case "tradeTerms": {
      const d = config.data;
      if (
        !Number.isInteger(d.dueDays) ||
        d.dueDays < 0 ||
        d.dueDays > 3650 ||
        !Number.isInteger(d.discountDays) ||
        d.discountDays < 0 ||
        d.discountDays > d.dueDays ||
        typeof d.allowPartialDiscount !== "boolean"
      )
        tradeError("data.discountDays", "shape");
      checkedTradePercent(d.discountPercent, "data.discountPercent");
      break;
    }
    case "taxCode": {
      const d = config.data;
      if (!["ordinary", "zero", "exempt"].includes(d.mode)) tradeError("data.mode", "shape");
      checkedTradePercent(d.deductiblePercent, "data.deductiblePercent");
      if (!Array.isArray(d.rates) || !d.rates.length || d.rates.length > 100)
        tradeError("data.rates", "shape");
      const ids = new Set<string>();
      const sorted = [...d.rates].sort((a, b) => a.from.localeCompare(b.from));
      for (const [index, rate] of sorted.entries()) {
        checkedCode(rate.id);
        checkedTradeWindow(rate, "data.rates");
        if (
          ids.has(rate.id) ||
          rate.from < d.from ||
          rate.to > d.to ||
          (index > 0 && sorted[index - 1].to >= rate.from)
        )
          tradeError("data.rates", "window");
        ids.add(rate.id);
        if (
          checkedTradePercent(rate.ratePercent, "data.rates.ratePercent") !== 0n &&
          d.mode !== "ordinary"
        )
          tradeError("data.rates.ratePercent", "shape");
      }
      if (
        (d.inputAccount === null) !== (d.outputAccount === null) ||
        (d.mode === "ordinary" && d.inputAccount === null)
      )
        tradeError("data.inputAccount", "account");
      break;
    }
  }
}
export type TradeAccountRole =
  | "controlAccount"
  | "advanceAccount"
  | "cashAccount"
  | "discountAccount"
  | "expenseAccount"
  | "revenueAccount"
  | "inputAccount"
  | "outputAccount";
export function assertTradeAccount(
  account: Account | null,
  role: TradeAccountRole,
  side?: "AP" | "AR",
): void {
  if (!account?.active || account.contraOf !== null) tradeError(`data.${role}`, "account");
  const normal =
    account.category === "ASSET" || account.category === "EXPENSE" ? "DEBIT" : "CREDIT";
  if (account.normalSide !== normal) tradeError(`data.${role}`, "account");
  const control = (
    category: Account["category"],
    module: Account["controlModule"],
    group: string,
  ) =>
    account.category === category &&
    account.purpose === "control" &&
    account.controlModule === module &&
    !account.manualAllowed &&
    account.reportGroup === group;
  const general = (category: Account["category"]) =>
    account.category === category &&
    account.purpose === "general" &&
    account.controlModule === null;
  const valid =
    role === "controlAccount"
      ? side === "AP"
        ? control("LIABILITY", "AP", "payables")
        : side === "AR" && control("ASSET", "AR", "receivables")
      : role === "advanceAccount"
        ? side === "AP"
          ? control("ASSET", "AP", "prepayments")
          : side === "AR" && control("LIABILITY", "AR", "otherLiabilities")
        : role === "cashAccount"
          ? general("ASSET") && account.reportGroup === "cash"
          : role === "discountAccount" || role === "revenueAccount"
            ? general("REVENUE")
            : role === "expenseAccount"
              ? general("EXPENSE")
              : role === "inputAccount"
                ? control("ASSET", "TAX", "otherAssets")
                : control("LIABILITY", "TAX", "taxLiabilities");
  if (!valid) tradeError(`data.${role}`, "account");
}
export function selectTradeTax(
  party: TradeConfig<"tradeParty">,
  product: TradeConfig<"tradeProduct">,
  taxes: readonly TradeConfig<"taxCode">[],
  taxDate: string,
  selected?: string,
): { tax: TradeConfig<"taxCode">; rate: TradeTaxRate } {
  checkedJournalDay(taxDate, "taxDate");
  const allowed = party.data.allowedTaxCodes.filter((code) =>
    product.data.allowedTaxCodes.includes(code),
  );
  if (selected !== undefined && !allowed.includes(selected)) tradeError("taxCode", "reference");
  const matches = taxes.flatMap((tax) =>
    allowed.includes(tax.code) &&
    (selected === undefined || selected === tax.code) &&
    tradeEffective(tax, taxDate)
      ? tax.data.rates
          .filter((rate) => rate.from <= taxDate && taxDate <= rate.to)
          .map((rate) => ({ tax, rate }))
      : [],
  );
  if (matches.length === 0) tradeError("taxCode", "missingTax");
  if (matches.length !== 1) tradeError("taxCode", "ambiguousTax");
  return matches[0];
}

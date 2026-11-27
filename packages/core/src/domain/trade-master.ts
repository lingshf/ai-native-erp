import {
  checkedCode,
  checkedName,
  checkedExpectedRevision,
  checkedJournalDay,
  type Account,
  type DimensionMap,
} from "./index.ts";
import type { DimensionConfig } from "./dimensions.ts";
import { checkedTradeWindow, tradeError } from "./trade-master-checks.ts";
import {
  validateTaxCode,
  validateTradeParty,
  validateTradeProduct,
  validateTradeProfile,
  validateTradeTerms,
} from "./trade-master-validation.ts";

export { tradeError, checkedTradePercent, checkedTradeWindow } from "./trade-master-checks.ts";

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
/**
 * M1-01 default-dimension check for parties and products: a plain map of at most 32 keys whose
 * dimensions and values are active and valid over the whole configuration window.
 */
export function checkTradeDefaultDimensions(
  range: { readonly from: string; readonly to: string },
  dimensions: unknown,
  catalog: readonly DimensionConfig[],
): void {
  if (
    !dimensions ||
    typeof dimensions !== "object" ||
    Array.isArray(dimensions) ||
    Object.keys(dimensions).length > 32
  )
    tradeError("data.defaultDimensions", "shape");
  for (const [key, value] of Object.entries(dimensions)) {
    for (const kind of ["dimension", "value"] as const) {
      if (kind === "value" && value === null) continue;
      const found = catalog.find(
        (item) =>
          item.kind === kind &&
          (kind === "dimension"
            ? item.code === key
            : item.kind === "value" && item.dimension === key && item.code === value),
      );
      if (!found?.active || found.from > range.from || found.to < range.to)
        tradeError(`data.defaultDimensions.${key}`, "reference");
    }
  }
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
  switch (config.kind) {
    case "tradeParty":
      validateTradeParty(config.data);
      break;
    case "tradeProduct":
      validateTradeProduct(config.data);
      break;
    case "tradeProfile":
      validateTradeProfile(config.data);
      break;
    case "tradeTerms":
      validateTradeTerms(config.data);
      break;
    case "taxCode":
      validateTaxCode(config.data);
      break;
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

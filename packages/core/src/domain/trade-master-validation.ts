import { checkedCode } from "./index.ts";
import { checkedTradePercent, checkedTradeWindow, tradeError } from "./trade-master-checks.ts";
import type {
  TradePartyData,
  TradeProductData,
  TradeProfileData,
  TradeTaxData,
  TradeTermsData,
} from "./trade-master.ts";

export function checkedAllowedTaxCodes(codes: readonly string[]): void {
  if (!Array.isArray(codes) || codes.length > 100 || new Set(codes).size !== codes.length)
    tradeError("data.allowedTaxCodes", "shape");
  for (const code of codes) checkedCode(code);
}
export function validateTradeParty(data: TradePartyData): void {
  if (
    !["vendor", "customer", "both"].includes(data.role) ||
    (data.role !== "customer") !== (data.apProfile !== null) ||
    (data.role !== "vendor") !== (data.arProfile !== null)
  )
    tradeError("data.role", "shape");
  if (data.apProfile !== null) checkedCode(data.apProfile);
  if (data.arProfile !== null) checkedCode(data.arProfile);
  checkedCode(data.terms);
  checkedAllowedTaxCodes(data.allowedTaxCodes);
}
export function validateTradeProduct(data: TradeProductData): void {
  if (
    !["expense", "service"].includes(data.type) ||
    (data.type === "expense") !== (data.expenseAccount !== null) ||
    (data.type === "service") !== (data.revenueAccount !== null)
  )
    tradeError("data.type", "shape");
  checkedAllowedTaxCodes(data.allowedTaxCodes);
}
export function validateTradeProfile(data: TradeProfileData): void {
  if (!["AP", "AR"].includes(data.side)) tradeError("data.side", "shape");
}
export function validateTradeTerms(data: TradeTermsData): void {
  if (
    !Number.isInteger(data.dueDays) ||
    data.dueDays < 0 ||
    data.dueDays > 3650 ||
    !Number.isInteger(data.discountDays) ||
    data.discountDays < 0 ||
    data.discountDays > data.dueDays ||
    typeof data.allowPartialDiscount !== "boolean"
  )
    tradeError("data.discountDays", "shape");
  checkedTradePercent(data.discountPercent, "data.discountPercent");
}
export function validateTaxCode(data: TradeTaxData): void {
  if (!["ordinary", "zero", "exempt"].includes(data.mode)) tradeError("data.mode", "shape");
  checkedTradePercent(data.deductiblePercent, "data.deductiblePercent");
  if (!Array.isArray(data.rates) || !data.rates.length || data.rates.length > 100)
    tradeError("data.rates", "shape");
  const ids = new Set<string>();
  const sorted = [...data.rates].sort((a, b) => a.from.localeCompare(b.from));
  for (const [index, rate] of sorted.entries()) {
    checkedCode(rate.id);
    checkedTradeWindow(rate, "data.rates");
    if (
      ids.has(rate.id) ||
      rate.from < data.from ||
      rate.to > data.to ||
      (index > 0 && sorted[index - 1].to >= rate.from)
    )
      tradeError("data.rates", "window");
    ids.add(rate.id);
    if (
      checkedTradePercent(rate.ratePercent, "data.rates.ratePercent") !== 0n &&
      data.mode !== "ordinary"
    )
      tradeError("data.rates.ratePercent", "shape");
  }
  if (
    (data.inputAccount === null) !== (data.outputAccount === null) ||
    (data.mode === "ordinary" && data.inputAccount === null)
  )
    tradeError("data.inputAccount", "account");
}

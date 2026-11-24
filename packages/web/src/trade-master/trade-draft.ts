import type { CompanyDto, TradeDto } from "@erp/core/contracts";
import { wholeDays } from "./trade-field-issue.ts";
import type { TradeKind } from "./trade-master-types.ts";

export const specific = {
  tradeParty: ["role", "apProfile", "arProfile", "terms", "allowedTaxCodes", "defaultDimensions"],
  tradeProduct: [
    "type",
    "expenseAccount",
    "revenueAccount",
    "allowedTaxCodes",
    "defaultDimensions",
  ],
  tradeProfile: ["side", "controlAccount", "advanceAccount", "cashAccount", "discountAccount"],
  tradeTerms: ["dueDays", "discountDays", "discountPercent", "allowPartialDiscount"],
  taxCode: ["mode", "rates", "deductiblePercent", "inputAccount", "outputAccount"],
} as const;
export const choices = {
  role: ["vendor", "customer", "both"],
  type: ["expense", "service"],
  side: ["AP", "AR"],
  mode: ["ordinary", "zero", "exempt"],
} as const;
export const nullable = new Set([
  "apProfile",
  "arProfile",
  "expenseAccount",
  "revenueAccount",
  "inputAccount",
  "outputAccount",
]);
export type TradeFieldName = "name" | "from" | "to" | (typeof specific)[TradeKind][number];

export function isJsonField(field: string) {
  return field === "rates" || field === "defaultDimensions";
}

export function initialTradeDraft(company: CompanyDto, kind: TradeKind, initial: TradeDto | null) {
  const value: Record<string, string> = {
    name: "",
    from: `${company.year}-01-01`,
    to: `${company.year}-12-31`,
    role: "vendor",
    type: "expense",
    side: "AP",
    mode: "ordinary",
    defaultDimensions: "{}",
    rates: "[]",
    dueDays: "30",
    discountDays: "7",
    discountPercent: "1.5",
    allowPartialDiscount: "true",
    deductiblePercent: "100",
    allowedTaxCodes: "",
  };
  for (const field of specific[kind]) value[field] ??= "";
  if (initial)
    for (const [field, item] of Object.entries(initial.data))
      value[field] =
        field === "allowedTaxCodes" && Array.isArray(item)
          ? item.join(",")
          : item !== null && typeof item === "object"
            ? JSON.stringify(item)
            : item === null
              ? ""
              : String(item);
  return value;
}

export function tradeFieldValue(field: TradeFieldName, value: string): unknown {
  return isJsonField(field)
    ? JSON.parse(value)
    : field === "allowedTaxCodes"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : field === "allowPartialDiscount"
        ? value === "true"
        : field === "dueDays" || field === "discountDays"
          ? wholeDays(value)
          : nullable.has(field) && !value
            ? null
            : value;
}

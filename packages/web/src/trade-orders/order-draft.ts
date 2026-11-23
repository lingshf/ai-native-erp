import { tradeOrderCommandSchema, type CompanyDto } from "@erp/core/contracts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
export type Command = ReturnType<typeof tradeOrderCommandSchema.parse>;
type LineDraft = {
  lineId: string;
  product: string;
  taxCode: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
};
export type Draft = {
  orderId: string;
  side: "AP" | "AR";
  party: string;
  orderDate: string;
  priceIncludesTax: boolean;
  rounding: "line" | "document";
  lines: LineDraft[];
};
type Issue = { path: string; key: TradeOrderKey };
export type Failure = { message: string; issues: Issue[]; uncertain: boolean };
export const numeric = new Set<string>(["quantity", "unitPrice", "discountPercent"]);
const rules = [
  "shape",
  "reference",
  "party",
  "product",
  "currency",
  "account",
  "duplicate",
  "missingTax",
  "ambiguousTax",
  "quantity",
] as const;

export const blankLine = (n: number): LineDraft => ({
  lineId: `L${n}`,
  product: "",
  taxCode: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "0",
});
const localToday = () => {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
};
export const blankDraft = (): Draft => ({
  orderId: "",
  side: "AP",
  party: "",
  orderDate: localToday(),
  priceIncludesTax: false,
  rounding: "line",
  lines: [blankLine(1)],
});
export const toCommand = (company: CompanyDto, draft: Draft): Command => ({
  company: company.code,
  orderId: draft.orderId.trim(),
  side: draft.side,
  party: draft.party.trim(),
  currency: company.currency,
  orderDate: draft.orderDate,
  priceIncludesTax: draft.priceIncludesTax,
  rounding: draft.rounding,
  lines: draft.lines.map((line) => ({
    lineId: line.lineId,
    product: line.product.trim(),
    taxCode: line.taxCode.trim(),
    quantity: line.quantity.trim(),
    unitPrice: line.unitPrice.trim(),
    discountPercent: line.discountPercent.trim(),
    taxableCharge: "0",
  })),
});
// Line errors arrive by array index ("lines.0.taxCode"); keep them on the submitted line's stable
// lineId so removing a line can never move an error onto the line that shifts into its place.
export const stablePath = (path: string, lines: readonly { lineId: string }[]) => {
  const match = /^lines\.(\d+)(\..+)?$/u.exec(path);
  const line = match ? lines[Number(match[1])] : undefined;
  return match && line ? `line:${line.lineId}${match[2] ?? ""}` : path;
};
export const ruleKey = (messageKey: string): TradeOrderKey => {
  const rule = messageKey.split(".").at(-1);
  return rules.find((known) => known === rule)
    ? (`tord.issue.${rule}` as TradeOrderKey)
    : "tord.issue.other";
};

import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
import type { T } from "./order-model.ts";
import type { Failure } from "./order-draft.ts";

export const MAX_ORDER_LINES = 100;
export const ORDER_TEXT_MAX_LENGTH = 60;
export const lineFields = [
  "product",
  "taxCode",
  "quantity",
  "unitPrice",
  "discountPercent",
] as const;
export type LineField = (typeof lineFields)[number];
export const amountKeys = ["net", "tax", "gross"] as const;

const errorId = (path: string) => `tord-error-${path.replaceAll(/[.:]/gu, "-")}`;

// Error props and text for one render's failure, keyed by the stable field path.
export function fieldErrors(failure: Failure | null, t: T) {
  const issueAt = (path: string) => failure?.issues.find((issue) => issue.path === path);
  const props = (path: string) =>
    issueAt(path) ? { "aria-invalid": true as const, "aria-describedby": errorId(path) } : {};
  const text = (path: string) => {
    const issue = issueAt(path);
    return issue ? (
      <p className="ui-error-text" id={errorId(path)}>
        {t(issue.key)}
      </p>
    ) : null;
  };
  return { props, text };
}
export type FieldErrors = ReturnType<typeof fieldErrors>;

export function fieldLabel(t: T, path: string) {
  const line = /^line:(.+?)(?:\.([A-Za-z]+))?$/u.exec(path);
  if (line) {
    const [, lineId, field] = line;
    if (!field) return `${t("tord.lineId")} ${lineId}`;
    const known = (lineFields as readonly string[]).includes(field);
    return `${known ? t(`tord.${field}` as TradeOrderKey) : field} ${lineId}`;
  }
  const header = ["orderId", "side", "party", "currency", "orderDate", "rounding", "lines"];
  return header.includes(path) ? t(`tord.${path}` as TradeOrderKey) : "";
}

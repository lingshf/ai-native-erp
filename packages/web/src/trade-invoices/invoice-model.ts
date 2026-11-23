import type { TradeInvoiceCommandDto, TradeOrderInvoicingDto } from "@erp/core/contracts";
import type { LabelKey } from "../ui/index.ts";
import { tradeEn } from "../ui/trade-labels.ts";
import { MasterDataFailure } from "../master-data-client.ts";

type Key = Exclude<LabelKey, "shell.httpError">;
export type T = (key: Key) => string;
export type Failure = { key: Key; path: string | null };
type LineDraft = {
  lineId: string;
  product: string;
  taxCode: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxableCharge: string;
  orderLineId: string;
};
export type Draft = {
  side: "AP" | "AR";
  party: string;
  externalInvoice: string;
  accountingDate: string;
  documentDate: string;
  taxDate: string;
  orderId: string;
  priceIncludesTax: boolean;
  rounding: "line" | "document";
  exception: boolean;
  reason: string;
  lines: LineDraft[];
};
export type Pending = { command: TradeInvoiceCommandDto; fingerprint: string; key: string };
export type Saved = { draft: Draft; documentId: string; dirty: boolean; pending: Pending | null };
export type Guard = { busy: boolean; unsaved: boolean };
export const idleGuard: Guard = { busy: false, unsaved: false };
const today = () => new Date().toISOString().slice(0, 10);
export const blankLine = (n: number): LineDraft => ({
  lineId: `L${n}`,
  product: "",
  taxCode: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "0",
  taxableCharge: "0",
  orderLineId: "",
});
export const blankDraft = (): Draft => {
  const day = today();
  return {
    side: "AP",
    party: "",
    externalInvoice: "",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    orderId: "",
    priceIncludesTax: false,
    rounding: "line",
    exception: false,
    reason: "",
    lines: [blankLine(1)],
  };
};

// Exact decimal arithmetic in millionths, matching the contract's at-most-6-decimal quantities.
const micros = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(6, "0"));
};
const decimalText = (value: bigint) => {
  const digits = value.toString().padStart(7, "0");
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`.replace(/\.?0+$/u, "");
};
/** New draft from an order: header from the order, only lines with an uninvoiced quantity. */
export function draftFromOrder({ order, invoiced }: TradeOrderInvoicingDto): Draft | null {
  const done = new Map(invoiced.map((row) => [row.lineId, micros(row.invoicedQuantity)]));
  const lines = order.lines.flatMap((line) => {
    const remaining = micros(line.quantity) - (done.get(line.lineId) ?? 0n);
    return remaining > 0n ? [{ line, remaining }] : [];
  });
  if (!lines.length) return null;
  return {
    ...blankDraft(),
    side: order.side,
    party: order.party,
    orderId: order.orderId,
    priceIncludesTax: order.priceIncludesTax,
    rounding: order.rounding,
    lines: lines.map(({ line, remaining }, index) => ({
      lineId: `L${index + 1}`,
      product: line.product,
      taxCode: line.taxCode,
      quantity: decimalText(remaining),
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxableCharge: line.taxableCharge,
      orderLineId: line.lineId,
    })),
  };
}
function isIssueKey(key: string): key is Key {
  return key in tradeEn;
}
export function failure(error: unknown): Failure {
  if (error instanceof MasterDataFailure) {
    const field = error.detail?.fieldErrors[0];
    const rule = field?.messageKey.split(".").at(-1) ?? "";
    const key = `tinv.issue.${rule}`;
    if (field && isIssueKey(key)) return { key, path: field.path };
    if (error.status === 409) return { key: "master.conflict", path: null };
    if (error.status === 400 || error.kind === "invalid")
      return { key: "tinv.issue.shape", path: field?.path ?? null };
  }
  return { key: "master.error", path: null };
}
export function uncertain(error: unknown) {
  return (
    !(error instanceof MasterDataFailure) || error.kind !== "http" || (error.status ?? 500) >= 500
  );
}

import { StorageError } from "@erp/core/application";
import type {
  DimensionMap,
  OpenItem,
  TradeDocumentLine,
  TradeOrder,
  TradeControlSegment,
} from "@erp/core/domain";
import type { Row } from "./types.ts";

export function int(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new StorageError("STORAGE_FAILURE");
}
export function str(value: unknown): string {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return value;
}
export function json<T>(value: unknown): T {
  return JSON.parse(str(value)) as T;
}
export function optional(value: unknown): string | null {
  return value === null ? null : str(value);
}
export function orderLineRow(row: Row): TradeOrder["lines"][number] {
  return {
    lineId: str(row.line_id),
    lineNo: int(row.line_no),
    product: str(row.product_id),
    taxCode: str(row.tax_code),
    quantity: str(row.quantity),
    unitPrice: str(row.unit_price),
    discountPercent: str(row.discount_percent),
    taxableCharge: str(row.taxable_charge),
    net: int(row.net_minor),
    tax: int(row.tax_minor),
    gross: int(row.gross_minor),
  };
}
export function documentLineRow(row: Row): TradeDocumentLine {
  return {
    lineId: str(row.line_id),
    lineNo: int(row.line_no),
    product: str(row.product_id),
    account: str(row.account),
    taxCode: str(row.tax_code),
    taxRateId: str(row.tax_rate_id),
    ratePercent: str(row.rate_percent),
    quantity: str(row.quantity),
    unitPrice: str(row.unit_price),
    discountPercent: str(row.discount_percent),
    taxableCharge: str(row.taxable_charge),
    net: int(row.net_minor),
    tax: int(row.tax_minor),
    gross: int(row.gross_minor),
    deductibleTax: int(row.deductible_tax_minor),
    orderId: optional(row.order_id),
    orderLineId: optional(row.order_line_id),
    expectedNet: row.expected_net_minor === null ? null : int(row.expected_net_minor),
    matchStatus: str(row.match_status) as TradeDocumentLine["matchStatus"],
  };
}
export function openItemRow(row: Row, segments: readonly TradeControlSegment[]): OpenItem {
  if (
    segments.reduce((n, s) => n + s.gross, 0) !== int(row.gross_minor) ||
    segments.reduce((n, s) => n + s.remainingGross, 0) !== int(row.remaining_gross_minor)
  )
    throw new StorageError("STORAGE_FAILURE");
  return {
    kind: str(row.kind) as OpenItem["kind"],
    segments,
    discountPercent: str(row.discount_percent),
    allowPartialDiscount: int(row.allow_partial_discount) === 1,
    itemId: str(row.item_id),
    side: str(row.side) as OpenItem["side"],
    party: str(row.party_id),
    externalNo: str(row.external_no),
    controlAccount: str(row.control_account),
    dimensions: json<DimensionMap>(row.dimensions),
    currency: str(row.currency),
    accountingDate: str(row.accounting_date),
    documentDate: str(row.document_date),
    dueDate: str(row.due_date),
    discountDate: str(row.discount_date),
    gross: int(row.gross_minor),
    net: int(row.net_minor),
    tax: int(row.tax_minor),
    remainingGross: int(row.remaining_gross_minor),
    remainingNet: int(row.remaining_net_minor),
    remainingTax: int(row.remaining_tax_minor),
    status: str(row.status) as OpenItem["status"],
    revision: int(row.revision),
  };
}

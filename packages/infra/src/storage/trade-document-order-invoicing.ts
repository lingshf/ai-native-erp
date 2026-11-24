import { StorageError } from "@erp/core/application";
import type { TradeOrderSummary } from "@erp/core/domain";
import { quantityMicros } from "@erp/core/domain";
import { str } from "./trade-document-rows.ts";
import type { Connection } from "./types.ts";

// TINV-03: the single "invoiced" predicate. Invoice lines of the company that reference an order and
// whose open item is not cancelled; tradeOrderInvoiced and the status recomputation both append
// their own order filters and then subtract credits with subtractCredits (TINV-09). First bound
// value: company.
const invoicedLinesFrom =
  "FROM trade_document_lines l JOIN open_items o ON o.company_id=l.company_id AND o.item_id=l.document_id";
const invoicedLinesWhere =
  "WHERE l.company_id=? AND l.order_id IS NOT NULL AND o.status<>'cancelled'";
export const invoicedOrderLines = `${invoicedLinesFrom} ${invoicedLinesWhere}`;
export const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(",");
type InvoicedLine = {
  readonly orderId: string;
  readonly orderLineId: string;
  readonly micros: bigint;
};
const lineKey = (orderId: string, orderLineId: string) => `${orderId}\u0000${orderLineId}`;
// TINV-09: non-cancelled credit quantities on the invoiced lines of the given orders, one statement.
// CROSS JOIN + INDEXED BY keep the order-driven plan (trade_document_lines_order, then one
// trade_credit_lines_source probe per line), never a company-wide range over the credit lines.
function creditedOrderLinesSql(orders: number): string {
  return `SELECT l.order_id,l.order_line_id,c.quantity ${invoicedLinesFrom} CROSS JOIN trade_credit_lines c INDEXED BY trade_credit_lines_source ON c.company_id=l.company_id AND c.invoice_id=l.document_id AND c.source_line_id=l.line_id JOIN open_items k ON k.company_id=c.company_id AND k.item_id=c.credit_id ${invoicedLinesWhere} AND k.status<>'cancelled' AND l.order_id IN(${placeholders(orders)})`;
}
/**
 * TINV-09: invoiced micros net of credit notes (exact decimal → micros); the one place credits count.
 * TORD-08: each line also carries the credited micros that were subtracted (0n when none).
 */
export async function subtractCredits<Line extends InvoicedLine>(
  db: Pick<Connection, "query">,
  company: string,
  lines: readonly Line[],
): Promise<(Line & { readonly creditedMicros: bigint })[]> {
  const orderIds = [...new Set(lines.map((line) => line.orderId))];
  if (!orderIds.length) return [];
  const credited = new Map<string, bigint>();
  const rows = await db.query(creditedOrderLinesSql(orderIds.length), [company, ...orderIds]);
  for (const row of rows) {
    const key = lineKey(str(row.order_id), str(row.order_line_id));
    credited.set(key, (credited.get(key) ?? 0n) + quantityMicros(str(row.quantity)));
  }
  return lines.map((line) => {
    const creditedMicros = credited.get(lineKey(line.orderId, line.orderLineId)) ?? 0n;
    return { ...line, micros: line.micros - creditedMicros, creditedMicros };
  });
}
// TINV-03: one statement for a set of orders, whatever its size. Ordered quantity of every line of
// the orders (trade_order_lines primary key) with its invoiced micros, summed on
// trade_document_lines_order over the same orders. Values: (company, ...orderIds) twice.
// TORD-06: no longer run by the list; only by the stored-status refresh (posting, cancellation,
// migration 019 backfill).
export function tradeOrderPageInvoicedSql(orders: number): string {
  const ids = placeholders(orders);
  return `SELECT ol.order_id,ol.line_id,ol.quantity,COALESCE(i.micros,'0') AS micros FROM trade_order_lines ol LEFT JOIN (SELECT l.order_id,l.order_line_id,CAST(SUM(l.quantity_micros) AS TEXT) AS micros ${invoicedOrderLines} AND l.order_id IN(${ids}) GROUP BY l.order_id,l.order_line_id) i ON i.order_id=ol.order_id AND i.order_line_id=ol.line_id WHERE ol.company_id=? AND ol.order_id IN(${ids})`;
}
/** TINV-03: none = nothing invoiced on any line; full = every line invoiced up to its ordered quantity. */
export function tradeOrderInvoicingStatus(
  lines: readonly { readonly ordered: bigint; readonly invoiced: bigint }[],
): TradeOrderSummary["invoicing"] {
  if (lines.every((line) => line.invoiced === 0n)) return "none";
  return lines.every((line) => line.invoiced >= line.ordered) ? "full" : "partial";
}
/**
 * TINV-03 / TORD-06: invoicing status of each given order recomputed from its invoice lines, in one
 * tradeOrderPageInvoicedSql statement, net of credit notes (TINV-09, one more statement). Used to
 * write the stored status (and by tests to check it).
 */
export async function tradeOrderStatuses(
  db: Pick<Connection, "query">,
  company: string,
  orderIds: readonly string[],
): Promise<Map<string, TradeOrderSummary["invoicing"]>> {
  if (!orderIds.length) return new Map();
  const rows = await db.query(tradeOrderPageInvoicedSql(orderIds.length), [
    company,
    ...orderIds,
    company,
    ...orderIds,
  ]);
  const invoiced = await subtractCredits(
    db,
    company,
    rows.map((row) => ({
      orderId: str(row.order_id),
      orderLineId: str(row.line_id),
      micros: BigInt(str(row.micros)),
      ordered: quantityMicros(str(row.quantity)),
    })),
  );
  const lines = new Map<string, { ordered: bigint; invoiced: bigint }[]>();
  for (const line of invoiced) {
    const list = lines.get(line.orderId) ?? [];
    list.push({ ordered: line.ordered, invoiced: line.micros });
    lines.set(line.orderId, list);
  }
  return new Map(orderIds.map((id) => [id, tradeOrderInvoicingStatus(lines.get(id) ?? [])]));
}
// Orders recomputed per statement: bounds its values (2 + 2 × chunk) far below the SQLite and
// PostgreSQL parameter limits however many orders one migration or posting touches.
const refreshChunk = 400;
/**
 * TORD-06: recomputes the stored status of the given orders with the TINV-03 computation and
 * writes it on the caller's connection, so it commits or rolls back with the caller's transaction
 * (invoice or credit posting, cancellation, migration 019/020 backfill). Every order must have its row.
 */
export async function refreshTradeOrderInvoicing(
  db: Pick<Connection, "query">,
  company: string,
  orderIds: readonly string[],
): Promise<void> {
  for (let start = 0; start < orderIds.length; start += refreshChunk) {
    const chunk = orderIds.slice(start, start + refreshChunk);
    for (const [orderId, status] of await tradeOrderStatuses(db, company, chunk)) {
      const updated = await db.query(
        "UPDATE trade_order_invoicing SET status=? WHERE company_id=? AND order_id=? RETURNING order_id",
        [status, company, orderId],
      );
      if (updated.length !== 1) throw new StorageError("STORAGE_FAILURE");
    }
  }
}
/**
 * TINV-09: refreshes the orders whose invoiced quantity an open item counts in: the orders its own
 * invoice lines reference, and those of the invoice lines it credits as a credit note.
 */
export async function refreshOrdersOfItem(
  db: Pick<Connection, "query">,
  company: string,
  itemId: string,
) {
  const rows = await db.query(
    "SELECT order_id FROM trade_document_lines WHERE company_id=? AND document_id=? AND order_id IS NOT NULL UNION SELECT l.order_id FROM trade_credit_lines c JOIN trade_document_lines l ON l.company_id=c.company_id AND l.document_id=c.invoice_id AND l.line_id=c.source_line_id WHERE c.company_id=? AND c.credit_id=? AND l.order_id IS NOT NULL ORDER BY 1",
    [company, itemId, company, itemId],
  );
  await refreshTradeOrderInvoicing(
    db,
    company,
    rows.map((row) => str(row.order_id)),
  );
}

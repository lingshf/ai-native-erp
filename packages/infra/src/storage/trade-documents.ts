import {
  StorageError,
  type TradeDocumentRepository,
  type TradeOrderListQuery,
} from "@erp/core/application";
import type {
  DimensionMap,
  OpenItem,
  TradeDocumentLine,
  TradeDocumentRecord,
  TradeDocumentSnapshot,
  TradeDocumentSummary,
  TradeConfig,
  TradeOrder,
  TradeOrderSummary,
  TradeActionRecord,
  TradeCreditLine,
  TradeControlSegment,
} from "@erp/core/domain";
import {
  quantityMicros,
  tradeDimensionKey,
  tradeDocumentError,
  type TradeSettlementReceipt,
} from "@erp/core/domain";
import { tradeConfigRow, tradeTables } from "./trade-master.ts";
import type { Connection, Row } from "./types.ts";

function int(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new StorageError("STORAGE_FAILURE");
}
function str(value: unknown): string {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return value;
}
function json<T>(value: unknown): T {
  return JSON.parse(str(value)) as T;
}
function optional(value: unknown): string | null {
  return value === null ? null : str(value);
}
function orderLineRow(row: Row): TradeOrder["lines"][number] {
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
function documentLineRow(row: Row): TradeDocumentLine {
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
function openItemRow(row: Row, segments: readonly TradeControlSegment[]): OpenItem {
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
const openItemSelect =
  "SELECT o.*,d.kind,d.external_no,t.discount_percent,t.allow_partial_discount FROM open_items o JOIN trade_item_sources d ON d.company_id=o.company_id AND d.item_id=o.item_id JOIN trade_invoice_terms t ON t.company_id=o.company_id AND t.item_id=o.item_id";
const tradeOrderPageSelect = (from: string) =>
  `SELECT o.order_id,o.side,o.party_id,o.order_date,o.currency,o.price_includes_tax,o.rounding_mode,o.recorded_at,count(*) AS line_count,sum(l.net_minor) AS net_minor,sum(l.tax_minor) AS tax_minor,sum(l.gross_minor) AS gross_minor FROM ${from} JOIN trade_order_lines l ON l.company_id=o.company_id AND l.order_id=o.order_id WHERE o.company_id=?`;
const tradeOrderPageOrder = " GROUP BY o.order_id ORDER BY o.order_id LIMIT ?";
// TORD-03: one statement per order-list page; parameters are (company, cursor or "", limit + 1).
// Orders always have 1–100 lines, so the inner join keeps every order; both tables use their primary keys.
export const tradeOrderPageSql = `${tradeOrderPageSelect("trade_orders o")} AND o.order_id>?${tradeOrderPageOrder}`;
// TORD-05: still one statement per page. The text is assembled only from fixed fragments chosen by
// which filters are present; every value is bound. With a party the statement SEARCHes
// trade_orders_party (company_id, party_id, order_id), already in order_id order. INDEXED BY is
// required: without ANALYZE statistics SQLite's default estimates prefer the primary key, which
// would walk every order of the company after the cursor. Side and date are filtered row by row
// on the primary-key range. With no filter the text is exactly tradeOrderPageSql.
export function tradeOrderPageStatement(
  company: string,
  query: TradeOrderListQuery,
): { readonly sql: string; readonly values: readonly (string | number)[] } {
  let sql = tradeOrderPageSelect(
    query.party === undefined ? "trade_orders o" : "trade_orders o INDEXED BY trade_orders_party",
  );
  const values: (string | number)[] = [company];
  const add = (fragment: string, value: string | undefined) => {
    if (value === undefined) return;
    sql += fragment;
    values.push(value);
  };
  add(" AND o.party_id=?", query.party);
  add(" AND o.order_id>?", query.cursor ?? "");
  add(" AND o.side=?", query.side);
  add(" AND o.order_date>=?", query.from);
  add(" AND o.order_date<=?", query.to);
  values.push(query.limit + 1);
  return { sql: sql + tradeOrderPageOrder, values };
}

// TINV-03: the single "invoiced" predicate. Invoice lines of the company that reference an order and
// whose open item is not cancelled; tradeOrderInvoiced and the order-list aggregate both append
// their own order filters. First bound value: company.
const invoicedOrderLines =
  "FROM trade_document_lines l JOIN open_items o ON o.company_id=l.company_id AND o.item_id=l.document_id WHERE l.company_id=? AND l.order_id IS NOT NULL AND o.status<>'cancelled'";
const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(",");
// TINV-03: one statement per list page, whatever its size. Ordered quantity of every line of the
// page's orders (trade_order_lines primary key) with its invoiced micros, summed on
// trade_document_lines_order over the same orders. Values: (company, ...orderIds) twice.
export function tradeOrderPageInvoicedSql(orders: number): string {
  const ids = placeholders(orders);
  return `SELECT ol.order_id,ol.quantity,COALESCE(i.micros,'0') AS micros FROM trade_order_lines ol LEFT JOIN (SELECT l.order_id,l.order_line_id,CAST(SUM(l.quantity_micros) AS TEXT) AS micros ${invoicedOrderLines} AND l.order_id IN(${ids}) GROUP BY l.order_id,l.order_line_id) i ON i.order_id=ol.order_id AND i.order_line_id=ol.line_id WHERE ol.company_id=? AND ol.order_id IN(${ids})`;
}
/** TINV-03: none = nothing invoiced on any line; full = every line invoiced up to its ordered quantity. */
export function tradeOrderInvoicingStatus(
  lines: readonly { readonly ordered: bigint; readonly invoiced: bigint }[],
): TradeOrderSummary["invoicing"] {
  if (lines.every((line) => line.invoiced === 0n)) return "none";
  return lines.every((line) => line.invoiced >= line.ordered) ? "full" : "partial";
}

export function tradeDocumentRepository(db: Connection): TradeDocumentRepository {
  async function segments(company: string, ids: readonly string[]) {
    const result = new Map<string, TradeControlSegment[]>();
    if (!ids.length) return result;
    const rows = await db.query(
      `SELECT * FROM trade_control_segments WHERE company_id=? AND item_id IN(${ids.map(() => "?").join(",")}) ORDER BY item_id,dimension_key COLLATE BINARY`,
      [company, ...ids],
    );
    for (const row of rows) {
      const id = str(row.item_id),
        list = result.get(id) ?? [];
      list.push({
        dimensions: json<DimensionMap>(row.dimension_key),
        gross: int(row.gross_minor),
        remainingGross: int(row.remaining_gross_minor),
      });
      result.set(id, list);
    }
    return result;
  }
  async function insertSegments(
    company: string,
    id: string,
    values: readonly TradeControlSegment[],
  ) {
    for (const segment of values)
      await db.query("INSERT INTO trade_control_segments VALUES(?,?,?,?,?)", [
        company,
        id,
        tradeDimensionKey(segment.dimensions),
        segment.gross,
        segment.remainingGross,
      ]);
  }
  async function document(where: string, parameters: (string | number)[]) {
    const rows = await db.query(
      `SELECT d.*,o.control_account,o.dimensions,o.discount_date FROM trade_documents d JOIN open_items o ON o.company_id=d.company_id AND o.item_id=d.document_id WHERE ${where}`,
      parameters,
    );
    const row = rows[0];
    if (!row) return null;
    const lines = await db.query(
      "SELECT * FROM trade_document_lines WHERE company_id=? AND document_id=? ORDER BY line_no",
      [str(row.company_id), str(row.document_id)],
    );
    const record: TradeDocumentRecord = {
      documentId: str(row.document_id),
      side: str(row.side) as TradeDocumentRecord["side"],
      party: str(row.party_id),
      externalNo: str(row.external_no),
      externalNoNormalized: str(row.external_no_normalized),
      currency: str(row.currency),
      accountingDate: str(row.accounting_date),
      documentDate: str(row.document_date),
      taxDate: str(row.tax_date),
      dueDate: str(row.due_date),
      discountDate: str(row.discount_date),
      orderId: optional(row.order_id),
      poMatch: str(row.po_match) as TradeDocumentRecord["poMatch"],
      exceptionReason: optional(row.exception_reason),
      net: int(row.net_minor),
      tax: int(row.tax_minor),
      gross: int(row.gross_minor),
      journalId: str(row.journal_id),
      receiptKey: str(row.receipt_key),
      fingerprint: str(row.fingerprint),
      commandHash: str(row.command_hash),
      postedAt: str(row.posted_at),
      controlAccount: str(row.control_account),
      controlDimensions: json<DimensionMap>(row.dimensions),
      lines: lines.map(documentLineRow),
      snapshot: json<TradeDocumentSnapshot>(row.snapshot),
    };
    return record;
  }
  return {
    async tradeAction(company, id, byReceipt = false) {
      const rows = await db.query(
        `SELECT record FROM trade_actions WHERE company_id=? AND ${byReceipt ? "receipt_key" : "action_id"}=?`,
        [company, id],
      );
      return rows[0] ? json<TradeActionRecord>(rows[0].record) : null;
    },
    async tradeItemActions(company, itemId) {
      const rows = await db.query(
        "SELECT a.record FROM trade_action_items i JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id WHERE i.company_id=? AND i.item_id=? ORDER BY a.sequence",
        [company, itemId],
      );
      return rows.map((row) => json<TradeActionRecord>(row.record));
    },
    async tradeUndo(company, kind, relatedId) {
      return (
        (
          await db.query(
            "SELECT 1 FROM trade_actions WHERE company_id=? AND kind=? AND related_id=?",
            [company, kind, relatedId],
          )
        ).length > 0
      );
    },
    async tradeItemSource(company, itemId) {
      const rows = await db.query(
        "SELECT journal_id,original_id,EXISTS(SELECT 1 FROM legacy_refs r WHERE r.object_type='opening_items' AND r.target_id=s.item_id) AS opening FROM trade_item_sources s WHERE company_id=? AND item_id=?",
        [company, itemId],
      );
      return rows[0]
        ? {
            journalId: str(rows[0].journal_id),
            originalId: optional(rows[0].original_id),
            opening: Number(rows[0].opening) === 1,
          }
        : null;
    },
    async tradeOpeningItems(company, itemIds) {
      if (!itemIds.length) return new Set<string>();
      const rows = await db.query(
        `SELECT r.target_id FROM legacy_refs r JOIN open_items o ON o.item_id=r.target_id
        WHERE r.object_type='opening_items' AND o.company_id=? AND r.target_id IN (${itemIds.map(() => "?").join(",")})`,
        [company, ...itemIds],
      );
      return new Set(rows.map((row) => str(row.target_id)));
    },
    async tradeCreditLines(company, invoiceId) {
      const rows = await db.query(
        "SELECT c.* FROM trade_credit_lines c JOIN open_items o ON o.company_id=c.company_id AND o.item_id=c.credit_id WHERE c.company_id=? AND c.invoice_id=? AND o.status<>'cancelled' ORDER BY c.credit_id,c.source_line_id",
        [company, invoiceId],
      );
      return rows.map(
        (row): TradeCreditLine => ({
          sourceLineId: str(row.source_line_id),
          quantity: str(row.quantity),
          net: int(row.net_minor),
          tax: int(row.tax_minor),
          deductibleTax: int(row.deductible_tax_minor),
        }),
      );
    },
    async insertTradeItem(company, item, journalId, originalId) {
      await db.query(
        "INSERT INTO trade_item_sources(company_id,item_id,kind,external_no,journal_id,original_id) VALUES(?,?,?,?,?,?)",
        [company, item.itemId, item.kind, item.externalNo, journalId, originalId],
      );
      await db.query(
        "INSERT INTO open_items(company_id,item_id,side,party_id,control_account,dimensions,currency,accounting_date,document_date,due_date,discount_date,gross_minor,net_minor,tax_minor,remaining_gross_minor,remaining_net_minor,remaining_tax_minor,status,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          item.itemId,
          item.side,
          item.party,
          item.controlAccount,
          JSON.stringify(item.dimensions),
          item.currency,
          item.accountingDate,
          item.documentDate,
          item.dueDate,
          item.discountDate,
          item.gross,
          item.net,
          item.tax,
          item.remainingGross,
          item.remainingNet,
          item.remainingTax,
          item.status,
          item.revision,
        ],
      );
      await db.query("INSERT INTO trade_invoice_terms VALUES(?,?,?,?)", [
        company,
        item.itemId,
        item.discountPercent,
        item.allowPartialDiscount ? 1 : 0,
      ]);
      await insertSegments(company, item.itemId, item.segments);
    },
    async changeOpenItem(company, before, after) {
      const rows = await db.query(
        "UPDATE open_items SET remaining_gross_minor=?,remaining_net_minor=?,remaining_tax_minor=?,status=?,revision=revision+1 WHERE company_id=? AND item_id=? AND revision=? RETURNING item_id",
        [
          after.remainingGross,
          after.remainingNet,
          after.remainingTax,
          after.status,
          company,
          before.itemId,
          before.revision,
        ],
      );
      if (rows.length !== 1) tradeDocumentError("revision", "stale", true);
      for (const segment of after.segments) {
        const updated = await db.query(
          "UPDATE trade_control_segments SET remaining_gross_minor=? WHERE company_id=? AND item_id=? AND dimension_key=? RETURNING item_id",
          [segment.remainingGross, company, after.itemId, tradeDimensionKey(segment.dimensions)],
        );
        if (updated.length !== 1) throw new StorageError("STORAGE_FAILURE");
      }
    },
    async insertTradeAction(company, record) {
      const c = record.command,
        r = record.receipt;
      const relatedId =
        c.kind === "credit"
          ? c.invoiceId
          : c.kind === "cancel"
            ? c.itemId
            : c.kind === "reverse"
              ? c.settlementId
              : null;
      await db.query(
        "INSERT INTO trade_actions(company_id,action_id,kind,related_id,accounting_date,receipt_key,command_hash,record) VALUES(?,?,?,?,?,?,?,?)",
        [
          company,
          c.actionId,
          c.kind,
          relatedId,
          c.accountingDate,
          r.idempotencyKey,
          record.commandHash,
          JSON.stringify(record),
        ],
      );
      for (const change of r.changes)
        await db.query("INSERT INTO trade_action_items VALUES(?,?,?)", [
          company,
          c.actionId,
          change.after.itemId,
        ]);
      if (c.kind === "credit")
        for (const line of r.creditLines)
          await db.query("INSERT INTO trade_credit_lines VALUES(?,?,?,?,?,?,?,?)", [
            company,
            c.actionId,
            c.invoiceId,
            line.sourceLineId,
            line.quantity,
            line.net,
            line.tax,
            line.deductibleTax,
          ]);
    },
    async latestSettlementDate(company, itemId) {
      const rows = await db.query(
        "SELECT MAX(day) AS day FROM (SELECT accounting_date AS day FROM settlements WHERE company_id=? AND item_id=? UNION ALL SELECT a.accounting_date FROM trade_action_items i JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id WHERE i.company_id=? AND i.item_id=?)",
        [company, itemId, company, itemId],
      );
      return rows[0].day === null ? "" : str(rows[0].day);
    },
    async tradePayment(company, id, byReceipt = false) {
      const rows = await db.query(
        `SELECT command_hash,receipt FROM trade_payments WHERE company_id=? AND ${byReceipt ? "receipt_key" : "payment_id"}=?`,
        [company, id],
      );
      return rows[0]
        ? {
            commandHash: str(rows[0].command_hash),
            receipt: json<TradeSettlementReceipt>(rows[0].receipt),
          }
        : null;
    },
    async insertTradePayment(company, record) {
      const r = record.receipt;
      await db.query(
        "INSERT INTO trade_payments(company_id,payment_id,receipt_key,command_hash,fingerprint,receipt) VALUES(?,?,?,?,?,?)",
        [
          company,
          r.paymentId,
          r.idempotencyKey,
          record.commandHash,
          r.fingerprint,
          JSON.stringify(r),
        ],
      );
    },
    async settleOpenItem(company, paymentId, key, journalId, day, at, a) {
      const rows = await db.query(
        "UPDATE open_items SET remaining_gross_minor=?,remaining_net_minor=?,remaining_tax_minor=?,status=?,revision=revision+1 WHERE company_id=? AND item_id=? AND revision=? RETURNING item_id",
        [
          a.remainingGross,
          a.remainingNet,
          a.remainingTax,
          a.remainingGross === 0 ? "settled" : "open",
          company,
          a.itemId,
          a.revision,
        ],
      );
      if (rows.length !== 1) tradeDocumentError("revision", "stale", true);
      if (!a.segments) throw new StorageError("STORAGE_FAILURE");
      for (const segment of a.segments) {
        const updated = await db.query(
          "UPDATE trade_control_segments SET remaining_gross_minor=remaining_gross_minor-? WHERE company_id=? AND item_id=? AND dimension_key=? AND remaining_gross_minor>=? RETURNING item_id",
          [segment.gross, company, a.itemId, tradeDimensionKey(segment.dimensions), segment.gross],
        );
        if (updated.length !== 1) tradeDocumentError("segments", "stale", true);
      }
      await db.query(
        "INSERT INTO settlements(company_id,settlement_id,item_id,side,accounting_date,applied_gross_minor,applied_net_minor,applied_tax_minor,discount_minor,receipt_key,journal_id,recorded_at) SELECT ?,?,?,side,?,?,?,?,?,?,?,? FROM open_items WHERE company_id=? AND item_id=?",
        [
          company,
          paymentId,
          a.itemId,
          day,
          a.gross,
          a.net,
          a.tax,
          a.discount,
          key,
          journalId,
          at,
          company,
          a.itemId,
        ],
      );
    },
    async itemSettlements(company, itemId) {
      const rows = await db.query(
        "SELECT p.receipt FROM settlements s JOIN trade_payments p ON p.company_id=s.company_id AND p.payment_id=s.settlement_id WHERE s.company_id=? AND s.item_id=? ORDER BY s.accounting_date,s.recorded_at,s.settlement_id",
        [company, itemId],
      );
      return rows.map((row) => json<TradeSettlementReceipt>(row.receipt));
    },
    async tradeOrder(company, orderId) {
      const rows = await db.query("SELECT * FROM trade_orders WHERE company_id=? AND order_id=?", [
        company,
        orderId,
      ]);
      const row = rows[0];
      if (!row) return null;
      const lines = await db.query(
        "SELECT * FROM trade_order_lines WHERE company_id=? AND order_id=? ORDER BY line_no",
        [company, orderId],
      );
      return {
        orderId: str(row.order_id),
        side: str(row.side) as TradeOrder["side"],
        party: str(row.party_id),
        currency: str(row.currency),
        orderDate: str(row.order_date),
        priceIncludesTax: int(row.price_includes_tax) === 1,
        rounding: str(row.rounding_mode) as TradeOrder["rounding"],
        commandHash: str(row.command_hash),
        recordedAt: str(row.recorded_at),
        lines: lines.map(orderLineRow),
      };
    },
    async insertTradeOrder(company, order) {
      await db.query(
        "INSERT INTO trade_orders(company_id,order_id,side,party_id,currency,order_date,price_includes_tax,rounding_mode,command_hash,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          order.orderId,
          order.side,
          order.party,
          order.currency,
          order.orderDate,
          order.priceIncludesTax ? 1 : 0,
          order.rounding,
          order.commandHash,
          order.recordedAt,
        ],
      );
      for (const line of order.lines)
        await db.query(
          "INSERT INTO trade_order_lines(company_id,order_id,line_id,line_no,product_id,tax_code,quantity,unit_price,discount_percent,taxable_charge,net_minor,tax_minor,gross_minor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            company,
            order.orderId,
            line.lineId,
            line.lineNo,
            line.product,
            line.taxCode,
            line.quantity,
            line.unitPrice,
            line.discountPercent,
            line.taxableCharge,
            line.net,
            line.tax,
            line.gross,
          ],
        );
    },
    async tradeOrderPage(company, query) {
      const statement = tradeOrderPageStatement(company, query);
      const fetched = await db.query(statement.sql, statement.values);
      const rows = fetched.slice(0, query.limit);
      const lines = new Map<string, { ordered: bigint; invoiced: bigint }[]>();
      if (rows.length) {
        const ids = rows.map((row) => str(row.order_id));
        for (const row of await db.query(tradeOrderPageInvoicedSql(ids.length), [
          company,
          ...ids,
          company,
          ...ids,
        ])) {
          const orderId = str(row.order_id);
          const list = lines.get(orderId) ?? [];
          list.push({
            ordered: quantityMicros(str(row.quantity)),
            invoiced: BigInt(str(row.micros)),
          });
          lines.set(orderId, list);
        }
      }
      const items: TradeOrderSummary[] = rows.map((row) => ({
        orderId: str(row.order_id),
        side: str(row.side) as TradeOrderSummary["side"],
        party: str(row.party_id),
        orderDate: str(row.order_date),
        currency: str(row.currency),
        priceIncludesTax: int(row.price_includes_tax) === 1,
        rounding: str(row.rounding_mode) as TradeOrderSummary["rounding"],
        recordedAt: str(row.recorded_at),
        lineCount: int(row.line_count),
        net: int(row.net_minor),
        tax: int(row.tax_minor),
        gross: int(row.gross_minor),
        invoicing: tradeOrderInvoicingStatus(lines.get(str(row.order_id)) ?? []),
      }));
      return {
        items,
        nextCursor: fetched.length > query.limit ? items[items.length - 1].orderId : null,
      };
    },
    async tradeOrderInvoiced(company, orderId, orderLineIds) {
      if (!orderLineIds.length) return [];
      // Summed exactly in SQLite over only the referenced lines; TEXT keeps 64-bit precision.
      const rows = await db.query(
        `SELECT l.order_line_id,CAST(SUM(l.quantity_micros) AS TEXT) AS micros ${invoicedOrderLines} AND l.order_id=? AND l.order_line_id IN(${placeholders(orderLineIds.length)}) GROUP BY l.order_line_id`,
        [company, orderId, ...orderLineIds],
      );
      return rows.map((row) => ({
        orderLineId: str(row.order_line_id),
        micros: BigInt(str(row.micros)),
      }));
    },
    async tradeOrderLatestDate(company, orderId) {
      const rows = await db.query(
        "SELECT MAX(day) AS day FROM (SELECT accounting_date AS day FROM trade_documents WHERE company_id=? AND order_id=? UNION ALL SELECT a.accounting_date FROM trade_documents d JOIN trade_action_items i ON i.company_id=d.company_id AND i.item_id=d.document_id JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id WHERE d.company_id=? AND d.order_id=?)",
        [company, orderId, company, orderId],
      );
      return rows[0].day === null ? "" : str(rows[0].day);
    },
    async tradeConfigsByCodes(company, kind, codes) {
      if (!codes.length) return [];
      const rows = await db.query(
        `SELECT * FROM ${tradeTables[kind]} WHERE company_id=? AND code IN(${codes.map(() => "?").join(",")}) ORDER BY code`,
        [company, ...codes],
      );
      return rows.map((row) => tradeConfigRow(kind, row) as TradeConfig<typeof kind>);
    },
    tradeDocument(company, documentId) {
      return document("d.company_id=? AND d.document_id=?", [company, documentId]);
    },
    tradeDocumentByReceipt(company, key) {
      return document("d.company_id=? AND d.receipt_key=?", [company, key]);
    },
    async tradeDocumentByExternal(company, party, normalized) {
      const rows = await db.query(
        "SELECT document_id FROM trade_documents WHERE company_id=? AND party_id=? AND external_no_normalized=?",
        [company, party, normalized],
      );
      return rows[0] ? str(rows[0].document_id) : null;
    },
    async insertTradeDocument(company, record) {
      await db.query(
        "INSERT INTO trade_documents(company_id,document_id,kind,side,party_id,external_no,external_no_normalized,currency,accounting_date,document_date,tax_date,due_date,order_id,po_match,exception_reason,net_minor,tax_minor,gross_minor,journal_id,receipt_key,fingerprint,command_hash,snapshot,posted_at) VALUES(?,?,'invoice',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          record.documentId,
          record.side,
          record.party,
          record.externalNo,
          record.externalNoNormalized,
          record.currency,
          record.accountingDate,
          record.documentDate,
          record.taxDate,
          record.dueDate,
          record.orderId,
          record.poMatch,
          record.exceptionReason,
          record.net,
          record.tax,
          record.gross,
          record.journalId,
          record.receiptKey,
          record.fingerprint,
          record.commandHash,
          JSON.stringify(record.snapshot),
          record.postedAt,
        ],
      );
      for (const line of record.lines)
        await db.query(
          "INSERT INTO trade_document_lines(company_id,document_id,line_id,line_no,product_id,account,tax_code,tax_rate_id,rate_percent,quantity,quantity_micros,unit_price,discount_percent,taxable_charge,net_minor,tax_minor,gross_minor,deductible_tax_minor,order_id,order_line_id,expected_net_minor,match_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            company,
            record.documentId,
            line.lineId,
            line.lineNo,
            line.product,
            line.account,
            line.taxCode,
            line.taxRateId,
            line.ratePercent,
            line.quantity,
            quantityMicros(line.quantity),
            line.unitPrice,
            line.discountPercent,
            line.taxableCharge,
            line.net,
            line.tax,
            line.gross,
            line.deductibleTax,
            line.orderId,
            line.orderLineId,
            line.expectedNet,
            line.matchStatus,
          ],
        );
      await db.query(
        "INSERT INTO open_items(company_id,item_id,side,party_id,control_account,dimensions,currency,accounting_date,document_date,due_date,discount_date,gross_minor,net_minor,tax_minor,remaining_gross_minor,remaining_net_minor,remaining_tax_minor,status,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',1)",
        [
          company,
          record.documentId,
          record.side,
          record.party,
          record.controlAccount,
          JSON.stringify(record.controlDimensions),
          record.currency,
          record.accountingDate,
          record.documentDate,
          record.dueDate,
          record.discountDate,
          record.gross,
          record.net,
          record.tax,
          record.gross,
          record.net,
          record.tax,
        ],
      );
      const terms = record.snapshot.settlementTerms;
      if (!terms) throw new StorageError("STORAGE_FAILURE");
      await db.query(
        "INSERT INTO trade_invoice_terms(company_id,item_id,discount_percent,allow_partial_discount) VALUES(?,?,?,?)",
        [company, record.documentId, terms.discountPercent, terms.allowPartialDiscount ? 1 : 0],
      );
      await insertSegments(
        company,
        record.documentId,
        record.snapshot.controlSegments ?? [
          {
            dimensions: record.controlDimensions,
            gross: record.gross,
            remainingGross: record.gross,
          },
        ],
      );
    },
    async tradeDocumentPage(company, query) {
      const rows = await db.query(
        "SELECT sequence,document_id,side,party_id,external_no,accounting_date,document_date,due_date,po_match,gross_minor,currency,journal_id,order_id FROM trade_documents INDEXED BY trade_documents_company WHERE company_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
        [
          company,
          query.cursor === undefined ? Number.MAX_SAFE_INTEGER : Number(query.cursor),
          query.limit + 1,
        ],
      );
      const items: TradeDocumentSummary[] = rows.slice(0, query.limit).map((row) => ({
        documentId: str(row.document_id),
        side: str(row.side) as TradeDocumentSummary["side"],
        party: str(row.party_id),
        externalNo: str(row.external_no),
        accountingDate: str(row.accounting_date),
        documentDate: str(row.document_date),
        dueDate: str(row.due_date),
        poMatch: str(row.po_match) as TradeDocumentSummary["poMatch"],
        gross: int(row.gross_minor),
        currency: str(row.currency),
        journalId: str(row.journal_id),
        orderId: optional(row.order_id),
        cursor: String(int(row.sequence)),
      }));
      return {
        items,
        nextCursor: rows.length > query.limit ? items[items.length - 1].cursor : null,
      };
    },
    async openItem(company, itemId) {
      const rows = await db.query(`${openItemSelect} WHERE o.company_id=? AND o.item_id=?`, [
        company,
        itemId,
      ]);
      return rows[0]
        ? openItemRow(rows[0], (await segments(company, [itemId])).get(itemId) ?? [])
        : null;
    },
    async openItemPage(company, query) {
      const [due, item] = query.cursor === undefined ? ["", ""] : query.cursor.split("|");
      const filters = [
        ...(query.party === undefined ? [] : ["o.party_id=?"]),
        ...(query.status === undefined ? [] : ["o.status=?"]),
      ];
      const rows = await db.query(
        `${openItemSelect} WHERE o.company_id=?${filters.map((filter) => ` AND ${filter}`).join("")} AND (o.due_date>? OR (o.due_date=? AND o.item_id>?)) ORDER BY o.due_date,o.item_id LIMIT ?`,
        [
          company,
          ...(query.party === undefined ? [] : [query.party]),
          ...(query.status === undefined ? [] : [query.status]),
          due,
          due,
          item,
          query.limit + 1,
        ],
      );
      const values = await segments(
        company,
        rows.slice(0, query.limit).map((row) => str(row.item_id)),
      );
      const items = rows
        .slice(0, query.limit)
        .map((row) => openItemRow(row, values.get(str(row.item_id)) ?? []));
      return {
        items,
        nextCursor:
          rows.length > query.limit
            ? `${items[items.length - 1].dueDate}|${items[items.length - 1].itemId}`
            : null,
      };
    },
  };
}

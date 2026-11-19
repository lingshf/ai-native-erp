import { StorageError, type TradeDocumentRepository } from "@erp/core/application";
import type {
  DimensionMap,
  OpenItem,
  TradeDocumentLine,
  TradeDocumentRecord,
  TradeDocumentSnapshot,
  TradeDocumentSummary,
  TradeOrder,
} from "@erp/core/domain";
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
function openItemRow(row: Row): OpenItem {
  return {
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
  "SELECT o.*,d.external_no FROM open_items o JOIN trade_documents d ON d.company_id=o.company_id AND d.document_id=o.item_id";

export function tradeDocumentRepository(db: Connection): TradeDocumentRepository {
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
    async tradeOrderInvoiced(company, orderId) {
      const rows = await db.query(
        "SELECT order_line_id,quantity FROM trade_document_lines WHERE company_id=? AND order_id=? AND order_line_id IS NOT NULL",
        [company, orderId],
      );
      return rows.map((row) => ({
        orderLineId: str(row.order_line_id),
        quantity: str(row.quantity),
      }));
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
          "INSERT INTO trade_document_lines(company_id,document_id,line_id,line_no,product_id,account,tax_code,tax_rate_id,rate_percent,quantity,unit_price,discount_percent,taxable_charge,net_minor,tax_minor,gross_minor,deductible_tax_minor,order_id,order_line_id,expected_net_minor,match_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
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
    },
    async tradeDocumentPage(company, query) {
      const rows = await db.query(
        "SELECT sequence,document_id,side,party_id,external_no,accounting_date,document_date,due_date,po_match,gross_minor,currency,journal_id FROM trade_documents INDEXED BY trade_documents_company WHERE company_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
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
      return rows[0] ? openItemRow(rows[0]) : null;
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
      const items = rows.slice(0, query.limit).map(openItemRow);
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

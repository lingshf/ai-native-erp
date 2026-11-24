import type { TradeDocumentRepository, TradeInvoiceListQuery } from "@erp/core/application";
import type {
  DimensionMap,
  TradeDocumentRecord,
  TradeDocumentSnapshot,
  TradeDocumentSummary,
} from "@erp/core/domain";
import {
  insertInvoiceHeader,
  insertInvoiceLines,
  insertInvoiceOpenItem,
} from "./trade-document-invoice-posting.ts";
import { refreshTradeOrderInvoicing } from "./trade-document-order-invoicing.ts";
import { documentLineRow, int, json, optional, str } from "./trade-document-rows.ts";
import type { Connection } from "./types.ts";

// TINV-05: one statement per invoice-list page, newest sequence first. The text is assembled only
// from fixed fragments chosen by which filters are present; every value is bound. With a party the
// statement SEARCHes trade_documents_party (company_id, party_id, sequence), already in sequence
// order; otherwise it keeps trade_documents_company. Side and accounting date are filtered row by
// row on that range. With no filter the text is exactly the pre-TINV-05 statement.
export function tradeDocumentPageStatement(
  company: string,
  query: TradeInvoiceListQuery,
): { readonly sql: string; readonly values: readonly (string | number)[] } {
  let sql = `SELECT sequence,document_id,side,party_id,external_no,accounting_date,document_date,due_date,po_match,gross_minor,currency,journal_id,order_id FROM trade_documents INDEXED BY ${query.party === undefined ? "trade_documents_company" : "trade_documents_party"} WHERE company_id=?`;
  const values: (string | number)[] = [company];
  const add = (fragment: string, value: string | number | undefined) => {
    if (value === undefined) return;
    sql += fragment;
    values.push(value);
  };
  add(" AND party_id=?", query.party);
  add(
    " AND sequence<?",
    query.cursor === undefined ? Number.MAX_SAFE_INTEGER : Number(query.cursor),
  );
  add(" AND side=?", query.side);
  add(" AND accounting_date>=?", query.from);
  add(" AND accounting_date<=?", query.to);
  values.push(query.limit + 1);
  return { sql: `${sql} ORDER BY sequence DESC LIMIT ?`, values };
}
async function document(
  db: Pick<Connection, "query">,
  where: string,
  parameters: (string | number)[],
) {
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
export function tradeInvoiceRecords(
  db: Pick<Connection, "query">,
): Pick<
  TradeDocumentRepository,
  | "tradeDocument"
  | "tradeDocumentByReceipt"
  | "tradeDocumentByExternal"
  | "insertTradeDocument"
  | "tradeDocumentPage"
> {
  return {
    tradeDocument(company, documentId) {
      return document(db, "d.company_id=? AND d.document_id=?", [company, documentId]);
    },
    tradeDocumentByReceipt(company, key) {
      return document(db, "d.company_id=? AND d.receipt_key=?", [company, key]);
    },
    async tradeDocumentByExternal(company, party, normalized) {
      const rows = await db.query(
        "SELECT document_id FROM trade_documents WHERE company_id=? AND party_id=? AND external_no_normalized=?",
        [company, party, normalized],
      );
      return rows[0] ? str(rows[0].document_id) : null;
    },
    async insertTradeDocument(company, record) {
      await insertInvoiceHeader(db, company, record);
      await insertInvoiceLines(db, company, record);
      await insertInvoiceOpenItem(db, company, record);
      // TORD-06: after the open item exists, so the TINV-03 predicate already counts this invoice.
      const linkedOrders = new Set(
        record.lines.flatMap((line) => (line.orderId === null ? [] : [line.orderId])),
      );
      await refreshTradeOrderInvoicing(db, company, [...linkedOrders]);
    },
    async tradeDocumentPage(company, query) {
      const statement = tradeDocumentPageStatement(company, query);
      const rows = await db.query(statement.sql, statement.values);
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
  };
}

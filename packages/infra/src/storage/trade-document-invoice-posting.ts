import { StorageError } from "@erp/core/application";
import type { TradeDocumentRecord } from "@erp/core/domain";
import { quantityMicros } from "@erp/core/domain";
import { insertSegments } from "./trade-document-segments.ts";
import type { Connection } from "./types.ts";

export async function insertInvoiceHeader(
  db: Pick<Connection, "query">,
  company: string,
  record: TradeDocumentRecord,
) {
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
}
export async function insertInvoiceLines(
  db: Pick<Connection, "query">,
  company: string,
  record: TradeDocumentRecord,
) {
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
}
// The settlementTerms check stays after INSERT INTO open_items and before the terms insert: a
// record without terms fails only once the header, lines and open item have been written.
export async function insertInvoiceOpenItem(
  db: Pick<Connection, "query">,
  company: string,
  record: TradeDocumentRecord,
) {
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
    db,
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
}

import { StorageError, type TradeDocumentRepository } from "@erp/core/application";
import {
  tradeDimensionKey,
  tradeDocumentError,
  type TradeSettlementReceipt,
} from "@erp/core/domain";
import { json, str } from "./trade-document-rows.ts";
import type { Connection } from "./types.ts";

export function tradePaymentRecords(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "tradePayment" | "insertTradePayment"> {
  return {
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
  };
}
export function openItemSettlements(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "settleOpenItem" | "itemSettlements"> {
  return {
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
  };
}

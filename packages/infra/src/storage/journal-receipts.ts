import { canonicalJson, type JournalRepository } from "@erp/core/application";
import { journalReceiptSchema } from "@erp/core/contracts";
import { json } from "./journal-rows.ts";
import type { Connection } from "./types.ts";

export function journalReceiptStore(
  db: Connection,
): Pick<
  JournalRepository,
  "journalReceipt" | "journalSourceExists" | "journalConfigurationStamp" | "insertJournalReceipt"
> {
  return {
    async journalReceipt(company, key) {
      const rows = await db.query(
        "SELECT result FROM receipts WHERE company_id=? AND idempotency_key=? AND tenant_id='LOCAL' AND book_id='LOCAL' AND operation='journal.confirm'",
        [company, key],
      );
      return rows[0] ? journalReceiptSchema.parse(json(rows[0].result)) : null;
    },
    async journalSourceExists(company, reference) {
      return (
        (
          await db.query("SELECT 1 FROM receipts WHERE company_id=? AND source_ref=?", [
            company,
            reference,
          ])
        ).length > 0
      );
    },
    async journalConfigurationStamp(company) {
      const rows = await db.query(
        "SELECT (SELECT count(*) FROM config_history WHERE company_id=?) AS master,(SELECT count(*) FROM dimension_history WHERE company_id=?) AS dimensions",
        [company, company],
      );
      return `${rows[0].master}:${rows[0].dimensions}`;
    },
    async insertJournalReceipt(receipt) {
      await db.query(
        "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version,idempotency_key,source_ref) VALUES('LOCAL','LOCAL',?,'journal.confirm',?,'LOCAL',?,?,1,?,?)",
        [
          receipt.company,
          receipt.idempotencyKey,
          receipt.fingerprint,
          canonicalJson(receipt),
          receipt.idempotencyKey,
          receipt.sourceRef,
        ],
      );
    },
  };
}
export function journalCorrectionAuditLog(
  db: Connection,
): Pick<JournalRepository, "insertJournalCorrection" | "insertJournalAudit"> {
  return {
    async insertJournalCorrection(company, originalId, entry) {
      await db.query(
        "INSERT INTO journal_corrections(company_id,original_id,output_id,operation) VALUES(?,?,?,?)",
        [company, originalId, entry.id, entry.operation],
      );
    },
    async insertJournalAudit(receipt) {
      await db.query(
        "INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at) SELECT 'LOCAL','LOCAL',?,coalesce(max(sequence),0)+1,'journal.confirm',?,'LOCAL',?,? FROM audit WHERE tenant_id='LOCAL' AND book_id='LOCAL' AND company_id=?",
        [
          receipt.company,
          receipt.sourceRef,
          canonicalJson(receipt),
          receipt.postedAt,
          receipt.company,
        ],
      );
    },
  };
}

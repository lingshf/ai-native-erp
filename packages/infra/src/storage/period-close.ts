import { StorageError, type PeriodCloseRepository } from "@erp/core/application";
import { closeResultSchema } from "@erp/core/contracts";
import type { Connection } from "./types.ts";

export function periodCloseRepository(db: Connection): PeriodCloseRepository {
  return {
    async closeState(company, month, annual) {
      const start = annual && month.endsWith("-12") ? `${month.slice(0, 4)}-01` : month;
      const row = (
        await db.query(
          `SELECT
        (SELECT count(*) FROM journal_drafts WHERE company_id=? AND substr(accounting_date,1,7) BETWEEN ? AND ?) AS drafts,
        (SELECT count(*) FROM transfer_queue q JOIN business_events e ON e.company_id=q.company_id AND e.id=q.id
          WHERE q.company_id=? AND q.status IN('pending','failed') AND substr(e.accounting_date,1,7) BETWEEN ? AND ?) AS queue,
        (SELECT count(*) FROM periods WHERE company_id=? AND month<? AND
          (status='open' OR (month<? AND status<>'closed'))) AS prior
      `,
          [
            company,
            start,
            month,
            company,
            start,
            month,
            company,
            month,
            annual ? `${month.slice(0, 4)}-01` : month,
          ],
        )
      )[0];
      return {
        drafts: Number(row.drafts),
        queue: Number(row.queue),
        priorPeriods: Number(row.prior),
      };
    },
    async periodClose(company, key) {
      const row = (
        await db.query("SELECT result FROM period_closes WHERE company_id=? AND receipt_key=?", [
          company,
          key,
        ])
      )[0];
      if (!row) return null;
      if (typeof row.result !== "string") throw new StorageError("STORAGE_FAILURE");
      return closeResultSchema.parse(JSON.parse(row.result));
    },
    async insertPeriodClose(result) {
      await db.query(
        "INSERT INTO period_closes(company_id,receipt_key,month,revision,result) VALUES(?,?,?,?,?)",
        [
          result.preview.company,
          result.receipt.idempotencyKey,
          result.period.month,
          result.period.revision,
          JSON.stringify(result),
        ],
      );
    },
    async isClosingJournal(company, id) {
      return (
        (
          await db.query(
            "SELECT 1 FROM period_closing_journals WHERE company_id=? AND journal_id=?",
            [company, id],
          )
        ).length > 0
      );
    },
  };
}

import { StorageError, type BusinessRepository, type QueueSummary } from "@erp/core/application";
import {
  queueSummarySchema,
  transferQueueSchema,
  businessPreviewSchema,
} from "@erp/core/contracts";
import type { Connection, Row } from "./types.ts";
import { storedJournalPlan } from "./journals.ts";
import { decoded, json, page } from "./business-rows.ts";
function queueSummary(row: Row): QueueSummary {
  return decoded(queueSummarySchema, {
    id: row.id,
    sourceRef: row.source_ref,
    date: row.accounting_date,
    memo: row.memo,
    status: row.status,
    createdAt: row.created_at,
    revision: Number(row.revision),
    journalIds: json(row.journal_ids),
    fingerprint: row.transfer_fingerprint,
    error: row.error,
    reason: row.reason,
  });
}
const queueProjection =
  "q.id,q.status,q.created_at,q.revision,q.journal_ids,q.transfer_fingerprint,q.error,q.reason,b.source_ref,b.accounting_date,b.memo";
export function transferQueueStore(
  db: Connection,
): Pick<BusinessRepository, "queueItem" | "queuePage" | "saveQueue" | "pendingTransfers"> {
  return {
    async queueItem(company, id) {
      const rows = await db.query(
        `SELECT ${queueProjection},q.transfer_plan FROM transfer_queue q JOIN business_events b ON b.company_id=q.company_id AND b.id=q.id WHERE q.company_id=? AND q.id=?`,
        [company, id],
      );
      return rows[0]
        ? decoded(transferQueueSchema, {
            ...queueSummary(rows[0]),
            plan:
              rows[0].transfer_plan === null
                ? null
                : decoded(
                    businessPreviewSchema.shape.plan,
                    storedJournalPlan(json(rows[0].transfer_plan)),
                  ),
          })
        : null;
    },
    async queuePage(company, status, query) {
      const [createdAt = "", id = ""] = query.cursor?.split("~") ?? [];
      const rows = await db.query(
        `SELECT ${queueProjection} FROM transfer_queue q JOIN business_events b ON b.company_id=q.company_id AND b.id=q.id WHERE q.company_id=? AND q.status=? AND (q.created_at,q.id)>(?,?) ORDER BY q.created_at,q.id LIMIT ?`,
        [company, status, createdAt, id, query.limit + 1],
      );
      return page(rows, query, queueSummary, (item) => `${item.createdAt}~${item.id}`);
    },
    async saveQueue(company, item, expected) {
      const values = [
        item.status,
        item.revision,
        JSON.stringify(item.journalIds),
        item.fingerprint,
        item.plan === null ? null : JSON.stringify(item.plan),
        item.error,
        item.reason,
      ];
      if (expected === 0)
        await db.query(
          "INSERT INTO transfer_queue(status,revision,journal_ids,transfer_fingerprint,transfer_plan,error,reason,company_id,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          [...values, company, item.id, item.createdAt],
        );
      else if (
        (
          await db.query(
            "UPDATE transfer_queue SET status=?,revision=?,journal_ids=?,transfer_fingerprint=?,transfer_plan=?,error=?,reason=? WHERE company_id=? AND id=? AND revision=? RETURNING id",
            [...values, company, item.id, expected],
          )
        ).length !== 1
      )
        throw new StorageError("CONFLICT");
    },
    async pendingTransfers(company, month) {
      return (
        (
          await db.query(
            "SELECT 1 FROM transfer_queue q JOIN business_events b ON b.company_id=q.company_id AND b.id=q.id WHERE q.company_id=? AND q.status IN('pending','failed') AND substr(b.accounting_date,1,7)=? LIMIT 1",
            [company, month],
          )
        ).length > 0
      );
    },
  };
}

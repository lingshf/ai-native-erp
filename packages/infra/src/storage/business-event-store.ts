import type { BusinessRepository } from "@erp/core/application";
import { businessRecordSchema, businessSummarySchema } from "@erp/core/contracts";
import type { Connection } from "./types.ts";
import { storedJournalPlan } from "./journals.ts";
import { decoded, json, page } from "./business-rows.ts";
function storedPreview(value: unknown): unknown {
  const parsed = json(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  return { ...parsed, plan: storedJournalPlan(Reflect.get(parsed, "plan")) };
}
export function businessEventLookups(
  db: Connection,
): Pick<
  BusinessRepository,
  "businessEvent" | "businessByReceipt" | "journalBusinessEvent" | "businessCancelled"
> {
  return {
    async businessEvent(company, id) {
      const rows = await db.query(
        "SELECT b.input,b.preview,b.created_at,r.result FROM business_events b JOIN receipts r ON r.company_id=b.company_id AND r.idempotency_key=b.receipt_key WHERE b.company_id=? AND b.id=?",
        [company, id],
      );
      return rows[0]
        ? decoded(businessRecordSchema, {
            event: json(rows[0].input),
            preview: storedPreview(rows[0].preview),
            receipt: json(rows[0].result),
            createdAt: rows[0].created_at,
          })
        : null;
    },
    async businessByReceipt(company, key) {
      const rows = await db.query(
        "SELECT id FROM business_events WHERE company_id=? AND receipt_key=?",
        [company, key],
      );
      return rows[0] ? String(rows[0].id) : null;
    },
    async journalBusinessEvent(company, id) {
      // Queue acceptance does not turn an ordinary journal into a cash-service source.
      const rows = await db.query(
        "SELECT l.event_id FROM business_event_journals l JOIN business_events b ON b.company_id=l.company_id AND b.id=l.event_id WHERE l.company_id=? AND l.journal_id=? AND b.operation<>'journal'",
        [company, id],
      );
      return rows[0] ? String(rows[0].event_id) : null;
    },
    async businessCancelled(company, id) {
      return (
        (
          await db.query(
            "SELECT 1 FROM business_events WHERE company_id=? AND original_event_id=?",
            [company, id],
          )
        ).length > 0
      );
    },
  };
}
export function businessEventList(db: Connection): Pick<BusinessRepository, "businessEvents"> {
  return {
    async businessEvents(company, query) {
      const rows = await db.query(
        `SELECT b.id,b.source_ref,b.accounting_date,b.memo,b.operation,b.created_at,
        coalesce(q.status,CASE WHEN b.operation='cash_service' AND EXISTS(SELECT 1 FROM business_events c WHERE c.company_id=b.company_id AND c.original_event_id=b.id) THEN 'cancelled'
          WHEN b.operation IN('statistics','clearing.match') THEN 'recorded' ELSE 'posted' END) AS status
        FROM business_events b LEFT JOIN transfer_queue q ON q.company_id=b.company_id AND q.id=b.id
        WHERE b.company_id=? AND b.id>? ORDER BY b.id LIMIT ?`,
        [company, query.cursor ?? "", query.limit + 1],
      );
      return page(
        rows,
        query,
        (row) =>
          decoded(businessSummarySchema, {
            id: row.id,
            sourceRef: row.source_ref,
            date: row.accounting_date,
            memo: row.memo,
            operation: row.operation,
            status: row.status,
            createdAt: row.created_at,
          }),
        (item) => item.id,
      );
    },
  };
}
export function businessEventWrites(
  db: Connection,
): Pick<
  BusinessRepository,
  "insertBusinessEvent" | "linkBusinessJournal" | "insertBusinessEffects"
> {
  return {
    async insertBusinessEvent(company, record) {
      await db.query(
        "INSERT INTO business_events(company_id,id,source_ref,accounting_date,memo,operation,original_event_id,input,preview,receipt_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          record.event.id,
          record.event.sourceRef,
          record.event.date,
          record.event.memo,
          record.event.operation,
          record.event.operation === "cash_service.cancel" ? record.event.originalId : null,
          JSON.stringify(record.event),
          JSON.stringify(record.preview),
          record.receipt.idempotencyKey,
          record.createdAt,
        ],
      );
    },
    async linkBusinessJournal(company, eventId, journalId) {
      await db.query(
        "INSERT INTO business_event_journals(company_id,event_id,journal_id) VALUES(?,?,?)",
        [company, eventId, journalId],
      );
    },
    async insertBusinessEffects(company, id, preview) {
      const fact = preview.statistics;
      if (fact)
        await db.query(
          "INSERT INTO statistics_facts(company_id,event_id,code,quantity_minor,scale,unit,dimensions,origins) VALUES(?,?,?,?,?,?,?,?)",
          [
            company,
            id,
            fact.code,
            fact.quantity,
            fact.scale,
            fact.unit,
            JSON.stringify(fact.dimensions),
            JSON.stringify(fact.dimensionOrigins),
          ],
        );
      for (const line of preview.clearing)
        await db.query(
          "INSERT INTO business_clearing_links(company_id,entry_id,line_no,event_id) VALUES(?,?,?,?)",
          [company, line.entryId, line.lineNo, id],
        );
    },
  };
}

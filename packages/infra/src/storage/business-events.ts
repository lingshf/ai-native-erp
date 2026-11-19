import {
  StorageError,
  canonicalJson,
  type BusinessRepository,
  type QueueSummary,
} from "@erp/core/application";
import {
  businessMasterSchema,
  postingRuleSchema,
  businessRecordSchema,
  businessSummarySchema,
  queueSummarySchema,
  transferQueueSchema,
  openClearingLineSchema,
  businessPreviewSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import type { Page, PageQuery } from "@erp/core/domain";
import type { Connection, Row } from "./types.ts";
import { storedJournalPlan } from "./journals.ts";
function decoded<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageError("STORAGE_FAILURE");
  return parsed.data;
}
function json(value: unknown): unknown {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return JSON.parse(value);
}
function storedPreview(value: unknown): unknown {
  const parsed = json(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  return { ...parsed, plan: storedJournalPlan(Reflect.get(parsed, "plan")) };
}
function flag(value: unknown): boolean {
  if (value !== 0 && value !== 0n && value !== 1 && value !== 1n)
    throw new StorageError("STORAGE_FAILURE");
  return value === 1 || value === 1n;
}
function master(row: Row) {
  return decoded(businessMasterSchema, {
    code: row.code,
    name: row.name,
    group: row.group_code,
    active: flag(row.active),
    revision: Number(row.revision),
    dimensions: json(row.dimensions),
  });
}
function rule(row: Row) {
  return decoded(postingRuleSchema, {
    code: row.code,
    revision: Number(row.revision),
    active: flag(row.active),
    direction: row.direction,
    meaning: row.meaning,
    objectScope: row.object_scope,
    objectCode: row.object_code,
    partyScope: row.party_scope,
    partyCode: row.party_code,
    account: row.account_code,
    dimensions: json(row.dimensions),
    from: row.valid_from,
    to: row.valid_to,
  });
}
function page<T>(
  rows: readonly Row[],
  query: PageQuery,
  decode: (row: Row) => T,
  cursor: (value: T) => string,
): Page<T> {
  const items = rows.slice(0, query.limit).map(decode);
  return { items, nextCursor: rows.length > query.limit ? cursor(items[items.length - 1]) : null };
}
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
function clearingLine(row: Row) {
  return decoded(openClearingLineSchema, {
    entryId: row.entry_id,
    lineNo: Number(row.line_no),
    account: row.account_code,
    date: row.accounting_date,
    memo: row.memo,
    debit: Number(row.debit_minor),
    credit: Number(row.credit_minor),
    dimensions: json(row.dimensions),
  });
}
const queueProjection =
  "q.id,q.status,q.created_at,q.revision,q.journal_ids,q.transfer_fingerprint,q.error,q.reason,b.source_ref,b.accounting_date,b.memo";
const lineProjection =
  "l.entry_id,l.line_no,l.account_code,l.debit_minor,l.credit_minor,l.dimensions,j.accounting_date,j.memo";
export function businessRepository(db: Connection): BusinessRepository {
  async function save(
    table: "business_services" | "business_parties" | "posting_rules",
    company: string,
    code: string,
    columns: readonly string[],
    values: readonly (string | number)[],
    expected: number,
  ) {
    if (expected === 0)
      await db.query(
        `INSERT INTO ${table}(company_id,code,${columns.join(",")}) VALUES(?,?,${columns.map(() => "?").join(",")})`,
        [company, code, ...values],
      );
    else if (
      (
        await db.query(
          `UPDATE ${table} SET ${columns.map((name) => `${name}=?`).join(",")} WHERE company_id=? AND code=? AND revision=? RETURNING code`,
          [...values, company, code, expected],
        )
      ).length !== 1
    )
      throw new StorageError("CONFLICT");
  }
  return {
    async businessMaster(company, kind, code) {
      const rows = await db.query(
        `SELECT * FROM ${kind === "service" ? "business_services" : "business_parties"} WHERE company_id=? AND code=?`,
        [company, code],
      );
      return rows[0] ? master(rows[0]) : null;
    },
    async businessMasters(company, kind, query) {
      return page(
        await db.query(
          `SELECT * FROM ${kind === "service" ? "business_services" : "business_parties"} WHERE company_id=? AND code>? ORDER BY code LIMIT ?`,
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        master,
        (item) => item.code,
      );
    },
    saveBusinessMaster(company, kind, value, expected) {
      return save(
        kind === "service" ? "business_services" : "business_parties",
        company,
        value.code,
        ["name", "group_code", "active", "revision", "dimensions"],
        [value.name, value.group, +value.active, value.revision, JSON.stringify(value.dimensions)],
        expected,
      );
    },
    async postingRules(company, query) {
      return page(
        await db.query(
          "SELECT * FROM posting_rules WHERE company_id=? AND code>? ORDER BY code LIMIT ?",
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        rule,
        (item) => item.code,
      );
    },
    async postingCatalog(company) {
      return (
        await db.query("SELECT * FROM posting_rules WHERE company_id=? ORDER BY code LIMIT 5001", [
          company,
        ])
      ).map(rule);
    },
    async postingRule(company, code) {
      const rows = await db.query("SELECT * FROM posting_rules WHERE company_id=? AND code=?", [
        company,
        code,
      ]);
      return rows[0] ? rule(rows[0]) : null;
    },
    savePostingRule(company, value, expected) {
      return save(
        "posting_rules",
        company,
        value.code,
        [
          "active",
          "revision",
          "direction",
          "meaning",
          "object_scope",
          "object_code",
          "party_scope",
          "party_code",
          "account_code",
          "dimensions",
          "valid_from",
          "valid_to",
        ],
        [
          +value.active,
          value.revision,
          value.direction,
          value.meaning,
          value.objectScope,
          value.objectCode,
          value.partyScope,
          value.partyCode,
          value.account,
          JSON.stringify(value.dimensions),
          value.from,
          value.to,
        ],
        expected,
      );
    },
    async businessHistory(company, kind, code, revision, snapshot, at) {
      await db.query(
        "INSERT INTO business_config_history(company_id,kind,code,revision,snapshot,recorded_at) VALUES(?,?,?,?,?,?)",
        [company, kind, code, revision, JSON.stringify(snapshot), at],
      );
    },
    async businessStamp(company) {
      const rows = await db.query(
        "SELECT count(*) AS stamp FROM business_config_history WHERE company_id=?",
        [company],
      );
      return Number(rows[0].stamp);
    },
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
    async clearingLines(company, refs) {
      if (!refs.length) return [];
      const rows = await db.query(
        `SELECT ${lineProjection},c.event_id AS matched,json_extract(l.evidence,'$.balancing') AS balancing FROM journal_lines l JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id LEFT JOIN business_clearing_links c ON c.company_id=l.company_id AND c.entry_id=l.entry_id AND c.line_no=l.line_no WHERE l.company_id=? AND (l.entry_id,l.line_no) IN(${refs.map(() => "(?,?)").join(",")}) ORDER BY l.entry_id,l.line_no`,
        [company, ...refs.flatMap((line) => [line.entryId, line.lineNo])],
      );
      return rows.map((row) => ({
        ...clearingLine(row),
        matched: row.matched !== null,
        balancing: row.balancing !== null,
      }));
    },
    async openClearingLines(company, account, date, query) {
      const [id = "", lineNo = "0"] = query.cursor?.split(":") ?? [];
      const rows = await db.query(
        `SELECT ${lineProjection} FROM journal_lines l JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id LEFT JOIN business_clearing_links c ON c.company_id=l.company_id AND c.entry_id=l.entry_id AND c.line_no=l.line_no WHERE l.company_id=? AND l.account_code=? AND (l.entry_id,l.line_no)>(?,?) AND j.accounting_date<=? AND c.event_id IS NULL AND json_extract(l.evidence,'$.balancing') IS NULL ORDER BY l.entry_id,l.line_no LIMIT ?`,
        [company, account, id, Number(lineNo), date, query.limit + 1],
      );
      return page(rows, query, clearingLine, (item) => `${item.entryId}:${item.lineNo}`);
    },
    async businessAudit(company, reference, action, details, at) {
      await db.query(
        "INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at) SELECT 'LOCAL','LOCAL',?,coalesce(max(sequence),0)+1,?,?,'LOCAL',?,? FROM audit WHERE tenant_id='LOCAL' AND book_id='LOCAL' AND company_id=?",
        [company, action, reference, canonicalJson(details), at, company],
      );
    },
  };
}

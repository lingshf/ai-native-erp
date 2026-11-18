import { createHash, randomUUID } from "node:crypto";
import {
  StorageError,
  canonicalJson,
  type JournalRepository,
  type JournalTools,
} from "@erp/core/application";
import {
  journalDraftSchema,
  journalEntrySchema,
  journalLineSchema,
  journalReceiptSchema,
} from "@erp/core/contracts";
import type { Connection, Row } from "./types.ts";

export const journalTools: JournalTools = {
  id: randomUUID,
  now: () => new Date().toISOString(),
  hash(parts) {
    const hash = createHash("sha256");
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== "object") {
        const text = JSON.stringify(value);
        if (text === undefined || (typeof value === "number" && !Number.isSafeInteger(value)))
          throw new StorageError("INVALID_INPUT");
        hash.update(text);
        return;
      }
      if (Array.isArray(value)) {
        hash.update("[");
        for (const item of value) {
          visit(item);
          hash.update(",");
        }
        hash.update("]");
      } else {
        hash.update("{");
        for (const key of Object.keys(value).sort()) {
          visit(key);
          hash.update(":");
          visit(Reflect.get(value, key));
          hash.update(",");
        }
        hash.update("}");
      }
    };
    visit(parts);
    return hash.digest("hex");
  },
};
function json(value: unknown): unknown {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return JSON.parse(value);
}
async function journalTurnover(db: Connection, company: string): Promise<number> {
  const rows = await db.query(
    "SELECT s.turnover_minor FROM journal_entries e JOIN journal_seals s ON s.company_id=e.company_id AND s.entry_id=e.id WHERE e.company_id=? ORDER BY e.sequence DESC LIMIT 1",
    [company],
  );
  const value = Number(rows[0]?.turnover_minor ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new StorageError("STORAGE_FAILURE");
  return value;
}
export function journalRepository(db: Connection): JournalRepository {
  return {
    journalTurnover: (company) => journalTurnover(db, company),
    async journalDraft(company, id) {
      const rows = await db.query("SELECT data FROM journal_drafts WHERE company_id=? AND id=?", [
        company,
        id,
      ]);
      return rows[0] ? journalDraftSchema.parse(json(rows[0].data)) : null;
    },
    async saveJournalDraft(company, draft, expected) {
      const values = [
        draft.revision,
        draft.sourceRef,
        draft.date,
        draft.memo,
        draft.operation,
        JSON.stringify(draft),
        company,
        draft.id,
      ];
      if (expected === 0)
        await db.query(
          "INSERT INTO journal_drafts(revision,source_ref,accounting_date,memo,operation,data,company_id,id) VALUES(?,?,?,?,?,?,?,?)",
          values,
        );
      else if (
        (
          await db.query(
            "UPDATE journal_drafts SET revision=?,source_ref=?,accounting_date=?,memo=?,operation=?,data=? WHERE company_id=? AND id=? AND revision=? RETURNING id",
            [...values, expected],
          )
        ).length !== 1
      )
        throw new StorageError("CONFLICT");
    },
    async deleteJournalDraft(company, id, expected) {
      if (
        (
          await db.query(
            "DELETE FROM journal_drafts WHERE company_id=? AND id=? AND revision=? RETURNING id",
            [company, id, expected],
          )
        ).length !== 1
      )
        throw new StorageError("CONFLICT");
    },
    async journalPage(company, status, query) {
      const table = status === "draft" ? "journal_drafts" : "journal_entries";
      const rows = await db.query(
        `SELECT id,source_ref,accounting_date,memo,operation,${status === "draft" ? "revision" : "NULL AS revision"} FROM ${table} WHERE company_id=? AND id>? ORDER BY id LIMIT ?`,
        [company, query.cursor ?? "", query.limit + 1],
      );
      const items = rows.slice(0, query.limit).map((row) => ({
        id: String(row.id),
        sourceRef: String(row.source_ref),
        date: String(row.accounting_date),
        memo: String(row.memo),
        operation: journalDraftSchema.shape.operation.parse(row.operation),
        revision: row.revision === null ? null : Number(row.revision),
      }));
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].id : null };
    },
    async journalEntry(company, id) {
      const rows = await db.query("SELECT * FROM journal_entries WHERE company_id=? AND id=?", [
        company,
        id,
      ]);
      if (!rows[0]) return null;
      const row = rows[0];
      const lines = (
        await db.query(
          "SELECT account_code,debit_minor,credit_minor,dimensions,evidence FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY line_no",
          [company, id],
        )
      ).map((line) => {
        const evidence = json(line.evidence);
        if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence))
          throw new StorageError("STORAGE_FAILURE");
        return journalLineSchema.parse({
          ...evidence,
          account: line.account_code,
          debit: Number(line.debit_minor),
          credit: Number(line.credit_minor),
          dimensions: json(line.dimensions),
        });
      });
      return journalEntrySchema.parse({
        id,
        sourceRef: row.source_ref,
        date: row.accounting_date,
        memo: row.memo,
        kind: row.kind,
        operation: row.operation,
        role: row.role,
        postedAt: row.posted_at,
        fingerprint: row.fingerprint,
        lines,
        debit: Number(lines.reduce((sum, line) => sum + BigInt(line.debit), 0n)),
        credit: Number(lines.reduce((sum, line) => sum + BigInt(line.credit), 0n)),
      });
    },
    async journalChain(company, id) {
      const rows = await db.query(
        `WITH RECURSIVE chain(id) AS (
        SELECT ? UNION SELECT c.output_id FROM journal_corrections c JOIN chain ON c.original_id=chain.id WHERE c.company_id=?
      ) SELECT c.*,j.accounting_date,j.sequence FROM journal_corrections c JOIN chain ON c.original_id=chain.id
        JOIN journal_entries j ON j.company_id=c.company_id AND j.id=c.output_id WHERE c.company_id=? ORDER BY j.sequence DESC`,
        [id, company, company],
      );
      return rows.map((row) => ({
        originalId: String(row.original_id),
        outputId: String(row.output_id),
        operation: correctionOperation(row),
        date: String(row.accounting_date),
        sequence: Number(row.sequence),
      }));
    },
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
    async insertJournalEntry(company, entry, key) {
      await db.query(
        "INSERT INTO journal_entries(company_id,id,receipt_key,source_ref,accounting_date,period,memo,kind,operation,role,posted_at,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          entry.id,
          key,
          entry.sourceRef,
          entry.date,
          entry.date.slice(0, 7),
          entry.memo,
          entry.kind,
          entry.operation,
          entry.role,
          entry.postedAt,
          entry.fingerprint,
        ],
      );
      for (const [index, line] of entry.lines.entries()) {
        const { account, debit, credit, dimensions, ...evidence } = line;
        await db.query(
          "INSERT INTO journal_lines(company_id,entry_id,line_no,period,account_code,debit_minor,credit_minor,dimensions,evidence) VALUES(?,?,?,?,?,?,?,?,?)",
          [
            company,
            entry.id,
            index + 1,
            entry.date.slice(0, 7),
            account,
            debit,
            credit,
            JSON.stringify(dimensions),
            JSON.stringify(evidence),
          ],
        );
      }
      await db.query(
        "INSERT INTO journal_seals(company_id,entry_id,turnover_minor) VALUES(?,?,?)",
        [company, entry.id, BigInt(await journalTurnover(db, company)) + BigInt(entry.debit)],
      );
    },
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
function correctionOperation(row: Row): "reverse" | "replace" | "reclassify" {
  if (row.operation !== "reverse" && row.operation !== "replace" && row.operation !== "reclassify")
    throw new StorageError("STORAGE_FAILURE");
  return row.operation;
}

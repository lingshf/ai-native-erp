import { StorageError, type JournalRepository } from "@erp/core/application";
import { journalDraftSchema, journalEntrySchema, journalLineSchema } from "@erp/core/contracts";
import { correctionOperation, json } from "./journal-rows.ts";
import type { Connection } from "./types.ts";

export function journalPageReader(db: Connection): Pick<JournalRepository, "journalPage"> {
  return {
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
  };
}
export function journalEntryReader(db: Connection): Pick<JournalRepository, "journalEntry"> {
  return {
    async journalEntry(company, id) {
      const rows = await db.query(
        "SELECT e.*,CASE WHEN e.import_run IS NOT NULL THEN 'LEGACY' ELSE json_extract(r.result,'$.module') END AS adapter_module FROM journal_entries e LEFT JOIN receipts r ON r.company_id=e.company_id AND r.idempotency_key=e.receipt_key WHERE e.company_id=? AND e.id=?",
        [company, id],
      );
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
        documentDate: row.document_date,
        taxDate: row.tax_date,
        module: row.adapter_module,
        memo: row.memo,
        kind: (
          await db.query(
            "SELECT 1 FROM period_closing_journals WHERE company_id=? AND journal_id=?",
            [company, id],
          )
        ).length
          ? "closing"
          : row.kind,
        operation: row.operation,
        role: row.role,
        postedAt: row.posted_at,
        fingerprint: row.fingerprint,
        lines,
        debit: Number(lines.reduce((sum, line) => sum + BigInt(line.debit), 0n)),
        credit: Number(lines.reduce((sum, line) => sum + BigInt(line.credit), 0n)),
      });
    },
  };
}
export function journalChainReader(db: Connection): Pick<JournalRepository, "journalChain"> {
  return {
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
  };
}

import { StorageError, type JournalRepository } from "@erp/core/application";
import { journalDraftSchema } from "@erp/core/contracts";
import { journalDates } from "@erp/core/domain";
import { json } from "./journal-rows.ts";
import type { Connection } from "./types.ts";

export function journalDraftStore(
  db: Connection,
): Pick<JournalRepository, "journalDraft" | "saveJournalDraft" | "deleteJournalDraft"> {
  return {
    async journalDraft(company, id) {
      const rows = await db.query("SELECT data FROM journal_drafts WHERE company_id=? AND id=?", [
        company,
        id,
      ]);
      if (!rows[0]) return null;
      const draft = journalDraftSchema.parse(json(rows[0].data));
      return { ...draft, ...journalDates(draft) };
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
  };
}

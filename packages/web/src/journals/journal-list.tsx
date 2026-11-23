import type { JournalPageDto } from "@erp/core/contracts";
import type { T as Translate } from "./dialogs.tsx";
import { VirtualRows } from "./virtual-rows.tsx";
import { openListRow, startNewDraft, type JournalContext } from "./journal-commands.ts";
import type { JournalLookups } from "./use-journal-lookups.ts";

type ListProps = { journal: JournalContext; listing: JournalLookups["listing"]; t: Translate };
type ListRow = JournalPageDto["items"][number];

export function JournalToolbar({ journal, listing, t }: ListProps) {
  const { draft, busy, status } = journal;
  return (
    <div className="toolbar-row">
      <button
        type="button"
        className={`btn ${draft ? "btn-secondary" : "btn-primary"}`}
        disabled={Boolean(draft) || busy}
        onClick={() => startNewDraft(journal)}
      >
        {t("journal.new")}
      </button>
      <label className="jv-status">
        {t("journal.title")}{" "}
        <select
          className="jv-select"
          aria-label={t("journal.title")}
          disabled={busy}
          value={status}
          onChange={(event) =>
            journal.setStatus(event.target.value === "draft" ? "draft" : "posted")
          }
        >
          <option value="draft">{t("journal.drafts")}</option>
          <option value="posted">{t("journal.posted")}</option>
        </select>
      </label>
      <button
        type="button"
        className="btn btn-subtle"
        disabled={busy}
        onClick={() => void listing.refetch()}
      >
        {t("journal.refresh")}
      </button>
    </div>
  );
}
function listRowCells(row: ListRow, journal: JournalContext, t: Translate) {
  const action = t(row.revision === null ? "journal.view" : "journal.edit");
  return (
    <>
      <td>{row.date}</td>
      <td>{row.sourceRef}</td>
      <td>{row.memo}</td>
      <td>
        {/* The source reference is already in its own column and can be 100 chars; keep it only in the accessible name. */}
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          aria-label={`${action} ${row.sourceRef || row.id}`}
          disabled={journal.busy || Boolean(journal.draft)}
          onClick={() => void openListRow(journal, row)}
        >
          {action}
        </button>
      </td>
    </>
  );
}
export function JournalList({ journal, listing, t }: ListProps) {
  const rows = listing.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="card jv-list">
      <VirtualRows
        items={rows}
        title={t("journal.title")}
        header={[
          t("journal.date"),
          t("journal.sourceRef"),
          t("journal.memo"),
          t("journal.actions"),
        ]}
        render={(row) => listRowCells(row, journal, t)}
      />
      {!listing.isPending && !listing.isError && !rows.length && (
        <p className="empty-state">{t("journal.empty")}</p>
      )}
    </div>
  );
}

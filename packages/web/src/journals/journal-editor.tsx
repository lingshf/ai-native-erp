import type { AccountDto, JournalDraftDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { FastTab, MessageBar } from "../ui/components/index.tsx";
import { DimensionFields } from "./dialogs.tsx";
import type { T as Translate } from "./dialogs.tsx";
import { lineTotals, MEMO_MAX_LENGTH, SOURCE_REF_MAX_LENGTH } from "./journal-draft.ts";
import {
  change,
  edit,
  preview,
  reloadDraft,
  requestDelete,
  saveDraft,
  type JournalContext,
} from "./journal-commands.ts";
import { JournalLinesTab, LookupError } from "./journal-lines.tsx";
import type { JournalLookups } from "./use-journal-lookups.ts";

type DraftProps = { journal: JournalContext; draft: JournalDraftDto; t: Translate };
type EditorProps = DraftProps & Omit<JournalLookups, "listing"> & { language: Language };
const DOCUMENT_DATE_FIELDS = ["documentDate", "taxDate"] as const;

function dimensionKeysOf(dimensions: JournalLookups["dimensions"], draft: JournalDraftDto) {
  return [
    ...new Set([
      ...(dimensions.data?.pages.flatMap((page) => page.items.map((item) => item.code)) ?? []),
      ...Object.keys(draft.headerDimensions),
      ...draft.lines.flatMap((line) => Object.keys(line.dimensions)),
    ]),
  ];
}
export function JournalEditor({ journal, draft, accounts, dimensions, language, t }: EditorProps) {
  const { busy, plan, deleting } = journal;
  const accountItems: readonly AccountDto[] =
    accounts.data?.pages.flatMap((page) => page.items) ?? [];
  const dimensionKeys = dimensionKeysOf(dimensions, draft);
  const totals = lineTotals(draft.lines, journal.company.scale, language);
  const operation = draft.operation === "journal" ? "editor" : draft.operation;
  return (
    <form
      className="jv-editor"
      ref={journal.form}
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          if (!plan && !busy) void preview(journal);
        }
      }}
    >
      <fieldset disabled={busy || Boolean(plan) || deleting}>
        <legend className="jv-legend">{t(`journal.${operation}`)}</legend>
        {draft.originalId && (
          <MessageBar tone="info">
            {t("journal.original")}: {draft.originalId} — {t("journal.correctionDate")}
          </MessageBar>
        )}
        <FastTab
          id="journal-general"
          title={t("journal.tabGeneral")}
          summary={[draft.sourceRef, draft.date].filter(Boolean).join(" · ")}
        >
          <JournalGeneralFields journal={journal} draft={draft} t={t} />
          {draft.operation !== "reverse" && (
            <HeaderDimensions
              journal={journal}
              draft={draft}
              dimensions={dimensions}
              dimensionKeys={dimensionKeys}
              t={t}
            />
          )}
        </FastTab>
        {draft.operation !== "reverse" && (
          <JournalLinesTab
            journal={journal}
            draft={draft}
            accounts={accounts}
            accountItems={accountItems}
            dimensionKeys={dimensionKeys}
            totals={totals}
            t={t}
          />
        )}
        <JournalEditorActions journal={journal} draft={draft} t={t} />
      </fieldset>
    </form>
  );
}
function JournalGeneralFields({ journal, draft, t }: DraftProps) {
  return (
    <div className="ui-form-grid">
      <label className="ui-field">
        <span className="label">{t("journal.sourceRef")}</span>
        <input
          value={draft.sourceRef}
          maxLength={SOURCE_REF_MAX_LENGTH}
          onChange={(event) => change(journal, { sourceRef: event.target.value })}
        />
      </label>
      <label className="ui-field">
        <span className="label">{t("journal.date")}</span>
        <input
          type="date"
          value={draft.date}
          onChange={(event) => change(journal, { date: event.target.value })}
        />
      </label>
      <label className="ui-field ui-span-2">
        <span className="label">{t("journal.memo")}</span>
        <input
          value={draft.memo}
          maxLength={MEMO_MAX_LENGTH}
          onChange={(event) => change(journal, { memo: event.target.value })}
        />
      </label>
      {DOCUMENT_DATE_FIELDS.map((field) => (
        <label key={field} className="ui-field">
          <span className="label">{t(`journal.${field}`)}</span>
          <input
            type="date"
            value={draft[field] ?? ""}
            onChange={(event) => change(journal, { [field]: event.target.value || undefined })}
          />
        </label>
      ))}
      <label className="ui-field">
        <span className="label">{t("journal.kind")}</span>
        <select
          disabled={draft.operation === "reverse" || draft.operation === "reclassify"}
          value={draft.kind}
          onChange={(event) =>
            change(journal, { kind: event.target.value === "adjusting" ? "adjusting" : "normal" })
          }
        >
          <option value="normal">{t("journal.normal")}</option>
          <option value="adjusting">{t("journal.adjusting")}</option>
        </select>
      </label>
    </div>
  );
}
function HeaderDimensions({
  journal,
  draft,
  dimensions,
  dimensionKeys,
  t,
}: DraftProps & { dimensions: JournalLookups["dimensions"]; dimensionKeys: string[] }) {
  return (
    <>
      <p className="jv-hint">{t("journal.dimensionHelp")}</p>
      <DimensionFields
        keys={dimensionKeys}
        value={draft.headerDimensions}
        title={t("journal.header")}
        change={(value) => change(journal, { headerDimensions: value })}
      />
      {dimensions.isError && <LookupError retry={() => void dimensions.refetch()} t={t} />}
      {dimensions.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void dimensions.fetchNextPage()}
        >
          {t("master.loadMore")} {t("journal.dimensions")}
        </button>
      )}
    </>
  );
}
function JournalEditorActions({ journal, draft, t }: DraftProps) {
  return (
    <div className="ui-form-actions jv-actions">
      <button type="button" className="btn btn-secondary" onClick={() => void saveDraft(journal)}>
        {t("journal.save")}
      </button>
      <button type="button" className="btn btn-primary" onClick={() => void preview(journal)}>
        {t("journal.preview")}
      </button>
      {draft.revision > 0 && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={(event) => requestDelete(journal, event.currentTarget)}
        >
          {t("journal.delete")}
        </button>
      )}
      <button type="button" className="btn btn-subtle" onClick={() => edit(journal, null)}>
        {t("journal.cancel")}
      </button>
      {journal.error !== undefined && (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => edit(journal, { ...draft, id: crypto.randomUUID(), revision: 0 })}
          >
            {t("journal.copy")}
          </button>
          {draft.revision > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void reloadDraft(journal, draft)}
            >
              {t("journal.reload")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

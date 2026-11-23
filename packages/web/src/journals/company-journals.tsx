import { useQueryClient } from "@tanstack/react-query";
import type { CompanyDto } from "@erp/core/contracts";
import { label, type Language } from "../ui/index.ts";
import { AiPanel } from "../AiPanel.tsx";
import { MessageBar } from "../ui/components/index.tsx";
import { JournalError } from "./dialogs.tsx";
import type { T as Translate } from "./dialogs.tsx";
import { adoptDraft, type JournalContext } from "./journal-commands.ts";
import { DeleteDraftDialog, PostingConfirmDialog } from "./journal-confirm.tsx";
import { PostedJournalDetail, PostingReceipt, QueuedNotice } from "./journal-detail.tsx";
import { JournalEditor } from "./journal-editor.tsx";
import { JournalList, JournalToolbar } from "./journal-list.tsx";
import { useJournalDetail } from "./use-journal-detail.ts";
import { useJournalFocus } from "./use-journal-focus.ts";
import { useJournalLookups } from "./use-journal-lookups.ts";
import { useEditorRefs, useJournalState } from "./use-journal-state.ts";
type CompanyJournalsProps = {
  company: CompanyDto;
  initialEntryId: string | null;
  language: Language;
  teaching: boolean;
  lock: (value: boolean) => void;
};
export function CompanyJournals({
  company,
  initialEntryId,
  language,
  teaching,
  lock,
}: CompanyJournalsProps) {
  const t: Translate = (key) => label(language, key),
    client = useQueryClient();
  const state = useJournalState(initialEntryId);
  const refs = useEditorRefs();
  const detailRequest = useJournalDetail(company, initialEntryId, state);
  useJournalFocus({ ...state, ...refs });
  const { listing, accounts, dimensions } = useJournalLookups(company, state.status);
  const journal: JournalContext = { ...state, ...refs, ...detailRequest, company, client, lock };
  const { draft, plan, deleting, error, busy, notice, queued, receipt, detail } = state;
  return (
    <>
      <JournalToolbar journal={journal} listing={listing} t={t} />
      {listing.isPending && <p role="status">{t("master.loading")}</p>}
      {listing.isError && (
        <MessageBar tone="danger" role="alert">
          {t("journal.error")}
        </MessageBar>
      )}
      <JournalList journal={journal} listing={listing} t={t} />
      {listing.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary jv-more"
          disabled={listing.isFetchingNextPage}
          onClick={() => void listing.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      {error !== undefined && !plan && !deleting && (
        <JournalError error={error} t={t} uncertain={state.uncertain} />
      )}
      {busy && <p role="status">{t("journal.pending")}</p>}
      {notice && (
        <MessageBar tone="info" role="status">
          {t("journal.saved")}
        </MessageBar>
      )}
      {draft && (
        <JournalEditor
          journal={journal}
          draft={draft}
          accounts={accounts}
          dimensions={dimensions}
          language={language}
          t={t}
        />
      )}
      {draft?.operation === "journal" && !plan && !deleting && (
        <AiPanel
          key={`${draft.id}:${draft.date.slice(0, 7)}`}
          company={company.code}
          month={draft.date.slice(0, 7)}
          language={language}
          teaching={teaching}
          disabled={busy}
          adopt={(value) => adoptDraft(journal, value)}
        />
      )}
      {deleting && draft && <DeleteDraftDialog journal={journal} draft={draft} t={t} />}
      {plan && <PostingConfirmDialog journal={journal} plan={plan} language={language} t={t} />}
      {queued && <QueuedNotice company={company} queued={queued} t={t} />}
      {receipt && <PostingReceipt journal={journal} receipt={receipt} t={t} />}
      {detail && (
        <PostedJournalDetail journal={journal} detail={detail} language={language} t={t} />
      )}
    </>
  );
}

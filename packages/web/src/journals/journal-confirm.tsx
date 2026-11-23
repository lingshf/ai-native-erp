import type { JournalDraftDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import { MessageBar } from "../ui/components/index.tsx";
import { Facts, JournalError, LinePlan, Modal } from "./dialogs.tsx";
import type { T as Translate } from "./dialogs.tsx";
import { confirm, deleteDraft, type JournalContext } from "./journal-commands.ts";
import type { PostingPlan } from "./use-journal-state.ts";

type PlanProps = { journal: JournalContext; plan: PostingPlan; language: Language; t: Translate };
type PlannedJournal = PostingPlan["plan"]["journals"][number];
const TOTAL_SIDES = ["debit", "credit"] as const;

export function DeleteDraftDialog({
  journal,
  draft,
  t,
}: {
  journal: JournalContext;
  draft: JournalDraftDto;
  t: Translate;
}) {
  const { busy, error, setDeleting } = journal;
  return (
    <Modal title={t("journal.deleteTitle")} busy={busy} close={() => setDeleting(false)}>
      <p>{draft.sourceRef || draft.id}</p>
      <div className="ui-form-actions">
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => void deleteDraft(journal, draft)}
        >
          {t("journal.deleteConfirm")}
        </button>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={busy}
          onClick={() => setDeleting(false)}
        >
          {t("journal.back")}
        </button>
      </div>
      {error !== undefined && <JournalError error={error} t={t} uncertain={false} />}
    </Modal>
  );
}
export function PostingConfirmDialog(props: PlanProps) {
  const { journal, plan, language, t } = props;
  const { busy, uncertain, error } = journal;
  return (
    <Modal
      title={t("journal.previewTitle")}
      busy={busy || uncertain}
      close={() => journal.setPlan(null)}
    >
      <Facts
        items={[
          [t("journal.sourceRef"), plan.plan.sourceRef],
          [t("journal.date"), plan.plan.date],
          [t("journal.currency"), plan.plan.currency],
          [t("journal.memo"), plan.plan.memo],
          [t("journal.documentDate"), plan.plan.documentDate],
          [t("journal.taxDate"), plan.plan.taxDate],
        ]}
      />
      <PlanTotals {...props} />
      {journal.dirty && (
        <MessageBar tone="info" role="status">
          {t("journal.unsaved")}
        </MessageBar>
      )}
      {plan.plan.journals.map((entry, index) => (
        <PlanJournalSection
          key={entry.role}
          entry={entry}
          index={index}
          journal={journal}
          language={language}
          t={t}
        />
      ))}
      {error !== undefined && <JournalError error={error} t={t} uncertain={uncertain} />}
      <PostingConfirmActions {...props} />
    </Modal>
  );
}
function PlanTotals({ journal, plan, language, t }: PlanProps) {
  return (
    <div className="kpis">
      {TOTAL_SIDES.map((side) => (
        <div key={side} className="kpi emphasis">
          <div className="label">{t(`journal.${side}`)}</div>
          <p className="value">
            {formatMinor(
              plan.plan.journals.reduce((sum, entry) => sum + entry[side], 0),
              language,
              journal.company.scale,
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
function plannedJournalRole(entry: PlannedJournal) {
  if (entry.role === "reversal") return "journal.historical";
  return entry.role === "reclassification" ? "journal.reclassify" : "journal.business";
}
function PlanJournalSection({
  entry,
  index,
  journal,
  language,
  t,
}: Omit<PlanProps, "plan"> & { entry: PlannedJournal; index: number }) {
  return (
    <section>
      <h4>
        {index + 1} · {t(plannedJournalRole(entry))}
      </h4>
      <LinePlan
        lines={entry.lines}
        company={journal.company}
        language={language}
        t={t}
        total={entry}
      />
    </section>
  );
}
function PostingConfirmActions({ journal, plan, t }: PlanProps) {
  const { busy, dirty, uncertain } = journal;
  return (
    <div className="ui-form-actions">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || dirty || (uncertain && plan.command !== "POST")}
        onClick={() => void confirm(journal, "POST")}
      >
        {t("journal.confirm")}
      </button>
      {journal.draft?.operation === "journal" && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || dirty || (uncertain && plan.command !== "QUEUE")}
          onClick={() => void confirm(journal, "QUEUE")}
        >
          {t("business.enqueue")}
        </button>
      )}
      <button
        type="button"
        className="btn btn-subtle"
        disabled={busy || uncertain}
        onClick={() => journal.setPlan(null)}
      >
        {t("journal.back")}
      </button>
    </div>
  );
}

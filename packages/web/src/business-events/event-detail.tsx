import type { BusinessResultDto, CompanyDto, JournalDetailDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { LinePlan } from "../journals/dialogs.tsx";
import { MessageBar } from "../ui/components/index.tsx";
import { BusinessPlan } from "./business-plan.tsx";
import { fresh, openJournal, openOriginal } from "./event-commands.ts";
import type { T } from "./types.ts";
import type { CompanyEventsState } from "./use-company-events.ts";
type DetailProps = {
  detail: BusinessResultDto;
  state: CompanyEventsState;
  t: T;
  language: Language;
};
export function EventDetail({ detail, state, t, language }: DetailProps) {
  const { company, entry, editing, busy } = state;
  return (
    <section className="card jv-detail">
      <header>
        <h3>
          {detail.event.sourceRef} · {t(`business.${detail.status}`)}
        </h3>
      </header>
      <div className="body">
        <MessageBar tone="info" role="status">
          {t("business.done")}
        </MessageBar>
        <p>
          {t("business.receipt")}: {detail.receipt.idempotencyKey} · {detail.receipt.postedAt} ·{" "}
          {detail.receipt.fingerprint}
        </p>
        <BusinessPlan preview={detail.preview} company={company} language={language} t={t} />
        {detail.queue?.plan && (
          <>
            <h4>{t("business.currentPlan")}</h4>
            {detail.queue.plan.journals.map((journal) => (
              <LinePlan
                key={journal.role}
                lines={journal.lines}
                company={company}
                language={language}
                t={t}
              />
            ))}
          </>
        )}
        {detail.event.operation === "cash_service.cancel" && (
          <p>
            {t("business.original")}:{" "}
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              disabled={editing || busy}
              onClick={() => openOriginal(state, detail.event)}
            >
              {detail.event.originalId}
            </button>
          </p>
        )}
        <DetailActions detail={detail} state={state} t={t} />
        {entry && <JournalEntry entry={entry} company={company} language={language} t={t} />}
      </div>
    </section>
  );
}
function DetailActions({ detail, state, t }: Omit<DetailProps, "language">) {
  const { editing, busy } = state;
  return (
    <div className="ui-form-actions">
      {detail.event.operation === "cash_service" && detail.status === "posted" && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={editing || busy}
          onClick={() => fresh(state, "cash_service", detail.event.id)}
        >
          {t("business.cash_service.cancel")}
        </button>
      )}
      {detail.journalIds.map((id) => (
        <button
          type="button"
          className="btn btn-secondary"
          key={id}
          disabled={editing || busy}
          onClick={() => void openJournal(state, id)}
        >
          {t("journal.view")} {id}
        </button>
      ))}
    </div>
  );
}
type EntryProps = { entry: JournalDetailDto; company: CompanyDto; language: Language; t: T };
function JournalEntry({ entry, company, language, t }: EntryProps) {
  return (
    <section className="jv-entry">
      <h4>
        {entry.entry.sourceRef} · {entry.entry.id}
      </h4>
      <LinePlan lines={entry.entry.lines} company={company} language={language} t={t} />
      <h4>{t("journal.chain")}</h4>
      {entry.chain.map((edge) => (
        <p key={edge.outputId}>
          {edge.date} · {edge.originalId} → {edge.outputId}
        </p>
      ))}
    </section>
  );
}

import { Link } from "react-router-dom";
import type {
  BusinessResultDto,
  CompanyDto,
  JournalDetailDto,
  JournalReceiptDto,
} from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { MessageBar } from "../ui/components/index.tsx";
import { LinePlan } from "./dialogs.tsx";
import type { T as Translate } from "./dialogs.tsx";
import {
  run,
  startCorrection,
  type CorrectionOperation,
  type JournalContext,
} from "./journal-commands.ts";

type DetailProps = {
  journal: JournalContext;
  detail: JournalDetailDto;
  language: Language;
  t: Translate;
};
const CORRECTIONS: readonly CorrectionOperation[] = ["reverse", "replace", "reclassify"];

export function QueuedNotice({
  company,
  queued,
  t,
}: {
  company: CompanyDto;
  queued: BusinessResultDto;
  t: Translate;
}) {
  return (
    <MessageBar tone="info">
      <span role="status">{t("business.enqueued")}</span>{" "}
      <Link
        to={`/events?company=${encodeURIComponent(company.code)}&id=${queued.event.id}&view=queue`}
      >
        {t("business.queue")}
      </Link>
    </MessageBar>
  );
}
export function PostingReceipt({
  journal,
  receipt,
  t,
}: {
  journal: JournalContext;
  receipt: JournalReceiptDto;
  t: Translate;
}) {
  return (
    <section className="card" aria-label={t("journal.posted")}>
      <div className="body">
        <MessageBar tone="info" role="status">
          {t("journal.postedNotice")}
        </MessageBar>
        <p>
          {receipt.sourceRef} · {receipt.postedAt}
        </p>
        <div className="ui-form-actions">
          {receipt.journalIds.map((id) => (
            <button
              type="button"
              className="btn btn-secondary"
              key={id}
              disabled={journal.busy || Boolean(journal.draft)}
              onClick={() => void run(journal, () => journal.loadDetail(id))}
            >
              {t("journal.view")} {id}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
export function PostedJournalDetail(props: DetailProps) {
  const { journal, detail, language, t } = props;
  return (
    <section className="card jv-detail">
      <header>
        <h3>
          {detail.entry.sourceRef} · {detail.entry.date}
        </h3>
      </header>
      <div className="body">
        <p>{detail.entry.memo}</p>
        {detail.entry.module && (
          <p>
            {t("journal.module")}: {detail.entry.module}
          </p>
        )}
        <p>
          {t("journal.documentDate")}: {detail.entry.documentDate} · {t("journal.taxDate")}:{" "}
          {detail.entry.taxDate}
        </p>
        <LinePlan lines={detail.entry.lines} company={journal.company} language={language} t={t} />
        <DetailActions {...props} />
        <h4>{t("journal.chain")}</h4>
        {detail.chain.map((edge) => (
          <p key={edge.outputId}>
            {edge.date} · {t(`journal.${edge.operation}`)} ·{" "}
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              disabled={journal.busy || Boolean(journal.draft)}
              onClick={() => void run(journal, () => journal.loadDetail(edge.outputId))}
            >
              {edge.outputId}
            </button>
          </p>
        ))}
      </div>
    </section>
  );
}
function DetailActions({ journal, detail, t }: DetailProps) {
  const { entry } = detail;
  const { code } = journal.company;
  return (
    <div className="ui-form-actions">
      {entry.kind === "closing" && (
        <Link
          to={`/period-close?${new URLSearchParams({ company: code, month: entry.date.slice(0, 7) })}`}
        >
          {t("close.title")}
        </Link>
      )}
      {detail.businessEventId && (
        <Link to={`/events?company=${encodeURIComponent(code)}&id=${detail.businessEventId}`}>
          {t("business.original")}
        </Link>
      )}
      {!detail.businessEventId &&
        !entry.module &&
        entry.kind !== "closing" &&
        entry.role !== "reversal" &&
        CORRECTIONS.filter(
          (action) => entry.role !== "reclassification" || action === "reverse",
        ).map((action) => (
          <button
            key={action}
            type="button"
            className="btn btn-secondary"
            disabled={journal.busy || Boolean(journal.draft)}
            onClick={() => startCorrection(journal, action)}
          >
            {t(`journal.${action}`)}
          </button>
        ))}
    </div>
  );
}

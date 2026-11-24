import type { PeriodDto } from "@erp/core/contracts";
import type { MasterDataFailure } from "../master-data-client.ts";
import { MessageBar } from "../ui/components/index.tsx";
import { LoadMoreButton } from "./load-more-button.tsx";
import { views, type T } from "./types.ts";

type Change = (fields: Record<string, string>) => void;

export function ReportFilterBar({
  months,
  month,
  ledger,
  conflict,
  hasMorePeriods,
  onLoadMorePeriods,
  view,
  stage,
  change,
  onRefresh,
  t,
}: {
  months: PeriodDto[];
  month: string | undefined;
  ledger: boolean;
  conflict: MasterDataFailure | null;
  hasMorePeriods: boolean;
  onLoadMorePeriods: () => void;
  view: string;
  stage: string;
  change: Change;
  onRefresh: () => void;
  t: T;
}) {
  return (
    <div className="filter-bar">
      <div className="field">
        <label htmlFor="ledger-month">{t("ledger.period")}</label>
        <select
          id="ledger-month"
          disabled={ledger && conflict !== null}
          value={month ?? ""}
          onChange={(event) => change({ month: event.target.value })}
        >
          {months.map((item) => (
            <option key={item.month}>{item.month}</option>
          ))}
        </select>
      </div>
      {hasMorePeriods && <LoadMoreButton onClick={onLoadMorePeriods} t={t} />}
      {!ledger && <ReportViewFields view={view} stage={stage} change={change} t={t} />}
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
          {t("ledger.refresh")}
        </button>
      </div>
    </div>
  );
}

function ReportViewFields({
  view,
  stage,
  change,
  t,
}: {
  view: string;
  stage: string;
  change: Change;
  t: T;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="ledger-view">{t("ledger.view")}</label>
        <select
          id="ledger-view"
          value={view}
          onChange={(event) => change({ view: event.target.value, group: "" })}
        >
          {views.map((item) => (
            <option key={item} value={item}>
              {t(`ledger.${item}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ledger-stage">{t("ledger.stage")}</label>
        <select
          id="ledger-stage"
          value={stage}
          onChange={(event) => change({ stage: event.target.value })}
        >
          {(["unadjusted", "adjusted", "postClosing"] as const).map((item) => (
            <option key={item} value={item}>
              {t(`ledger.${item}`)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export function InvalidReportAlert({ onReload, t }: { onReload: () => void; t: T }) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("ledger.invalid")}{" "}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onReload}>
        {t("reports.reload")}
      </button>
    </MessageBar>
  );
}

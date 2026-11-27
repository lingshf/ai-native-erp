import { Navigate, useLocation } from "react-router-dom";
import type { LegacyContextResponse, LegacyTrialStage } from "@erp/core/contracts";
import { TeachingTip } from "./ui/components/index.tsx";
import type { Preferences } from "./ui/index.ts";
import "./pages/ledger.css";
import { ReportFailure } from "./reports-data.ts";
import { InvalidSelection } from "./reports/invalid-selection.tsx";
import { Ledger } from "./reports/legacy-ledger.tsx";
import { LoadingStatus } from "./reports/loading-status.tsx";
import { Alert, Failure, failureLabel } from "./reports/report-failure.tsx";
import type { Translate } from "./reports/report-label.ts";
import { ReportPeriodHeader } from "./reports/report-period-header.tsx";
import { SnapshotUnconfigured } from "./reports/snapshot-unconfigured.tsx";
import { Trial } from "./reports/trial-report.tsx";
import { useReportSelection } from "./reports/use-report-selection.ts";

export function Reports({ preferences }: { preferences: Preferences }) {
  const selection = useReportSelection(preferences);
  const { t, language, context, source, periods, selectedSource, month, stage } = selection;
  const { invalid, setParams, trialRoute, ledgerRoute, reload, reloading } = selection;
  const reloadSnapshot = () => {
    void reload();
  };
  if (reloading || context.isPending) return <LoadingStatus t={t} />;
  if (
    context.isError &&
    context.error instanceof ReportFailure &&
    context.error.status === 503 &&
    failureLabel(context.error) === "reports.unavailable"
  )
    return <SnapshotUnconfigured t={t} refetch={() => void context.refetch()} />;
  if (context.isError)
    return (
      <Failure
        error={context.error}
        t={t}
        retry={() => {
          void context.refetch();
        }}
        reload={reloadSnapshot}
      />
    );
  if (!source) return null;
  const search = new URLSearchParams({
    source: source.snapshotSha256,
    month: month ?? "",
    stage,
  }).toString();
  const scope = { source, month: month ?? "" };
  const account = ledgerRoute?.params.account;
  return (
    <section className="page reports ledger-page">
      <ReportPeriodHeader
        t={t}
        periods={periods}
        source={source}
        stage={stage}
        setParams={setParams}
        value={invalid || !month ? "" : month}
        disabled={periods.length === 0 || selectedSource !== source.snapshotSha256}
      />
      <SnapshotIntro t={t} source={source} teaching={preferences.teaching} />
      {invalid ? (
        <InvalidSelection t={t} reload={reloadSnapshot} />
      ) : periods.length === 0 ? (
        <p className="empty-state">{t("reports.noPeriods")}</p>
      ) : trialRoute ? (
        <Trial
          key={`${source.snapshotSha256}:${month}`}
          scope={scope}
          stage={stage as LegacyTrialStage}
          t={t}
          language={language}
          search={search}
          onStage={(next) =>
            setParams({ source: source.snapshotSha256, month: month!, stage: next })
          }
          reload={reloadSnapshot}
        />
      ) : ledgerRoute && account && /^[1-9][0-9]{3}$/u.test(account) ? (
        <Ledger
          key={`${source.snapshotSha256}:${month}:${account}`}
          scope={{ ...scope, account }}
          t={t}
          language={language}
          search={search}
          reload={reloadSnapshot}
        />
      ) : (
        <Alert>{t("reports.routeMissing")}</Alert>
      )}
    </section>
  );
}

function SnapshotIntro({
  t,
  source,
  teaching,
}: {
  t: Translate;
  source: LegacyContextResponse["source"];
  teaching: boolean;
}) {
  return (
    <>
      <details className="snapshot-identity">
        <summary>{t("reports.source")}</summary>
        <code>{source.snapshotSha256}</code>
      </details>
      <p className="ledger-meta">{t("reports.sign")}</p>
      <TeachingTip teaching={teaching} title={t("reports.teachingTitle")}>
        {t("reports.teaching")}
      </TeachingTip>
    </>
  );
}

export function ReportIndex() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/reports/trial", search }} replace />;
}

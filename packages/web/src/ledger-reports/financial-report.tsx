import { useQuery } from "@tanstack/react-query";
import { reportSchema, type CompanyDto, type ReportDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import { formatMinor } from "../reports-data.ts";
import { ErrorBox } from "./error-box.tsx";
import { ReportKpis, reportKpis } from "./report-kpis.tsx";
import {
  AccountTable,
  GroupTable,
  isReportCategory,
  ReconciliationReport,
} from "./report-tables.tsx";
import type { T, View } from "./types.ts";

type ReportFilters = {
  company: CompanyDto;
  month: string;
  stage: string;
  view: View;
  group: string | null;
  search: URLSearchParams;
};

function useReport({ company, month, stage, view, group, search }: ReportFilters) {
  return useQuery({
    queryKey: [
      "ledger-live",
      company.code,
      month,
      stage,
      view,
      search.get("watermark"),
      search.get("accountRevision"),
      group,
    ],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const report = await masterRequest(`/api/v1/reports/${view}?${search}`, reportSchema, {
        signal,
      });
      if (
        search.has("watermark") &&
        (report.watermark !== Number(search.get("watermark")) ||
          report.accountRevision !== Number(search.get("accountRevision")))
      )
        throw new MasterDataFailure("invalid");
      return report;
    },
  });
}

function drilldownLinks(report: ReportDto, search: URLSearchParams) {
  const pinnedSearch = new URLSearchParams(search);
  pinnedSearch.set("watermark", String(report.watermark));
  pinnedSearch.set("accountRevision", String(report.accountRevision));
  const toLedger = (code: string, operating = false) => {
    const target = new URLSearchParams(pinnedSearch);
    if (operating && report.stage === "postClosing") target.set("stage", "adjusted");
    target.set("account", code);
    return `/ledger?${target}`;
  };
  return { pinnedSearch, toLedger };
}

export function FinancialReport({
  preferences,
  t,
  ...filters
}: ReportFilters & { preferences: Preferences; t: T }) {
  const { company, month, view, group, search } = filters;
  const query = useReport(filters);
  if (query.isPending || query.isFetching) return <p role="status">{t("master.loading")}</p>;
  if (query.isError)
    return <ErrorBox error={query.error} retry={() => void query.refetch()} t={t} />;
  const report = query.data,
    fmt = (n: number) => formatMinor(n, preferences.language, company.scale);
  const { pinnedSearch, toLedger } = drilldownLinks(report, search);
  const selected = report.trial.rows.filter(
    (row) => (!group || row.reportGroup === group) && isReportCategory(view, row.category),
  );
  const groupValue = (row: ReportDto["groups"][number]) =>
    view === "income" ? row.activity : row.closing;
  const incomeGroup =
    view === "income" ? report.groups.find((row) => row.reportGroup === group) : undefined;
  const kpis = reportKpis(view, report, t);
  const summary = `${month} · ${company.currency}`;
  const accountsTitle = t(view === "income" ? "ledger.incomeAccounts" : "ledger.trial");
  return (
    <section className="ledger-stack" aria-label={t(`ledger.${view}`)}>
      <p className="ledger-meta">
        {t("ledger.watermark")}: {report.watermark}
        {" · "}
        {t("ledger.accountRevision")}: {report.accountRevision}
      </p>
      {view === "reconciliation" ? (
        <ReconciliationReport
          checks={report.reconciliation.checks}
          summary={summary}
          fmt={fmt}
          t={t}
        />
      ) : (
        <>
          <ReportKpis kpis={kpis} fmt={fmt} />
          <GroupTable
            groups={report.groups}
            view={view}
            group={group}
            pinnedSearch={pinnedSearch}
            summary={summary}
            groupValue={groupValue}
            fmt={fmt}
            onReselect={() => void query.refetch()}
            t={t}
          />
          <AccountTable
            title={accountsTitle}
            incomeGroup={incomeGroup}
            rows={selected}
            view={view}
            toLedger={toLedger}
            fmt={fmt}
            t={t}
          />
        </>
      )}
    </section>
  );
}

import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { companiesPageSchema, type CompanyDto } from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { CompanySelect } from "./trade-reports/company-select.tsx";
import { ItemDetail } from "./trade-reports/item-detail.tsx";
import { OpenItemsView } from "./trade-reports/open-items-view.tsx";
import { ReconciliationView } from "./trade-reports/reconciliation-view.tsx";
import { ReportFilters } from "./trade-reports/report-filters.tsx";
import { ReportToolbar } from "./trade-reports/report-toolbar.tsx";
import type { T } from "./trade-reports/types.ts";
import { useCompanyReports } from "./trade-reports/use-company-reports.ts";
import "./pages/trade-reports.css";
export function TradeReports({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams();
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = rows.find((row) => row.code === (params.get("company") ?? rows[0]?.code));
  const header = (context?: ReactNode) => (
    <PageHeader title={t("trpt.title")} description={t("trpt.boundary")} context={context} />
  );
  return (
    <section className="page trade-reports">
      {company ? (
        <CompanyReports
          key={company.code}
          company={company}
          companies={rows}
          preferences={preferences}
          header={header}
          changeCompany={(code) => setParams({ company: code })}
          loadCompanies={companies.hasNextPage ? () => void companies.fetchNextPage() : undefined}
        />
      ) : (
        <>
          {header()}
          <TeachingTip teaching={preferences.teaching} title={t("trpt.teachingTitle")}>
            {t("trpt.teaching")}
          </TeachingTip>
        </>
      )}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void companies.refetch()}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {!companies.isPending && !company && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.invalid")}
        </MessageBar>
      )}
    </section>
  );
}
function CompanyReports({
  company,
  companies,
  preferences,
  header,
  changeCompany,
  loadCompanies,
}: {
  company: CompanyDto;
  companies: readonly CompanyDto[];
  preferences: Preferences;
  header: (context: ReactNode) => ReactNode;
  changeCompany: (company: string) => void;
  loadCompanies: (() => void) | undefined;
}) {
  const t: T = (key) => label(preferences.language, key);
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const state = useCompanyReports(company, t);
  const { dirty, view, valid, failure, refresh, page, reconciliation, totals, detail, id } = state;
  return (
    <>
      {header(
        <CompanySelect
          company={company}
          companies={companies}
          dirty={dirty}
          changeCompany={changeCompany}
          loadCompanies={loadCompanies}
          t={t}
        />,
      )}
      <TeachingTip teaching={preferences.teaching} title={t("trpt.teachingTitle")}>
        {t("trpt.teaching")}
      </TeachingTip>
      <ReportFilters state={state} t={t} />
      <ReportToolbar state={state} t={t} />
      {!valid && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}
        </MessageBar>
      )}
      {failure && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}{" "}
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {(view === "reconciliation" ? reconciliation.isFetching : page.isFetching) && (
        <p role="status">{t("master.loading")}</p>
      )}
      {valid && view !== "reconciliation" && !page.isError && totals && (
        <OpenItemsView state={state} totals={totals} company={company} t={t} money={money} />
      )}
      {valid && view === "reconciliation" && (
        <ReconciliationView state={state} company={company} t={t} money={money} />
      )}
      {detail.data && !detail.isError && id && (
        <ItemDetail detail={detail.data} preferences={preferences} company={company} />
      )}
    </>
  );
}

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { periodsPageSchema, type CompanyDto } from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import { masterRequest, type MasterDataFailure } from "../master-data-client.ts";
import { ErrorBox } from "./error-box.tsx";
import { InvalidReportAlert, ReportFilterBar } from "./report-filter-bar.tsx";
import { isValidReportParams, reportSearch } from "./report-params.ts";
import { ReportContent } from "./report-content.tsx";
import type { T } from "./types.ts";

function useLedgerPeriods(company: CompanyDto, params: URLSearchParams) {
  const periods = useInfiniteQuery({
    queryKey: ["ledger-periods", company.code],
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/periods?company=${encodeURIComponent(company.code)}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        periodsPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const months = periods.data?.pages.flatMap((page) => page.items) ?? [];
  const month = params.get("month") ?? months.at(-1)?.month;
  const requestedMonth = params.get("month");
  const previousMonth = useRef(requestedMonth);
  useEffect(() => {
    const changed = previousMonth.current !== requestedMonth;
    previousMonth.current = requestedMonth;
    if (changed && requestedMonth && !months.some((item) => item.month === requestedMonth))
      void periods.refetch();
  }, [requestedMonth, months, periods.refetch]);
  return { periods, months, month };
}

export function CompanyReports({
  company,
  preferences,
  conflict,
  setConflict,
}: {
  company: CompanyDto;
  preferences: Preferences;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
}) {
  const [params, setParams] = useSearchParams(),
    location = useLocation(),
    client = useQueryClient();
  const t: T = (key) => label(preferences.language, key);
  const { periods, months, month } = useLedgerPeriods(company, params);
  const view = params.get("view") ?? "trial",
    stage = params.get("stage") ?? "adjusted",
    account = params.get("account") ?? "1000";
  const valid = isValidReportParams({ params, months, month, view, stage, account });
  const search = reportSearch(company, month, stage, params);
  const change = (fields: Record<string, string>) =>
    setParams({
      ...Object.fromEntries(params),
      company: company.code,
      month: month ?? "",
      ...fields,
    });
  const ledger = location.pathname === "/ledger";
  const refresh = () => {
    setConflict(null);
    void client.resetQueries({ queryKey: ["ledger-live", company.code] });
    void client.invalidateQueries({ queryKey: ["ledger-periods", company.code] });
    const next = new URLSearchParams(params);
    next.delete("watermark");
    next.delete("accountRevision");
    setParams(next);
  };
  return (
    <>
      <ReportFilterBar
        months={months}
        month={month}
        ledger={ledger}
        conflict={conflict}
        hasMorePeriods={periods.hasNextPage}
        onLoadMorePeriods={() => void periods.fetchNextPage()}
        view={view}
        stage={stage}
        change={change}
        onRefresh={refresh}
        t={t}
      />
      {periods.isError && (
        <ErrorBox error={periods.error} retry={() => void periods.refetch()} t={t} />
      )}
      {!periods.isPending && !periods.isFetching && !valid && (
        <InvalidReportAlert onReload={() => setParams({ company: company.code })} t={t} />
      )}
      {valid && month && (
        <ReportContent
          ledger={ledger}
          params={params}
          search={search}
          company={company}
          month={month}
          account={account}
          stage={stage}
          view={view}
          preferences={preferences}
          conflict={conflict}
          setConflict={setConflict}
          t={t}
        />
      )}
    </>
  );
}

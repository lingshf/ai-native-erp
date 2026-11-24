import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  tradeReportSchema,
  tradeReconciliationSchema,
  tradeItemDetailSchema,
  type CompanyDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { OPEN_ITEMS_PAGE_SIZE, isValidReportQuery, reportScopes } from "./report-query.ts";
import type { T } from "./types.ts";
import { useReportFilters } from "./use-report-filters.ts";
export type CompanyReportsState = ReturnType<typeof useCompanyReports>;
export function useCompanyReports(company: CompanyDto, t: T) {
  const filters = useReportFilters(company, t);
  const { party, month, side, view, id } = filters;
  const valid = isValidReportQuery({ month, party, side, view });
  const { scope, filtered } = reportScopes(company.code, { month, party, side });
  const page = useInfiniteQuery({
    queryKey: ["tradeReport", company.code, month, side, party],
    enabled: valid && view !== "reconciliation",
    initialPageParam: { cursor: "", snapshot: "" },
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/reports/open-items?${filtered}&limit=${OPEN_ITEMS_PAGE_SIZE}${pageParam.cursor ? `&cursor=${pageParam.cursor}&snapshot=${pageParam.snapshot}` : ""}`,
        tradeReportSchema,
        { signal },
      ),
    getNextPageParam: (page) =>
      page.nextCursor ? { cursor: page.nextCursor, snapshot: page.snapshot } : undefined,
  });
  const reconciliation = useQuery({
    queryKey: ["tradeReconciliation", company.code, month],
    enabled: valid && view === "reconciliation",
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(`/api/v1/trade/reports/reconciliation?${scope}`, tradeReconciliationSchema, {
        signal,
      }),
  });
  const detail = useQuery({
    queryKey: ["tradeItemDetail", company.code, month, id],
    enabled: valid && !!id,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/reports/open-items/${encodeURIComponent(id ?? "")}?${scope}`,
        tradeItemDetailSchema,
        { signal },
      ),
  });
  const rows = page.data?.pages.flatMap((p) => p.items) ?? [],
    totals = page.data?.pages[0]?.totals;
  const failure =
    (view === "reconciliation" ? reconciliation.error : page.error) ?? (id ? detail.error : null);
  const refresh = () => {
    if (view === "reconciliation") void reconciliation.refetch();
    else void page.refetch();
    if (id) void detail.refetch();
  };
  return { ...filters, valid, page, reconciliation, detail, rows, totals, failure, refresh };
}

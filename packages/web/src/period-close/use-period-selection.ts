import { useCallback, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  periodsPageSchema,
  type CompanyDto,
  type PeriodDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";

function useCompanyPeriods(params: URLSearchParams) {
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
  const items = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = items.find((item) => item.code === (params.get("company") ?? items[0]?.code));
  const periods = useInfiniteQuery({
    queryKey: ["close-periods", company?.code],
    enabled: !!company,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/periods?company=${encodeURIComponent(company?.code ?? "")}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        periodsPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const months = periods.data?.pages.flatMap((page) => page.items) ?? [];
  const period = months.find(
    (item) =>
      item.month ===
      (params.get("month") ??
        months.find((row) => row.status === "open")?.month ??
        months.at(-1)?.month),
  );
  return { companies, items, company, periods, months, period };
}

export function usePeriodSelection() {
  const [params, setParams] = useSearchParams();
  const [locked, setLocked] = useState(false);
  const [admissionLocked, setAdmissionLocked] = useState(false);
  const [admissionSaved, setAdmissionSaved] = useState<{ company: string; month: string } | null>(
    null,
  );
  const [held, setHeld] = useState<{ company: CompanyDto; period: PeriodDto } | null>(null);
  const { companies, items, company, periods, months, period } = useCompanyPeriods(params);
  // While the wizard runs, hold the period it started on so a refetched list cannot swap it out.
  const lock = useCallback(
    (value: boolean) => {
      if (value && company && period) setHeld((current) => current ?? { company, period });
      if (!value) setHeld(null);
      setLocked(value);
    },
    [company, period],
  );
  const selectedCompany = held?.company ?? company,
    selectedPeriod = held?.period ?? period;
  const companyOptions =
    held && !items.some((item) => item.code === held.company.code)
      ? [held.company, ...items]
      : items;
  const periodOptions =
    held && !months.some((item) => item.month === held.period.month)
      ? [held.period, ...months]
      : months;
  const error = companies.error ?? periods.error;
  const selectionLocked = locked || admissionLocked;
  return {
    setParams,
    companies,
    company,
    periods,
    months,
    period,
    held,
    locked,
    admissionLocked,
    setAdmissionLocked,
    admissionSaved,
    setAdmissionSaved,
    lock,
    selectedCompany,
    selectedPeriod,
    companyOptions,
    periodOptions,
    error,
    selectionLocked,
  };
}

export type PeriodSelection = ReturnType<typeof usePeriodSelection>;

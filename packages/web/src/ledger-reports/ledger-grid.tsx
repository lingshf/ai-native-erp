import { useState, type FormEvent, type UIEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type SetURLSearchParams, useSearchParams } from "react-router-dom";
import { ledgerSchema, type CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import { formatMinor } from "../reports-data.ts";
import { MessageBar } from "../ui/components/index.tsx";
import { ErrorBox, SnapshotUnavailable } from "./error-box.tsx";
import { LedgerDetailTable, LedgerLoadMore, LedgerTotals } from "./ledger-detail.tsx";
import { LedgerFilterForm } from "./ledger-filter-form.tsx";
import { ledgerFilters, ledgerKey, useLedgerConflict } from "./ledger-query.ts";
import type { T } from "./types.ts";

function useLedgerPages(filters: URLSearchParams, conflict: MasterDataFailure | null) {
  return useInfiniteQuery({
    queryKey: ledgerKey(filters),
    enabled: conflict === null,
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: "",
    queryFn: async ({ pageParam, signal }) => {
      if (conflict) throw conflict;
      if (!filters.has("watermark") || !filters.has("accountRevision"))
        throw new MasterDataFailure("invalid");
      const page = await masterRequest(
        `/api/v1/ledger?${filters}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        ledgerSchema,
        { signal },
      );
      if (
        page.watermark !== Number(filters.get("watermark")) ||
        page.accountRevision !== Number(filters.get("accountRevision"))
      )
        throw new MasterDataFailure("invalid");
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

type LedgerGridProps = {
  company: CompanyDto;
  month: string;
  account: string;
  params: URLSearchParams;
  preferences: Preferences;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
  t: T;
};

type LedgerPages = ReturnType<typeof useLedgerPages>;
type FilterDraft = Pick<
  LedgerGridProps,
  "company" | "month" | "account" | "params" | "conflict"
> & {
  code: string;
  dimension: string;
  value: string;
  query: LedgerPages;
  setParams: SetURLSearchParams;
};

function submitFilters({
  company,
  month,
  account,
  params,
  conflict,
  code,
  dimension,
  value,
  query,
  setParams,
}: FilterDraft) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (conflict) return;
    if (
      code === account &&
      dimension === (params.get("dimension") ?? "") &&
      value === (params.get("value") ?? "")
    )
      void query.refetch();
    setParams({
      company: company.code,
      month,
      account: code,
      stage: params.get("stage") ?? "adjusted",
      watermark: params.get("watermark") ?? "",
      accountRevision: params.get("accountRevision") ?? "",
      ...(dimension ? { dimension, value } : {}),
    });
  };
}

function loadMoreOnScroll(query: LedgerPages, conflict: MasterDataFailure | null) {
  return (event: UIEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.scrollHeight - target.scrollTop - target.clientHeight < 600 &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.isError &&
      !conflict
    )
      void query.fetchNextPage({ cancelRefetch: false });
  };
}

export function LedgerGrid({
  company,
  month,
  account,
  params,
  preferences,
  conflict,
  setConflict,
  t,
}: LedgerGridProps) {
  const [, setParams] = useSearchParams();
  const [code, setCode] = useState(account),
    [dimension, setDimension] = useState(params.get("dimension") ?? ""),
    [value, setValue] = useState(params.get("value") ?? "");
  const filters = ledgerFilters(company.code, month, account, params);
  const query = useLedgerPages(filters, conflict);
  useLedgerConflict(query.error, setConflict);
  const data = conflict || query.isError || query.isRefetching ? undefined : query.data;
  const rows = data?.pages.flatMap((page) => page.items) ?? [],
    first = data?.pages[0],
    fmt = (n: number) => formatMinor(n, preferences.language, company.scale);
  const submit = submitFilters({
    company,
    month,
    account,
    params,
    conflict,
    code,
    dimension,
    value,
    query,
    setParams,
  });
  const onScroll = loadMoreOnScroll(query, conflict);
  const changeDimension = (next: string) => {
    setDimension(next);
    if (!next) setValue("");
  };
  return (
    <div className="ledger-stack">
      <LedgerFilterForm
        account={{ value: code, onChange: setCode }}
        dimension={{ value: dimension, onChange: changeDimension }}
        value={{ value, onChange: setValue }}
        locked={conflict !== null}
        onSubmit={submit}
        t={t}
      />
      <MessageBar tone="info">{t("ledger.snapshot")}</MessageBar>
      {!conflict && (query.isPending || query.isRefetching) && (
        <p className="ledger-meta" role="status">
          {t("master.loading")}
        </p>
      )}
      {conflict && <SnapshotUnavailable t={t} />}
      {!conflict && query.isError && (
        <ErrorBox
          error={query.error}
          retry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
          t={t}
        />
      )}
      {first && <LedgerTotals first={first} fmt={fmt} t={t} />}
      {first && !rows.length && <p className="empty-state">{t("ledger.empty")}</p>}
      <LedgerDetailTable
        companyCode={company.code}
        rows={rows}
        onScrollCapture={onScroll}
        fmt={fmt}
        t={t}
      />
      {query.hasNextPage && !query.isError && !conflict && (
        <LedgerLoadMore
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          t={t}
        />
      )}
    </div>
  );
}

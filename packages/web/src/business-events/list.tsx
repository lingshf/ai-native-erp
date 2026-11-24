import type { ReactNode } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { ContractSchema } from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { BusinessError } from "./business-error.tsx";
import type { T } from "./types.ts";
export const companyQuery = (company: string) => `company=${encodeURIComponent(company)}`;
export const pageKey = (company: string, path: string, query = "") =>
  ["business", company, path, query] as const;
export function usePage<T>(
  path: string,
  company: string,
  schema: ContractSchema<{ items: T[]; nextCursor: string | null }>,
  query = "",
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: pageKey(company, path, query),
    enabled,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/${path}?${companyQuery(company)}&limit=100${query}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        schema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
type Listing<T> = {
  data?: { pages: { items: T[] }[] };
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
};
export function PageControls({ page, t }: { page: Listing<unknown>; t: T }) {
  return (
    <>
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && (
        <>
          <BusinessError error={page.error} t={t} />
          <button type="button" className="btn btn-secondary" onClick={() => void page.refetch()}>
            {t("master.retry")}
          </button>
        </>
      )}
      {page.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page.isFetchingNextPage}
          onClick={() => void page.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
    </>
  );
}
// TLIST-05: re-reads only the first page of this list; stays enabled while an editor is open.
function ListRefresh({ queryKey, t }: { queryKey: readonly unknown[]; t: T }) {
  const client = useQueryClient();
  return (
    <div className="toolbar-row">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => void client.resetQueries({ queryKey, exact: true })}
      >
        {t("master.listRefresh")}
      </button>
    </div>
  );
}
export function PageTable<Item>({
  page,
  title,
  header,
  render,
  t,
  className,
  refreshKey,
}: {
  page: Listing<Item>;
  title: string;
  header: readonly string[];
  render: (item: Item, index: number) => ReactNode;
  t: T;
  className?: string;
  refreshKey?: readonly unknown[];
}) {
  const items = page.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      {refreshKey && <ListRefresh queryKey={refreshKey} t={t} />}
      <div className="card">
        <VirtualRows
          items={items}
          title={title}
          header={header}
          render={render}
          className={className}
        />
        {!page.isPending && !page.isError && !items.length && (
          <p className="empty-state">{t("business.empty")}</p>
        )}
      </div>
      <PageControls page={page} t={t} />
    </>
  );
}

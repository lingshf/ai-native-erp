import { useRef } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { LegacyLedgerResponse } from "@erp/core/contracts";
import { parseLedgerPage, readReport, type ReportScope } from "../reports-data.ts";

const pageLimit = "100";

export function useLedgerPages(scope: ReportScope & { account: string }) {
  const client = useQueryClient();
  const lock = useRef(false);
  const key = [
    "legacy",
    "ledger",
    scope.source.snapshotSha256,
    scope.month,
    scope.account,
    pageLimit,
  ] as const;
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const cached =
        client.getQueryData<InfiniteData<LegacyLedgerResponse, string | undefined>>(key)?.pages ??
        [];
      const priorIndex = cached.findIndex((page) => page.nextCursor === pageParam);
      const previous = pageParam === undefined ? [] : cached.slice(0, priorIndex + 1);
      const params = new URLSearchParams({
        snapshot: scope.source.snapshotSha256,
        month: scope.month,
        account: scope.account,
        limit: pageLimit,
      });
      if (pageParam !== undefined) params.set("cursor", pageParam);
      return readReport(`/api/v1/legacy/ledger?${params}`, signal, (body) =>
        parseLedgerPage(body, scope, previous, pageParam),
      );
    },
    getNextPageParam: (last: LegacyLedgerResponse) => last.nextCursor,
  });
  async function more() {
    if (lock.current || query.isFetching || !query.hasNextPage) return;
    lock.current = true;
    try {
      await query.fetchNextPage({ cancelRefetch: false });
    } finally {
      lock.current = false;
    }
  }
  return { query, more };
}

export type LedgerPagesQuery = ReturnType<typeof useLedgerPages>["query"];

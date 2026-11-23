import { useInfiniteQuery } from "@tanstack/react-query";
import {
  accountsPageSchema,
  dimensionPageSchema,
  journalPageSchema,
  type CompanyDto,
  type ContractSchema,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { companyParam, LOOKUP_PAGE_SIZE } from "./journal-draft.ts";
import type { JournalStatus } from "./use-journal-state.ts";

/** Infinite-query options for a cursor-paged list; `path` already carries its query string. */
function cursorPagedQuery<Page extends { nextCursor: string | null }>(
  queryKey: readonly unknown[],
  path: string,
  schema: ContractSchema<Page>,
) {
  return {
    queryKey,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }: { pageParam: string; signal: AbortSignal }) =>
      masterRequest(
        `${path}&limit=${LOOKUP_PAGE_SIZE}${pageParam ? `&cursor=${pageParam}` : ""}`,
        schema,
        { signal },
      ),
    getNextPageParam: (page: Page) => page.nextCursor ?? undefined,
  };
}

export function useJournalLookups(company: CompanyDto, status: JournalStatus) {
  const listing = useInfiniteQuery(
    cursorPagedQuery(
      ["journals", company.code, status],
      `/api/v1/journals?${companyParam(company.code)}&status=${status}`,
      journalPageSchema,
    ),
  );
  const accounts = useInfiniteQuery(
    cursorPagedQuery(
      ["journal-accounts", company.code],
      `/api/v1/accounts?${companyParam(company.code)}`,
      accountsPageSchema,
    ),
  );
  const dimensions = useInfiniteQuery(
    cursorPagedQuery(
      ["journal-dimensions", company.code],
      `/api/v1/dimensions?${companyParam(company.code)}&kind=dimension`,
      dimensionPageSchema,
    ),
  );
  return { listing, accounts, dimensions };
}
export type JournalLookups = ReturnType<typeof useJournalLookups>;

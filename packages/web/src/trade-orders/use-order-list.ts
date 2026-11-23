import { useState, type FormEvent } from "react";
import { type QueryClient, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  tradeOrderCommandSchema,
  tradeOrderPageSchema,
  type CompanyDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import {
  noOrderFilter,
  orderFilterKeys,
  readOrderFilter,
  type OrderFilter,
} from "../trade-order-link.ts";

type FilterState = { key: string; draft: OrderFilter; invalid: "party" | "range" | null };
export type OrderFilters = ReturnType<typeof useOrderFilters>;
const orderListKey = (company: string, filter: OrderFilter) =>
  ["trade-orders", company, filter] as const;
// K7b: a list shown afresh (apply, clear, company switch) reloads one first page, never pages
// still cached from an earlier visit (the client keeps them for the whole session).
export const restartOrderList = (client: QueryClient, company: string, filter: OrderFilter) =>
  void client.resetQueries({ queryKey: orderListKey(company, filter), exact: true });

/**
 * TORD-07: the applied filters are the address's; the bar's inputs keep unapplied edits and reset
 * whenever the applied filters change. Apply and Clear restart the list, then write the address.
 */
export function useOrderFilters(
  params: URLSearchParams,
  company: string,
  onFilter: (filter: OrderFilter) => void,
) {
  const client = useQueryClient();
  const { applied, broken } = readOrderFilter(params, company);
  const key = JSON.stringify(applied);
  const fresh = (): FilterState => ({ key, draft: applied, invalid: null });
  const [state, setState] = useState(fresh);
  const current = state.key === key ? state : fresh();
  if (current !== state) setState(current);
  const { draft, invalid } = current;
  const show = (next: OrderFilter) => {
    restartOrderList(client, company, next);
    setState({ key: JSON.stringify(next), draft: next, invalid: null });
    onFilter(next);
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const next = { ...draft, party: draft.party.trim() };
    if (next.party && !tradeOrderCommandSchema.shape.party.safeParse(next.party).success)
      setState({ ...current, invalid: "party" });
    else if (next.from && next.to && next.from > next.to)
      setState({ ...current, invalid: "range" });
    else show(next);
  };
  const clear = () => show(noOrderFilter);
  // TLIST-01: re-read the applied filters' first page; the bar's unapplied inputs stay as they are.
  const refresh = () => restartOrderList(client, company, applied);
  const edit = (patch: Partial<OrderFilter>) =>
    setState({ ...current, draft: { ...draft, ...patch }, invalid: null });
  return { applied, broken, draft, invalid, apply, clear, refresh, edit };
}

/** The applied filters' order pages (100 rows each) and their rows flattened in load order. */
export function useOrderRows(company: CompanyDto, applied: OrderFilter) {
  const page = useInfiniteQuery({
    queryKey: orderListKey(company.code, applied),
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) => {
      // Load more keeps the applied filters (TORD-05); an unfiltered URL is unchanged from TORD-03.
      const params = new URLSearchParams({ company: company.code, limit: "100" });
      if (pageParam) params.set("cursor", pageParam);
      for (const key of orderFilterKeys) if (applied[key]) params.set(key, applied[key]);
      return masterRequest(`/api/v1/trade/orders?${params}`, tradeOrderPageSchema, { signal });
    },
    getNextPageParam: (value) => value.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((value) => value.items) ?? [];
  return { page, rows };
}

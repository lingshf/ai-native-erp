import { useState, type FormEvent } from "react";
import { type QueryClient, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  tradeOrderCommandSchema,
  tradeOrderInvoicingStatusSchema,
  tradeOrderPageSchema,
  type CompanyDto,
} from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import { masterRequest } from "../master-data-client.ts";
import {
  noOrderFilter,
  orderFilterKeys,
  readOrderFilter,
  type OrderFilter,
} from "../trade-order-link.ts";
import { Badge, FastTab, MessageBar } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";
const invoicingValues = tradeOrderInvoicingStatusSchema.options;
type Invoicing = (typeof invoicingValues)[number];
const invoicingTone = { none: "warning", partial: "info", full: "success" } as const;
type FilterState = { key: string; draft: OrderFilter; invalid: "party" | "range" | null };
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
function useOrderFilters(
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

export function OrderList({
  company,
  language,
  money,
  t,
  params,
  onFilter,
  onOpen,
}: {
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
  params: URLSearchParams;
  onFilter: (filter: OrderFilter) => void;
  onOpen: (orderId: string) => void;
}) {
  const { applied, broken, draft, invalid, apply, clear, refresh, edit } = useOrderFilters(
    params,
    company.code,
    onFilter,
  );
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
  const filtered = orderFilterKeys.some((key) => applied[key]);
  const described = (kind: "party" | "range") =>
    invalid === kind
      ? { "aria-invalid": true as const, "aria-describedby": `tord-filter-${kind}-error` }
      : {};
  return (
    <FastTab id="tord-list" title={t("tord.list")}>
      {broken && (
        <MessageBar tone="warning" role="status">
          <p>{t("tord.filterLinkInvalid")}</p>
          <button type="button" className="btn btn-secondary" onClick={clear}>
            {t("tord.filterClear")}
          </button>
        </MessageBar>
      )}
      <form
        className="filter-bar tord-filter"
        aria-label={t("tord.filter")}
        noValidate
        onSubmit={apply}
      >
        <div className="field">
          <label htmlFor="tord-filter-party">{t("tord.filterParty")}</label>
          <input
            id="tord-filter-party"
            maxLength={60}
            autoComplete="off"
            value={draft.party}
            onChange={(event) => edit({ party: event.target.value })}
            {...described("party")}
          />
          {invalid === "party" && (
            <p className="ui-error-text" id="tord-filter-party-error">
              {t("tord.issue.shape")}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="tord-filter-side">{t("tord.filterSide")}</label>
          <select
            id="tord-filter-side"
            value={draft.side}
            onChange={(event) => edit({ side: event.target.value as OrderFilter["side"] })}
          >
            <option value="">{t("tord.filterAll")}</option>
            <option value="AP">{t("tord.filterAP")}</option>
            <option value="AR">{t("tord.filterAR")}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tord-filter-invoicing">{t("tord.invoicing")}</label>
          <select
            id="tord-filter-invoicing"
            value={draft.invoicing}
            onChange={(event) =>
              edit({ invoicing: event.target.value as OrderFilter["invoicing"] })
            }
          >
            <option value="">{t("tord.filterAll")}</option>
            {invoicingValues.map((value) => (
              <option key={value} value={value}>
                {t(`tord.invoicing.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tord-filter-from">{t("tord.filterFrom")}</label>
          <input
            id="tord-filter-from"
            type="date"
            value={draft.from}
            onChange={(event) => edit({ from: event.target.value })}
            {...described("range")}
          />
        </div>
        <div className="field">
          <label htmlFor="tord-filter-to">{t("tord.filterTo")}</label>
          <input
            id="tord-filter-to"
            type="date"
            value={draft.to}
            onChange={(event) => edit({ to: event.target.value })}
            {...described("range")}
          />
          {invalid === "range" && (
            <p className="ui-error-text" id="tord-filter-range-error">
              {t("tord.filterRange")}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-secondary">
            {t("tord.filterApply")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={clear}>
            {t("tord.filterClear")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            {t("tord.listRefresh")}
          </button>
        </div>
      </form>
      {page.isPending && <p role="status">{label(language, "master.loading")}</p>}
      {page.isError && (
        <MessageBar tone="danger" role="alert">
          <p>{label(language, "master.error")}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void page.refetch()}>
            {label(language, "master.retry")}
          </button>
        </MessageBar>
      )}
      {page.isSuccess && rows.length === 0 && (
        <p className="empty-state">{t(filtered ? "tord.listNoMatch" : "tord.listEmpty")}</p>
      )}
      {rows.length > 0 && (
        <div className="grid-wrap">
          <table className="grid tord-list" aria-label={t("tord.list")}>
            <thead>
              <tr>
                <th scope="col">{t("tord.orderId")}</th>
                <th scope="col">{t("tord.side")}</th>
                <th scope="col">{t("tord.party")}</th>
                <th scope="col">{t("tord.orderDate")}</th>
                <th scope="col">{t("tord.currency")}</th>
                <th scope="col" className="num">
                  {t("tord.lineCountColumn")}
                </th>
                <th scope="col" className="num">
                  {t("tord.gross")}
                </th>
                <th scope="col">{t("tord.invoicing")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.orderId}>
                  <td>
                    <button type="button" className="cell-link" onClick={() => onOpen(row.orderId)}>
                      {row.orderId}
                    </button>
                  </td>
                  <td>{label(language, `trade.${row.side}`)}</td>
                  <td>{row.party}</td>
                  <td>{row.orderDate}</td>
                  <td>{row.currency}</td>
                  <td className="num">{row.lineCount}</td>
                  <td className="num">{money(row.gross)}</td>
                  <td className="tord-invoicing">
                    <Badge tone={invoicingTone[row.invoicing]}>
                      {t(`tord.invoicing.${row.invoicing satisfies Invoicing}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page.hasNextPage && (
        <div className="ui-form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page.isFetchingNextPage}
            onClick={() => void page.fetchNextPage()}
          >
            {label(language, "master.loadMore")}
          </button>
        </div>
      )}
    </FastTab>
  );
}

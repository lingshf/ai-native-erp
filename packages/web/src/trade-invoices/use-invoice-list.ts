import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { type QueryClient, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  companyCodeSchema,
  tradeInvoicePageSchema,
  type CompanyDto,
  type TradeInvoicePageDto,
} from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import {
  invoiceFilterKeys,
  linkFilter,
  noInvoiceFilter,
  type InvoiceFilter,
  type InvoiceFilterState,
  type LinkChange,
} from "./invoice-link.ts";

export type InvoiceRowDto = TradeInvoicePageDto["items"][number];
type WriteLink = (change: LinkChange) => void;
type ScrollRef = RefObject<HTMLElement | null>;

/** Above this many loaded rows the table renders only the rows in view. */
const VIRTUAL_ROW_THRESHOLD = 100;
/** Row height in px: the virtualizer's estimate and every rendered row's height. */
export const INVOICE_ROW_HEIGHT = 44;
/** Rows rendered beyond each edge of the view while virtualized. */
const VIRTUAL_OVERSCAN = 5;

const invoiceListKey = (company: string, filter: InvoiceFilter) =>
  ["trade-invoices", company, filter] as const;
// Apply, Clear and Refresh list always reload from the first page, never from cached pages.
const restartInvoiceList = (client: QueryClient, company: string, filter: InvoiceFilter) =>
  void client.resetQueries({ queryKey: invoiceListKey(company, filter), exact: true });

export function useInvoiceFilters(company: CompanyDto, params: URLSearchParams, write: WriteLink) {
  const client = useQueryClient();
  // TINV-07: applied filters are read from the address and written with replace (no history entry,
  // no leave confirmation, see TradeInvoices); the inputs' unapplied values stay in this state and
  // reset whenever the applied filters or the company change.
  const { applied, broken } = linkFilter(params, company.code);
  const key = `${company.code}|${JSON.stringify(applied)}`;
  const fresh = (): InvoiceFilterState => ({ key, draft: applied, invalid: null });
  const [filter, setFilter] = useState(fresh);
  const current = filter.key === key ? filter : fresh();
  if (current !== filter) setFilter(current);
  const { draft, invalid } = current;
  const filtered = invoiceFilterKeys.some((key) => applied[key]);
  const show = (next: InvoiceFilter) => {
    restartInvoiceList(client, company.code, next);
    setFilter({ key: `${company.code}|${JSON.stringify(next)}`, draft: next, invalid: null });
    write(Object.fromEntries(invoiceFilterKeys.map((name) => [name, next[name] || null])));
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const next = { ...draft, party: draft.party.trim() };
    if (next.party && !companyCodeSchema.safeParse(next.party).success)
      setFilter({ ...current, invalid: "party" });
    else if (next.from && next.to && next.from > next.to)
      setFilter({ ...current, invalid: "range" });
    else show(next);
  };
  const clear = () => show(noInvoiceFilter);
  const refresh = () => restartInvoiceList(client, company.code, applied);
  const edit = (patch: Partial<InvoiceFilter>) =>
    setFilter({ ...current, draft: { ...draft, ...patch }, invalid: null });
  return { applied, broken, filtered, draft, invalid, apply, clear, refresh, edit };
}

export type InvoiceFilters = ReturnType<typeof useInvoiceFilters>;

export function useInvoicePages(company: CompanyDto, applied: InvoiceFilter) {
  const page = useInfiniteQuery({
    queryKey: invoiceListKey(company.code, applied),
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) => {
      // Load more keeps the applied filters; the unfiltered URL is unchanged from TINV-04.
      const filters = invoiceFilterKeys
        .filter((key) => applied[key])
        .map((key) => `&${key}=${encodeURIComponent(applied[key])}`)
        .join("");
      return masterRequest(
        `/api/v1/trade/invoices?company=${encodeURIComponent(company.code)}&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}${filters}`,
        tradeInvoicePageSchema,
        { signal },
      );
    },
    getNextPageParam: (value) => value.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((value) => value.items) ?? [];
  return { page, rows };
}

/** Owns the list's scroll element: the virtualizer scrolls it and focus falls back to it. */
export function useDetailFocus(params: URLSearchParams, write: WriteLink) {
  const scroll = useRef<HTMLElement>(null);
  // TINV-06 / TINV-07: the open invoice is the address's `invoice`; opening and closing replace the
  // address (no history entry, no leave guard). A deep link may name an invoice that is not in the
  // loaded rows: its title then comes from the detail response.
  // Only an empty or blank value means "no invoice" (P5); any other value is passed on as it is and
  // checked against the server's id rule, so " <id> " is not trimmed into a valid id (P6).
  const raw = params.get("invoice");
  const invoice = raw?.trim() ? raw : null;
  const opened = useRef<{ documentId: string; externalNo: string } | null>(null);
  const closedId = useRef<string | null>(null);
  // Runs after the dialog's own cleanup has closed it: focus its trigger, or the list if the row
  // is no longer rendered (or never was, for a deep link).
  useEffect(() => {
    const id = closedId.current;
    if (invoice || id === null) return;
    closedId.current = null;
    // Compare attribute values rather than building a selector: the id may come from the address.
    const trigger = Array.from(
      scroll.current?.querySelectorAll<HTMLElement>("[data-document-id]") ?? [],
    ).find((node) => node.dataset.documentId === id);
    (trigger ?? scroll.current)?.focus();
  }, [invoice]);
  const openDetail = (row: InvoiceRowDto) => {
    opened.current = { documentId: row.documentId, externalNo: row.externalNo };
    write({ invoice: row.documentId });
  };
  const closeDetail = () => {
    closedId.current = invoice;
    write({ invoice: null });
  };
  return { scroll, invoice, opened, openDetail, closeDetail };
}

export function useInvoiceRows(rows: InvoiceRowDto[], scroll: ScrollRef) {
  const virtual = rows.length > VIRTUAL_ROW_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => INVOICE_ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });
  const measured = virtualizer.getVirtualItems();
  const visible = virtual
    ? measured.map((item) => ({ row: rows[item.index], index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  const before = virtual ? (measured[0]?.start ?? 0) : 0;
  const after = virtual ? virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0) : 0;
  return { visible, before, after };
}

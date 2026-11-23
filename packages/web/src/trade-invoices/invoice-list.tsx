import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { companyCodeSchema, tradeInvoicePageSchema, type CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { detailLabel } from "../ui/trade-invoice-detail-labels.ts";
import { masterRequest } from "../master-data-client.ts";
import { formatMinor } from "../reports-data.ts";
import { Badge, MessageBar } from "../ui/components/index.tsx";
import { TradeInvoiceDetail } from "../TradeInvoiceDetail.tsx";
import { poMatchTone } from "../trade-invoice-status.ts";
import { failure, type T } from "./invoice-model.ts";
import {
  invoiceFilterKeys,
  linkFilter,
  noInvoiceFilter,
  type InvoiceFilter,
  type InvoiceFilterState,
  type LinkChange,
} from "./invoice-link.ts";
import { SourceOrderCell } from "./source-order.tsx";

export function InvoiceList({
  company,
  preferences,
  t,
  params,
  write,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  params: URLSearchParams;
  write: (change: LinkChange) => void;
}) {
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
  const page = useInfiniteQuery({
    queryKey: ["trade-invoices", company.code, applied],
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
  const filtered = invoiceFilterKeys.some((key) => applied[key]);
  // Apply and Clear always reload from the first page, never from pages cached for those filters.
  const show = (next: InvoiceFilter) => {
    void client.resetQueries({ queryKey: ["trade-invoices", company.code, next], exact: true });
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
  const edit = (patch: Partial<InvoiceFilter>) =>
    setFilter({ ...current, draft: { ...draft, ...patch }, invalid: null });
  const described = (kind: "party" | "range") =>
    invalid === kind
      ? { "aria-invalid": true as const, "aria-describedby": `tinv-filter-${kind}-error` }
      : {};
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
  const virtual = rows.length > 100;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 44,
    overscan: 5,
  });
  const measured = virtualizer.getVirtualItems();
  const visible = virtual
    ? measured.map((item) => ({ row: rows[item.index], index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  const before = virtual ? (measured[0]?.start ?? 0) : 0;
  const after = virtual ? virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0) : 0;
  const headers = [
    "tinv.side",
    "tinv.party",
    "tinv.externalInvoice",
    "tinv.accountingDate",
    "tinv.dueDate",
    "tinv.poMatch",
    "tinv.sourceOrder",
    "tinv.gross",
  ] as const;
  return (
    <div className="card tinv-list">
      <header>
        <h3>{t("tinv.list")}</h3>
      </header>
      {broken && (
        <MessageBar tone="warning" role="status">
          <p>{detailLabel(preferences.language, "tinv.filter.linkInvalid")}</p>
          <button type="button" className="btn btn-secondary" onClick={clear}>
            {t("tinv.filter.clear")}
          </button>
        </MessageBar>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: TINV-05 needs a submit form (Enter applies) that is a search landmark. */}
      <form
        className="filter-bar tinv-filter"
        role="search"
        aria-label={t("tinv.filter")}
        noValidate
        onSubmit={apply}
      >
        <div className="field">
          <label htmlFor="tinv-filter-party">{t("tinv.filter.party")}</label>
          <input
            id="tinv-filter-party"
            maxLength={60}
            autoComplete="off"
            value={draft.party}
            onChange={(event) => edit({ party: event.target.value })}
            {...described("party")}
          />
          {invalid === "party" && (
            <p className="ui-error-text" id="tinv-filter-party-error">
              {t("tinv.filter.partyInvalid")}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="tinv-filter-side">{t("tinv.filter.side")}</label>
          <select
            id="tinv-filter-side"
            value={draft.side}
            onChange={(event) => edit({ side: event.target.value as InvoiceFilter["side"] })}
          >
            <option value="">{t("tinv.filter.all")}</option>
            <option value="AP">{t("tinv.filter.ap")}</option>
            <option value="AR">{t("tinv.filter.ar")}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tinv-filter-from">{t("tinv.filter.from")}</label>
          <input
            id="tinv-filter-from"
            type="date"
            value={draft.from}
            onChange={(event) => edit({ from: event.target.value })}
            {...described("range")}
          />
        </div>
        <div className="field">
          <label htmlFor="tinv-filter-to">{t("tinv.filter.to")}</label>
          <input
            id="tinv-filter-to"
            type="date"
            value={draft.to}
            onChange={(event) => edit({ to: event.target.value })}
            {...described("range")}
          />
          {invalid === "range" && (
            <p className="ui-error-text" id="tinv-filter-range-error">
              {t("tinv.filter.range")}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-secondary">
            {t("tinv.filter.apply")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={clear}>
            {t("tinv.filter.clear")}
          </button>
        </div>
      </form>
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && (
        <MessageBar tone="danger" role="alert">
          <p>{t(failure(page.error).key)}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void page.refetch()}>
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      <section
        className="grid-wrap tinv-list-scroll"
        ref={scroll}
        aria-label={t("tinv.list")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual list supports keyboard scrolling.
        tabIndex={0}
      >
        <table className="grid" aria-label={t("tinv.list")} aria-rowcount={rows.length + 1}>
          <thead>
            <tr>
              {headers.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className={key === "tinv.sourceOrder" ? "tinv-source" : undefined}
                >
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {before > 0 && (
              <tr>
                <td colSpan={headers.length} style={{ height: before, padding: 0 }} />
              </tr>
            )}
            {visible.map(({ row, index }) =>
              row ? (
                <tr key={row.documentId} aria-rowindex={index + 2} style={{ height: 44 }}>
                  <td>{t(`trade.${row.side}`)}</td>
                  <td>{row.party}</td>
                  <td>
                    <button
                      type="button"
                      className="tinv-detail-trigger"
                      aria-haspopup="dialog"
                      aria-label={`${detailLabel(preferences.language, "tinv.detail.open")} ${row.externalNo}`}
                      data-document-id={row.documentId}
                      onClick={() => {
                        opened.current = { documentId: row.documentId, externalNo: row.externalNo };
                        write({ invoice: row.documentId });
                      }}
                    >
                      {row.externalNo}
                    </button>
                  </td>
                  <td>{row.accountingDate}</td>
                  <td>{row.dueDate}</td>
                  <td>
                    <Badge tone={poMatchTone[row.poMatch]}>{t(`tinv.${row.poMatch}`)}</Badge>
                  </td>
                  <SourceOrderCell company={company.code} orderId={row.orderId} t={t} />
                  <td>{formatMinor(row.gross, preferences.language, company.scale)}</td>
                </tr>
              ) : null,
            )}
            {after > 0 && (
              <tr>
                <td colSpan={headers.length} style={{ height: after, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
        {page.isSuccess && rows.length === 0 && (
          <p className="empty-state">{t(filtered ? "tinv.filter.none" : "tinv.empty")}</p>
        )}
      </section>
      {page.hasNextPage && (
        <div className="tinv-more">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page.isFetchingNextPage}
            onClick={() => void page.fetchNextPage()}
          >
            {t("master.loadMore")}
          </button>
        </div>
      )}
      {invoice && (
        <TradeInvoiceDetail
          key={invoice}
          company={company}
          documentId={invoice}
          externalNo={
            opened.current?.documentId === invoice
              ? opened.current.externalNo
              : rows.find((row) => row.documentId === invoice)?.externalNo
          }
          preferences={preferences}
          close={() => {
            closedId.current = invoice;
            write({ invoice: null });
          }}
        />
      )}
    </div>
  );
}

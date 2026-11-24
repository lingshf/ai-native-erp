import { useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  companiesPageSchema,
  tradePageSchema,
  tradeKindSchema,
  type TradeDto,
  type CompanyDto,
} from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { masterTeaching } from "./ui/trade-master-teaching.ts";
import { masterRequest } from "./master-data-client.ts";
import { guardHistory } from "./leave-guard-history.ts";
import { Badge, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { TradeEditor } from "./trade-master/trade-editor.tsx";
import { failure } from "./trade-master/trade-failure.ts";
import {
  idleGuard,
  type EditorGuard,
  type T,
  type TradeKind,
} from "./trade-master/trade-master-types.ts";
import "./pages/master.css";

const tradeKinds = tradeKindSchema.options;
function useTradeLeaveGuard(guard: EditorGuard, discard: string) {
  // Layout effect: armed in the commit that made the editor dirty (see trade-invoices/use-invoice-leave-guard.ts).
  useLayoutEffect(() => {
    if (!guard.dirty && !guard.pending) return;
    const mayLeave = () => !guard.pending && window.confirm(discard);
    // Back/Forward: a cancel keeps the address and the draft (leave-guard-history.ts).
    const guarded = guardHistory(mayLeave);
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.href === guarded.here() ||
        link.target === "_blank" ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (!mayLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      guarded.dispose();
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard.dirty, guard.pending, discard]);
}
function Notice({ error, retry, t }: { error: unknown; retry: () => void; t: T }) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{t(failure(error).key)}</p>
      <button type="button" className="btn btn-secondary" onClick={retry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}
export function TradeMaster({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key);
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState<TradeKind>("tradeParty");
  const [search, setSearch] = useState("");
  const [guard, setGuard] = useState(idleGuard);
  useTradeLeaveGuard(guard, t("trade.discard"));
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = rows.find((row) => row.code === (selected || rows[0]?.code));
  return (
    <section className="page ui-master trade-master">
      <PageHeader
        title={t("trade.title")}
        context={
          <>
            <div className="field">
              <label htmlFor="trade-company">{t("master.company")}</label>
              <select
                id="trade-company"
                disabled={guard.open}
                value={company?.code ?? ""}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setSearch("");
                }}
              >
                {rows.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code} · {row.name}
                  </option>
                ))}
              </select>
            </div>
            {companies.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={companies.isFetchingNextPage}
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {masterTeaching(preferences.language, t("trade.teaching"))}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <Notice error={companies.error} retry={() => void companies.refetch()} t={t} />
      )}
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="trade-kind">{t("trade.kind")}</label>
          <select
            id="trade-kind"
            disabled={guard.open}
            value={kind}
            onChange={(event) => {
              const next = tradeKinds.find((value) => value === event.target.value);
              if (next) {
                setKind(next);
                setSearch("");
              }
            }}
          >
            {tradeKinds.map((value) => (
              <option key={value} value={value}>
                {t(`trade.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field ui-master-search">
          <label htmlFor="trade-search">{t("trade.search")}</label>
          <input
            id="trade-search"
            maxLength={160}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {company && (
        <TradePane
          key={`${company.code}:${kind}`}
          company={company}
          kind={kind}
          search={search}
          t={t}
          lock={setGuard}
        />
      )}
    </section>
  );
}
// TLIST-02: "Refresh list" never touches the editor, so it stays enabled while New is locked.
function PaneActions({
  editing,
  onNew,
  onRefresh,
  t,
}: {
  editing: boolean;
  onNew: () => void;
  onRefresh: () => void;
  t: T;
}) {
  return (
    <div className="ui-master-actions">
      <button
        type="button"
        className={`btn ${editing ? "btn-secondary" : "btn-primary"}`}
        disabled={editing}
        onClick={onNew}
      >
        {t("trade.new")}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onRefresh}>
        {t("trade.listRefresh")}
      </button>
    </div>
  );
}
function TradePane({
  company,
  kind,
  search,
  t,
  lock,
}: {
  company: CompanyDto;
  kind: TradeKind;
  search: string;
  t: T;
  lock: (guard: EditorGuard) => void;
}) {
  const [editing, setEditing] = useState<TradeDto | null | undefined>();
  const client = useQueryClient();
  const queryKey = ["trade", company.code, kind, search];
  const refresh = () => void client.resetQueries({ queryKey, exact: true });
  const page = useInfiniteQuery({
    queryKey,
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/${kind}?company=${encodeURIComponent(company.code)}&limit=100${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        tradePageSchema,
        { signal },
      ),
    getNextPageParam: (value) => value.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((value) => value.items) ?? [];
  const scroll = useRef<HTMLElement>(null);
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
  return (
    <>
      <PaneActions
        editing={editing !== undefined}
        onNew={() => setEditing(null)}
        onRefresh={refresh}
        t={t}
      />
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && <Notice error={page.error} retry={() => void page.refetch()} t={t} />}
      <div className="card">
        <section
          className="grid-wrap ui-master-scroll"
          ref={scroll}
          aria-label={t(`trade.${kind}`)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual list supports keyboard scrolling.
          tabIndex={0}
        >
          <table className="grid" aria-label={t(`trade.${kind}`)} aria-rowcount={rows.length + 1}>
            <thead>
              <tr>
                {(["trade.code", "trade.name", "master.active", "trade.edit"] as const).map(
                  (key) => (
                    <th key={key} scope="col">
                      {t(key)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {before > 0 && (
                <tr>
                  <td colSpan={4} style={{ height: before, padding: 0 }} />
                </tr>
              )}
              {visible.map(({ row, index }) => (
                <tr key={row.code} aria-rowindex={index + 2} style={{ height: 44 }}>
                  <td>{row.code}</td>
                  <td>{row.data.name}</td>
                  <td>
                    {row.active ? (
                      <Badge tone="success">{t("master.active")}</Badge>
                    ) : (
                      <span className="badge">{t("master.inactive")}</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-subtle btn-sm"
                      aria-label={`${t("trade.edit")} ${row.code}`}
                      disabled={editing !== undefined}
                      onClick={() => setEditing(row)}
                    >
                      {t("trade.edit")}
                    </button>
                  </td>
                </tr>
              ))}
              {after > 0 && (
                <tr>
                  <td colSpan={4} style={{ height: after, padding: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      {page.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary ui-master-more"
          disabled={page.isFetchingNextPage}
          onClick={() => void page.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      {editing !== undefined && (
        <TradeEditor
          key={editing ? `${editing.code}:${editing.revision}` : "new"}
          company={company}
          kind={kind}
          initial={editing}
          t={t}
          lock={lock}
          close={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

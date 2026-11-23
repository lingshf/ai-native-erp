import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  companiesPageSchema,
  tradePageSchema,
  tradeWriteSchema,
  tradeConfigSchema,
  tradeKindSchema,
  type TradeDto,
  type TradeCommand,
  type CompanyDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { masterTeaching } from "./ui/trade-master-teaching.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { guardHistory } from "./leave-guard-history.ts";
import { Badge, FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/master.css";

type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
type TradeKind = TradeDto["kind"];
const tradeKinds = tradeKindSchema.options;
type Failure = { path: string; key: Exclude<LabelKey, "shell.httpError">; conflict: boolean };
type EditorGuard = { open: boolean; dirty: boolean; pending: boolean };
const idleGuard: EditorGuard = { open: false, dirty: false, pending: false };
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
function failure(error: unknown): Failure {
  if (error instanceof MasterDataFailure) {
    if (error.status === 409) return { path: "form", key: "master.conflict", conflict: true };
    const field = error.detail?.fieldErrors[0];
    for (const rule of [
      "shape",
      "window",
      "reference",
      "account",
      "missingTax",
      "ambiguousTax",
    ] as const)
      if (field?.messageKey === `api.error.trade.${rule}`)
        return { path: field.path, key: `trade.issue.${rule}`, conflict: false };
    if (error.status === 400 || error.kind === "invalid")
      return { path: "form", key: "trade.issue.shape", conflict: false };
  }
  return { path: "form", key: "master.error", conflict: false };
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
  const page = useInfiniteQuery({
    queryKey: ["trade", company.code, kind, search],
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
      <div className="ui-master-actions">
        <button
          type="button"
          className={`btn ${editing === undefined ? "btn-primary" : "btn-secondary"}`}
          disabled={editing !== undefined}
          onClick={() => setEditing(null)}
        >
          {t("trade.new")}
        </button>
      </div>
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
const specific = {
  tradeParty: ["role", "apProfile", "arProfile", "terms", "allowedTaxCodes", "defaultDimensions"],
  tradeProduct: [
    "type",
    "expenseAccount",
    "revenueAccount",
    "allowedTaxCodes",
    "defaultDimensions",
  ],
  tradeProfile: ["side", "controlAccount", "advanceAccount", "cashAccount", "discountAccount"],
  tradeTerms: ["dueDays", "discountDays", "discountPercent", "allowPartialDiscount"],
  taxCode: ["mode", "rates", "deductiblePercent", "inputAccount", "outputAccount"],
} as const;
const choices = {
  role: ["vendor", "customer", "both"],
  type: ["expense", "service"],
  side: ["AP", "AR"],
  mode: ["ordinary", "zero", "exempt"],
} as const;
const nullable = new Set([
  "apProfile",
  "arProfile",
  "expenseAccount",
  "revenueAccount",
  "inputAccount",
  "outputAccount",
]);
function TradeEditor({
  company,
  kind,
  initial,
  t,
  close,
  lock,
}: {
  company: CompanyDto;
  kind: TradeKind;
  initial: TradeDto | null;
  t: T;
  close: () => void;
  lock: (guard: EditorGuard) => void;
}) {
  const client = useQueryClient();
  const fields = ["name", "from", "to", ...specific[kind]] as const;
  const [code, setCode] = useState(initial?.code ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const value: Record<string, string> = {
      name: "",
      from: `${company.year}-01-01`,
      to: `${company.year}-12-31`,
      role: "vendor",
      type: "expense",
      side: "AP",
      mode: "ordinary",
      defaultDimensions: "{}",
      rates: "[]",
      dueDays: "30",
      discountDays: "7",
      discountPercent: "1.5",
      allowPartialDiscount: "true",
      deductiblePercent: "100",
      allowedTaxCodes: "",
    };
    for (const field of specific[kind]) value[field] ??= "";
    if (initial)
      for (const [field, item] of Object.entries(initial.data))
        value[field] =
          field === "allowedTaxCodes" && Array.isArray(item)
            ? item.join(",")
            : item !== null && typeof item === "object"
              ? JSON.stringify(item)
              : item === null
                ? ""
                : String(item);
    return value;
  });
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const starting = useRef(JSON.stringify({ code, active, draft }));
  const dirty = JSON.stringify({ code, active, draft }) !== starting.current;
  const pendingCommand = useRef<TradeCommand | null>(null);
  const generation = useRef(0);
  useLayoutEffect(() => {
    lock({ open: true, dirty, pending: busy || uncertain });
  }, [lock, dirty, busy, uncertain]);
  useLayoutEffect(() => () => lock(idleGuard), [lock]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || uncertain) return;
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const value = draft[field];
      try {
        data[field] =
          field === "rates" || field === "defaultDimensions"
            ? JSON.parse(value)
            : field === "allowedTaxCodes"
              ? value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              : field === "allowPartialDiscount"
                ? value === "true"
                : field === "dueDays" || field === "discountDays"
                  ? value.trim()
                    ? Number(value)
                    : null
                  : nullable.has(field) && !value
                    ? null
                    : value;
      } catch (issue) {
        if (!(issue instanceof SyntaxError)) throw issue;
        setError({ path: `data.${field}`, key: "trade.issue.shape", conflict: false });
        return;
      }
    }
    const parsed = tradeWriteSchema.safeParse({
      company: company.code,
      kind,
      code,
      expectedRevision: initial?.revision ?? 0,
      active,
      data,
    });
    if (!parsed.success) {
      setError({
        path: parsed.error.issues[0]?.path.join(".") || "form",
        key: "trade.issue.shape",
        conflict: false,
      });
      return;
    }
    pendingCommand.current = parsed.data;
    await persist(parsed.data);
  }
  async function persist(command: TradeCommand, reconcile = false) {
    const id = ++generation.current;
    setBusy(true);
    setError(null);
    let accepted = false;
    try {
      try {
        await masterRequest(`/api/v1/trade/${kind}`, tradeConfigSchema, {
          method: command.expectedRevision ? "PUT" : "POST",
          body: command,
        });
      } catch (issue) {
        if (!reconcile || !(issue instanceof MasterDataFailure) || issue.status !== 409)
          throw issue;
        const saved = await masterRequest(
          `/api/v1/trade/${kind}/${encodeURIComponent(command.code)}?company=${encodeURIComponent(company.code)}`,
          tradeConfigSchema,
        );
        if (
          saved.kind !== command.kind ||
          saved.code !== command.code ||
          saved.revision !== command.expectedRevision + 1 ||
          saved.active !== command.active ||
          JSON.stringify(saved.data) !== JSON.stringify(command.data)
        )
          throw issue;
      }
      accepted = true;
      if (generation.current === id) close();
    } catch (issue) {
      if (generation.current === id) {
        setError(failure(issue));
        setUncertain(
          !(issue instanceof MasterDataFailure) ||
            issue.kind !== "http" ||
            (issue.status ?? 500) >= 500 ||
            (reconcile && issue.status !== 409),
        );
      }
    } finally {
      if (generation.current === id) setBusy(false);
      if (accepted || generation.current !== id)
        void client.invalidateQueries({ queryKey: ["trade", company.code, kind] });
    }
  }
  return (
    <form className="ui-master-editor" onSubmit={(event) => void submit(event)}>
      <FastTab
        id="trade-editor"
        title={t("trade.editor")}
        summary={initial ? `${t("trade.edit")} · ${initial.code}` : t("trade.new")}
      >
        <p className="ui-hint">{t("trade.nullHint")}</p>
        {kind === "tradeProfile" && <p className="ui-hint">{t("trade.discountHint")}</p>}
        {kind === "taxCode" && <p className="ui-hint">{t("trade.rateHint")}</p>}
        {(busy || uncertain) && (
          <p role="status">{t(uncertain ? "trade.uncertain" : "master.saving")}</p>
        )}
        {uncertain && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              if (pendingCommand.current) void persist(pendingCommand.current, true);
            }}
          >
            {t("trade.reconcile")}
          </button>
        )}
        <fieldset disabled={busy || uncertain} className="ui-form-grid">
          <div className="ui-field">
            <label htmlFor="trade-code">{t("trade.code")}</label>
            <input
              id="trade-code"
              value={code}
              disabled={Boolean(initial)}
              required
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          {fields.map((field) => {
            const options = field in choices ? choices[field as keyof typeof choices] : null;
            const json = field === "rates" || field === "defaultDimensions";
            const invalid =
              error?.path === `data.${field}` || error?.path.startsWith(`data.${field}.`);
            const props = {
              id: `trade-${field}`,
              value: draft[field],
              onChange: (event: { target: { value: string } }) =>
                setDraft((value) => ({ ...value, [field]: event.target.value })),
              "aria-invalid": invalid ? true : undefined,
              "aria-describedby": invalid ? "trade-error" : undefined,
            };
            if (field === "allowPartialDiscount")
              return (
                <label key={field} className="ui-check" htmlFor={props.id}>
                  <input
                    id={props.id}
                    type="checkbox"
                    checked={draft[field] === "true"}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, [field]: String(event.target.checked) }))
                    }
                  />
                  {t(`trade.${field}`)}
                </label>
              );
            return (
              <div key={field} className={`ui-field${json ? " ui-master-wide" : ""}`}>
                <label htmlFor={`trade-${field}`}>{t(`trade.${field}`)}</label>
                {options ? (
                  <select {...props}>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {t(`trade.${option}`)}
                      </option>
                    ))}
                  </select>
                ) : json ? (
                  <textarea {...props} required />
                ) : (
                  <input
                    {...props}
                    type={field === "from" || field === "to" ? "date" : "text"}
                    required={!nullable.has(field) && field !== "allowedTaxCodes"}
                  />
                )}
              </div>
            );
          })}
          <label className="ui-check" htmlFor="trade-active">
            <input
              id="trade-active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            {t("master.active")}
          </label>
          {error && (
            <p role="alert" id="trade-error" className="ui-master-error ui-master-wide">
              {error.path}: {t(error.key)}
            </p>
          )}
          <div className="ui-form-actions ui-master-wide">
            {error?.conflict && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  void client.invalidateQueries({ queryKey: ["trade", company.code, kind] });
                  close();
                }}
              >
                {t("master.reload")}
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {t("dim.save")}
            </button>
            <button
              type="button"
              className="btn btn-subtle"
              onClick={() => {
                if (!dirty || window.confirm(t("trade.discard"))) close();
              }}
            >
              {t("master.cancel")}
            </button>
          </div>
        </fieldset>
      </FastTab>
    </form>
  );
}

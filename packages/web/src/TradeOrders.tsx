import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  companiesPageSchema,
  tradeOrderCommandSchema,
  tradeOrderSchema,
  tradePageSchema,
  type CompanyDto,
  type TradeDto,
} from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { orderLabel, type TradeOrderKey } from "./ui/trade-order-labels.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { Badge, FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/trade-orders.css";

type T = (key: TradeOrderKey, params?: Readonly<Record<string, string | number>>) => string;
type Command = ReturnType<typeof tradeOrderCommandSchema.parse>;
type Order = ReturnType<typeof tradeOrderSchema.parse>;
type LineDraft = {
  lineId: string;
  product: string;
  taxCode: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
};
type Draft = {
  orderId: string;
  side: "AP" | "AR";
  party: string;
  orderDate: string;
  priceIncludesTax: boolean;
  rounding: "line" | "document";
  lines: LineDraft[];
};
type Guard = { busy: boolean; unsaved: boolean };
type Issue = { path: string; key: TradeOrderKey };
type Failure = { message: string; issues: Issue[]; uncertain: boolean };
const idleGuard: Guard = { busy: false, unsaved: false };
const lineFields = ["product", "taxCode", "quantity", "unitPrice", "discountPercent"] as const;
const numeric = new Set<string>(["quantity", "unitPrice", "discountPercent"]);
const rules = [
  "shape",
  "reference",
  "party",
  "product",
  "currency",
  "account",
  "duplicate",
  "missingTax",
  "ambiguousTax",
  "quantity",
] as const;

const blankLine = (n: number): LineDraft => ({
  lineId: `L${n}`,
  product: "",
  taxCode: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "0",
});
const localToday = () => {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
};
const blankDraft = (): Draft => ({
  orderId: "",
  side: "AP",
  party: "",
  orderDate: localToday(),
  priceIncludesTax: false,
  rounding: "line",
  lines: [blankLine(1)],
});
const toCommand = (company: CompanyDto, draft: Draft): Command => ({
  company: company.code,
  orderId: draft.orderId.trim(),
  side: draft.side,
  party: draft.party.trim(),
  currency: company.currency,
  orderDate: draft.orderDate,
  priceIncludesTax: draft.priceIncludesTax,
  rounding: draft.rounding,
  lines: draft.lines.map((line) => ({
    lineId: line.lineId,
    product: line.product.trim(),
    taxCode: line.taxCode.trim(),
    quantity: line.quantity.trim(),
    unitPrice: line.unitPrice.trim(),
    discountPercent: line.discountPercent.trim(),
    taxableCharge: "0",
  })),
});
const ruleKey = (messageKey: string): TradeOrderKey => {
  const rule = messageKey.split(".").at(-1);
  return rules.find((known) => known === rule)
    ? (`tord.issue.${rule}` as TradeOrderKey)
    : "tord.issue.other";
};

// Same contract as the other trade pages' leave guards: links and history are blocked while a
// save is in flight; an unsaved draft asks before leaving and before unloading the tab.
function useOrderLeaveGuard(guard: Guard, message: string) {
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    if (!guard.busy && !guard.unsaved) return;
    const current = window.location.href;
    const mayLeave = () => !latest.current.busy && window.confirm(message);
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.href === current ||
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
    const navigation = (event: Event) => {
      if (window.location.href === current || mayLeave()) return;
      event.stopImmediatePropagation();
      window.history.replaceState(window.history.state, "", current);
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", navigation, true);
    window.addEventListener("hashchange", navigation, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", navigation, true);
      window.removeEventListener("hashchange", navigation, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard.busy, guard.unsaved, message]);
}

export function TradeOrders({ preferences }: { preferences: Preferences }) {
  const language = preferences.language;
  const t: T = (key, params) => orderLabel(language, key, params);
  const [selected, setSelected] = useState("");
  const [guard, setGuard] = useState(idleGuard);
  useOrderLeaveGuard(guard, t("tord.leaveConfirm"));
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
    <section className="page trade-orders">
      <PageHeader
        title={t("tord.title")}
        description={t("tord.description")}
        context={
          <div className="field">
            <label htmlFor="tord-company">{label(language, "master.company")}</label>
            <select
              id="tord-company"
              value={company?.code ?? ""}
              disabled={guard.busy}
              onChange={(event) => {
                if (!guard.unsaved || window.confirm(t("tord.leaveConfirm")))
                  setSelected(event.target.value);
              }}
            >
              {rows.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("tord.teachingTitle")}>
        {t("tord.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{label(language, "master.loading")}</p>}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          <p>{label(language, "master.error")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void companies.refetch()}
          >
            {label(language, "master.retry")}
          </button>
        </MessageBar>
      )}
      {company && (
        <OrderWorkspace
          key={company.code}
          company={company}
          preferences={preferences}
          t={t}
          onGuard={setGuard}
        />
      )}
    </section>
  );
}

function useOptions(company: string, kind: TradeDto["kind"]) {
  return useQuery({
    queryKey: ["trade-order-options", company, kind],
    refetchOnMount: true,
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/${kind}?company=${encodeURIComponent(company)}&limit=500`,
        tradePageSchema,
        { signal },
      ),
  });
}

function OrderWorkspace({
  company,
  preferences,
  t,
  onGuard,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
}) {
  const language = preferences.language;
  const [draft, setDraft] = useState(blankDraft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState<Order | null>(null);
  const savedNotice = useRef<HTMLDivElement>(null);
  const parties = useOptions(company.code, "tradeParty");
  const products = useOptions(company.code, "tradeProduct");
  const taxes = useOptions(company.code, "taxCode");
  useEffect(() => onGuard({ busy, unsaved: dirty }), [onGuard, busy, dirty]);
  useEffect(() => () => onGuard(idleGuard), [onGuard]);
  useEffect(() => {
    if (saved) savedNotice.current?.focus();
  }, [saved]);
  const money = (value: number) => formatMinor(value, language, company.scale);
  const issueAt = (path: string) => failure?.issues.find((issue) => issue.path === path);

  const edit = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setDirty(true);
    setSaved(null);
  };
  const editLine = (index: number, field: (typeof lineFields)[number], value: string) =>
    edit({
      lines: draft.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    });
  const addLine = () => {
    if (draft.lines.length >= 100) return;
    const used = new Set(draft.lines.map((line) => line.lineId));
    let n = draft.lines.length + 1;
    while (used.has(`L${n}`)) n += 1;
    edit({ lines: [...draft.lines, blankLine(n)] });
  };
  const discard = () => {
    if (busy || !window.confirm(t("tord.discardConfirm"))) return;
    setDraft(blankDraft());
    setDirty(false);
    setFailure(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const command = toCommand(company, draft);
    const checked = tradeOrderCommandSchema.safeParse(command);
    if (!checked.success) {
      setFailure({
        message: t("tord.invalid"),
        issues: checked.error.issues.map((issue) => ({
          path: issue.path.join("."),
          key: "tord.issue.shape",
        })),
        uncertain: false,
      });
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const order = await masterRequest("/api/v1/trade/orders", tradeOrderSchema, {
        method: "POST",
        body: checked.data,
      });
      setSaved(order);
      setDraft(blankDraft());
      setDirty(false);
    } catch (error) {
      const fields = error instanceof MasterDataFailure ? (error.detail?.fieldErrors ?? []) : [];
      const definite =
        error instanceof MasterDataFailure && error.kind === "http" && (error.status ?? 500) < 500;
      setFailure({
        message: fields.length
          ? t("tord.invalid")
          : t(definite ? "tord.issue.other" : "tord.uncertain"),
        issues: fields.map((field) => ({ path: field.path, key: ruleKey(field.messageKey) })),
        uncertain: !definite,
      });
    } finally {
      setBusy(false);
    }
  };

  const fieldLabel = (path: string) => {
    const [head, index, field] = path.split(".");
    if (head === "lines" && index !== undefined && field) {
      const line = draft.lines[Number(index)];
      const known = (lineFields as readonly string[]).includes(field);
      return `${known ? t(`tord.${field}` as TradeOrderKey) : field} ${line?.lineId ?? index}`;
    }
    const header = ["orderId", "side", "party", "currency", "orderDate", "rounding", "lines"];
    return header.includes(path) ? t(`tord.${path}` as TradeOrderKey) : "";
  };
  const errorProps = (path: string) => {
    const issue = issueAt(path);
    return issue
      ? {
          "aria-invalid": true as const,
          "aria-describedby": `tord-error-${path.replaceAll(".", "-")}`,
        }
      : {};
  };
  const errorText = (path: string) => {
    const issue = issueAt(path);
    return issue ? (
      <p className="ui-error-text" id={`tord-error-${path.replaceAll(".", "-")}`}>
        {t(issue.key)}
      </p>
    ) : null;
  };
  const options = (query: ReturnType<typeof useOptions>, keep: (item: TradeDto) => boolean) =>
    (query.data?.items ?? []).filter((item) => item.active && keep(item));
  const partyOptions = options(
    parties,
    (item) =>
      item.kind === "tradeParty" &&
      (item.data.role === "both" ||
        item.data.role === (draft.side === "AP" ? "vendor" : "customer")),
  );
  const productOptions = options(
    products,
    (item) =>
      item.kind === "tradeProduct" &&
      item.data.type === (draft.side === "AP" ? "expense" : "service"),
  );
  const taxOptions = options(taxes, (item) => item.kind === "taxCode");
  const optionsFailed = parties.isError || products.isError || taxes.isError;
  const generalSummary = [
    draft.orderId.trim(),
    label(language, `trade.${draft.side}`),
    draft.party.trim(),
    draft.orderDate,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <form
        className="tord-entry"
        aria-label={t("tord.entry")}
        onSubmit={(event) => void save(event)}
      >
        <div className="tord-command-bar">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t("tord.save")}
          </button>
          <button
            type="button"
            className="btn btn-subtle"
            disabled={!dirty || busy}
            onClick={discard}
          >
            {t("tord.discard")}
          </button>
          <span className="tord-status">
            {busy ? <span role="status">{t("tord.saving")}</span> : t("tord.amountsAfterSave")}
          </span>
        </div>
        {failure && (
          <MessageBar tone={failure.uncertain ? "warning" : "danger"} role="alert">
            <p>{failure.message}</p>
            {failure.issues.length > 0 && (
              <ul>
                {failure.issues.map((issue) => (
                  <li key={`${issue.path}:${issue.key}`}>
                    {[fieldLabel(issue.path), t(issue.key)].filter(Boolean).join(": ")}
                  </li>
                ))}
              </ul>
            )}
          </MessageBar>
        )}
        {saved && (
          <div className="tord-saved" ref={savedNotice} tabIndex={-1}>
            <MessageBar tone="success" role="status">
              <p>
                {t("tord.saved", { orderId: saved.orderId })}{" "}
                <a href="#/trade-invoices">{t("tord.toInvoices")}</a>
              </p>
            </MessageBar>
          </div>
        )}
        {optionsFailed && (
          <MessageBar tone="warning">
            <p>{t("tord.optionsFailed")}</p>
          </MessageBar>
        )}
        <FastTab id="tord-general" title={t("tord.entry")} summary={generalSummary}>
          <fieldset disabled={busy} className="ui-form-grid">
            <div className="ui-field">
              <label htmlFor="tord-orderId">{t("tord.orderId")}</label>
              <input
                id="tord-orderId"
                maxLength={60}
                autoComplete="off"
                value={draft.orderId}
                onChange={(event) => edit({ orderId: event.target.value })}
                {...errorProps("orderId")}
              />
              {errorText("orderId") ?? <p className="ui-hint">{t("tord.codeHint")}</p>}
            </div>
            <div className="ui-field">
              <label htmlFor="tord-side">{t("tord.side")}</label>
              <select
                id="tord-side"
                value={draft.side}
                onChange={(event) => edit({ side: event.target.value === "AR" ? "AR" : "AP" })}
              >
                <option value="AP">{label(language, "trade.AP")}</option>
                <option value="AR">{label(language, "trade.AR")}</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="tord-party">{t("tord.party")}</label>
              <input
                id="tord-party"
                list="tord-party-options"
                maxLength={60}
                autoComplete="off"
                value={draft.party}
                onChange={(event) => edit({ party: event.target.value })}
                {...errorProps("party")}
              />
              {errorText("party")}
            </div>
            <div className="ui-field">
              <label htmlFor="tord-currency">{t("tord.currency")}</label>
              <input
                id="tord-currency"
                readOnly
                value={company.currency}
                {...errorProps("currency")}
              />
              {errorText("currency")}
            </div>
            <div className="ui-field">
              <label htmlFor="tord-orderDate">{t("tord.orderDate")}</label>
              <input
                id="tord-orderDate"
                type="date"
                value={draft.orderDate}
                onChange={(event) => edit({ orderDate: event.target.value })}
                {...errorProps("orderDate")}
              />
              {errorText("orderDate")}
            </div>
            <label className="ui-check" htmlFor="tord-priceIncludesTax">
              <input
                id="tord-priceIncludesTax"
                type="checkbox"
                checked={draft.priceIncludesTax}
                onChange={(event) => edit({ priceIncludesTax: event.target.checked })}
              />
              {t("tord.priceIncludesTax")}
            </label>
            <div className="ui-field">
              <label htmlFor="tord-rounding">{t("tord.rounding")}</label>
              <select
                id="tord-rounding"
                value={draft.rounding}
                onChange={(event) =>
                  edit({ rounding: event.target.value === "document" ? "document" : "line" })
                }
              >
                <option value="line">{t("tord.roundingLine")}</option>
                <option value="document">{t("tord.roundingDocument")}</option>
              </select>
            </div>
          </fieldset>
        </FastTab>
        <FastTab
          id="tord-lines"
          title={t("tord.lines")}
          summary={t("tord.lineCount", { count: draft.lines.length })}
        >
          <fieldset disabled={busy} className="tord-lines">
            <div className="grid-wrap">
              <table className="grid" aria-label={t("tord.lines")}>
                <thead>
                  <tr>
                    <th scope="col">{t("tord.lineId")}</th>
                    {lineFields.map((field) => (
                      <th key={field} scope="col">
                        {t(`tord.${field}`)}
                      </th>
                    ))}
                    <th scope="col">{t("tord.removeLine")}</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line, index) => (
                    <tr key={line.lineId}>
                      <td>{line.lineId}</td>
                      {lineFields.map((field) => {
                        const path = `lines.${index}.${field}`;
                        return (
                          <td key={field}>
                            <input
                              aria-label={`${t(`tord.${field}`)} ${line.lineId}`}
                              inputMode={numeric.has(field) ? "decimal" : "text"}
                              list={
                                field === "product"
                                  ? "tord-product-options"
                                  : field === "taxCode"
                                    ? "tord-tax-options"
                                    : undefined
                              }
                              autoComplete="off"
                              maxLength={60}
                              value={line[field]}
                              onChange={(event) => editLine(index, field, event.target.value)}
                              {...errorProps(path)}
                            />
                            {errorText(path)}
                          </td>
                        );
                      })}
                      <td>
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          aria-label={`${t("tord.removeLine")} ${line.lineId}`}
                          disabled={draft.lines.length === 1}
                          onClick={() => edit({ lines: draft.lines.filter((_, i) => i !== index) })}
                        >
                          {t("tord.removeLine")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errorText("lines")}
            <div className="ui-form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={draft.lines.length >= 100}
                onClick={addLine}
              >
                {t("tord.addLine")}
              </button>
            </div>
          </fieldset>
        </FastTab>
        <datalist id="tord-party-options">
          {partyOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.data.name}
            </option>
          ))}
        </datalist>
        <datalist id="tord-product-options">
          {productOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.data.name}
            </option>
          ))}
        </datalist>
        <datalist id="tord-tax-options">
          {taxOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.data.name}
            </option>
          ))}
        </datalist>
      </form>
      {saved && (
        <FastTab id="tord-saved" title={t("tord.savedTitle")} summary={saved.orderId}>
          <OrderView order={saved} language={language} money={money} t={t} />
        </FastTab>
      )}
      <OrderLookup company={company} language={language} money={money} t={t} />
    </>
  );
}

function OrderLookup({
  company,
  language,
  money,
  t,
}: {
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
}) {
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Order | null>(null);
  const [error, setError] = useState<TradeOrderKey | "master.error" | null>(null);
  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    const id = orderId.trim();
    if (busy || !id) return;
    setResult(null);
    if (!tradeOrderCommandSchema.shape.orderId.safeParse(id).success) {
      setError("tord.issue.shape");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(
        await masterRequest(
          `/api/v1/trade/orders/${encodeURIComponent(id)}?company=${encodeURIComponent(company.code)}`,
          tradeOrderSchema,
        ),
      );
    } catch (issue) {
      setError(
        issue instanceof MasterDataFailure && issue.status === 404
          ? "tord.notFound"
          : "master.error",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <FastTab id="tord-lookup" title={t("tord.lookup")}>
      <form className="filter-bar tord-lookup" onSubmit={(event) => void lookup(event)}>
        <div className="field">
          <label htmlFor="tord-lookup-id">{t("tord.lookupId")}</label>
          <input
            id="tord-lookup-id"
            maxLength={60}
            autoComplete="off"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-secondary" disabled={busy || !orderId.trim()}>
            {t("tord.lookupButton")}
          </button>
        </div>
      </form>
      {busy && <p role="status">{label(language, "master.loading")}</p>}
      {error && (
        <MessageBar tone="danger" role="alert">
          <p>{error === "master.error" ? label(language, "master.error") : t(error)}</p>
        </MessageBar>
      )}
      {result && (
        <section className="tord-lookup-result" aria-label={t("tord.lookupTitle")}>
          <h4>
            {t("tord.lookupTitle")} <Badge tone="info">{result.orderId}</Badge>
          </h4>
          <OrderView order={result} language={language} money={money} t={t} />
        </section>
      )}
    </FastTab>
  );
}

function OrderView({
  order,
  language,
  money,
  t,
}: {
  order: Order;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
}) {
  const amountKeys = ["net", "tax", "gross"] as const;
  // Totals only add up the server's per-line amounts; no tax is calculated here (PG-01).
  const total = (key: (typeof amountKeys)[number]) =>
    order.lines.reduce((sum, line) => sum + line[key], 0);
  return (
    <div className="tord-order">
      <dl className="kpis">
        {amountKeys.map((key) => (
          <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
            <dt className="label">{t(`tord.${key}`)}</dt>
            <dd className="value">{money(total(key))}</dd>
          </div>
        ))}
      </dl>
      <dl className="tord-facts">
        <div>
          <dt>{t("tord.orderId")}</dt>
          <dd>{order.orderId}</dd>
        </div>
        <div>
          <dt>{t("tord.side")}</dt>
          <dd>{label(language, `trade.${order.side}`)}</dd>
        </div>
        <div>
          <dt>{t("tord.party")}</dt>
          <dd>{order.party}</dd>
        </div>
        <div>
          <dt>{t("tord.currency")}</dt>
          <dd>{order.currency}</dd>
        </div>
        <div>
          <dt>{t("tord.orderDate")}</dt>
          <dd>{order.orderDate}</dd>
        </div>
        <div>
          <dt>{t("tord.priceIncludesTax")}</dt>
          <dd>{t(order.priceIncludesTax ? "tord.yes" : "tord.no")}</dd>
        </div>
        <div>
          <dt>{t("tord.rounding")}</dt>
          <dd>
            {t(order.rounding === "document" ? "tord.roundingDocument" : "tord.roundingLine")}
          </dd>
        </div>
        <div>
          <dt>{t("tord.recordedAt")}</dt>
          <dd>{order.recordedAt}</dd>
        </div>
      </dl>
      <div className="grid-wrap">
        <table className="grid tord-amounts" aria-label={`${t("tord.lines")} ${order.orderId}`}>
          <thead>
            <tr>
              <th scope="col">{t("tord.lineNo")}</th>
              <th scope="col">{t("tord.lineId")}</th>
              <th scope="col">{t("tord.product")}</th>
              <th scope="col">{t("tord.taxCode")}</th>
              <th scope="col">{t("tord.quantity")}</th>
              <th scope="col">{t("tord.unitPrice")}</th>
              <th scope="col">{t("tord.discountPercent")}</th>
              {amountKeys.map((key) => (
                <th key={key} scope="col">
                  {t(`tord.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.lineId}>
                <td>{line.lineNo}</td>
                <td>{line.lineId}</td>
                <td>{line.product}</td>
                <td>{line.taxCode}</td>
                <td>{line.quantity}</td>
                <td>{line.unitPrice}</td>
                <td>{line.discountPercent}</td>
                {amountKeys.map((key) => (
                  <td key={key}>{money(line[key])}</td>
                ))}
              </tr>
            ))}
            <tr className="tord-total">
              <th scope="row" colSpan={7}>
                {t("tord.total")}
              </th>
              {amountKeys.map((key) => (
                <td key={key}>{money(total(key))}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

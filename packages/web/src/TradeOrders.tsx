import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  tradeOrderCommandSchema,
  tradeOrderInvoicingSchema,
  tradeOrderPageSchema,
  tradeOrderPreviewSchema,
  tradeOrderSchema,
  tradePageSchema,
  type CompanyDto,
  type TradeDto,
  type TradeOrderPreviewDto,
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
type Opened = { orderId: string; focus: boolean };
type Invoicing = "none" | "partial" | "full";
const invoicingTone = { none: "warning", partial: "info", full: "success" } as const;
type Issue = { path: string; key: TradeOrderKey };
type Failure = { message: string; issues: Issue[]; uncertain: boolean };
const idleGuard: Guard = { busy: false, unsaved: false };
type Filter = { party: string; side: "" | "AP" | "AR"; from: string; to: string };
const noFilter: Filter = { party: "", side: "", from: "", to: "" };
const filterKeys = ["party", "side", "from", "to"] as const;
const lineFields = ["product", "taxCode", "quantity", "unitPrice", "discountPercent"] as const;
const numeric = new Set<string>(["quantity", "unitPrice", "discountPercent"]);
const amountKeys = ["net", "tax", "gross"] as const;
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
// Line errors arrive by array index ("lines.0.taxCode"); keep them on the submitted line's stable
// lineId so removing a line can never move an error onto the line that shifts into its place.
const stablePath = (path: string, lines: readonly { lineId: string }[]) => {
  const match = /^lines\.(\d+)(\..+)?$/u.exec(path);
  const line = match ? lines[Number(match[1])] : undefined;
  return match && line ? `line:${line.lineId}${match[2] ?? ""}` : path;
};
const ruleKey = (messageKey: string): TradeOrderKey => {
  const rule = messageKey.split(".").at(-1);
  return rules.find((known) => known === rule)
    ? (`tord.issue.${rule}` as TradeOrderKey)
    : "tord.issue.other";
};

// Exact decimal arithmetic in millionths (the contract allows at most 6 fraction digits).
const micros = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
};
const fromMicros = (value: bigint) => {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = String(abs % 1_000_000n)
    .padStart(6, "0")
    .replace(/0+$/u, "");
  return `${sign}${abs / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
};

// Same contract as the other trade pages' leave guards: links and history are blocked while a
// save is in flight; an unsaved draft asks before leaving and before unloading the tab.
function useOrderLeaveGuard(guard: Guard, message: string) {
  const latest = useRef(guard);
  latest.current = guard;
  // Read on every render: the page rewrites its own address (company, order) while a draft is open,
  // and a cancelled navigation must return to that address, not the one from when the draft began.
  const here = useRef("");
  here.current = window.location.href;
  const hereState = useRef<unknown>(null);
  hereState.current = window.history.state;
  // The address a confirmed Back or Forward goes to: its hashchange follows the popstate before the
  // page re-renders, and must not ask again.
  const accepted = useRef("");
  if (accepted.current === here.current) accepted.current = "";
  useEffect(() => {
    if (!guard.busy && !guard.unsaved) return;
    const mayLeave = () => !latest.current.busy && window.confirm(message);
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.href === here.current ||
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
      const target = window.location.href;
      if (target === here.current || target === accepted.current) return;
      if (mayLeave()) {
        accepted.current = target;
        return;
      }
      event.stopImmediatePropagation();
      // The browser is already on the target entry: add the current address after it instead of
      // rewriting it, so a later Back or Forward can still reach the target.
      window.history.pushState(hereState.current, "", here.current);
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
  const [params, setParams] = useSearchParams();
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
  // A parameter that is absent takes the default; one that is present (even empty) must match.
  const linkCompany = params.get("company");
  const linkOrder = params.get("order");
  const company = rows.find((row) => row.code === (linkCompany ?? (selected || rows[0]?.code)));
  const companyMissing = linkCompany !== null && companies.isSuccess && !company;
  const link = (change: Readonly<Record<string, string | null>>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(change))
          if (value === null) next.delete(key);
          else next.set(key, value);
        return next;
      },
      { replace: true },
    );
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
                if (!guard.unsaved || window.confirm(t("tord.leaveConfirm"))) {
                  setSelected(event.target.value);
                  link({ company: event.target.value, order: null });
                }
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
      {companyMissing && (
        <MessageBar tone="danger" role="alert">
          <p>
            {t("tord.deepLink.company")} · {linkCompany}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              link({ company: null, order: null });
              document.getElementById("tord-company")?.focus();
            }}
          >
            {t("tord.deepLink.back")}
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
          linkOrder={linkOrder}
          onLink={(order) => link({ company: company.code, order })}
          onBack={() => link({ order: null })}
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
  linkOrder,
  onLink,
  onBack,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
  linkOrder: string | null;
  onLink: (orderId: string | null) => void;
  // Recovery from a bad order link removes only `order`; an absent `company` stays absent.
  onBack: () => void;
}) {
  const language = preferences.language;
  const [draft, setDraft] = useState(blankDraft);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState<"save" | "preview" | null>(null);
  const busy = working !== null;
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState<Order | null>(null);
  const [preview, setPreview] = useState<TradeOrderPreviewDto | null>(null);
  // Focus after a preview request ends: the result region on success, the Preview button on failure.
  const [previewFocus, setPreviewFocus] = useState<{ to: "result" | "button" } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // The address owns the opened order (TINV-03): a list click or lookup writes `order`, and every
  // change of `order` (click, deep link, Back) runs the lookup; a link or Back focuses the result.
  const focusNext = useRef(true);
  useEffect(() => {
    setOpened(linkOrder === null ? null : { orderId: linkOrder, focus: focusNext.current });
    focusNext.current = true;
  }, [linkOrder]);
  const open = (orderId: string, focus: boolean) => {
    if (orderId === linkOrder) setOpened({ orderId, focus });
    else {
      focusNext.current = focus;
      onLink(orderId);
    }
  };
  const client = useQueryClient();
  const savedNotice = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const previewResult = useRef<HTMLElement>(null);
  const parties = useOptions(company.code, "tradeParty");
  const products = useOptions(company.code, "tradeProduct");
  const taxes = useOptions(company.code, "taxCode");
  useEffect(() => onGuard({ busy, unsaved: dirty }), [onGuard, busy, dirty]);
  useEffect(() => () => onGuard(idleGuard), [onGuard]);
  // Layout effect: focus moves inside the commit, so the notice never appears with focus elsewhere (D92).
  useLayoutEffect(() => {
    if (saved) savedNotice.current?.focus();
  }, [saved]);
  useLayoutEffect(() => {
    if (previewFocus)
      (previewFocus.to === "result" ? previewResult : previewButton).current?.focus();
  }, [previewFocus]);
  const money = (value: number) => formatMinor(value, language, company.scale);
  const issueAt = (path: string) => failure?.issues.find((issue) => issue.path === path);

  const edit = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setDirty(true);
    setSaved(null);
    setPreview(null);
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
  const removeLine = (lineId: string) => {
    edit({ lines: draft.lines.filter((line) => line.lineId !== lineId) });
    setFailure(
      (current) =>
        current && {
          ...current,
          issues: current.issues.filter(
            (issue) => issue.path !== `line:${lineId}` && !issue.path.startsWith(`line:${lineId}.`),
          ),
        },
    );
  };
  const discard = () => {
    if (busy || !window.confirm(t("tord.discardConfirm"))) return;
    setDraft(blankDraft());
    setDirty(false);
    setFailure(null);
    setPreview(null);
  };
  const failed = (
    error: unknown,
    lines: Command["lines"],
    invalid: TradeOrderKey,
    other: TradeOrderKey,
  ) => {
    const fields = error instanceof MasterDataFailure ? (error.detail?.fieldErrors ?? []) : [];
    const definite =
      error instanceof MasterDataFailure && error.kind === "http" && (error.status ?? 500) < 500;
    setFailure({
      message: fields.length ? t(invalid) : t(definite ? "tord.issue.other" : other),
      issues: fields.map((field) => ({
        path: stablePath(field.path, lines),
        key: ruleKey(field.messageKey),
      })),
      uncertain: !definite,
    });
  };
  const checkedCommand = (invalid: TradeOrderKey) => {
    const command = toCommand(company, draft);
    const checked = tradeOrderCommandSchema.safeParse(command);
    if (checked.success) return checked.data;
    setFailure({
      message: t(invalid),
      issues: checked.error.issues.map((issue) => ({
        path: stablePath(issue.path.join("."), command.lines),
        key: "tord.issue.shape",
      })),
      uncertain: false,
    });
    return null;
  };

  const runPreview = async () => {
    if (busy) return;
    const command = checkedCommand("tord.previewInvalid");
    if (!command) {
      setPreviewFocus({ to: "button" });
      return;
    }
    setWorking("preview");
    setFailure(null);
    setSaved(null);
    try {
      setPreview(
        await masterRequest("/api/v1/trade/orders/preview", tradeOrderPreviewSchema, {
          method: "POST",
          body: command,
        }),
      );
      setPreviewFocus({ to: "result" });
    } catch (error) {
      setPreview(null);
      failed(error, command.lines, "tord.previewInvalid", "tord.previewFailed");
      setPreviewFocus({ to: "button" });
    } finally {
      setWorking(null);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const command = checkedCommand("tord.invalid");
    if (!command) return;
    setWorking("save");
    setFailure(null);
    try {
      const order = await masterRequest("/api/v1/trade/orders", tradeOrderSchema, {
        method: "POST",
        body: command,
      });
      setSaved(order);
      setPreview(null);
      setDraft(blankDraft());
      setDirty(false);
      void client.resetQueries({ queryKey: ["trade-orders", company.code] });
    } catch (error) {
      failed(error, command.lines, "tord.invalid", "tord.uncertain");
    } finally {
      setWorking(null);
    }
  };

  const fieldLabel = (path: string) => {
    const line = /^line:(.+?)(?:\.([A-Za-z]+))?$/u.exec(path);
    if (line) {
      const [, lineId, field] = line;
      if (!field) return `${t("tord.lineId")} ${lineId}`;
      const known = (lineFields as readonly string[]).includes(field);
      return `${known ? t(`tord.${field}` as TradeOrderKey) : field} ${lineId}`;
    }
    const header = ["orderId", "side", "party", "currency", "orderDate", "rounding", "lines"];
    return header.includes(path) ? t(`tord.${path}` as TradeOrderKey) : "";
  };
  const errorProps = (path: string) => {
    const issue = issueAt(path);
    return issue
      ? {
          "aria-invalid": true as const,
          "aria-describedby": `tord-error-${path.replaceAll(/[.:]/gu, "-")}`,
        }
      : {};
  };
  const errorText = (path: string) => {
    const issue = issueAt(path);
    return issue ? (
      <p className="ui-error-text" id={`tord-error-${path.replaceAll(/[.:]/gu, "-")}`}>
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
          <button
            ref={previewButton}
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void runPreview()}
          >
            {t("tord.preview")}
          </button>
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
            {busy ? (
              <span role="status">
                {t(working === "preview" ? "tord.previewing" : "tord.saving")}
              </span>
            ) : preview ? (
              <Badge tone="info">{t("tord.previewBadge")}</Badge>
            ) : (
              t("tord.amountsAfterSave")
            )}
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
        {preview && (
          <section
            className="tord-lookup-result"
            ref={previewResult}
            tabIndex={-1}
            aria-labelledby="tord-preview-title"
          >
            <h4 id="tord-preview-title">
              {t("tord.previewTitle")} <Badge tone="info">{t("tord.previewBadge")}</Badge>
            </h4>
            <p className="ui-hint">{t("tord.previewNote")}</p>
            <dl className="kpis">
              {amountKeys.map((key) => (
                <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
                  <dt className="label">{t(`tord.${key}`)}</dt>
                  <dd className="value">{money(preview[key])}</dd>
                </div>
              ))}
            </dl>
          </section>
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
                    {preview &&
                      amountKeys.map((key) => (
                        <th key={key} scope="col" className="num">
                          {t(`tord.${key}`)}
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
                        const path = `line:${line.lineId}.${field}`;
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
                      {preview &&
                        amountKeys.map((key) => (
                          <td key={key} className="num">
                            {money(preview.lines[index][key])}
                          </td>
                        ))}
                      <td>
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          aria-label={`${t("tord.removeLine")} ${line.lineId}`}
                          disabled={draft.lines.length === 1}
                          onClick={() => removeLine(line.lineId)}
                        >
                          {t("tord.removeLine")}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {preview && (
                    <tr className="tord-total">
                      <th scope="row" colSpan={1 + lineFields.length}>
                        {t("tord.total")}
                      </th>
                      {amountKeys.map((key) => (
                        <td key={key}>{money(preview[key])}</td>
                      ))}
                      <td />
                    </tr>
                  )}
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
          <OrderView order={saved} company={company} language={language} money={money} t={t} />
        </FastTab>
      )}
      <OrderList
        company={company}
        language={language}
        money={money}
        t={t}
        onOpen={(orderId) => open(orderId, true)}
      />
      <OrderLookup
        company={company}
        language={language}
        money={money}
        t={t}
        request={opened}
        onLookup={(orderId) => open(orderId, false)}
        onBack={onBack}
      />
    </>
  );
}

function OrderList({
  company,
  language,
  money,
  t,
  onOpen,
}: {
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
  onOpen: (orderId: string) => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(noFilter);
  const [applied, setApplied] = useState(noFilter);
  const [invalid, setInvalid] = useState<"party" | "range" | null>(null);
  const queryKey = ["trade-orders", company.code, applied] as const;
  const page = useInfiniteQuery({
    queryKey,
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) => {
      // Load more keeps the applied filters (TORD-05); an unfiltered URL is unchanged from TORD-03.
      const params = new URLSearchParams({ company: company.code, limit: "100" });
      if (pageParam) params.set("cursor", pageParam);
      for (const key of filterKeys) if (applied[key]) params.set(key, applied[key]);
      return masterRequest(`/api/v1/trade/orders?${params}`, tradeOrderPageSchema, { signal });
    },
    getNextPageParam: (value) => value.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((value) => value.items) ?? [];
  const filtered = filterKeys.some((key) => applied[key]);
  // Apply and Clear always reload from the first page, never from pages cached for those filters.
  const show = (next: Filter) => {
    setInvalid(null);
    void client.resetQueries({ queryKey: ["trade-orders", company.code, next], exact: true });
    setApplied(next);
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const next = { ...draft, party: draft.party.trim() };
    if (next.party && !tradeOrderCommandSchema.shape.party.safeParse(next.party).success)
      setInvalid("party");
    else if (next.from && next.to && next.from > next.to) setInvalid("range");
    else show(next);
  };
  const clear = () => {
    setDraft(noFilter);
    show(noFilter);
  };
  const edit = (patch: Partial<Filter>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setInvalid(null);
  };
  const described = (kind: "party" | "range") =>
    invalid === kind
      ? { "aria-invalid": true as const, "aria-describedby": `tord-filter-${kind}-error` }
      : {};
  return (
    <FastTab id="tord-list" title={t("tord.list")}>
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
            onChange={(event) => edit({ side: event.target.value as Filter["side"] })}
          >
            <option value="">{t("tord.filterAll")}</option>
            <option value="AP">{t("tord.filterAP")}</option>
            <option value="AR">{t("tord.filterAR")}</option>
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

function OrderLookup({
  company,
  language,
  money,
  t,
  request,
  onLookup,
  onBack,
}: {
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
  request: Opened | null;
  onLookup: (orderId: string) => void;
  onBack: () => void;
}) {
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Order | null>(null);
  const [error, setError] = useState<TradeOrderKey | "master.error" | null>(null);
  const [focusResult, setFocusResult] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const latest = useRef(0);
  const [failed, setFailed] = useState("");
  // An order number chosen in the list, the form or the address runs one lookup (TORD-03, TINV-03);
  // a removed `order` clears the result.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per request, not per keystroke.
  useEffect(() => {
    if (!request) {
      ++latest.current;
      setBusy(false);
      setResult(null);
      setError(null);
      return;
    }
    setOrderId(request.orderId);
    const toggle = document.querySelector<HTMLButtonElement>(
      '[aria-controls="tord-lookup-body"][aria-expanded="false"]',
    );
    toggle?.click();
    setFocusResult(request.focus);
    void run(request.orderId);
  }, [request]);
  useLayoutEffect(() => {
    if (focusResult && result) {
      resultRef.current?.focus();
      setFocusResult(false);
    }
  }, [focusResult, result]);
  const lookup = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    onLookup(orderId.trim());
  };
  // The latest selection owns the detail: a list click during a pending lookup supersedes it, and
  // a superseded response is dropped so it can never show beside the newer order number.
  const run = async (id: string) => {
    const ticket = ++latest.current;
    setResult(null);
    setError(null);
    setFailed(id);
    if (!tradeOrderCommandSchema.shape.orderId.safeParse(id).success) {
      setBusy(false);
      setError("tord.issue.shape");
      return;
    }
    setBusy(true);
    try {
      const order = await masterRequest(
        `/api/v1/trade/orders/${encodeURIComponent(id)}?company=${encodeURIComponent(company.code)}`,
        tradeOrderSchema,
      );
      if (ticket === latest.current) setResult(order);
    } catch (issue) {
      if (ticket === latest.current)
        setError(
          !(issue instanceof MasterDataFailure)
            ? "master.error"
            : issue.status === 400
              ? "tord.issue.shape"
              : issue.status === 404 && issue.detail?.code === "NOT_FOUND"
                ? "tord.notFound"
                : "master.error",
        );
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  };
  return (
    <FastTab id="tord-lookup" title={t("tord.lookup")}>
      <form className="filter-bar tord-lookup" onSubmit={lookup}>
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
          {error === "master.error" ? (
            <button type="button" className="btn btn-secondary" onClick={() => void run(failed)}>
              {label(language, "master.retry")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onBack();
                document
                  .querySelector<HTMLButtonElement>('[aria-controls="tord-list-body"]')
                  ?.focus();
              }}
            >
              {t("tord.deepLink.back")}
            </button>
          )}
        </MessageBar>
      )}
      {result && (
        <section
          className="tord-lookup-result"
          aria-label={t("tord.lookupTitle")}
          ref={resultRef}
          tabIndex={-1}
        >
          <h4>
            {t("tord.lookupTitle")} <Badge tone="info">{result.orderId}</Badge>
          </h4>
          <OrderView order={result} company={company} language={language} money={money} t={t} />
        </section>
      )}
    </FastTab>
  );
}

function OrderView({
  order,
  company,
  language,
  money,
  t,
}: {
  order: Order;
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
}) {
  const amountKeys = ["net", "tax", "gross"] as const;
  const reasonId = useId();
  // The saved / looked-up order stays the source of the detail; invoiced quantities come from one
  // extra read of the invoicing endpoint (TINV-02 decision 1), always fresh when the detail mounts.
  const invoicing = useQuery({
    queryKey: ["trade-order-invoicing", company.code, order.orderId],
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/orders/${encodeURIComponent(order.orderId)}/invoicing?company=${encodeURIComponent(company.code)}`,
        tradeOrderInvoicingSchema,
        { signal },
      ),
  });
  const known = invoicing.isSuccess && !invoicing.isFetching ? invoicing.data : null;
  const invoiced = new Map(known?.invoiced.map((row) => [row.lineId, row.invoicedQuantity]));
  const remaining = (line: Order["lines"][number]) => {
    const done = invoiced.get(line.lineId);
    return done === undefined ? null : micros(line.quantity) - micros(done);
  };
  const fullyInvoiced =
    known !== null && order.lines.every((line) => (remaining(line) ?? 1n) <= 0n);
  const invoiceLink = `/trade-invoices?${new URLSearchParams({ company: company.code, fromOrder: order.orderId })}`;
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
              <th scope="col">{t("tord.invoicedQuantity")}</th>
              <th scope="col">{t("tord.uninvoicedQuantity")}</th>
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
            {order.lines.map((line) => {
              const left = remaining(line);
              return (
                <tr key={line.lineId}>
                  <td>{line.lineNo}</td>
                  <td>{line.lineId}</td>
                  <td>{line.product}</td>
                  <td>{line.taxCode}</td>
                  <td>{line.quantity}</td>
                  <td>{invoiced.get(line.lineId) ?? "…"}</td>
                  <td>
                    {left === null ? (
                      "…"
                    ) : left > 0n ? (
                      fromMicros(left)
                    ) : (
                      <>
                        {left < 0n && `${fromMicros(left)} `}
                        <Badge tone="success">{t("tord.fullyInvoicedBadge")}</Badge>
                      </>
                    )}
                  </td>
                  <td>{line.unitPrice}</td>
                  <td>{line.discountPercent}</td>
                  {amountKeys.map((key) => (
                    <td key={key}>{money(line[key])}</td>
                  ))}
                </tr>
              );
            })}
            <tr className="tord-total">
              <th scope="row" colSpan={9}>
                {t("tord.total")}
              </th>
              {amountKeys.map((key) => (
                <td key={key}>{money(total(key))}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {invoicing.isFetching && <p role="status">{t("tord.invoicingLoading")}</p>}
      {invoicing.isError && !invoicing.isFetching && (
        <MessageBar tone="danger" role="alert">
          <p>{t("tord.invoicingFailed")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void invoicing.refetch()}
          >
            {label(language, "master.retry")}
          </button>
        </MessageBar>
      )}
      <div className="tord-invoice-actions">
        {known && !fullyInvoiced ? (
          <Link className="btn btn-primary" to={invoiceLink}>
            {t("tord.invoice")}
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled
            aria-describedby={fullyInvoiced ? reasonId : undefined}
          >
            {t("tord.invoice")}
          </button>
        )}
        {fullyInvoiced && (
          <p className="ui-hint" id={reasonId}>
            {t("tord.fullyInvoiced")}
          </p>
        )}
      </div>
    </div>
  );
}

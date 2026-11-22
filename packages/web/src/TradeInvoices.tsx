import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  tradeInvoiceCommandSchema,
  tradeInvoicePageSchema,
  tradeInvoicePreviewSchema,
  tradeInvoiceReceiptSchema,
  tradeOrderInvoicingSchema,
  type CompanyDto,
  type TradeInvoiceCommandDto,
  type TradeInvoicePreviewDto,
  type TradeInvoiceReceiptDto,
  type TradeOrderInvoicingDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { tradeEn } from "./ui/trade-labels.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { guardHistory, type HistoryGuard } from "./leave-guard-history.ts";
import { Badge, FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/trade-invoices.css";

type Key = Exclude<LabelKey, "shell.httpError">;
type T = (key: Key) => string;
type Failure = { key: Key; path: string | null };
type LineDraft = {
  lineId: string;
  product: string;
  taxCode: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxableCharge: string;
  orderLineId: string;
};
type Draft = {
  side: "AP" | "AR";
  party: string;
  externalInvoice: string;
  accountingDate: string;
  documentDate: string;
  taxDate: string;
  orderId: string;
  priceIncludesTax: boolean;
  rounding: "line" | "document";
  exception: boolean;
  reason: string;
  lines: LineDraft[];
};
type Pending = { command: TradeInvoiceCommandDto; fingerprint: string; key: string };
type Saved = { draft: Draft; documentId: string; dirty: boolean; pending: Pending | null };
type Guard = { busy: boolean; unsaved: boolean };
const idleGuard: Guard = { busy: false, unsaved: false };
// TINV-01: one `fromOrder` request taken from the address; `company` null means the current one.
type Intake = { company: string | null; orderId: string };
type IntakeState = {
  status: "loaded" | "notFound" | "fullyInvoiced" | "failed" | "locked";
  orderId: string;
};
const intakeTone = {
  loaded: "success",
  fullyInvoiced: "info",
  locked: "warning",
  notFound: "danger",
  failed: "danger",
} as const;

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = (n: number): LineDraft => ({
  lineId: `L${n}`,
  product: "",
  taxCode: "",
  quantity: "1",
  unitPrice: "",
  discountPercent: "0",
  taxableCharge: "0",
  orderLineId: "",
});
const blankDraft = (): Draft => {
  const day = today();
  return {
    side: "AP",
    party: "",
    externalInvoice: "",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    orderId: "",
    priceIncludesTax: false,
    rounding: "line",
    exception: false,
    reason: "",
    lines: [blankLine(1)],
  };
};
const lineFields = [
  "product",
  "taxCode",
  "quantity",
  "unitPrice",
  "discountPercent",
  "taxableCharge",
  "orderLineId",
] as const;

// Exact decimal arithmetic in millionths, matching the contract's at-most-6-decimal quantities.
const micros = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(6, "0"));
};
const decimalText = (value: bigint) => {
  const digits = value.toString().padStart(7, "0");
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`.replace(/\.?0+$/u, "");
};
/** New draft from an order: header from the order, only lines with an uninvoiced quantity. */
function draftFromOrder({ order, invoiced }: TradeOrderInvoicingDto): Draft | null {
  const done = new Map(invoiced.map((row) => [row.lineId, micros(row.invoicedQuantity)]));
  const lines = order.lines.flatMap((line) => {
    const remaining = micros(line.quantity) - (done.get(line.lineId) ?? 0n);
    return remaining > 0n ? [{ line, remaining }] : [];
  });
  if (!lines.length) return null;
  return {
    ...blankDraft(),
    side: order.side,
    party: order.party,
    orderId: order.orderId,
    priceIncludesTax: order.priceIncludesTax,
    rounding: order.rounding,
    lines: lines.map(({ line, remaining }, index) => ({
      lineId: `L${index + 1}`,
      product: line.product,
      taxCode: line.taxCode,
      quantity: decimalText(remaining),
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxableCharge: line.taxableCharge,
      orderLineId: line.lineId,
    })),
  };
}

// Drafts and an unresolved post envelope survive company switches, route changes and reloads in this tab.
const sessionKey = (company: string) => `erp.tradeInvoices.v1.${company}`;
const ADD_LINE_SHORTCUT = "Alt+Shift+N";
function loadSaved(company: string): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(company));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Saved> | null;
    if (
      !value ||
      typeof value.documentId !== "string" ||
      typeof value.draft !== "object" ||
      value.draft === null ||
      !Array.isArray(value.draft.lines) ||
      value.draft.lines.length === 0
    )
      return null;
    let pending: Pending | null = null;
    if (value.pending) {
      const command = tradeInvoiceCommandSchema.safeParse(value.pending.command);
      if (
        !command.success ||
        command.data.company !== company ||
        typeof value.pending.fingerprint !== "string" ||
        typeof value.pending.key !== "string"
      )
        return null;
      pending = { ...value.pending, command: command.data };
    }
    return {
      draft: { ...blankDraft(), ...value.draft },
      documentId: value.documentId,
      dirty: value.dirty === true,
      pending,
    };
  } catch {
    return null;
  }
}
// Returns whether sessionStorage now holds exactly this state (read back after writing).
function storeSaved(company: string, saved: Saved): boolean {
  try {
    const key = sessionKey(company);
    if (!saved.dirty && !saved.pending) {
      window.sessionStorage.removeItem(key);
      return window.sessionStorage.getItem(key) === null;
    }
    const value = JSON.stringify(saved);
    window.sessionStorage.setItem(key, value);
    return window.sessionStorage.getItem(key) === value;
  } catch {
    return false;
  }
}
// Shared by the trade pages: busy (a submit in flight or its outcome unknown) blocks in-app links
// and history; unsaved input asks once per navigation; modified clicks open a new tab untouched.
// Back/Forward go through leave-guard-history.ts (a cancel keeps the address and the draft).
export function useInvoiceLeaveGuard(guard: Guard, message: string) {
  // Listeners read the latest guard so a just-finished post never keeps blocking navigation.
  const latest = useRef(guard);
  latest.current = guard;
  const history = useRef<HistoryGuard | null>(null);
  // After every render: the page may rewrite its own address while guarded (leave-guard-history.ts).
  useLayoutEffect(() => history.current?.settle());
  // Layout effects: the guard is armed in the same commit as the input that made the page dirty,
  // so an immediate Back is asked (passive effects may run after the traversal has begun).
  useLayoutEffect(() => {
    if (!guard.busy && !guard.unsaved) return;
    const mayLeave = () =>
      !latest.current.busy && (!latest.current.unsaved || window.confirm(message));
    const guarded = guardHistory(mayLeave);
    history.current = guarded;
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.href === guarded.here() ||
        link.target === "_blank"
      )
        return;
      const plain =
        event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
      if (!latest.current.busy && !plain) return;
      if (mayLeave()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!latest.current.busy && !latest.current.unsaved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      history.current = null;
      guarded.dispose();
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard.busy, guard.unsaved, message]);
}
function isIssueKey(key: string): key is Key {
  return key in tradeEn;
}
function failure(error: unknown): Failure {
  if (error instanceof MasterDataFailure) {
    const field = error.detail?.fieldErrors[0];
    const rule = field?.messageKey.split(".").at(-1) ?? "";
    const key = `tinv.issue.${rule}`;
    if (field && isIssueKey(key)) return { key, path: field.path };
    if (error.status === 409) return { key: "master.conflict", path: null };
    if (error.status === 400 || error.kind === "invalid")
      return { key: "tinv.issue.shape", path: field?.path ?? null };
  }
  return { key: "master.error", path: null };
}
function uncertain(error: unknown) {
  return (
    !(error instanceof MasterDataFailure) || error.kind !== "http" || (error.status ?? 500) >= 500
  );
}
function toCommand(company: CompanyDto, documentId: string, draft: Draft): TradeInvoiceCommandDto {
  return {
    company: company.code,
    documentId,
    side: draft.side,
    party: draft.party.trim(),
    externalInvoice: draft.externalInvoice,
    currency: company.currency,
    accountingDate: draft.accountingDate,
    documentDate: draft.documentDate,
    taxDate: draft.taxDate,
    orderId: draft.orderId.trim() || null,
    priceIncludesTax: draft.priceIncludesTax,
    rounding: draft.rounding,
    headerDimensions: {},
    matchingException: draft.exception ? { confirmed: true, reason: draft.reason } : null,
    lines: draft.lines.map((line) => ({
      lineId: line.lineId,
      product: line.product.trim(),
      taxCode: line.taxCode.trim() || null,
      quantity: line.quantity.trim(),
      unitPrice: line.unitPrice.trim(),
      discountPercent: line.discountPercent.trim(),
      taxableCharge: line.taxableCharge.trim(),
      orderLineId: line.orderLineId.trim() || null,
      dimensions: {},
    })),
  };
}

export function TradeInvoices({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key);
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(() => params.get("company") ?? "");
  const [guard, setGuard] = useState(idleGuard);
  const [intake, setIntake] = useState<Intake | null>(null);
  useInvoiceLeaveGuard(guard, t("trade.leaveConfirm"));
  const fromOrder = params.get("fromOrder");
  // The router commits the dropped parameter in a transition, so this effect can rerun (e.g. on
  // guard.busy) while the address still shows the request: take each request only once.
  const taken = useRef<string | null>(null);
  // Take the request once and drop it from the address (replace), so a refresh never refills.
  useEffect(() => {
    if (fromOrder === null) {
      taken.current = null;
      return;
    }
    if (taken.current === fromOrder) return;
    taken.current = fromOrder;
    const target = params.get("company");
    const orderId = fromOrder.trim();
    setIntake(orderId ? { company: target || null, orderId } : null);
    if (target && !guard.busy) setSelected(target);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("fromOrder");
        return next;
      },
      { replace: true },
    );
  }, [fromOrder, params, setParams, guard.busy]);
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
  const company = rows.find((row) => row.code === selected) ?? rows[0];
  // An order link names its company: if it is not among the loaded companies, say so and fill
  // nothing instead of falling back to another company (picking a company drops the request).
  const wanted = intake?.company;
  const missing = !!wanted && companies.isSuccess && !rows.some((row) => row.code === wanted);
  return (
    <section className="page trade-invoices">
      <PageHeader
        title={t("tinv.title")}
        description={t("tinv.description")}
        context={
          <div className="field">
            <label htmlFor="tinv-company">{t("master.company")}</label>
            <select
              id="tinv-company"
              value={company?.code ?? ""}
              disabled={guard.busy}
              onChange={(event) => {
                setSelected(event.target.value);
                setIntake(null);
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
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {missing && (
        <MessageBar tone="danger" role="alert">
          <p>
            {t("tinv.fromOrder.company")} · {wanted}
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setIntake(null)}>
            {t("master.cancel")}
          </button>
        </MessageBar>
      )}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          <p>{t(failure(companies.error).key)}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void companies.refetch()}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {company && !missing && (
        <>
          <InvoiceEntry
            key={company.code}
            company={company}
            preferences={preferences}
            t={t}
            onGuard={setGuard}
            intake={
              intake && (intake.company === null || intake.company === company.code)
                ? intake.orderId
                : null
            }
            onIntake={setIntake}
          />
          <InvoiceList company={company} preferences={preferences} t={t} />
        </>
      )}
    </section>
  );
}

function InvoiceEntry({
  company,
  preferences,
  t,
  onGuard,
  intake,
  onIntake,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
  intake: string | null;
  onIntake: (done: null) => void;
}) {
  const client = useQueryClient();
  const [saved] = useState(() => loadSaved(company.code));
  const [draft, setDraft] = useState(() => saved?.draft ?? blankDraft());
  const [documentId, setDocumentId] = useState(() => saved?.documentId ?? crypto.randomUUID());
  const [dirty, setDirty] = useState(saved?.dirty ?? false);
  const [preview, setPreview] = useState<{ value: TradeInvoicePreviewDto; command: string } | null>(
    null,
  );
  const [pending, setPending] = useState<Pending | null>(saved?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(
    saved?.pending ? { key: "tinv.uncertain", path: null } : null,
  );
  const [retry, setRetry] = useState(saved?.pending != null);
  // Layout effect so storage matches the committed screen: a render that shows the receipt has
  // already dropped the posted envelope. Best-effort draft autosave; the post envelope itself is
  // persisted synchronously in confirm().
  useLayoutEffect(() => {
    storeSaved(company.code, { draft, documentId, dirty, pending });
  }, [company.code, draft, documentId, dirty, pending]);
  useLayoutEffect(() => {
    onGuard({ busy, unsaved: dirty || pending !== null });
  }, [onGuard, busy, dirty, pending]);
  useLayoutEffect(() => () => onGuard(idleGuard), [onGuard]);
  const [receipt, setReceipt] = useState<TradeInvoiceReceiptDto | null>(null);
  const firstField = useRef<HTMLSelectElement>(null);
  const command = toCommand(company, documentId, draft);
  const serialized = JSON.stringify(command);
  const stale = preview !== null && preview.command !== serialized;
  const money = (value: number) => formatMinor(value, preferences.language, company.scale);
  const locked = busy || pending !== null;

  const edit = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setDirty(true);
    setReceipt(null);
  };
  const discard = () => {
    if (locked || !window.confirm(t("tinv.discardConfirm"))) return;
    setDraft(blankDraft());
    setDocumentId(crypto.randomUUID());
    setDirty(false);
    setPreview(null);
    setError(null);
    setFromOrder(null);
  };
  const [fromOrder, setFromOrder] = useState<IntakeState | null>(null);
  // Each fill sets a new "loaded" state object, so focus moves once per fill.
  useEffect(() => {
    if (fromOrder?.status === "loaded") document.getElementById("tinv-externalInvoice")?.focus();
  }, [fromOrder]);
  const fillFromOrder = async (orderId: string) => {
    if (locked) {
      setFromOrder({ status: "locked", orderId });
      return;
    }
    setBusy(true);
    setFromOrder(null);
    try {
      const value = await masterRequest(
        `/api/v1/trade/orders/${encodeURIComponent(orderId)}/invoicing?company=${encodeURIComponent(company.code)}`,
        tradeOrderInvoicingSchema,
      );

      const next = draftFromOrder(value);
      if (!next) {
        setFromOrder({ status: "fullyInvoiced", orderId });
        return;
      }
      // Cancelled: the request status was already cleared above.
      if (dirty && !window.confirm(t("tinv.fromOrder.replaceConfirm"))) return;
      setDraft(next);
      setDocumentId(crypto.randomUUID());
      setDirty(true);
      setPreview(null);
      setError(null);
      setReceipt(null);
      setFromOrder({ status: "loaded", orderId });
    } catch (issue) {
      // Only a confirmed NOT_FOUND means "no such order"; anything else (400 included) can be retried.
      const missing = (issue as MasterDataFailure | undefined)?.detail?.code === "NOT_FOUND";
      setFromOrder({ status: missing ? "notFound" : "failed", orderId });
    } finally {
      setBusy(false);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: one load per address request; fillFromOrder reads that render's draft state.
  useEffect(() => {
    if (intake === null) return;
    onIntake(null);
    void fillFromOrder(intake);
  }, [intake, onIntake]);
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
  // Layout effect: a passive effect leaves the previous render's listener (stale draft and locked
  // state) attached after commit, silently dropping a shortcut pressed in that window.
  useLayoutEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "n" && !locked) {
        event.preventDefault();
        addLine();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  const runPreview = async (event: FormEvent) => {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const value = await masterRequest(
        "/api/v1/trade/invoices/preview",
        tradeInvoicePreviewSchema,
        { method: "POST", body: command },
      );
      setPreview({ value, command: serialized });
    } catch (issue) {
      setPreview(null);
      setError(failure(issue));
    } finally {
      setBusy(false);
    }
  };
  const post = async (request: Pending) => {
    setBusy(true);
    setError(null);
    setRetry(false);
    try {
      const value = await masterRequest("/api/v1/trade/invoices", tradeInvoiceReceiptSchema, {
        method: "POST",
        body: {
          command: request.command,
          fingerprint: request.fingerprint,
          idempotencyKey: request.key,
          confirmation: "POST",
        },
      });
      setReceipt(value);
      setPending(null);
      setPreview(null);
      setFromOrder(null);
      setDraft(blankDraft());
      setDocumentId(crypto.randomUUID());
      setDirty(false);
      void client.invalidateQueries({ queryKey: ["trade-invoices", company.code] });
      firstField.current?.focus();
    } catch (issue) {
      if (uncertain(issue)) {
        setRetry(true);
        setError({ key: "tinv.uncertain", path: null });
      } else {
        setPending(null);
        setError(failure(issue));
      }
    } finally {
      setBusy(false);
    }
  };
  const confirm = () => {
    if (!preview || stale || locked) return;
    const request = {
      command: JSON.parse(preview.command) as TradeInvoiceCommandDto,
      fingerprint: preview.value.fingerprint,
      key: crypto.randomUUID(),
    };
    // D7: the original envelope must be durable before the request can reach the server.
    if (!storeSaved(company.code, { draft, documentId, dirty, pending: request })) {
      setError({ key: "tinv.storageFailed", path: null });
      return;
    }
    setPending(request);
    void post(request);
  };

  const generalSummary = [
    t(`trade.${draft.side}`),
    draft.party.trim(),
    draft.externalInvoice.trim(),
    draft.accountingDate,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      className="tinv-entry"
      aria-label={t("tinv.entry")}
      onSubmit={(event) => void runPreview(event)}
    >
      <div className="tinv-command-bar">
        <button type="submit" className="btn btn-secondary" disabled={locked}>
          {t("tinv.preview")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!preview || stale || locked}
          onClick={confirm}
        >
          {t("tinv.confirm")}
        </button>
        <span className="tinv-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn btn-subtle"
          disabled={!dirty || locked}
          onClick={discard}
        >
          {t("tinv.discard")}
        </button>
        <span className="tinv-status">
          {busy && <span role="status">{t("master.loading")}</span>}
          {preview &&
            (stale ? (
              <Badge tone="warning">{t("tinv.previewStale")}</Badge>
            ) : (
              <Badge tone="success">{t("tinv.previewCurrent")}</Badge>
            ))}
        </span>
      </div>
      {error && (
        <MessageBar tone={error.key === "tinv.uncertain" ? "warning" : "danger"} role="alert">
          <p>
            {t(error.key)}
            {error.path ? ` (${error.path})` : ""}
          </p>
          {retry && pending && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void post(pending)}
            >
              {t("tinv.retryConfirm")}
            </button>
          )}
        </MessageBar>
      )}
      {receipt && (
        <MessageBar tone="success" role="status">
          {t("tinv.posted")} {receipt.journalIds.join(", ")} · {money(receipt.gross)}
        </MessageBar>
      )}
      {fromOrder && (
        <MessageBar
          tone={intakeTone[fromOrder.status]}
          role={
            fromOrder.status === "loaded" || fromOrder.status === "fullyInvoiced"
              ? "status"
              : "alert"
          }
        >
          <p>
            {t(`tinv.fromOrder.${fromOrder.status}`)} · {fromOrder.orderId}
          </p>
          {fromOrder.status === "failed" && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void fillFromOrder(fromOrder.orderId)}
            >
              {t("master.retry")}
            </button>
          )}
        </MessageBar>
      )}
      {stale && (
        <MessageBar tone="warning" role="alert">
          {t("tinv.stale")}
        </MessageBar>
      )}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("tinv.teaching")}
        {fromOrder?.status === "loaded" && (
          <>
            <br />
            {t("tinv.fromOrder.teaching")}
          </>
        )}
      </TeachingTip>
      <FastTab id="tinv-general" title={t("tinv.entry")} summary={generalSummary}>
        <fieldset disabled={locked} className="ui-form-grid">
          <div className="ui-field">
            <label htmlFor="tinv-side">{t("tinv.side")}</label>
            <select
              id="tinv-side"
              ref={firstField}
              value={draft.side}
              onChange={(event) => edit({ side: event.target.value === "AR" ? "AR" : "AP" })}
            >
              <option value="AP">{t("trade.AP")}</option>
              <option value="AR">{t("trade.AR")}</option>
            </select>
          </div>
          {(
            [
              ["party", 40, "text"],
              ["externalInvoice", 100, "text"],
              ["accountingDate", 10, "date"],
              ["documentDate", 10, "date"],
              ["taxDate", 10, "date"],
              ["orderId", 40, "text"],
            ] as const
          ).map(([field, max, type]) => (
            <div key={field} className="ui-field">
              <label htmlFor={`tinv-${field}`}>{t(`tinv.${field}`)}</label>
              <input
                id={`tinv-${field}`}
                type={type}
                maxLength={max}
                value={draft[field]}
                onChange={(event) => edit({ [field]: event.target.value })}
              />
            </div>
          ))}
          <label className="ui-check" htmlFor="tinv-priceIncludesTax">
            <input
              id="tinv-priceIncludesTax"
              type="checkbox"
              checked={draft.priceIncludesTax}
              onChange={(event) => edit({ priceIncludesTax: event.target.checked })}
            />
            {t("tinv.priceIncludesTax")}
          </label>
          <div className="ui-field">
            <label htmlFor="tinv-rounding">{t("tinv.rounding")}</label>
            <select
              id="tinv-rounding"
              value={draft.rounding}
              onChange={(event) =>
                edit({ rounding: event.target.value === "document" ? "document" : "line" })
              }
            >
              <option value="line">{t("tinv.roundingLine")}</option>
              <option value="document">{t("tinv.roundingDocument")}</option>
            </select>
          </div>
        </fieldset>
      </FastTab>
      <FastTab id="tinv-lines" title={t("tinv.lines")}>
        <fieldset disabled={locked} className="tinv-lines">
          <div className="grid-wrap">
            <table className="grid" aria-label={t("tinv.lines")}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  {lineFields.map((field) => (
                    <th key={field} scope="col">
                      {t(`tinv.${field}`)}
                    </th>
                  ))}
                  <th scope="col">{t("tinv.removeLine")}</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line, index) => (
                  <tr key={line.lineId}>
                    <td>{line.lineId}</td>
                    {lineFields.map((field) => (
                      <td key={field}>
                        <input
                          aria-label={`${t(`tinv.${field}`)} ${line.lineId}`}
                          inputMode={
                            field === "product" || field === "taxCode" || field === "orderLineId"
                              ? "text"
                              : "decimal"
                          }
                          maxLength={60}
                          value={line[field]}
                          onChange={(event) => editLine(index, field, event.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn btn-subtle btn-sm"
                        aria-label={`${t("tinv.removeLine")} ${line.lineId}`}
                        disabled={draft.lines.length === 1}
                        onClick={() => edit({ lines: draft.lines.filter((_, i) => i !== index) })}
                      >
                        {t("tinv.removeLine")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ui-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              aria-keyshortcuts={ADD_LINE_SHORTCUT}
              disabled={draft.lines.length >= 100}
              onClick={addLine}
            >
              {t("tinv.addLine")}{" "}
              <span aria-hidden="true">
                <kbd>{t("tinv.addLineShortcut")}</kbd>
              </span>
            </button>
            <label className="ui-check" htmlFor="tinv-exception">
              <input
                id="tinv-exception"
                type="checkbox"
                checked={draft.exception}
                onChange={(event) => edit({ exception: event.target.checked })}
              />
              {t("tinv.exceptionConfirmed")}
            </label>
          </div>
          {draft.exception && (
            <div className="ui-field tinv-reason">
              <label htmlFor="tinv-reason">{t("tinv.exceptionReason")}</label>
              <input
                id="tinv-reason"
                maxLength={160}
                value={draft.reason}
                onChange={(event) => edit({ reason: event.target.value })}
              />
            </div>
          )}
        </fieldset>
      </FastTab>
      {preview && (
        <FastTab
          id="tinv-preview"
          title={t("tinv.previewTitle")}
          summary={t("tinv.previewSummary")}
        >
          <PreviewPanel preview={preview.value} money={money} t={t} />
        </FastTab>
      )}
    </form>
  );
}

function PreviewPanel({
  preview,
  money,
  t,
}: {
  preview: TradeInvoicePreviewDto;
  money: (value: number) => string;
  t: T;
}) {
  const calc = preview.calculation;
  const amountKeys = ["net", "tax", "gross", "deductibleTax", "expense"] as const;
  const tone = { matched: "success", exception: "warning", notApplicable: "info" } as const;
  return (
    <section className="tinv-preview" aria-label={t("tinv.previewTitle")}>
      <dl className="kpis">
        {(["net", "tax", "gross", "deductibleTax"] as const).map((key) => (
          <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
            <dt className="label">{t(`tinv.${key}`)}</dt>
            <dd className="value">{money(calc[key])}</dd>
          </div>
        ))}
      </dl>
      <dl className="tinv-facts">
        <div>
          <dt>{t("tinv.dueDate")}</dt>
          <dd>{preview.dueDate}</dd>
        </div>
        <div>
          <dt>{t("tinv.discountDate")}</dt>
          <dd>{preview.discountDate}</dd>
        </div>
        <div>
          <dt>{t("tinv.controlAccount")}</dt>
          <dd>{preview.controlAccount}</dd>
        </div>
        <div>
          <dt>{t("tinv.poMatch")}</dt>
          <dd>
            <Badge tone={tone[preview.poMatch]}>{t(`tinv.${preview.poMatch}`)}</Badge>
          </dd>
        </div>
      </dl>
      <div className="grid-wrap">
        <table className="grid" aria-label={t("tinv.previewTitle")}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("tinv.taxCode")}</th>
              {amountKeys.map((key) => (
                <th key={key} scope="col">
                  {t(`tinv.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calc.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.id}</td>
                <td>{line.taxCode}</td>
                {amountKeys.map((key) => (
                  <td key={key}>{money(line[key])}</td>
                ))}
              </tr>
            ))}
            <tr className="tinv-total">
              <th scope="row" colSpan={2}>
                Σ
              </th>
              {amountKeys.map((key) => (
                <td key={key}>{money(calc[key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="tinv-split">
        <div className="grid-wrap">
          <table className="grid" aria-label="GL">
            <caption>{t("tinv.postingPreview")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("tinv.account")}</th>
                <th scope="col">{t("tinv.debit")}</th>
                <th scope="col">{t("tinv.credit")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.journal.journals.flatMap((journal, j) =>
                journal.lines.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Plan lines have no identity beyond position.
                  <tr key={`${j}:${i}`}>
                    <td>{line.account}</td>
                    <td>{line.debit ? money(line.debit) : ""}</td>
                    <td>{line.credit ? money(line.credit) : ""}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {preview.matches.length > 0 && (
          <div className="grid-wrap">
            <table className="grid" aria-label={t("tinv.poMatch")}>
              <caption>{t("tinv.poMatch")}</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t("tinv.orderLineId")}</th>
                  <th scope="col">{t("tinv.quantity")}</th>
                  <th scope="col">{t("tinv.expectedNet")}</th>
                  <th scope="col">{t("tinv.net")}</th>
                  <th scope="col">{t("tinv.variance")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.matches.map((match) => (
                  <tr key={match.lineId}>
                    <td>{match.lineId}</td>
                    <td>{match.orderLineId}</td>
                    <td>{match.quantity}</td>
                    <td>{money(match.expectedNet)}</td>
                    <td>{money(match.invoiceNet)}</td>
                    <td>
                      {match.variance < 0 ? "-" : ""}
                      {money(Math.abs(match.variance))}
                      {match.withinTolerance ? "" : " ⚠"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** Router path of an order's detail on the order page (TINV-03 reads `company` and `order`). */
export const sourceOrderPath = (company: string, orderId: string) =>
  `/trade-orders?company=${encodeURIComponent(company)}&order=${encodeURIComponent(orderId)}`;

// A router link: keyboard-activatable and openable in a new tab; leaving a dirty draft is confirmed
// by the page's leave guard like any other in-app link.
export function SourceOrderCell({
  company,
  orderId,
  t,
}: {
  company: string;
  orderId: string | null;
  t: T;
}) {
  return (
    <td className="tinv-source">
      {orderId === null ? (
        <>
          <span aria-hidden="true">—</span>
          <span className="visually-hidden">{t("tinv.noSourceOrder")}</span>
        </>
      ) : (
        <Link to={sourceOrderPath(company, orderId)}>{orderId}</Link>
      )}
    </td>
  );
}

function InvoiceList({
  company,
  preferences,
  t,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
}) {
  const page = useInfiniteQuery({
    queryKey: ["trade-invoices", company.code],
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/invoices?company=${encodeURIComponent(company.code)}&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        tradeInvoicePageSchema,
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
                  <td>{row.externalNo}</td>
                  <td>{row.accountingDate}</td>
                  <td>{row.dueDate}</td>
                  <td>{t(`tinv.${row.poMatch}`)}</td>
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
        {page.isSuccess && rows.length === 0 && <p className="empty-state">{t("tinv.empty")}</p>}
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
    </div>
  );
}

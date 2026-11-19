import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  companiesPageSchema,
  tradeInvoiceCommandSchema,
  tradeInvoicePageSchema,
  tradeInvoicePreviewSchema,
  tradeInvoiceReceiptSchema,
  type CompanyDto,
  type TradeInvoiceCommandDto,
  type TradeInvoicePreviewDto,
  type TradeInvoiceReceiptDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { tradeEn } from "./ui/trade-labels.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";

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

// Drafts and an unresolved post envelope survive company switches, route changes and reloads in this tab.
const sessionKey = (company: string) => `erp.tradeInvoices.v1.${company}`;
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
export function useInvoiceLeaveGuard(guard: Guard) {
  // Listeners read the latest guard so a just-finished post never keeps blocking navigation.
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    if (!guard.busy && !guard.unsaved) return;
    const current = window.location.href;
    const click = (event: MouseEvent) => {
      if (!latest.current.busy) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.href === current || link.target === "_blank")
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const navigation = (event: Event) => {
      if (!latest.current.busy || window.location.href === current) return;
      event.stopImmediatePropagation();
      window.history.replaceState(window.history.state, "", current);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!latest.current.busy && !latest.current.unsaved) return;
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
  }, [guard.busy, guard.unsaved]);
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
  const [selected, setSelected] = useState("");
  const [guard, setGuard] = useState(idleGuard);
  useInvoiceLeaveGuard(guard);
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
    <section>
      <h2>{t("tinv.title")}</h2>
      {preferences.teaching && <p className="teaching">{t("tinv.teaching")}</p>}
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <div role="alert">
          <p>{t(failure(companies.error).key)}</p>
          <button type="button" onClick={() => void companies.refetch()}>
            {t("master.retry")}
          </button>
        </div>
      )}
      <label htmlFor="tinv-company">{t("master.company")}</label>
      <select
        id="tinv-company"
        value={company?.code ?? ""}
        disabled={guard.busy}
        onChange={(event) => setSelected(event.target.value)}
      >
        {rows.map((row) => (
          <option key={row.code} value={row.code}>
            {row.code} · {row.name}
          </option>
        ))}
      </select>
      {company && (
        <>
          <InvoiceEntry
            key={company.code}
            company={company}
            preferences={preferences}
            t={t}
            onGuard={setGuard}
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
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
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
  useEffect(() => {
    // Best-effort draft autosave; the post envelope itself is persisted synchronously in confirm().
    storeSaved(company.code, { draft, documentId, dirty, pending });
  }, [company.code, draft, documentId, dirty, pending]);
  useEffect(() => {
    onGuard({ busy, unsaved: dirty || pending !== null });
  }, [onGuard, busy, dirty, pending]);
  useEffect(() => () => onGuard(idleGuard), [onGuard]);
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
  useEffect(() => {
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

  return (
    <form aria-label={t("tinv.entry")} onSubmit={(event) => void runPreview(event)}>
      <h3>{t("tinv.entry")}</h3>
      <fieldset disabled={locked} className="form-grid">
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
          <span key={field} className="form-field">
            <label htmlFor={`tinv-${field}`}>{t(`tinv.${field}`)}</label>
            <input
              id={`tinv-${field}`}
              type={type}
              maxLength={max}
              value={draft[field]}
              onChange={(event) => edit({ [field]: event.target.value })}
            />
          </span>
        ))}
        <label className="checkbox-label" htmlFor="tinv-priceIncludesTax">
          <input
            id="tinv-priceIncludesTax"
            type="checkbox"
            checked={draft.priceIncludesTax}
            onChange={(event) => edit({ priceIncludesTax: event.target.checked })}
          />
          {t("tinv.priceIncludesTax")}
        </label>
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
        <table aria-label={t("tinv.lines")}>
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
        <button type="button" disabled={draft.lines.length >= 100} onClick={addLine}>
          {t("tinv.addLine")}
        </button>
        <label className="checkbox-label" htmlFor="tinv-exception">
          <input
            id="tinv-exception"
            type="checkbox"
            checked={draft.exception}
            onChange={(event) => edit({ exception: event.target.checked })}
          />
          {t("tinv.exceptionConfirmed")}
        </label>
        {draft.exception && (
          <>
            <label htmlFor="tinv-reason">{t("tinv.exceptionReason")}</label>
            <input
              id="tinv-reason"
              maxLength={160}
              value={draft.reason}
              onChange={(event) => edit({ reason: event.target.value })}
            />
          </>
        )}
      </fieldset>
      <button type="submit" disabled={locked}>
        {t("tinv.preview")}
      </button>
      <button type="button" disabled={!preview || stale || locked} onClick={confirm}>
        {t("tinv.confirm")}
      </button>
      <button type="button" disabled={!dirty || locked} onClick={discard}>
        {t("tinv.discard")}
      </button>
      {busy && <p role="status">{t("master.loading")}</p>}
      {error && (
        <div role="alert">
          <p>
            {t(error.key)}
            {error.path ? ` (${error.path})` : ""}
          </p>
          {retry && pending && (
            <button type="button" disabled={busy} onClick={() => void post(pending)}>
              {t("tinv.retryConfirm")}
            </button>
          )}
        </div>
      )}
      {receipt && (
        <p role="status">
          {t("tinv.posted")} {receipt.journalIds.join(", ")} · {money(receipt.gross)}
        </p>
      )}
      {stale && <p role="alert">{t("tinv.stale")}</p>}
      {preview && <PreviewPanel preview={preview.value} money={money} t={t} />}
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
  return (
    <section aria-label={t("tinv.previewTitle")}>
      <h3>{t("tinv.previewTitle")}</h3>
      <table aria-label={t("tinv.previewTitle")}>
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
          <tr>
            <th scope="row" colSpan={2}>
              Σ
            </th>
            {amountKeys.map((key) => (
              <td key={key}>{money(calc[key])}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <dl>
        <dt>{t("tinv.dueDate")}</dt>
        <dd>{preview.dueDate}</dd>
        <dt>{t("tinv.discountDate")}</dt>
        <dd>{preview.discountDate}</dd>
        <dt>{t("tinv.controlAccount")}</dt>
        <dd>{preview.controlAccount}</dd>
        <dt>{t("tinv.poMatch")}</dt>
        <dd>{t(`tinv.${preview.poMatch}`)}</dd>
      </dl>
      {preview.matches.length > 0 && (
        <table aria-label={t("tinv.poMatch")}>
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
      )}
      <table aria-label="GL">
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
    </section>
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
    "tinv.gross",
  ] as const;
  return (
    <>
      <h3>{t("tinv.list")}</h3>
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && (
        <div role="alert">
          <p>{t(failure(page.error).key)}</p>
          <button type="button" onClick={() => void page.refetch()}>
            {t("master.retry")}
          </button>
        </div>
      )}
      <section
        className="accounts-scroll"
        ref={scroll}
        aria-label={t("tinv.list")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual list supports keyboard scrolling.
        tabIndex={0}
      >
        <table aria-label={t("tinv.list")} aria-rowcount={rows.length + 1}>
          <thead>
            <tr>
              {headers.map((key) => (
                <th key={key} scope="col">
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
      </section>
      {page.hasNextPage && (
        <button
          type="button"
          disabled={page.isFetchingNextPage}
          onClick={() => void page.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
    </>
  );
}

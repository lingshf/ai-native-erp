import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  tradeInvoicePreviewSchema,
  tradeInvoiceReceiptSchema,
  tradeOrderInvoicingSchema,
  type CompanyDto,
  type TradeInvoiceCommandDto,
  type TradeInvoicePreviewDto,
  type TradeInvoiceReceiptDto,
} from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { masterRequest, type MasterDataFailure } from "../master-data-client.ts";
import { formatMinor } from "../reports-data.ts";
import { Badge, FastTab, MessageBar, TeachingTip } from "../ui/components/index.tsx";
import {
  blankDraft,
  blankLine,
  draftFromOrder,
  failure,
  idleGuard,
  uncertain,
  type Draft,
  type Failure,
  type Guard,
  type Pending,
  type T,
} from "./invoice-model.ts";
import { loadSaved, storeSaved } from "./invoice-session.ts";
import { PreviewPanel } from "./preview-panel.tsx";

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
const lineFields = [
  "product",
  "taxCode",
  "quantity",
  "unitPrice",
  "discountPercent",
  "taxableCharge",
  "orderLineId",
] as const;
const ADD_LINE_SHORTCUT = "Alt+Shift+N";
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

export function InvoiceEntry({
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
          <PreviewPanel
            preview={preview.value}
            money={money}
            language={preferences.language}
            t={t}
          />
        </FastTab>
      )}
    </form>
  );
}

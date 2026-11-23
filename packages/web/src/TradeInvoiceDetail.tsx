import { useEffect, useRef, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  tradeInvoiceDetailSchema,
  type CompanyDto,
  type TradeInvoiceDetailDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import {
  detailLabel,
  isDetailKey,
  type TradeInvoiceDetailKey,
} from "./ui/trade-invoice-detail-labels.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { MessageBar, TeachingTip } from "./ui/components/index.tsx";

type Key = Exclude<LabelKey, "shell.httpError"> | TradeInvoiceDetailKey;
type T = (key: Key) => string;

/** Query key of one invoice's detail; every open fetches it again (staleTime 0, gcTime 0). */
export const invoiceDetailKey = (company: string, documentId: string) =>
  ["trade-invoice", company, documentId] as const;

const focusable =
  "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex='0']";
// Same shape check as the server (application/trade-documents.ts): anything else cannot exist.
const documentIdPattern = /^[0-9a-f-]{36}$/;

// TINV-06: read-only modal in the same shape as Journals.tsx `Modal` (showModal, focus on open,
// Esc / cancel closes, Tab cycles inside), written here so the invoice page does not import
// Journals.tsx or journals.css. It never touches the address, history or the leave guard.
export function TradeInvoiceDetail({
  company,
  documentId,
  externalNo,
  preferences,
  close,
}: {
  company: CompanyDto;
  documentId: string;
  // Unknown for a deep link to an invoice that is not in the loaded rows (TINV-07).
  externalNo: string | undefined;
  preferences: Preferences;
  close: () => void;
}) {
  const t: T = (key) =>
    isDetailKey(key) ? detailLabel(preferences.language, key) : label(preferences.language, key);
  const ref = useRef<HTMLDialogElement>(null);
  // A malformed id from the address is reported as not found without a request.
  const wellFormed = documentIdPattern.test(documentId);
  const detail = useQuery({
    queryKey: invoiceDetailKey(company.code, documentId),
    staleTime: 0,
    gcTime: 0,
    enabled: wellFormed,
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/invoices/${encodeURIComponent(documentId)}?company=${encodeURIComponent(company.code)}`,
        tradeInvoiceDetailSchema,
        { signal },
      ),
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);
  const keyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusable));
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === ref.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (active === last || active === ref.current)) {
      event.preventDefault();
      first.focus();
    }
  };
  const number = externalNo ?? (detail.isSuccess ? detail.data.document.externalNo : undefined);
  const title =
    number === undefined ? t("tinv.detail.title") : `${t("tinv.detail.title")} · ${number}`;
  const notFound =
    !wellFormed || (detail.error instanceof MasterDataFailure && detail.error.status === 404);
  const code = detail.error instanceof MasterDataFailure ? detail.error.detail?.code : undefined;
  return (
    <dialog
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      ref={ref}
      className="tinv-detail"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={keyDown}
    >
      <header className="tinv-detail-head">
        <h3>{title}</h3>
        <button type="button" className="btn btn-secondary" onClick={close}>
          {t("tinv.detail.close")}
        </button>
      </header>
      {wellFormed && detail.isPending && <p role="status">{t("tinv.detail.loading")}</p>}
      {(detail.isError || !wellFormed) && (
        <MessageBar tone="danger" role="alert">
          <p>
            {t(notFound ? "tinv.detail.notFound" : "tinv.detail.error")}
            {!notFound && code ? ` (${code})` : ""}
          </p>
          {!notFound && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void detail.refetch()}
            >
              {t("master.retry")}
            </button>
          )}
        </MessageBar>
      )}
      {detail.isSuccess && (
        <DetailBody value={detail.data} company={company} preferences={preferences} t={t} />
      )}
    </dialog>
  );
}

function DetailBody({
  value,
  company,
  preferences,
  t,
}: {
  value: TradeInvoiceDetailDto;
  company: CompanyDto;
  preferences: Preferences;
  t: T;
}) {
  const { document: invoice, openItem } = value;
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const day = (iso: string) => iso.slice(0, 10);
  const settlements = value.settlements
    .flatMap((settlement) => {
      const allocation = settlement.allocations.find((item) => item.itemId === openItem.itemId);
      return allocation ? [{ settlement, allocation }] : [];
    })
    .sort((a, b) => a.settlement.postedAt.localeCompare(b.settlement.postedAt));
  const actions = [...value.actions].sort((a, b) =>
    a.receipt.postedAt.localeCompare(b.receipt.postedAt),
  );
  const facts: [Key, string][] = [
    ["tinv.side", t(`trade.${invoice.side}`)],
    ["tinv.party", invoice.party],
    ["tinv.externalInvoice", invoice.externalNo],
    ["tinv.accountingDate", invoice.accountingDate],
    ["tinv.documentDate", invoice.documentDate],
    ["tinv.taxDate", invoice.taxDate],
    ["tinv.dueDate", invoice.dueDate],
    ["tinv.detail.currency", invoice.currency],
    ["tinv.controlAccount", invoice.controlAccount],
    ["tinv.poMatch", t(`tinv.${invoice.poMatch}`)],
    ...(invoice.exceptionReason
      ? [["tinv.exceptionReason", invoice.exceptionReason] as [Key, string]]
      : []),
    ["tinv.sourceOrder", invoice.orderId ?? t("tinv.noSourceOrder")],
  ];
  const lineHeaders = [
    "tinv.detail.lineNo",
    "tinv.product",
    "tinv.quantity",
    "tinv.unitPrice",
    "tinv.discountPercent",
    "tinv.net",
    "tinv.tax",
    "tinv.gross",
    "tinv.detail.matchStatus",
  ] as const;
  return (
    <div className="tinv-detail-body">
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("tinv.detail.teachingPosting")} {invoice.journalId}
        <br />
        {t("tinv.detail.teachingControl")} {invoice.controlAccount}
        <br />
        {t("tinv.detail.teachingSettle")}
      </TeachingTip>
      <section aria-label={t("tinv.detail.header")}>
        <h4>{t("tinv.detail.header")}</h4>
        <dl className="tinv-facts">
          {facts.map(([key, text]) => (
            <div key={key}>
              <dt>{t(key)}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>
      {/* A Tab stop so the lines can be scrolled sideways with the keyboard at narrow widths. */}
      <section
        className="grid-wrap tinv-detail-lines"
        aria-label={t("tinv.lines")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Named scroll regions must stay keyboard-focusable.
        tabIndex={0}
      >
        <table className="grid" aria-label={t("tinv.lines")}>
          <caption>{t("tinv.lines")}</caption>
          <thead>
            <tr>
              {lineHeaders.map((key) => (
                <th key={key} scope="col">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.lineId}>
                <td>{line.lineNo}</td>
                <td>{line.product}</td>
                <td>{line.quantity}</td>
                <td>{line.unitPrice}</td>
                <td>{line.discountPercent}</td>
                <td>{money(line.net)}</td>
                <td>{money(line.tax)}</td>
                <td>{money(line.gross)}</td>
                <td>{t(`tinv.${line.matchStatus}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="tinv-split">
        <section aria-label={t("tinv.detail.totals")}>
          <h4>{t("tinv.detail.totals")}</h4>
          <dl className="tinv-facts">
            <div>
              <dt>{t("tinv.net")}</dt>
              <dd>{money(invoice.net)}</dd>
            </div>
            <div>
              <dt>{t("tinv.tax")}</dt>
              <dd>{money(invoice.tax)}</dd>
            </div>
            <div>
              <dt>{t("tinv.gross")}</dt>
              <dd>{money(invoice.gross)}</dd>
            </div>
          </dl>
        </section>
        <section aria-label={t("tinv.detail.openItem")}>
          <h4>{t("tinv.detail.openItem")}</h4>
          <dl className="tinv-facts">
            <div>
              <dt>{t("tadj.status")}</dt>
              <dd>{t(`tadj.${openItem.status}`)}</dd>
            </div>
            <div>
              <dt>{t("tinv.detail.remaining")}</dt>
              <dd>{money(openItem.remainingGross)}</dd>
            </div>
          </dl>
        </section>
      </div>
      <section aria-label={t("tinv.detail.settlements")}>
        <h4>{t("tinv.detail.settlements")}</h4>
        {settlements.length === 0 ? (
          <p className="empty-state">{t("tinv.detail.noSettlements")}</p>
        ) : (
          <div className="grid-wrap">
            <table
              className="grid tinv-detail-settlements"
              aria-label={t("tinv.detail.settlements")}
            >
              <thead>
                <tr>
                  <th scope="col">{t("tinv.detail.date")}</th>
                  <th scope="col">{t("tinv.detail.sourceRef")}</th>
                  <th scope="col">{t("tinv.gross")}</th>
                  <th scope="col">{t("tinv.detail.cash")}</th>
                  <th scope="col">{t("tinv.detail.discount")}</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map(({ settlement, allocation }) => (
                  <tr key={settlement.paymentId}>
                    <td>{day(settlement.postedAt)}</td>
                    <td>{settlement.sourceRef}</td>
                    <td>{money(allocation.gross)}</td>
                    <td>{money(allocation.cash)}</td>
                    <td>{money(allocation.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-label={t("tinv.detail.actions")}>
        <h4>{t("tinv.detail.actions")}</h4>
        {actions.length === 0 ? (
          <p className="empty-state">{t("tinv.detail.noActions")}</p>
        ) : (
          <div className="grid-wrap">
            <table className="grid tinv-detail-actions" aria-label={t("tinv.detail.actions")}>
              <thead>
                <tr>
                  <th scope="col">{t("tinv.detail.date")}</th>
                  <th scope="col">{t("tadj.kind")}</th>
                  <th scope="col">{t("tinv.detail.amount")}</th>
                  <th scope="col">{t("tinv.detail.sourceRef")}</th>
                </tr>
              </thead>
              <tbody>
                {actions.map(({ receipt }) => (
                  <tr key={receipt.actionId}>
                    <td>{day(receipt.postedAt)}</td>
                    <td>{t(`tadj.${receipt.kind}`)}</td>
                    <td>{money(receipt.gross)}</td>
                    <td>{receipt.sourceRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

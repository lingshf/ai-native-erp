import type { FormEvent } from "react";
import {
  tradeInvoicePreviewSchema,
  tradeInvoiceReceiptSchema,
  tradeOrderInvoicingSchema,
  type CompanyDto,
  type TradeInvoiceCommandDto,
} from "@erp/core/contracts";
import { masterRequest, type MasterDataFailure } from "../master-data-client.ts";
import {
  blankDraft,
  blankLine,
  draftFromOrder,
  failure,
  uncertain,
  type Draft,
  type Pending,
  type T,
} from "./invoice-model.ts";
import { storeSaved } from "./invoice-session.ts";
import type { InvoiceEntryState } from "./use-invoice-entry.ts";

export const MAX_INVOICE_LINES = 100;
export const lineFields = [
  "product",
  "taxCode",
  "quantity",
  "unitPrice",
  "discountPercent",
  "taxableCharge",
  "orderLineId",
] as const;
export type LineField = (typeof lineFields)[number];

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

// One render's state plus the values derived from it; every command reads this snapshot.
export type InvoiceEntryContext = InvoiceEntryState & {
  company: CompanyDto;
  t: T;
  command: TradeInvoiceCommandDto;
  serialized: string;
  stale: boolean;
  locked: boolean;
};

export function invoiceEntryContext(
  state: InvoiceEntryState,
  company: CompanyDto,
  t: T,
): InvoiceEntryContext {
  const command = toCommand(company, state.documentId, state.draft);
  const serialized = JSON.stringify(command);
  const stale = state.preview !== null && state.preview.command !== serialized;
  const locked = state.busy || state.pending !== null;
  return { ...state, company, t, command, serialized, stale, locked };
}

function editDraft(
  { setDraft, setDirty, setReceipt }: InvoiceEntryContext,
  change: Partial<Draft>,
) {
  setDraft((current) => ({ ...current, ...change }));
  setDirty(true);
  setReceipt(null);
}

function editLine(entry: InvoiceEntryContext, index: number, field: LineField, value: string) {
  editDraft(entry, {
    lines: entry.draft.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
  });
}

function removeLine(entry: InvoiceEntryContext, index: number) {
  editDraft(entry, { lines: entry.draft.lines.filter((_, i) => i !== index) });
}

function addLine(entry: InvoiceEntryContext) {
  const { lines } = entry.draft;
  if (lines.length >= MAX_INVOICE_LINES) return;
  const used = new Set(lines.map((line) => line.lineId));
  let n = lines.length + 1;
  while (used.has(`L${n}`)) n += 1;
  editDraft(entry, { lines: [...lines, blankLine(n)] });
}

function discardDraft({
  locked,
  t,
  setDraft,
  setDocumentId,
  setDirty,
  setPreview,
  setError,
  setFromOrder,
}: InvoiceEntryContext) {
  if (locked || !window.confirm(t("tinv.discardConfirm"))) return;
  setDraft(blankDraft());
  setDocumentId(crypto.randomUUID());
  setDirty(false);
  setPreview(null);
  setError(null);
  setFromOrder(null);
}

async function fillFromOrder(entry: InvoiceEntryContext, orderId: string) {
  const { company, dirty, locked, t, setBusy, setFromOrder } = entry;
  const { setDraft, setDocumentId, setDirty, setPreview, setError, setReceipt } = entry;
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
}

async function runPreview(entry: InvoiceEntryContext, event: FormEvent) {
  const { command, serialized, locked, setBusy, setError, setReceipt, setPreview } = entry;
  event.preventDefault();
  if (locked) return;
  setBusy(true);
  setError(null);
  setReceipt(null);
  try {
    const value = await masterRequest("/api/v1/trade/invoices/preview", tradeInvoicePreviewSchema, {
      method: "POST",
      body: command,
    });
    setPreview({ value, command: serialized });
  } catch (issue) {
    setPreview(null);
    setError(failure(issue));
  } finally {
    setBusy(false);
  }
}

async function postInvoice(entry: InvoiceEntryContext, request: Pending) {
  const { client, company, firstField, setBusy, setError, setRetry, setPending } = entry;
  const { setReceipt, setPreview, setFromOrder, setDraft, setDocumentId, setDirty } = entry;
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
}

function confirmInvoice(entry: InvoiceEntryContext) {
  const { preview, stale, locked, company, draft, documentId, dirty, setError, setPending } = entry;
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
  void postInvoice(entry, request);
}

// Binds the commands to one render's context, as the inline closures in InvoiceEntry did.
export function bindInvoiceCommands(entry: InvoiceEntryContext) {
  return {
    edit: (change: Partial<Draft>) => editDraft(entry, change),
    editLine: (index: number, field: LineField, value: string) =>
      editLine(entry, index, field, value),
    removeLine: (index: number) => removeLine(entry, index),
    addLine: () => addLine(entry),
    discard: () => discardDraft(entry),
    fillFromOrder: (orderId: string) => fillFromOrder(entry, orderId),
    runPreview: (event: FormEvent) => runPreview(entry, event),
    post: (request: Pending) => postInvoice(entry, request),
    confirm: () => confirmInvoice(entry),
  };
}
export type InvoiceCommands = ReturnType<typeof bindInvoiceCommands>;

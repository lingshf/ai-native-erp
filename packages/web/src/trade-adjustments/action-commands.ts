import {
  tradeActionCommandSchema,
  tradeActionConfirmSchema,
  tradeActionPreviewSchema,
  tradeActionReceiptSchema,
  type CompanyDto,
  type TradeActionCommandDto,
} from "@erp/core/contracts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import {
  empty,
  key,
  partyCode,
  type Draft,
  type Pending,
  type Saved,
  type T,
} from "./action-draft.ts";
import type { ActionDraftState, ActionItemsState } from "./use-action-entry.ts";

// Everything one render of ActionEntry knows; commands read these render-time values.
export type ActionEntryContext = ActionDraftState &
  ActionItemsState & { company: CompanyDto; t: T };

export function changeDraft(entry: ActionEntryContext, patch: Partial<Draft>) {
  entry.sequence.current++;
  entry.setSaved({ draft: { ...entry.draft, ...patch }, pending: null });
  entry.setPreview(null);
  entry.setReceipt(null);
  entry.setError(null);
}

export function applyPartyFilter(entry: ActionEntryContext) {
  const value = entry.partyInput.trim();
  if (value !== "" && !partyCode.test(value)) return;
  entry.setPartyInput(value);
  if (value === entry.partyFilter) return;
  entry.client.removeQueries({
    queryKey: ["tradeActionItems", entry.company.code],
  });
  entry.setPartyFilter(value);
  changeDraft(entry, { sourceId: "", targetId: "", items: [] });
}

export function clearEntry(entry: ActionEntryContext) {
  entry.sequence.current++;
  entry.setSaved({ draft: empty(), pending: null });
  entry.setPreview(null);
  entry.setReceipt(null);
  if (entry.partyFilter)
    entry.client.removeQueries({
      queryKey: ["tradeActionItems", entry.company.code],
    });
  entry.setPartyFilter("");
  entry.setPartyInput("");
}

function buildCommand({ company, draft, rows }: ActionEntryContext): TradeActionCommandDto {
  const common = {
    company: company.code,
    actionId: draft.actionId,
    kind: draft.kind,
    accountingDate: draft.accountingDate,
    documentDate: draft.documentDate,
    taxDate: draft.taxDate,
  };
  const source = rows.find((row) => row.itemId === draft.sourceId);
  const target = rows.find((row) => row.itemId === draft.targetId);
  switch (draft.kind) {
    case "advance":
      return tradeActionCommandSchema.parse({
        ...common,
        side: draft.side,
        party: draft.party,
        currency: company.currency,
        gross: Number(draft.gross),
        dimensions: {},
      });
    case "credit":
      return tradeActionCommandSchema.parse({
        ...common,
        invoiceId: draft.sourceId,
        revision: source?.revision,
        lines: draft.lines.map(({ sourceLineId, quantity }) => ({
          sourceLineId,
          quantity,
        })),
      });
    case "apply":
      return tradeActionCommandSchema.parse({
        ...common,
        sourceId: draft.sourceId,
        sourceRevision: source?.revision,
        targetId: draft.targetId,
        targetRevision: target?.revision,
        gross: Number(draft.gross),
      });
    case "cancel":
      return tradeActionCommandSchema.parse({
        ...common,
        itemId: draft.sourceId,
        revision: source?.revision,
        relatedRevision: draft.relatedRevision ? Number(draft.relatedRevision) : null,
        reason: draft.reason,
      });
    case "reverse":
      return tradeActionCommandSchema.parse({
        ...common,
        settlementId: draft.settlementId,
        items: draft.items.map((itemId) => ({
          itemId,
          revision: rows.find((row) => row.itemId === itemId)?.revision,
        })),
        reason: draft.reason,
      });
  }
}

function report({ t, setError }: ActionEntryContext, error: unknown) {
  const detail = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : null;
  setError(
    detail ? `${t("master.error")} ${detail.path}: ${detail.messageKey}` : t("master.error"),
  );
}

// Writes the envelope and reads it back before sending; false means storage cannot be trusted.
function persistPending({ company, setStorageFailed }: ActionEntryContext, next: Saved) {
  try {
    const value = JSON.stringify(next);
    sessionStorage.setItem(key(company.code), value);
    if (sessionStorage.getItem(key(company.code)) !== value) {
      setStorageFailed(true);
      return false;
    }
  } catch {
    setStorageFailed(true);
    return false;
  }
  return true;
}

// Sync on purpose: every early return and parse error must settle in the same tick as the click,
// exactly like the inline code it replaces, so React batches busy on and off together.
function stagePending(entry: ActionEntryContext): Pending | null {
  const { saved, preview } = entry;
  if (!preview && !saved.pending) return null;
  if (!saved.pending) entry.setUncertain(false);
  const pending =
    saved.pending ??
    tradeActionConfirmSchema.parse({
      command: buildCommand(entry),
      fingerprint: preview?.fingerprint,
      idempotencyKey: crypto.randomUUID(),
      confirmation: "POST",
    });
  const next = { ...saved, pending };
  if (!persistPending(entry, next)) return null;
  entry.setSaved(next);
  return pending;
}

function failAction(entry: ActionEntryContext, error: unknown, confirm: boolean) {
  report(entry, error);
  if (error instanceof MasterDataFailure && error.kind === "http" && (error.status ?? 500) < 500) {
    entry.setSaved((saved) => ({ ...saved, pending: null }));
    entry.setPreview(null);
  } else if (confirm) entry.setUncertain(true);
}

export async function runAction(entry: ActionEntryContext, confirm: boolean) {
  const { sequence, running } = entry;
  if (running.current || entry.storageFailed || (!confirm && entry.locked)) return;
  running.current = true;
  entry.setBusy(true);
  entry.setError(null);
  const version = ++sequence.current;
  try {
    if (!confirm) {
      const result = await masterRequest(
        "/api/v1/trade/actions/preview",
        tradeActionPreviewSchema,
        { method: "POST", body: buildCommand(entry) },
      );
      if (sequence.current === version) entry.setPreview(result);
      return;
    }
    const pending = stagePending(entry);
    if (!pending) return;
    const result = await masterRequest("/api/v1/trade/actions", tradeActionReceiptSchema, {
      method: "POST",
      body: pending,
    });
    if (sequence.current !== version) return;
    entry.setReceipt(result);
    entry.setPreview(null);
    entry.setSaved({ draft: empty(), pending: null });
    await entry.page.refetch();
  } catch (error) {
    if (sequence.current !== version) return;
    failAction(entry, error, confirm);
  } finally {
    running.current = false;
    if (sequence.current === version) entry.setBusy(false);
  }
}

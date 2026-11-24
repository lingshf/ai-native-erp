import {
  tradeSettlementCommandSchema,
  tradeSettlementPreviewSchema,
  tradeSettlementReceiptSchema,
  type CompanyDto,
  type TradeSettlementCommandDto,
} from "@erp/core/contracts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import type { T } from "./settlement-model.ts";
import { storageKey } from "./settlement-storage.ts";
import type { SettlementDraft } from "./use-settlement-draft.ts";
import type { OpenItems } from "./use-open-items.ts";

// One render's state and props; every command reads this snapshot, as the inline closures did.
export type SettlementContext = SettlementDraft & {
  company: CompanyDto;
  t: T;
  page: OpenItems["page"];
};

export function changeCommand(entry: SettlementContext, next: TradeSettlementCommandDto) {
  entry.sequence.current++;
  entry.setSaved({ command: next, pending: null });
  entry.setPreview(null);
  entry.setReceipt(null);
  entry.setError(null);
}

function report(entry: SettlementContext, error: unknown) {
  const { t } = entry;
  const detail = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : null;
  entry.setError(
    detail ? `${t("master.error")} ${detail.path}: ${detail.messageKey}` : t("master.error"),
  );
}

export async function runPreview(entry: SettlementContext) {
  const { running, sequence, command } = entry;
  if (running.current || entry.locked) return;
  running.current = true;
  entry.setBusy(true);
  entry.setError(null);
  const version = ++sequence.current;
  try {
    const body = tradeSettlementCommandSchema.parse(command);
    const result = await masterRequest(
      "/api/v1/trade/settlements/preview",
      tradeSettlementPreviewSchema,
      { method: "POST", body },
    );
    if (sequence.current === version) entry.setPreview(result);
  } catch (error) {
    if (sequence.current === version) report(entry, error);
  } finally {
    running.current = false;
    if (sequence.current === version) entry.setBusy(false);
  }
}

export async function confirmSettlement(entry: SettlementContext) {
  const { running, sequence, command, preview, saved, storageFailed, company } = entry;
  if (running.current || storageFailed || (!preview && !saved.pending)) return;
  let pending = saved.pending;
  if (!pending) {
    if (!preview) return;
    entry.setUncertain(false);
    pending = {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey: crypto.randomUUID(),
      confirmation: "POST",
    };
  }
  try {
    const serialized = JSON.stringify({ command, pending });
    window.sessionStorage.setItem(storageKey(company.code), serialized);
    if (window.sessionStorage.getItem(storageKey(company.code)) !== serialized) {
      entry.setStorageFailed(true);
      return;
    }
  } catch {
    entry.setStorageFailed(true);
    return;
  }
  entry.setSaved({ command, pending });
  running.current = true;
  entry.setBusy(true);
  entry.setError(null);
  const version = ++sequence.current;
  try {
    const result = await masterRequest("/api/v1/trade/settlements", tradeSettlementReceiptSchema, {
      method: "POST",
      body: pending,
    });
    if (sequence.current !== version) return;
    entry.setReceipt(result);
    entry.setPreview(null);
    entry.setSaved({
      command: { ...command, paymentId: crypto.randomUUID(), items: [] },
      pending: null,
    });
    await entry.page.refetch();
  } catch (error) {
    if (sequence.current === version) {
      report(entry, error);
      if (
        error instanceof MasterDataFailure &&
        error.kind === "http" &&
        (error.status ?? 500) < 500
      ) {
        entry.setSaved({ command, pending: null });
        entry.setPreview(null);
      } else entry.setUncertain(true);
    }
  } finally {
    running.current = false;
    if (sequence.current === version) entry.setBusy(false);
  }
}

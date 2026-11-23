import type { TradeActionReceiptDto } from "@erp/core/contracts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./action-draft.ts";

// Storage, open-item and request failures, in that order; each text appears at most once.
export function ActionErrors({ texts }: { texts: (string | false | null)[] }) {
  return texts.map(
    (text) =>
      text && (
        <MessageBar key={text} tone="danger" role="alert">
          {text}
        </MessageBar>
      ),
  );
}

export function UncertainBar({
  t,
  disabled,
  onRetry,
}: {
  t: T;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <MessageBar tone="warning" role="alert">
      <p>{t("tinv.uncertain")}</p>
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={onRetry}>
        {t("tinv.retryConfirm")}
      </button>
    </MessageBar>
  );
}

export function ReceiptBar({ t, receipt }: { t: T; receipt: TradeActionReceiptDto }) {
  return (
    <MessageBar tone="success" role="status">
      {t("tadj.posted")} {receipt.sourceRef} · {receipt.journalIds.join(", ")}
    </MessageBar>
  );
}

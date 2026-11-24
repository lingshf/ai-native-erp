import type { TradeSettlementReceiptDto } from "@erp/core/contracts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./settlement-model.ts";

export function SettlementErrorBars({ messages }: { messages: (string | false | null)[] }) {
  return messages.map(
    (text) =>
      text && (
        <MessageBar key={text} tone="danger" role="alert">
          {text}
        </MessageBar>
      ),
  );
}

type SettlementUncertainBarProps = {
  t: T;
  retryDisabled: boolean;
  onRetry: () => Promise<void>;
};

export function SettlementUncertainBar({ t, retryDisabled, onRetry }: SettlementUncertainBarProps) {
  return (
    <MessageBar tone="warning" role="alert">
      <p>{t("tinv.uncertain")}</p>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={retryDisabled}
        onClick={() => void onRetry()}
      >
        {t("tinv.retryConfirm")}
      </button>
    </MessageBar>
  );
}

export function SettlementReceiptBar({ t, receipt }: { t: T; receipt: TradeSettlementReceiptDto }) {
  return (
    <MessageBar tone="success" role="status">
      {t("tset.posted")} {receipt.sourceRef} · {receipt.journalIds.join(", ")}
    </MessageBar>
  );
}

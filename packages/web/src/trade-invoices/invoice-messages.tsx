import type { TradeInvoiceReceiptDto } from "@erp/core/contracts";
import { MessageBar } from "../ui/components/index.tsx";
import type { Failure, Pending, T } from "./invoice-model.ts";
import type { IntakeState } from "./use-invoice-entry.ts";

const intakeTone = {
  loaded: "success",
  fullyInvoiced: "info",
  locked: "warning",
  notFound: "danger",
  failed: "danger",
} as const;

export function InvoiceErrorBar({
  t,
  error,
  retry,
  pending,
  busy,
  onRetry,
}: {
  t: T;
  error: Failure;
  retry: boolean;
  pending: Pending | null;
  busy: boolean;
  onRetry: (request: Pending) => Promise<void>;
}) {
  return (
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
          onClick={() => void onRetry(pending)}
        >
          {t("tinv.retryConfirm")}
        </button>
      )}
    </MessageBar>
  );
}

export function InvoiceReceiptBar({
  t,
  receipt,
  money,
}: {
  t: T;
  receipt: TradeInvoiceReceiptDto;
  money: (value: number) => string;
}) {
  return (
    <MessageBar tone="success" role="status">
      {t("tinv.posted")} {receipt.journalIds.join(", ")} · {money(receipt.gross)}
    </MessageBar>
  );
}

export function OrderIntakeBar({
  t,
  fromOrder,
  busy,
  onRetry,
}: {
  t: T;
  fromOrder: IntakeState;
  busy: boolean;
  onRetry: (orderId: string) => Promise<void>;
}) {
  return (
    <MessageBar
      tone={intakeTone[fromOrder.status]}
      role={
        fromOrder.status === "loaded" || fromOrder.status === "fullyInvoiced" ? "status" : "alert"
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
          onClick={() => void onRetry(fromOrder.orderId)}
        >
          {t("master.retry")}
        </button>
      )}
    </MessageBar>
  );
}

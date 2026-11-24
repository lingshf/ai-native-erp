import { Link } from "react-router-dom";
import { label, type Preferences } from "../ui/index.ts";
import { MessageBar } from "../ui/components/index.tsx";
import type { OrderInvoicing } from "./use-order-invoicing.ts";
import type { T } from "./order-model.ts";

export function OrderInvoicingFailure({
  language,
  t,
  onRetry,
}: {
  language: Preferences["language"];
  t: T;
  onRetry: () => void;
}) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{t("tord.invoicingFailed")}</p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        {label(language, "master.retry")}
      </button>
    </MessageBar>
  );
}

export function OrderInvoiceActions({
  known,
  fullyInvoiced,
  invoiceLink,
  reasonId,
  t,
}: {
  known: OrderInvoicing["known"];
  fullyInvoiced: boolean;
  invoiceLink: string;
  reasonId: string;
  t: T;
}) {
  return (
    <div className="tord-invoice-actions">
      {known && !fullyInvoiced ? (
        <Link className="btn btn-primary" to={invoiceLink}>
          {t("tord.invoice")}
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled
          aria-describedby={fullyInvoiced ? reasonId : undefined}
        >
          {t("tord.invoice")}
        </button>
      )}
      {fullyInvoiced && (
        <p className="ui-hint" id={reasonId}>
          {t("tord.fullyInvoiced")}
        </p>
      )}
    </div>
  );
}

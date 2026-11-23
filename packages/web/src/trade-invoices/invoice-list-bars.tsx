import type { Preferences } from "../ui/index.ts";
import { detailLabel } from "../ui/trade-invoice-detail-labels.ts";
import { MessageBar } from "../ui/components/index.tsx";
import { failure, type T } from "./invoice-model.ts";

export function InvoiceLinkWarning({
  language,
  t,
  onClear,
}: {
  language: Preferences["language"];
  t: T;
  onClear: () => void;
}) {
  return (
    <MessageBar tone="warning" role="status">
      <p>{detailLabel(language, "tinv.filter.linkInvalid")}</p>
      <button type="button" className="btn btn-secondary" onClick={onClear}>
        {t("tinv.filter.clear")}
      </button>
    </MessageBar>
  );
}

export function InvoiceListFailure({
  t,
  error,
  onRetry,
}: {
  t: T;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{t(failure(error).key)}</p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}

export function InvoiceListMore({
  t,
  loading,
  onMore,
}: {
  t: T;
  loading: boolean;
  onMore: () => void;
}) {
  return (
    <div className="tinv-more">
      <button type="button" className="btn btn-secondary" disabled={loading} onClick={onMore}>
        {t("master.loadMore")}
      </button>
    </div>
  );
}

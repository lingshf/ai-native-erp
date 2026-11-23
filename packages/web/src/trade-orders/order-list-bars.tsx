import { label, type Preferences } from "../ui/index.ts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";

export function OrderLinkWarning({ t, onClear }: { t: T; onClear: () => void }) {
  return (
    <MessageBar tone="warning" role="status">
      <p>{t("tord.filterLinkInvalid")}</p>
      <button type="button" className="btn btn-secondary" onClick={onClear}>
        {t("tord.filterClear")}
      </button>
    </MessageBar>
  );
}

export function OrderListFailure({
  language,
  onRetry,
}: {
  language: Preferences["language"];
  onRetry: () => void;
}) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{label(language, "master.error")}</p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        {label(language, "master.retry")}
      </button>
    </MessageBar>
  );
}

export function OrderListMore({
  language,
  loading,
  onMore,
}: {
  language: Preferences["language"];
  loading: boolean;
  onMore: () => void;
}) {
  return (
    <div className="ui-form-actions">
      <button type="button" className="btn btn-secondary" disabled={loading} onClick={onMore}>
        {label(language, "master.loadMore")}
      </button>
    </div>
  );
}

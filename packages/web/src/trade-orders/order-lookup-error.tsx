import { label, type Preferences } from "../ui/index.ts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";
import type { LookupError } from "./use-order-lookup.ts";

export function OrderLookupError({
  error,
  language,
  t,
  onRetry,
  onBack,
}: {
  error: LookupError;
  language: Preferences["language"];
  t: T;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{error === "master.error" ? label(language, "master.error") : t(error)}</p>
      {error === "master.error" ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {label(language, "master.retry")}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            onBack();
            document.querySelector<HTMLButtonElement>('[aria-controls="tord-list-body"]')?.focus();
          }}
        >
          {t("tord.deepLink.back")}
        </button>
      )}
    </MessageBar>
  );
}

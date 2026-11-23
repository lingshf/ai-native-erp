import { Badge } from "../ui/components/index.tsx";
import type { T } from "./invoice-model.ts";

export function InvoiceCommandBar({
  t,
  busy,
  dirty,
  locked,
  previewed,
  stale,
  onConfirm,
  onDiscard,
}: {
  t: T;
  busy: boolean;
  dirty: boolean;
  locked: boolean;
  previewed: boolean;
  stale: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="tinv-command-bar">
      <button type="submit" className="btn btn-secondary" disabled={locked}>
        {t("tinv.preview")}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!previewed || stale || locked}
        onClick={onConfirm}
      >
        {t("tinv.confirm")}
      </button>
      <span className="tinv-divider" aria-hidden="true" />
      <button
        type="button"
        className="btn btn-subtle"
        disabled={!dirty || locked}
        onClick={onDiscard}
      >
        {t("tinv.discard")}
      </button>
      <span className="tinv-status">
        {busy && <span role="status">{t("master.loading")}</span>}
        {previewed &&
          (stale ? (
            <Badge tone="warning">{t("tinv.previewStale")}</Badge>
          ) : (
            <Badge tone="success">{t("tinv.previewCurrent")}</Badge>
          ))}
      </span>
    </div>
  );
}

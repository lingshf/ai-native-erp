import type { Failure } from "./trade-failure.ts";
import type { T } from "./trade-master-types.ts";

export function TradeEditorActions({
  error,
  reload,
  cancel,
  t,
}: {
  error: Failure | null;
  reload: () => void;
  cancel: () => void;
  t: T;
}) {
  return (
    <div className="ui-form-actions ui-master-wide">
      {error?.conflict && (
        <button type="button" className="btn btn-secondary" onClick={reload}>
          {t("master.reload")}
        </button>
      )}
      <button type="submit" className="btn btn-primary">
        {t("dim.save")}
      </button>
      <button type="button" className="btn btn-subtle" onClick={cancel}>
        {t("master.cancel")}
      </button>
    </div>
  );
}

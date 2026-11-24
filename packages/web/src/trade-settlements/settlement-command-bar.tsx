import type { T } from "./settlement-model.ts";

type SettlementCommandBarProps = {
  t: T;
  previewDisabled: boolean;
  confirmDisabled: boolean;
  onPreview: () => Promise<void>;
  onConfirm: () => Promise<void>;
};

export function SettlementCommandBar(props: SettlementCommandBarProps) {
  const { t, previewDisabled, confirmDisabled, onPreview, onConfirm } = props;
  return (
    <div className="tset-command-bar">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={previewDisabled}
        onClick={() => void onPreview()}
      >
        {t("tinv.preview")}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={confirmDisabled}
        onClick={() => void onConfirm()}
      >
        {t("tset.confirm")}
      </button>
    </div>
  );
}

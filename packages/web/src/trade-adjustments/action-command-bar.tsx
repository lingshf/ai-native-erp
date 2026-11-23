export function ActionCommandBar({
  t,
  locked,
  previewed,
  irreversible,
  onRun,
  onClear,
}: {
  t: (key: "tinv.preview" | "tadj.confirm" | "tadj.clear") => string;
  locked: boolean;
  previewed: boolean;
  irreversible: boolean;
  onRun: (confirm: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div className="tadj-command-bar">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={locked}
        onClick={() => onRun(false)}
      >
        {t("tinv.preview")}
      </button>
      <button
        type="button"
        className={irreversible ? "btn btn-danger" : "btn btn-primary"}
        disabled={locked || !previewed}
        onClick={() => onRun(true)}
      >
        {t("tadj.confirm")}
      </button>
      <button type="button" className="btn btn-subtle" disabled={locked} onClick={onClear}>
        {t("tadj.clear")}
      </button>
    </div>
  );
}

import type { T } from "./dimension-types.ts";

// TLIST-04: "Refresh list" only re-reads the current list, so it stays enabled while the editor is open.
export function DimensionActions({
  editing,
  onNew,
  onRefresh,
  t,
}: {
  editing: boolean;
  onNew: () => void;
  onRefresh: () => void;
  t: T;
}) {
  return (
    <div className="ui-master-actions">
      <button
        type="button"
        className={`btn ${editing ? "btn-secondary" : "btn-primary"}`}
        onClick={onNew}
      >
        {t("dim.new")}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onRefresh}>
        {t("master.listRefresh")}
      </button>
    </div>
  );
}

import type { T } from "./settlement-model.ts";

// Sits outside the allocation fieldset so it stays usable while a confirmation is pending.
export function SettlementListToolbar({ t, onRefresh }: { t: T; onRefresh: () => void }) {
  return (
    <div className="toolbar-row">
      <button type="button" className="btn btn-secondary" onClick={onRefresh}>
        {t("master.listRefresh")}
      </button>
    </div>
  );
}

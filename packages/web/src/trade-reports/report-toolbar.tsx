import type { T } from "./types.ts";
import type { CompanyReportsState } from "./use-company-reports.ts";
export function ReportToolbar({ state, t }: { state: CompanyReportsState; t: T }) {
  const { view, dirty, change, refresh } = state;
  return (
    <div className="toolbar-row">
      <nav className="segmented" aria-label={t("trpt.title")}>
        {(["openItems", "ageing", "reconciliation"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={dirty}
            aria-pressed={view === value}
            onClick={() => change({ view: value })}
          >
            {t(`trpt.${value}`)}
          </button>
        ))}
      </nav>
      <button type="button" className="btn btn-secondary" disabled={dirty} onClick={refresh}>
        {t("trpt.refresh")}
      </button>
    </div>
  );
}

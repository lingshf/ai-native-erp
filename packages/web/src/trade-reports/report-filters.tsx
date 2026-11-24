import { PARTY_MAX_LENGTH } from "./report-query.ts";
import type { T } from "./types.ts";
import type { CompanyReportsState } from "./use-company-reports.ts";
export function ReportFilters({ state, t }: { state: CompanyReportsState; t: T }) {
  const { input, setInput, change, clear } = state;
  return (
    <form
      className="filter-bar"
      onSubmit={(e) => {
        e.preventDefault();
        change(input);
      }}
    >
      <div className="field">
        <label htmlFor="trpt-month">{t("trpt.month")}</label>
        <input
          id="trpt-month"
          type="month"
          value={input.month}
          onChange={(e) => setInput({ ...input, month: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="trpt-party">{t("trpt.party")}</label>
        <input
          id="trpt-party"
          value={input.party}
          maxLength={PARTY_MAX_LENGTH}
          onChange={(e) => setInput({ ...input, party: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="trpt-side">{t("tinv.side")}</label>
        <select
          id="trpt-side"
          value={input.side}
          onChange={(e) => setInput({ ...input, side: e.target.value })}
        >
          <option value="">{t("trpt.all")}</option>
          <option>AP</option>
          <option>AR</option>
        </select>
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary">
          {t("trpt.apply")}
        </button>
        <button type="button" className="btn btn-subtle" onClick={clear}>
          {t("trpt.clear")}
        </button>
      </div>
    </form>
  );
}

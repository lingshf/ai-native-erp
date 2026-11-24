import type { CloseText } from "./close-text.ts";
import type { PeriodSelection } from "./use-period-selection.ts";

type PickerSelection = Pick<
  PeriodSelection,
  | "setParams"
  | "company"
  | "companies"
  | "periods"
  | "companyOptions"
  | "periodOptions"
  | "selectedCompany"
  | "selectedPeriod"
  | "locked"
  | "selectionLocked"
>;

export function PeriodPicker({ t, selection }: { t: CloseText; selection: PickerSelection }) {
  const { setParams, company, companies, periods, companyOptions, periodOptions } = selection;
  const { selectedCompany, selectedPeriod, locked, selectionLocked } = selection;
  return (
    <>
      <div className="field">
        <label htmlFor="close-company">{t("master.company")}</label>
        <select
          id="close-company"
          disabled={selectionLocked}
          value={selectedCompany?.code ?? ""}
          onChange={(event) => setParams({ company: event.target.value })}
        >
          {companyOptions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} · {item.name}
            </option>
          ))}
        </select>
      </div>
      {companies.hasNextPage && (
        <button
          className="btn btn-secondary"
          disabled={selectionLocked}
          type="button"
          onClick={() => void companies.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      <div className="field">
        <label htmlFor="close-month">{t("ledger.period")}</label>
        <select
          id="close-month"
          disabled={selectionLocked}
          value={selectedPeriod?.month ?? ""}
          onChange={(event) =>
            setParams({ company: company?.code ?? "", month: event.target.value })
          }
        >
          {periodOptions.map((item) => (
            <option key={item.month}>{item.month}</option>
          ))}
        </select>
      </div>
      {periods.hasNextPage && (
        <button
          className="btn btn-secondary"
          disabled={locked}
          type="button"
          onClick={() => void periods.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
    </>
  );
}

import type { CompanyDto } from "@erp/core/contracts";
import type { T } from "./types.ts";
export function CompanySelect({
  company,
  companies,
  dirty,
  changeCompany,
  loadCompanies,
  t,
}: {
  company: CompanyDto;
  companies: readonly CompanyDto[];
  dirty: boolean;
  changeCompany: (company: string) => void;
  loadCompanies: (() => void) | undefined;
  t: T;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="trpt-company">{t("master.company")}</label>
        <select
          id="trpt-company"
          value={company.code}
          disabled={dirty}
          onChange={(e) => changeCompany(e.target.value)}
        >
          {companies.map((row) => (
            <option key={row.code} value={row.code}>
              {row.code} · {row.name}
            </option>
          ))}
        </select>
      </div>
      {loadCompanies && (
        <button type="button" className="btn btn-subtle" onClick={loadCompanies}>
          {t("master.loadMore")}
        </button>
      )}
    </>
  );
}

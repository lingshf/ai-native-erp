import type { CompanyDto } from "@erp/core/contracts";
import { Link } from "react-router-dom";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { MessageBar } from "../ui/components/index.tsx";
import type { Money, T } from "./types.ts";
import type { CompanyReportsState } from "./use-company-reports.ts";
type Reconciliation = NonNullable<CompanyReportsState["reconciliation"]["data"]>;
type ReconciliationRow = Reconciliation["rows"][number];
const COLUMNS = [
  "subledger",
  "tradeGl",
  "opening",
  "other",
  "gl",
  "tradeDifference",
  "difference",
] as const;
const CELL_KEYS = ["subledger", "trade", "opening", "other", "gl", "tradeDifference", "difference"];
export function ReconciliationView({
  state,
  company,
  t,
  money,
}: {
  state: CompanyReportsState;
  company: CompanyDto;
  t: T;
  money: Money;
}) {
  const { reconciliation, month } = state;
  return (
    <>
      <MessageBar tone="info">{t("trpt.reconcileNote")}</MessageBar>
      {reconciliation.data && !reconciliation.isError && (
        <div className="card trpt-reconciliation">
          <header>
            <h3>{t("trpt.reconciliation")}</h3>
            <span className="summary">
              {month || t("trpt.current")} · {company.currency}
            </span>
          </header>
          <VirtualRows
            items={reconciliation.data.rows}
            title={t("trpt.reconciliation")}
            header={[t("journal.account"), ...COLUMNS.map((key) => t(`trpt.${key}`))]}
            render={(row) => (
              <ReconciliationCells row={row} month={month} company={company} money={money} />
            )}
          />
        </div>
      )}
    </>
  );
}
function ReconciliationCells({
  row,
  month,
  company,
  money,
}: {
  row: ReconciliationRow;
  month: string;
  company: CompanyDto;
  money: Money;
}) {
  return (
    <>
      <td>
        {month ? (
          <Link
            to={`/ledger?${new URLSearchParams({ company: company.code, month, account: row.account })}`}
          >
            {row.account}
          </Link>
        ) : (
          row.account
        )}
      </td>
      {[
        row.subledgerMinor,
        row.tradeGlMinor,
        row.openingGlMinor,
        row.otherSourceMinor,
        row.glMinor,
        row.tradeDifferenceMinor,
        row.differenceMinor,
      ].map((n, i) => (
        <td key={CELL_KEYS[i]} className="num">
          {money(n)}
        </td>
      ))}
    </>
  );
}

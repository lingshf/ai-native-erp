import type { ReportDto } from "@erp/core/contracts";
import type { Format, T, View } from "./types.ts";

type Kpi = [string, number, boolean?];

export function reportKpis(view: View, report: ReportDto, t: T): Kpi[] {
  return view === "income"
    ? [
        [t("ledger.revenue"), report.income.month.revenue],
        [t("ledger.expense"), report.income.month.expense],
        [t("ledger.profit"), report.income.month.profit, true],
        [`${t("ledger.profit")} · ${t("ledger.year")}`, report.income.ytd.profit],
      ]
    : view === "balance-sheet"
      ? [
          [t("ledger.assets"), report.balanceSheet.assets, true],
          [t("ledger.liabilities"), report.balanceSheet.liabilities],
          [t("ledger.equity"), report.balanceSheet.equity],
        ]
      : [
          [t("journal.debit"), report.trial.debit],
          [t("journal.credit"), report.trial.credit],
        ];
}

export function ReportKpis({ kpis, fmt }: { kpis: Kpi[]; fmt: Format }) {
  return (
    <dl className="kpis">
      {kpis.map(([name, value, emphasis]) => (
        <div key={name} className={emphasis ? "kpi emphasis" : "kpi"}>
          <dt className="label">{name}</dt>
          <dd className="value">{fmt(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

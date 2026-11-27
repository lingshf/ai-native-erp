import { reportMinor, signedAmount, sum } from "./report-measures.ts";
import type { ReportRow } from "./reports.ts";

type IncomeActivity = (row: ReportRow) => number;

export function trialBalance(rows: readonly ReportRow[], activity: IncomeActivity) {
  return {
    rows: rows.map((row) => {
      const normalBalance = reportMinor(row.closing * (row.normalSide === "DEBIT" ? 1 : -1));
      return { ...row, incomeNet: activity(row), normalBalance, abnormal: normalBalance < 0 };
    }),
    debit: sum(rows.map((row) => Math.max(row.closing, 0))),
    credit: sum(rows.map((row) => Math.max(-row.closing, 0))),
  };
}
export function reportGroupTotals(rows: readonly ReportRow[], activity: IncomeActivity) {
  return [...new Set(rows.map((row) => row.reportGroup))].sort().map((reportGroup) => {
    const selected = rows.filter((row) => row.reportGroup === reportGroup);
    return {
      reportGroup,
      category: selected[0].category,
      opening: sum(selected.map((row) => signedAmount(row, row.opening))),
      activity: sum(
        selected.map((row) =>
          signedAmount(
            row,
            ["REVENUE", "EXPENSE"].includes(row.category) ? activity(row) : row.debit - row.credit,
          ),
        ),
      ),
      closing: sum(selected.map((row) => signedAmount(row, row.closing))),
      accounts: selected.map((row) => row.code),
    };
  });
}
export function contraAccountGroups(rows: readonly ReportRow[], activity: IncomeActivity) {
  return rows
    .filter((row) => rows.some((child) => child.contraOf === row.code))
    .map((row) => {
      const children = rows.filter((child) => child.contraOf === row.code);
      const measure = (item: ReportRow) =>
        ["REVENUE", "EXPENSE"].includes(item.category) ? activity(item) : item.closing;
      const gross = signedAmount(row, measure(row)),
        contra = sum(children.map((child) => -signedAmount(child, measure(child))));
      return {
        account: row.code,
        gross,
        contra,
        net: reportMinor(gross - contra),
        accounts: children.map((child) => child.code),
      };
    });
}

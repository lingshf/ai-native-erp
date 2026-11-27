import { DomainError } from "./index.ts";
import type { Account } from "./master-data.ts";
import type { ReportRow } from "./reports.ts";

export function reportMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new DomainError("INVALID_INPUT");
  return value === 0 ? 0 : value;
}
export const sum = (values: readonly number[]) =>
  reportMinor(Number(values.reduce((total, value) => total + BigInt(value), 0n)));
export const signedAmount = (row: ReportRow, value: number) =>
  reportMinor(value * (row.category === "ASSET" || row.category === "EXPENSE" ? 1 : -1));
export const categoryTotal = (
  name: Account["category"],
  measure: (row: ReportRow) => number,
  source: readonly ReportRow[],
) =>
  sum(source.filter((row) => row.category === name).map((row) => signedAmount(row, measure(row))));
export const incomeTotals = (measure: (row: ReportRow) => number, source: readonly ReportRow[]) => {
  const revenue = categoryTotal("REVENUE", measure, source),
    expense = categoryTotal("EXPENSE", measure, source);
  return { revenue, expense, profit: reportMinor(revenue - expense) };
};

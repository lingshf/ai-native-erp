import { DomainError } from "./index.ts";
import type { Account, Company } from "./master-data.ts";
import { categoryTotal, incomeTotals, reportMinor } from "./report-measures.ts";
import { contraAccountGroups, reportGroupTotals, trialBalance } from "./report-sections.ts";

export { reportMinor } from "./report-measures.ts";

export type TrialStage = "unadjusted" | "adjusted" | "postClosing";
export interface ReportRow extends Account {
  readonly opening: number;
  readonly debit: number;
  readonly credit: number;
  readonly closing: number;
  readonly yearNet: number;
}
export interface ReportSnapshot {
  readonly watermark: number;
  readonly accountRevision: number;
}
export function checkedReportSnapshot(
  value: Partial<ReportSnapshot> | undefined,
  latest: ReportSnapshot,
): ReportSnapshot {
  if (value?.watermark === undefined && value?.accountRevision === undefined) return latest;
  if (
    value.watermark === undefined ||
    value.accountRevision === undefined ||
    !Number.isSafeInteger(value.watermark) ||
    value.watermark < 0 ||
    !Number.isSafeInteger(value.accountRevision) ||
    value.accountRevision < 0
  )
    throw new DomainError("INVALID_INPUT");
  if (value.watermark > latest.watermark || value.accountRevision !== latest.accountRevision)
    throw new DomainError("CONFLICT");
  return { watermark: value.watermark, accountRevision: value.accountRevision };
}
export function reportCheck(id: string, left: number, right: number) {
  return { id, left, right, difference: reportMinor(left - right), pass: left === right };
}
export function buildReports(
  company: Company,
  month: string,
  stage: TrialStage,
  rows: readonly ReportRow[],
  incomeRows: readonly ReportRow[] = rows,
) {
  const monthly = incomeTotals((row) => row.debit - row.credit, incomeRows);
  const rawProfit = incomeTotals((row) => row.debit - row.credit, rows).profit;
  const ytd = incomeTotals((row) => row.yearNet, incomeRows);
  const incomeByCode = new Map(incomeRows.map((row) => [row.code, row]));
  const activity = (row: ReportRow) => {
    const current = incomeByCode.get(row.code);
    if (!current) throw new DomainError("INVALID_INPUT");
    return reportMinor(current.debit - current.credit);
  };
  const cumulative = incomeTotals((row) => row.closing, rows);
  const assets = categoryTotal("ASSET", (row) => row.closing, rows);
  const liabilities = categoryTotal("LIABILITY", (row) => row.closing, rows);
  const capitalAndRetained = categoryTotal("EQUITY", (row) => row.closing, rows);
  const equity = reportMinor(capitalAndRetained + cumulative.profit);
  const opening = reportMinor(
    categoryTotal("EQUITY", (row) => row.opening, rows) +
      incomeTotals((row) => row.opening, rows).profit,
  );
  const movements = categoryTotal("EQUITY", (row) => row.debit - row.credit, rows);
  const trial = trialBalance(rows, activity);
  const groups = reportGroupTotals(rows, activity);
  const contraGroups = contraAccountGroups(rows, activity);
  const checks = [
    { id: "trial", left: trial.debit, right: trial.credit },
    { id: "balanceSheet", left: assets, right: reportMinor(liabilities + equity) },
    { id: "equitySummary", left: reportMinor(opening + movements + rawProfit), right: equity },
    { id: "profit", left: reportMinor(monthly.revenue - monthly.expense), right: monthly.profit },
  ].map((check) => reportCheck(check.id, check.left, check.right));
  return {
    company: company.code,
    month,
    currency: company.currency,
    scale: company.scale,
    stage,
    basis: "current-account-configuration" as const,
    trial,
    groups,
    income: { month: monthly, ytd },
    balanceSheet: {
      assets,
      liabilities,
      capitalAndRetained,
      currentEarnings: cumulative.profit,
      equity,
    },
    equitySummary: { opening, movements, profit: rawProfit, closing: equity },
    contraGroups,
    reconciliation: { checks, allPass: checks.every((check) => check.pass) },
  };
}
export interface LedgerCursor extends ReportSnapshot {
  readonly stage: TrialStage;
  readonly company: string;
  readonly account: string;
  readonly month: string;
  readonly dimension: string | null;
  readonly value: string | null;
  readonly date: string;
  readonly entryId: string;
  readonly lineNo: number;
}
export interface LedgerQuery {
  readonly watermark?: number;
  readonly accountRevision?: number;
  readonly stage?: TrialStage;
  readonly limit: number;
  readonly cursor?: string;
  readonly dimension?: string;
  readonly value?: string | null;
}
export interface LedgerLine {
  readonly entryId: string;
  readonly lineNo: number;
  readonly date: string;
  readonly sourceRef: string;
  readonly memo: string;
  readonly debit: number;
  readonly credit: number;
  readonly dimensions: Readonly<Record<string, string | null>>;
  readonly balance: number;
}
export interface LedgerPage extends ReportSnapshot {
  readonly stage: TrialStage;
  readonly opening: number;
  readonly debit: number;
  readonly credit: number;
  readonly closing: number;
  readonly total: number;
  readonly items: readonly LedgerLine[];
  readonly nextCursor: string | null;
}

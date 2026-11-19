import { DomainError } from "./index.ts";
import type { Account, Company } from "./master-data.ts";

export type TrialStage = "unadjusted" | "adjusted" | "postClosing";
export interface ReportRow extends Account {
  readonly opening: number;
  readonly debit: number;
  readonly credit: number;
  readonly closing: number;
  readonly yearNet: number;
}
export function reportMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new DomainError("INVALID_INPUT");
  return value === 0 ? 0 : value;
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
const sum = (values: readonly number[]) =>
  reportMinor(Number(values.reduce((total, value) => total + BigInt(value), 0n)));
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
  const signed = (row: ReportRow, value: number) =>
    reportMinor(value * (row.category === "ASSET" || row.category === "EXPENSE" ? 1 : -1));
  const category = (
    name: Account["category"],
    measure: (row: ReportRow) => number,
    source = rows,
  ) => sum(source.filter((row) => row.category === name).map((row) => signed(row, measure(row))));
  const income = (measure: (row: ReportRow) => number, source = rows) => {
    const revenue = category("REVENUE", measure, source),
      expense = category("EXPENSE", measure, source);
    return { revenue, expense, profit: reportMinor(revenue - expense) };
  };
  const monthly = income((row) => row.debit - row.credit, incomeRows);
  const rawProfit = income((row) => row.debit - row.credit).profit;
  const ytd = income((row) => row.yearNet, incomeRows);
  const incomeByCode = new Map(incomeRows.map((row) => [row.code, row]));
  const activity = (row: ReportRow) => {
    const current = incomeByCode.get(row.code);
    if (!current) throw new DomainError("INVALID_INPUT");
    return reportMinor(current.debit - current.credit);
  };
  const cumulative = income((row) => row.closing);
  const assets = category("ASSET", (row) => row.closing);
  const liabilities = category("LIABILITY", (row) => row.closing);
  const capitalAndRetained = category("EQUITY", (row) => row.closing);
  const equity = reportMinor(capitalAndRetained + cumulative.profit);
  const opening = reportMinor(
    category("EQUITY", (row) => row.opening) + income((row) => row.opening).profit,
  );
  const movements = category("EQUITY", (row) => row.debit - row.credit);
  const trial = {
    rows: rows.map((row) => {
      const normalBalance = reportMinor(row.closing * (row.normalSide === "DEBIT" ? 1 : -1));
      return { ...row, incomeNet: activity(row), normalBalance, abnormal: normalBalance < 0 };
    }),
    debit: sum(rows.map((row) => Math.max(row.closing, 0))),
    credit: sum(rows.map((row) => Math.max(-row.closing, 0))),
  };
  const groups = [...new Set(rows.map((row) => row.reportGroup))].sort().map((reportGroup) => {
    const selected = rows.filter((row) => row.reportGroup === reportGroup);
    return {
      reportGroup,
      category: selected[0].category,
      opening: sum(selected.map((row) => signed(row, row.opening))),
      activity: sum(
        selected.map((row) =>
          signed(
            row,
            ["REVENUE", "EXPENSE"].includes(row.category) ? activity(row) : row.debit - row.credit,
          ),
        ),
      ),
      closing: sum(selected.map((row) => signed(row, row.closing))),
      accounts: selected.map((row) => row.code),
    };
  });
  const contraGroups = rows
    .filter((row) => rows.some((child) => child.contraOf === row.code))
    .map((row) => {
      const children = rows.filter((child) => child.contraOf === row.code);
      const measure = (item: ReportRow) =>
        ["REVENUE", "EXPENSE"].includes(item.category) ? activity(item) : item.closing;
      const gross = signed(row, measure(row)),
        contra = sum(children.map((child) => -signed(child, measure(child))));
      return {
        account: row.code,
        gross,
        contra,
        net: reportMinor(gross - contra),
        accounts: children.map((child) => child.code),
      };
    });
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

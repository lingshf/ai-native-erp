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
export function reportWatermark(value: number | undefined, latest: number): number {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
    throw new DomainError("INVALID_INPUT");
  if (value !== undefined && value > latest) throw new DomainError("CONFLICT");
  return value ?? latest;
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
) {
  const signed = (row: ReportRow, value: number) =>
    reportMinor(value * (row.category === "ASSET" || row.category === "EXPENSE" ? 1 : -1));
  const category = (name: Account["category"], measure: (row: ReportRow) => number) =>
    sum(rows.filter((row) => row.category === name).map((row) => signed(row, measure(row))));
  const income = (measure: (row: ReportRow) => number) => {
    const revenue = category("REVENUE", measure),
      expense = category("EXPENSE", measure);
    return { revenue, expense, profit: reportMinor(revenue - expense) };
  };
  const monthly = income((row) => row.debit - row.credit);
  const ytd = income((row) => row.yearNet);
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
      return { ...row, normalBalance, abnormal: normalBalance < 0 };
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
      activity: sum(selected.map((row) => signed(row, row.debit - row.credit))),
      closing: sum(selected.map((row) => signed(row, row.closing))),
      accounts: selected.map((row) => row.code),
    };
  });
  const contraGroups = rows
    .filter((row) => rows.some((child) => child.contraOf === row.code))
    .map((row) => {
      const children = rows.filter((child) => child.contraOf === row.code);
      const measure = (item: ReportRow) =>
        ["REVENUE", "EXPENSE"].includes(item.category) ? item.debit - item.credit : item.closing;
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
    { id: "equitySummary", left: reportMinor(opening + movements + monthly.profit), right: equity },
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
    equitySummary: { opening, movements, profit: monthly.profit, closing: equity },
    contraGroups,
    reconciliation: { checks, allPass: checks.every((check) => check.pass) },
  };
}
export interface LedgerCursor {
  readonly stage: TrialStage;
  readonly company: string;
  readonly account: string;
  readonly month: string;
  readonly dimension: string | null;
  readonly value: string | null;
  readonly watermark: number;
  readonly date: string;
  readonly entryId: string;
  readonly lineNo: number;
}
export interface LedgerQuery {
  readonly watermark?: number;
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
export interface LedgerPage {
  readonly stage: TrialStage;
  readonly opening: number;
  readonly debit: number;
  readonly credit: number;
  readonly closing: number;
  readonly total: number;
  readonly watermark: number;
  readonly items: readonly LedgerLine[];
  readonly nextCursor: string | null;
}

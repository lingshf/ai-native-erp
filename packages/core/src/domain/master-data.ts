import { DomainError, checkedTeachingMonth, type AccountCategory } from "./index.ts";

export const reportGroups = {
  ASSET: ["cash", "receivables", "inventory", "prepayments", "fixedAssets", "otherAssets"],
  LIABILITY: ["payables", "taxLiabilities", "otherLiabilities"],
  EQUITY: ["capital", "retainedEarnings", "otherEquity"],
  REVENUE: ["sales", "otherRevenue"],
  EXPENSE: ["costOfSales", "operatingExpense", "otherExpense"],
} as const;
export type ReportGroup = (typeof reportGroups)[AccountCategory][number];
export interface CompanyInput {
  readonly code: string;
  readonly name: string;
  readonly currency: string;
  readonly scale: number;
  readonly year: number;
  readonly closeMode: "monthly-teaching" | "annual";
}
export interface Company extends CompanyInput {
  readonly revision: number;
}
export interface AccountInput {
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
  readonly reportGroup: ReportGroup;
  readonly normalSide: "DEBIT" | "CREDIT";
  readonly purpose: "general" | "control" | "clearing" | "suspense";
  readonly controlModule:
    | "AP"
    | "AR"
    | "INVENTORY"
    | "ASSET"
    | "BANK"
    | "TAX"
    | "LEASE"
    | "IC"
    | null;
  readonly contraOf: string | null;
  readonly manualAllowed: boolean;
  readonly active: boolean;
}
export interface Account extends AccountInput {
  readonly revision: number;
  readonly builtin: boolean;
}
export interface Period {
  readonly month: string;
  readonly status: "open" | "frozen" | "closed";
  readonly revision: number;
}
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
export interface PageQuery {
  readonly limit: number;
  readonly cursor?: string;
}
const invalid = (): never => {
  throw new DomainError("INVALID_INPUT");
};
const conflict = (): never => {
  throw new DomainError("CONFLICT");
};
export function checkedName(value: string, max = 80): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /\p{Cc}/u.test(value)
  )
    invalid();
  return value.trim();
}
export function checkedCode(value: string): string {
  if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u.test(value)) invalid();
  return value;
}
export function checkedAccountCode(value: string): string {
  if (typeof value !== "string" || !/^[1-9]\d{3}$/u.test(value)) invalid();
  return value;
}
export function checkedExpectedRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) invalid();
  return value;
}
export function checkedPage(query: PageQuery): PageQuery {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 500) invalid();
  return query;
}
export function checkedCompany(input: CompanyInput): CompanyInput {
  checkedCode(input.code);
  if (
    typeof input.currency !== "string" ||
    !/^[A-Z]{3}$/u.test(input.currency) ||
    !Number.isInteger(input.scale) ||
    input.scale < 0 ||
    input.scale > 4 ||
    !Number.isInteger(input.year) ||
    input.year < 1900 ||
    input.year > 9998 ||
    !["monthly-teaching", "annual"].includes(input.closeMode)
  )
    invalid();
  return { ...input, name: checkedName(input.name, 160) };
}
export function checkedAccount(input: AccountInput): AccountInput {
  checkedAccountCode(input.code);
  const groups: readonly string[] | undefined = reportGroups[input.category];
  if (
    !groups?.includes(input.reportGroup) ||
    !["DEBIT", "CREDIT"].includes(input.normalSide) ||
    !["general", "control", "clearing", "suspense"].includes(input.purpose) ||
    typeof input.active !== "boolean" ||
    typeof input.manualAllowed !== "boolean"
  )
    invalid();
  if (input.purpose === "control") {
    if (
      !input.controlModule ||
      !["AP", "AR", "INVENTORY", "ASSET", "BANK", "TAX", "LEASE", "IC"].includes(
        input.controlModule,
      ) ||
      input.manualAllowed
    )
      invalid();
  } else if (input.controlModule !== null) invalid();
  if (input.contraOf !== null) {
    checkedAccountCode(input.contraOf);
    if (input.purpose !== "general" || input.contraOf === input.code) conflict();
  }
  return { ...input, name: checkedName(input.name) };
}
export function assertAccountRelationships(
  input: AccountInput,
  parent: Account | null,
  children: readonly Account[],
): void {
  const normal = (category: AccountCategory) =>
    ["ASSET", "EXPENSE"].includes(category) ? "DEBIT" : "CREDIT";
  if (
    input.contraOf !== null &&
    (!parent ||
      parent.category !== input.category ||
      parent.purpose !== "general" ||
      parent.contraOf !== null ||
      parent.normalSide !== normal(parent.category) ||
      input.normalSide === parent.normalSide)
  )
    conflict();
  if (
    children.some(
      (child) =>
        input.purpose !== "general" ||
        input.contraOf !== null ||
        input.category !== child.category ||
        input.normalSide !== normal(input.category) ||
        input.normalSide === child.normalSide,
    )
  )
    conflict();
}
export function changedPeriod(
  old: Period,
  status: Period["status"],
  reason: string,
  confirmed: boolean,
): Period {
  checkedTeachingMonth(old.month);
  checkedName(reason, 160);
  if (!["open", "frozen", "closed"].includes(status) || typeof confirmed !== "boolean") invalid();
  if (old.status === "closed" || (status === "closed" && !confirmed)) conflict();
  return { ...old, status, revision: checkedExpectedRevision(old.revision) + 1 };
}
export function defaultAccounts(): readonly Account[] {
  const chart: readonly [string, string, AccountCategory, ReportGroup][] = [
    ["1000", "现金 / Cash", "ASSET", "cash"],
    ["1200", "预付费用 / Prepayments", "ASSET", "prepayments"],
    ["2000", "应计负债 / Accrued liabilities", "LIABILITY", "otherLiabilities"],
    ["3000", "投入资本 / Contributed capital", "EQUITY", "capital"],
    ["3100", "留存收益 / Retained earnings", "EQUITY", "retainedEarnings"],
    ["4000", "服务收入 / Service revenue", "REVENUE", "sales"],
    ["5000", "租金费用 / Rent expense", "EXPENSE", "operatingExpense"],
    ["5100", "工资费用 / Wages expense", "EXPENSE", "operatingExpense"],
  ];
  return chart.map(([code, name, category, reportGroup]) => ({
    code,
    name,
    category,
    reportGroup,
    normalSide: ["ASSET", "EXPENSE"].includes(category) ? "DEBIT" : "CREDIT",
    purpose: "general",
    controlModule: null,
    contraOf: null,
    manualAllowed: true,
    active: true,
    revision: 1,
    builtin: true,
  }));
}

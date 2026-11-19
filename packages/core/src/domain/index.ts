export * from "./master-data.ts";
export * from "./dimensions.ts";
export * from "./journals.ts";
export * from "./business-events.ts";
export * from "./period-close.ts";
export * from "./trade-calculator.ts";
export * from "./trade-master.ts";
import type { TradeIssue } from "./trade-master.ts";
import type { DimensionFieldIssue } from "./dimensions.ts";
import type { JournalFieldIssue } from "./journals.ts";
import type { BusinessIssue } from "./business-events.ts";
import type { TradeCalculationIssue } from "./trade-calculator.ts";
export type DomainErrorCode = "INVALID_INPUT" | "OVERFLOW" | "NOT_FOUND" | "CONFLICT";

export interface AccountFieldIssue {
  readonly path: "code" | "contraOf" | "purpose" | "category" | "normalSide";
  readonly rule: "contraParent" | "contraChildren" | "readOnly";
}
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly issue:
    | AccountFieldIssue
    | DimensionFieldIssue
    | JournalFieldIssue
    | BusinessIssue
    | TradeCalculationIssue
    | TradeIssue
    | undefined;
  constructor(
    code: DomainErrorCode,
    issue?:
      | AccountFieldIssue
      | DimensionFieldIssue
      | JournalFieldIssue
      | BusinessIssue
      | TradeCalculationIssue
      | TradeIssue,
  ) {
    super(
      code === "OVERFLOW" ? "The exact integer range was exceeded." : "Invalid projection input.",
    );
    this.code = code;
    this.issue = issue;
    this.name = "DomainError";
  }
}

const bound = 9007199254740991n;

export function checkedMinor(value: unknown, scale: number): number {
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) throw new DomainError("INVALID_INPUT");
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new DomainError(Number.isInteger(value) ? "OVERFLOW" : "INVALID_INPUT");
  }
  if (typeof value !== "bigint" && typeof value !== "number")
    throw new DomainError("INVALID_INPUT");
  const exact = BigInt(value);
  if (exact < -bound || exact > bound) throw new DomainError("OVERFLOW");
  return Number(exact);
}

export function checkedTeachingMonth(month: unknown): string {
  if (
    typeof month !== "string" ||
    !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ||
    month < "1900-01" ||
    month > "9998-12"
  ) {
    throw new DomainError("INVALID_INPUT");
  }
  return month;
}

export type AccountCategory = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type JournalKind = "normal" | "adjusting" | "reversal" | "closing";

export interface ProjectionAccount {
  readonly code: string;
  readonly name: string;
  readonly category: AccountCategory;
}

export interface PostedTeachingLine {
  readonly id: number;
  readonly lineId: number;
  readonly date: string;
  readonly memo: string;
  readonly kind: JournalKind;
  readonly reversal_of: number | null;
  readonly source_kind: JournalKind | null;
  readonly account: string;
  readonly debit: number;
  readonly credit: number;
  readonly dimensions?: Readonly<Record<string, string>>;
}

export interface TrialBalance {
  readonly rows: readonly (ProjectionAccount & {
    readonly debit: number;
    readonly credit: number;
  })[];
  readonly debit: number;
  readonly credit: number;
}

export interface TeachingTrialBalances {
  readonly month: string;
  readonly trialBalances: {
    readonly unadjusted: TrialBalance;
    readonly adjusted: TrialBalance;
    readonly postClosing: TrialBalance;
  };
}

export interface TeachingLedgerEntry extends PostedTeachingLine {
  readonly balance: number;
}
export interface TeachingLedgerProjection {
  readonly account: string;
  readonly month: string;
  readonly opening: number;
  readonly closing: number;
  readonly debit: number;
  readonly credit: number;
  readonly totalEntries: number;
  readonly entries: readonly TeachingLedgerEntry[];
}

function exact(value: bigint): bigint {
  checkedMinor(value, 2);
  return value;
}

function movement(line: PostedTeachingLine): bigint {
  const debit = checkedMinor(line.debit, 2),
    credit = checkedMinor(line.credit, 2);
  if (debit < 0 || credit < 0 || debit > 0 === credit > 0) throw new DomainError("INVALID_INPUT");
  return BigInt(debit) - BigInt(credit);
}

function compare(left: PostedTeachingLine, right: PostedTeachingLine): number {
  return left.date < right.date
    ? -1
    : left.date > right.date
      ? 1
      : left.id < right.id
        ? -1
        : left.id > right.id
          ? 1
          : left.lineId < right.lineId
            ? -1
            : left.lineId > right.lineId
              ? 1
              : 0;
}

function throughMonth(lines: readonly PostedTeachingLine[], month: string): PostedTeachingLine[] {
  checkedTeachingMonth(month);
  return lines.filter((line) => line.date < `${month}-32`).sort(compare);
}

export function projectTrialBalances(
  accounts: readonly ProjectionAccount[],
  lines: readonly PostedTeachingLine[],
  month: string,
): TeachingTrialBalances {
  const rows = throughMonth(lines, month),
    start = `${month}-01`;
  const trial = (selected: readonly PostedTeachingLine[]): TrialBalance => {
    const balances = new Map(accounts.map((account) => [account.code, 0n]));
    for (const row of selected) {
      const current = balances.get(row.account);
      if (current === undefined) throw new DomainError("NOT_FOUND");
      balances.set(row.account, exact(current + movement(row)));
    }
    let debit = 0n,
      credit = 0n;
    const result = accounts.map((account) => {
      const balance = balances.get(account.code);
      if (balance === undefined) throw new DomainError("NOT_FOUND");
      const dr = balance > 0n ? balance : 0n,
        cr = balance < 0n ? -balance : 0n;
      debit = exact(debit + dr);
      credit = exact(credit + cr);
      return { ...account, debit: Number(dr), credit: Number(cr) };
    });
    return { rows: result, debit: Number(debit), credit: Number(credit) };
  };
  return {
    month,
    trialBalances: {
      unadjusted: trial(
        rows.filter(
          (row) =>
            row.date < start ||
            (row.kind !== "closing" && row.kind !== "adjusting" && row.source_kind !== "adjusting"),
        ),
      ),
      adjusted: trial(rows.filter((row) => row.date < start || row.kind !== "closing")),
      postClosing: trial(rows),
    },
  };
}

export function projectTeachingLedger(
  lines: readonly PostedTeachingLine[],
  account: string,
  month: string,
): TeachingLedgerProjection {
  const rows = throughMonth(lines, month).filter((line) => line.account === account);
  let balance = 0n,
    opening = 0n,
    debit = 0n,
    credit = 0n;
  const entries: TeachingLedgerEntry[] = [];
  for (const row of rows) {
    balance = exact(balance + movement(row));
    if (row.date < `${month}-01`) opening = balance;
    else {
      debit = exact(debit + BigInt(row.debit));
      credit = exact(credit + BigInt(row.credit));
      entries.push({ ...row, balance: Number(balance) });
    }
  }
  return {
    account,
    month,
    opening: Number(opening),
    closing: Number(balance),
    debit: Number(debit),
    credit: Number(credit),
    totalEntries: entries.length,
    entries,
  };
}
export * from "./reports.ts";
export * from "./ai-assistant.ts";

import {
  DomainError,
  checkedTeachingMonth,
  checkedMinor,
  type Company,
  type JournalLine,
  type JournalReceipt,
  type Period,
  type PlannedJournal,
  type ReportRow,
  type ReportSnapshot,
} from "./index.ts";

export interface CloseCommand {
  readonly company: string;
  readonly month: string;
  readonly revision: number;
  readonly commandId: string;
}
export interface ClosePreview extends CloseCommand {
  readonly fingerprint: string;
  readonly action: "freeze" | "close";
  readonly snapshot: ReportSnapshot;
  readonly date: string;
  readonly netProfit: number;
  readonly blockers: readonly ("drafts" | "queue" | "priorPeriods")[];
  readonly lines: readonly JournalLine[];
}
export interface CloseResult {
  readonly preview: ClosePreview;
  readonly period: Period;
  readonly receipt: JournalReceipt;
}
export function nextLedgerMonth(month: string): string {
  checkedTeachingMonth(month);
  const year = Number(month.slice(0, 4)),
    number = Number(month.slice(5));
  return checkedTeachingMonth(
    number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`,
  );
}
export function closingJournals(company: Company, month: string, rows: readonly ReportRow[]) {
  checkedTeachingMonth(month);
  const action =
    company.closeMode === "annual" && !month.endsWith("-12")
      ? ("freeze" as const)
      : ("close" as const);
  const date = `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`;
  if (action === "freeze") return { action, date, netProfit: 0, journals: [] as PlannedJournal[] };
  const nominal = rows.filter(
    (row) => ["REVENUE", "EXPENSE"].includes(row.category) && row.closing !== 0,
  );
  if (nominal.some((row) => row.purpose !== "general")) throw new DomainError("CONFLICT");
  const retained = rows.find((row) => row.code === "3100");
  const line = (account: string, net: number): JournalLine => ({
    account,
    debit: Math.max(net, 0),
    credit: Math.max(-net, 0),
    dimensions: {},
    dimensionOrigins: {},
    role: "business",
    suspense: null,
    balancing: null,
    historical: null,
    group: null,
  });
  const journals: PlannedJournal[] = [];
  let netProfit = 0n;
  for (let offset = 0; offset < nominal.length; offset += 999) {
    const chunk = nominal.slice(offset, offset + 999);
    const net = chunk.reduce((sum, row) => sum - BigInt(row.closing), 0n);
    netProfit += net;
    const lines = chunk.map((row) => line(row.code, -row.closing));
    if (net !== 0n) {
      if (
        !retained?.active ||
        retained.purpose !== "general" ||
        retained.category !== "EQUITY" ||
        retained.reportGroup !== "retainedEarnings" ||
        retained.normalSide !== "CREDIT" ||
        retained.contraOf !== null
      )
        throw new DomainError("CONFLICT");
      lines.push(line(retained.code, checkedMinor(-net, 0)));
    }
    const debit = checkedMinor(
      lines.reduce((sum, item) => sum + BigInt(item.debit), 0n),
      0,
    );
    const credit = checkedMinor(
      lines.reduce((sum, item) => sum + BigInt(item.credit), 0n),
      0,
    );
    if (!debit || debit !== credit) throw new DomainError("INVALID_INPUT");
    journals.push({ kind: "closing", role: "normal", lines, debit, credit });
  }
  return { action, date, netProfit: checkedMinor(netProfit, 0), journals };
}

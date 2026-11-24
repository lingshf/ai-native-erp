import { DomainError, checkedMinor, dimensionBalance } from "./index.ts";
import { resolveLine, totals, type JournalPlanContext } from "./journal-plan-context.ts";
import {
  checkedJournalDay,
  journalError,
  type JournalInputLine,
  type JournalLine,
} from "./journals.ts";

export function businessLines(context: JournalPlanContext): readonly JournalLine[] {
  const { draft } = context;
  if (draft.lines.length < 2) journalError("lines", "shape");
  const lines: JournalLine[] = draft.lines.map((raw, index) =>
    checkedBusinessLine(context, raw, index),
  );
  totals(lines);
  appendBalancingLines(context, lines);
  totals(lines);
  return lines;
}

function checkedBusinessLine(
  context: JournalPlanContext,
  raw: JournalInputLine,
  index: number,
): JournalLine {
  const { accounts, company, draft, historicalImport, input } = context;
  const account = accounts.get(raw.account);
  if (!account || (!historicalImport && !account.active))
    journalError(`lines.${index}.account`, "account");
  if (
    account.purpose === "control"
      ? !account.controlModule || !input.adapter?.controlModules.includes(account.controlModule)
      : !historicalImport && !account.manualAllowed
  )
    journalError(`lines.${index}.account`, "manual");
  if (account.purpose === "suspense") {
    if (!raw.suspense?.owner.trim() || !raw.suspense.reason.trim())
      journalError(`lines.${index}.suspense`, "suspense");
    checkedJournalDay(raw.suspense.reviewDate, `lines.${index}.suspense.reviewDate`, "suspense");
  }
  const debit = amount(raw.debit, company.scale, `lines.${index}.debit`);
  const credit = amount(raw.credit, company.scale, `lines.${index}.credit`);
  if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0))
    journalError(`lines.${index}`, "money");
  return {
    account: raw.account,
    debit,
    credit,
    ...resolveLine(context, raw, index, draft.headerDimensions),
    role: "business",
    suspense: raw.suspense,
    balancing: null,
    historical: null,
    group: null,
  };
}

function amount(text: string, scale: number, path: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(text || "0");
  if (!match || (match[2]?.length ?? 0) > scale) journalError(path, "money");
  const exact = BigInt(`${match[1]}${(match[2] ?? "").padEnd(scale, "0")}`);
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) journalError(path, "money");
  return checkedMinor(exact, scale);
}

function appendBalancingLines(context: JournalPlanContext, lines: JournalLine[]): void {
  const { accounts, balance, draft } = context;
  let candidates: ReturnType<typeof dimensionBalance>;
  try {
    candidates = dimensionBalance(
      balance,
      draft.date,
      lines,
      balance ? (accounts.get(balance.account) ?? null) : null,
    );
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.issue &&
      "scope" in error.issue &&
      error.issue.scope === "dimensions" &&
      error.issue.path === "account"
    )
      journalError("balance.account", "balanceAccount");
    throw error;
  }
  for (const candidate of candidates) {
    const resolved = resolveLine(context, candidate, lines.length, {});
    if (
      !balance ||
      resolved.dimensions[balance.dimension] !== candidate.dimensions[balance.dimension]
    )
      journalError("lines", "balance");
    lines.push({
      account: candidate.account,
      debit: candidate.debit,
      credit: candidate.credit,
      ...resolved,
      role: "balance",
      suspense: null,
      historical: null,
      group: null,
      balancing: {
        dimension: balance.dimension,
        value: candidate.dimensions[balance.dimension],
        businessNet: candidate.businessNet,
        configurationRevision: candidate.configurationRevision,
      },
    });
  }
}

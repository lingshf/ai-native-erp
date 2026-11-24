import {
  DomainError,
  checkedMinor,
  compileDimensionRules,
  type Account,
  type Company,
  type DimensionConfig,
  type DimensionMap,
} from "./index.ts";
import {
  journalError,
  type buildJournalPlan,
  type JournalDraft,
  type JournalInputLine,
  type JournalLine,
  type PlannedJournal,
} from "./journals.ts";

export type JournalPlanInput = Parameters<typeof buildJournalPlan>[0];
export interface JournalPlanContext {
  readonly input: JournalPlanInput;
  readonly draft: JournalDraft;
  readonly company: Company;
  readonly accounts: ReadonlyMap<string, Account>;
  readonly compiled: ReturnType<typeof compileDimensionRules>;
  readonly balance: Extract<DimensionConfig, { kind: "balance" }> | undefined;
  readonly historicalImport: boolean;
}

export function journalPlanContext(
  input: JournalPlanInput,
  historicalImport: boolean,
): JournalPlanContext {
  const accounts = new Map(input.accounts.map((account) => [account.code, account]));
  const compiled = compileDimensionRules(
    historicalImport
      ? input.catalog.map((config) =>
          config.kind === "dimension" || config.kind === "value"
            ? { ...config, active: true }
            : config,
        )
      : input.catalog,
  );
  const balance = input.catalog.find(
    (item): item is Extract<DimensionConfig, { kind: "balance" }> => item.kind === "balance",
  );
  return {
    input,
    draft: input.draft,
    company: input.company,
    accounts,
    compiled,
    balance,
    historicalImport,
  };
}

export function resolveLine(
  context: JournalPlanContext,
  raw: Pick<JournalInputLine, "account" | "dimensions">,
  index: number,
  header: DimensionMap,
) {
  const { compiled, draft, input } = context;
  try {
    const resolved = compiled.resolve({
      account: raw.account,
      day: draft.date,
      header,
      explicit: raw.dimensions,
      master: input.master?.[index],
    });
    if (Object.keys(resolved.dimensions).length > 32)
      journalError(`lines.${index}.dimensions`, "dimensionLimit");
    return resolved;
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.issue &&
      "scope" in error.issue &&
      error.issue.scope === "dimensions"
    )
      throw new DomainError(error.code, {
        ...error.issue,
        path: `lines.${index}.${error.issue.path}`,
      });
    throw error;
  }
}

export function totals(lines: readonly JournalLine[]) {
  const exactDebit = lines.reduce((sum, line) => sum + BigInt(line.debit), 0n);
  const exactCredit = lines.reduce((sum, line) => sum + BigInt(line.credit), 0n);
  if (exactDebit > BigInt(Number.MAX_SAFE_INTEGER) || exactCredit > BigInt(Number.MAX_SAFE_INTEGER))
    journalError("lines", "money");
  const debit = checkedMinor(exactDebit, 0),
    credit = checkedMinor(exactCredit, 0);
  if (!debit || debit !== credit) journalError("lines", "balance");
  return { debit, credit };
}

export function plannedJournal(
  context: JournalPlanContext,
  lines: readonly JournalLine[],
  role: PlannedJournal["role"],
  kind: PlannedJournal["kind"] = context.draft.kind,
): PlannedJournal {
  return { kind, role, lines, ...totals(lines) };
}

import {
  DomainError,
  checkedDimensionDay,
  checkedExpectedRevision,
  checkedMinor,
  type compileDimensionRules,
  type Account,
  type Company,
  type DimensionConfig,
  type DimensionMap,
  type Period,
  type BusinessOperation,
} from "./index.ts";
import { journalPlanContext, plannedJournal } from "./journal-plan-context.ts";
import { correctionJournals } from "./journal-plan-corrections.ts";
import { businessLines } from "./journal-plan-lines.ts";

export type JournalOperation = "journal" | "reverse" | "replace" | "reclassify";
export interface JournalFieldIssue {
  readonly scope: "journals";
  readonly path: string;
  readonly rule:
    | "shape"
    | "money"
    | "balance"
    | "balanceAccount"
    | "dimensionLimit"
    | "businessSource"
    | "account"
    | "manual"
    | "suspense"
    | "period"
    | "stale"
    | "source"
    | "correction"
    | "amount";
}
export function journalError(
  path: string,
  rule: JournalFieldIssue["rule"],
  conflict = false,
): never {
  throw new DomainError(conflict ? "CONFLICT" : "INVALID_INPUT", { scope: "journals", path, rule });
}
export interface SuspenseEvidence {
  readonly owner: string;
  readonly reason: string;
  readonly reviewDate: string;
}
export interface JournalInputLine {
  readonly account: string;
  readonly debit: string;
  readonly credit: string;
  readonly dimensions: DimensionMap;
  readonly suspense: SuspenseEvidence | null;
}
export interface JournalDraft {
  readonly id: string;
  readonly revision: number;
  readonly sourceRef: string;
  readonly date: string;
  readonly documentDate?: string;
  readonly taxDate?: string;
  readonly memo: string;
  readonly kind: "normal" | "adjusting";
  readonly operation: JournalOperation;
  readonly originalId: string | null;
  readonly headerDimensions: DimensionMap;
  readonly lines: readonly JournalInputLine[];
}
type Resolved = ReturnType<ReturnType<typeof compileDimensionRules>["resolve"]>;
export interface JournalLine {
  readonly account: string;
  readonly debit: number;
  readonly credit: number;
  readonly dimensions: DimensionMap;
  readonly dimensionOrigins: Resolved["dimensionOrigins"];
  readonly role: "business" | "balance" | "historical";
  readonly suspense: SuspenseEvidence | null;
  readonly balancing: {
    readonly dimension: string;
    readonly value: string;
    readonly businessNet: number;
    readonly configurationRevision: number;
  } | null;
  readonly historical: { readonly entryId: string; readonly lineNo: number } | null;
  readonly group: "originalReverse" | "newAllocation" | null;
}
export interface PlannedJournal {
  readonly kind: "normal" | "adjusting" | "closing";
  readonly role: "normal" | "reversal" | "reclassification";
  readonly lines: readonly JournalLine[];
  readonly debit: number;
  readonly credit: number;
}
export interface JournalEntry extends PlannedJournal {
  readonly id: string;
  readonly sourceRef: string;
  readonly date: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly module: string | null;
  readonly memo: string;
  readonly operation: JournalOperation;
  readonly postedAt: string;
  readonly fingerprint: string;
}
export interface JournalCorrection {
  readonly originalId: string;
  readonly outputId: string;
  readonly operation: Exclude<JournalOperation, "journal">;
  readonly date: string;
  readonly sequence: number;
}
export interface JournalPlan {
  readonly version: 1;
  readonly company: string;
  readonly currency: string;
  readonly scale: number;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly sourceRef: string;
  readonly date: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly module: string | null;
  readonly memo: string;
  readonly operation: JournalOperation;
  readonly originalId: string | null;
  readonly journals: readonly PlannedJournal[];
}
export interface JournalReceipt {
  readonly company: string;
  readonly sourceRef: string;
  readonly idempotencyKey: string;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly fingerprint: string;
  readonly operation: JournalOperation | BusinessOperation | "period.close";
  readonly module: string | null;
  readonly journalIds: readonly string[];
  readonly postedAt: string;
}
export interface JournalSummary {
  readonly id: string;
  readonly date: string;
  readonly sourceRef: string;
  readonly memo: string;
  readonly operation: JournalOperation;
  readonly revision: number | null;
}
export function checkedJournalId(id: string): void {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)
  )
    journalError("id", "shape");
}
export function checkedJournalDraft(draft: JournalDraft, maximumLines = 500): void {
  checkedJournalId(draft.id);
  checkedExpectedRevision(draft.revision);
  if (
    !["journal", "reverse", "replace", "reclassify"].includes(draft.operation) ||
    !["normal", "adjusting"].includes(draft.kind) ||
    typeof draft.sourceRef !== "string" ||
    !/^[ -~]{0,100}$/u.test(draft.sourceRef) ||
    typeof draft.memo !== "string" ||
    draft.memo.length > 200 ||
    typeof draft.date !== "string" ||
    draft.date.length > 10 ||
    (draft.documentDate !== undefined &&
      (typeof draft.documentDate !== "string" || draft.documentDate.length > 10)) ||
    (draft.taxDate !== undefined &&
      (typeof draft.taxDate !== "string" || draft.taxDate.length > 10)) ||
    !Array.isArray(draft.lines) ||
    draft.lines.length > maximumLines
  )
    journalError("form", "shape");
  if (draft.operation === "journal" ? draft.originalId !== null : draft.originalId === null)
    journalError("originalId", "source");
  if (draft.originalId !== null) checkedJournalId(draft.originalId);
}
export function journalDates(draft: Pick<JournalDraft, "date" | "documentDate" | "taxDate">) {
  return {
    documentDate: draft.documentDate ?? draft.date,
    taxDate: draft.taxDate ?? draft.date,
  };
}
export function checkedJournalDay(day: string, path: string, rule: "shape" | "suspense" = "shape") {
  try {
    checkedDimensionDay(day, path);
  } catch (error) {
    if (error instanceof DomainError && error.code === "INVALID_INPUT") journalError(path, rule);
    throw error;
  }
}
export function buildJournalPlan(input: {
  readonly draft: JournalDraft;
  readonly company: Company;
  readonly period: Period | null;
  readonly accounts: readonly Account[];
  readonly catalog: readonly DimensionConfig[];
  readonly original: JournalEntry | null;
  readonly corrections: readonly JournalCorrection[];
  readonly turnover: number;
  readonly master?: readonly DimensionMap[];
  readonly adapter?: {
    readonly module: string;
    readonly controlModules: readonly NonNullable<Account["controlModule"]>[];
    readonly periodModules?: readonly ("trade" | "tax")[];
  };
}): JournalPlan {
  const { draft, company, period } = input;
  const historicalImport = input.adapter?.module === "LEGACY";
  checkedJournalDraft(draft, historicalImport ? 2000 : 500);
  if (!draft.sourceRef.trim() || !draft.memo.trim()) journalError("sourceRef", "shape");
  checkedJournalDay(draft.date, "date");
  const dates = journalDates(draft);
  checkedJournalDay(dates.documentDate, "documentDate");
  checkedJournalDay(dates.taxDate, "taxDate");
  if (!period || period.month !== draft.date.slice(0, 7) || period.status !== "open")
    journalError("date", "period");
  if (input.adapter?.periodModules?.some((module) => !period.modules.includes(module)))
    journalError("date", "period");
  const context = journalPlanContext(input, historicalImport);
  // correctionJournals builds new business lines only after the mirror self-check; error precedence relies on it.
  const journals =
    draft.operation === "journal"
      ? [plannedJournal(context, businessLines(context), "normal")]
      : correctionJournals(context);
  const turnover =
    BigInt(checkedMinor(input.turnover, 0)) +
    journals.reduce((sum, journal) => sum + BigInt(journal.debit), 0n);
  if (turnover > BigInt(Number.MAX_SAFE_INTEGER)) journalError("lines", "money");
  return {
    version: 1,
    company: company.code,
    currency: company.currency,
    scale: company.scale,
    draftId: draft.id,
    draftRevision: draft.revision,
    sourceRef: draft.sourceRef,
    date: draft.date,
    ...dates,
    module: input.adapter?.module ?? null,
    memo: draft.memo,
    operation: draft.operation,
    originalId: draft.originalId,
    journals,
  };
}

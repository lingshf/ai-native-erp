import { plannedJournal, type JournalPlanContext } from "./journal-plan-context.ts";
import { businessLines } from "./journal-plan-lines.ts";
import {
  journalError,
  type JournalCorrection,
  type JournalDraft,
  type JournalEntry,
  type JournalLine,
  type PlannedJournal,
} from "./journals.ts";

export function correctionJournals(context: JournalPlanContext): readonly PlannedJournal[] {
  const { draft, input } = context;
  const original = checkedCorrectionSource(context);
  checkedCorrectionChain(original, input.corrections, draft);
  const reversed = mirroredLines(context, original);
  if (draft.operation === "reverse")
    return [plannedJournal(context, reversed, "reversal", original.kind)];
  const fresh = businessLines(context);
  if (draft.operation === "replace")
    return [
      plannedJournal(context, reversed, "reversal", original.kind),
      plannedJournal(context, fresh, "normal"),
    ];
  return [reclassificationJournal(context, original, reversed, fresh)];
}

function checkedCorrectionSource({ draft, input }: JournalPlanContext): JournalEntry {
  const { original } = input;
  if (
    !original ||
    original.kind === "closing" ||
    original.id !== draft.originalId ||
    original.module !== (input.adapter?.module ?? null) ||
    original.role === "reversal" ||
    (original.role === "reclassification" && draft.operation !== "reverse")
  )
    journalError("originalId", "source");
  return original;
}

function checkedCorrectionChain(
  original: JournalEntry,
  corrections: readonly JournalCorrection[],
  draft: JournalDraft,
): void {
  const active = new Map<string, boolean>();
  for (const edge of [...corrections].sort((a, b) => b.sequence - a.sequence))
    active.set(
      edge.originalId,
      Boolean(active.get(edge.originalId)) ||
        edge.operation !== "reclassify" ||
        !active.get(edge.outputId),
    );
  if (active.get(original.id)) journalError("originalId", "correction", true);
  const latestDate = corrections.reduce(
    (latest, edge) => (edge.date > latest ? edge.date : latest),
    original.date,
  );
  if (draft.date < latestDate) journalError("date", "correction");
}

function mirroredLines(
  { accounts }: JournalPlanContext,
  original: JournalEntry,
): readonly JournalLine[] {
  // D6: mirror immutable evidence; current defaults/availability must not prevent undoing history.
  const reversed: JournalLine[] = original.lines.map((line, index) => {
    if (!accounts.has(line.account)) journalError(`lines.${index}.account`, "account");
    return {
      ...line,
      debit: line.credit,
      credit: line.debit,
      role: "historical",
      historical: { entryId: original.id, lineNo: index + 1 },
      group: null,
    };
  });
  for (const [index, line] of reversed.entries()) {
    const source = original.lines[index];
    if (
      line.account !== source.account ||
      line.debit !== source.credit ||
      line.credit !== source.debit ||
      JSON.stringify(line.dimensions) !== JSON.stringify(source.dimensions) ||
      JSON.stringify(line.dimensionOrigins) !== JSON.stringify(source.dimensionOrigins)
    )
      journalError(`lines.${index}`, "correction");
  }
  return reversed;
}

function reclassificationJournal(
  context: JournalPlanContext,
  original: JournalEntry,
  reversed: readonly JournalLine[],
  fresh: readonly JournalLine[],
): PlannedJournal {
  const economic = (lines: readonly JournalLine[]) =>
    lines
      .filter((line) => line.role === "business")
      .reduce((sum, line) => sum + BigInt(line.debit), 0n);
  if (economic(fresh) !== economic(original.lines)) journalError("lines", "amount");
  return plannedJournal(
    context,
    [
      ...reversed.map((line) => ({ ...line, group: "originalReverse" as const })),
      ...fresh.map((line) => ({ ...line, group: "newAllocation" as const })),
    ],
    "reclassification",
    original.kind,
  );
}

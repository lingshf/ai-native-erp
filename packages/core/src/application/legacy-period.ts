import { changedPeriod, checkedTeachingMonth, DomainError, type Period } from "@erp/core/domain";
import type { MasterDataRepository } from "./master-data.ts";

export async function importHistoricalPeriod(
  repo: MasterDataRepository,
  input: {
    company: string;
    month: string;
    status: "frozen" | "closed";
    sourceRef: string;
    closingRefs: readonly { legacyRef: string; journalId: string }[];
    at: string;
  },
): Promise<Period> {
  checkedTeachingMonth(input.month);
  const old = await repo.period(input.company, input.month);
  if (old?.status !== "open" || !input.sourceRef) throw new DomainError("CONFLICT");
  if ((await repo.closeState(input.company, input.month, false)).priorPeriods)
    throw new DomainError("CONFLICT");
  for (const ref of input.closingRefs) {
    const journal = await repo.journalEntry(input.company, ref.journalId);
    if (
      !ref.legacyRef ||
      !journal ||
      journal.kind !== "closing" ||
      journal.date.slice(0, 7) !== input.month
    )
      throw new DomainError("CONFLICT");
  }
  const next = changedPeriod(old, input.status, "legacy.import", true);
  await repo.savePeriod(input.company, next, old.revision);
  await repo.history(
    input.company,
    "period",
    input.month,
    next.revision,
    next,
    input.at,
    JSON.stringify({
      source: "legacy.import",
      sourceRef: input.sourceRef,
      closingRefs: input.closingRefs,
    }),
  );
  return next;
}

import { DomainError, type BusinessPreview, type JournalPlan } from "@erp/core/domain";
import type { JournalService } from "./journals.ts";
export type JournalPlanner = Pick<JournalService, "plan">;
export interface BusinessEventPart {
  readonly current: { fingerprint: string; plan: JournalPlan };
  readonly matches: BusinessPreview["matches"][number][];
  readonly statistics: BusinessPreview["statistics"];
  readonly clearing: BusinessPreview["clearing"];
  readonly evidence: unknown;
}
export type RepositorySteps<T> = Generator<Promise<unknown>, T, never>;
export function* waitFor<T>(pending: Promise<T>): Generator<Promise<T>, T, T> {
  return yield pending;
}
export function required<T>(value: T | null): T {
  if (value === null) throw new DomainError("NOT_FOUND");
  return value;
}

import {
  businessError,
  compileDimensionRules,
  journalError,
  statisticsQuantity,
  type BusinessEvent,
  type ClearingEvent,
  type Company,
  type JournalPlan,
  type Period,
  type StatisticsEvent,
} from "@erp/core/domain";
import {
  required,
  waitFor,
  type BusinessEventPart,
  type RepositorySteps,
} from "./business-event-plan.ts";
import type { JournalTools } from "./journals.ts";
import type { MasterDataRepository } from "./master-data.ts";
export interface LedgerContext {
  readonly company: string;
  readonly owner: Company;
  readonly period: Period;
}
function emptyBusinessPlan(company: string, owner: Company, event: BusinessEvent): JournalPlan {
  return {
    version: 1,
    company,
    currency: owner.currency,
    scale: owner.scale,
    draftId: event.id,
    draftRevision: 0,
    sourceRef: event.sourceRef,
    date: event.date,
    documentDate: event.date,
    taxDate: event.date,
    module: null,
    memo: event.memo,
    operation: "journal",
    originalId: null,
    journals: [],
  };
}
function* ledgerPlan(
  repo: MasterDataRepository,
  tools: JournalTools,
  { company, owner, period }: LedgerContext,
  plan: JournalPlan,
): RepositorySteps<BusinessEventPart["current"]> {
  return {
    plan,
    fingerprint: tools.hash([
      owner,
      period,
      yield* waitFor(repo.journalConfigurationStamp(company)),
    ]),
  };
}
export function* statisticsPreview(
  repo: MasterDataRepository,
  tools: JournalTools,
  context: LedgerContext,
  event: StatisticsEvent,
): RepositorySteps<BusinessEventPart> {
  const { company, owner } = context;
  const plan = emptyBusinessPlan(company, owner, event);
  const resolved = compileDimensionRules(yield* waitFor(repo.dimensionCatalog(company))).resolve({
    account: "LEDGER",
    day: event.date,
    explicit: event.dimensions,
  });
  if (Object.keys(resolved.dimensions).length > 32) journalError("dimensions", "dimensionLimit");
  const statistics: BusinessEventPart["statistics"] = {
    code: event.code,
    quantity: statisticsQuantity(event.quantity),
    scale: 6,
    unit: event.unit,
    ...resolved,
  };
  const current = yield* ledgerPlan(repo, tools, context, plan);
  return { current, matches: [], statistics, clearing: [], evidence: null };
}
export function* clearingMatchPreview(
  repo: MasterDataRepository,
  tools: JournalTools,
  context: LedgerContext,
  event: ClearingEvent,
): RepositorySteps<BusinessEventPart> {
  const { company, owner } = context;
  const plan = emptyBusinessPlan(company, owner, event);
  const account = required(yield* waitFor(repo.account(company, event.account)));
  if (!account.active || !["clearing", "suspense"].includes(account.purpose))
    businessError("account", "account");
  const lines = yield* waitFor(repo.clearingLines(company, event.lines));
  if (
    lines.length !== event.lines.length ||
    lines.some((line) => line.account !== event.account || line.balancing || line.date > event.date)
  )
    businessError("lines", "line");
  if (lines.some((line) => line.matched)) businessError("lines", "source", true);
  if (lines.reduce((sum, line) => sum + BigInt(line.debit) - BigInt(line.credit), 0n) !== 0n)
    businessError("lines", "line");
  const clearing = event.lines;
  const current = yield* ledgerPlan(repo, tools, context, plan);
  return { current, matches: [], statistics: null, clearing, evidence: [account, lines] };
}

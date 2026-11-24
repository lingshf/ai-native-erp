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
import { required, type BusinessEventPart } from "./business-event-plan.ts";
import type { JournalTools } from "./journals.ts";
import type { MasterDataRepository } from "./master-data.ts";
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
async function ledgerPlan(
  repo: MasterDataRepository,
  tools: JournalTools,
  company: string,
  owner: Company,
  period: Period,
  event: BusinessEvent,
): Promise<BusinessEventPart["current"]> {
  return {
    plan: emptyBusinessPlan(company, owner, event),
    fingerprint: tools.hash([owner, period, await repo.journalConfigurationStamp(company)]),
  };
}
export async function statisticsPreview(
  repo: MasterDataRepository,
  tools: JournalTools,
  company: string,
  owner: Company,
  period: Period,
  event: StatisticsEvent,
): Promise<BusinessEventPart> {
  const resolved = compileDimensionRules(await repo.dimensionCatalog(company)).resolve({
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
  const current = await ledgerPlan(repo, tools, company, owner, period, event);
  return { current, matches: [], statistics, clearing: [], evidence: null };
}
export async function clearingMatchPreview(
  repo: MasterDataRepository,
  tools: JournalTools,
  company: string,
  owner: Company,
  period: Period,
  event: ClearingEvent,
): Promise<BusinessEventPart> {
  const account = required(await repo.account(company, event.account));
  if (!account.active || !["clearing", "suspense"].includes(account.purpose))
    businessError("account", "account");
  const lines = await repo.clearingLines(company, event.lines);
  if (
    lines.length !== event.lines.length ||
    lines.some((line) => line.account !== event.account || line.balancing || line.date > event.date)
  )
    businessError("lines", "line");
  if (lines.some((line) => line.matched)) businessError("lines", "source", true);
  if (lines.reduce((sum, line) => sum + BigInt(line.debit) - BigInt(line.credit), 0n) !== 0n)
    businessError("lines", "line");
  const current = await ledgerPlan(repo, tools, company, owner, period, event);
  return {
    current,
    matches: [],
    statistics: null,
    clearing: event.lines,
    evidence: [account, lines],
  };
}

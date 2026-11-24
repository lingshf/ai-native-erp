import {
  businessError,
  compilePostingRules,
  type BusinessEvent,
  type CancelCashEvent,
  type CashServiceEvent,
  type Company,
  type JournalDraft,
} from "@erp/core/domain";
import { required, type BusinessEventPart, type JournalPlanner } from "./business-event-plan.ts";
import type { MasterDataRepository } from "./master-data.ts";
type PostingSelection = ReturnType<ReturnType<typeof compilePostingRules>["match"]>;
function businessDraft(event: BusinessEvent): JournalDraft {
  return {
    id: event.id,
    revision: 0,
    sourceRef: event.sourceRef,
    date: event.date,
    documentDate: event.date,
    taxDate: event.date,
    memo: event.memo,
    operation: "journal",
    originalId: null,
    kind: "normal",
    headerDimensions: {},
    lines: [],
  };
}
async function checkedCashAccounts(
  repo: MasterDataRepository,
  company: string,
  event: CashServiceEvent,
  cash: PostingSelection,
  offset: PostingSelection,
): Promise<BusinessEventPart["matches"]> {
  const matches: BusinessEventPart["matches"] = [];
  const accounts = await repo.accountsByCodes(company, [cash.rule.account, offset.rule.account]);
  for (const [selection, isCash] of [
    [cash, true],
    [offset, false],
  ] as const) {
    const account = accounts.find((item) => item.code === selection.rule.account);
    if (
      !account?.active ||
      account.purpose !== "general" ||
      (isCash
        ? account.category !== "ASSET" || account.reportGroup !== "cash"
        : account.category !== (event.direction === "receive" ? "REVENUE" : "EXPENSE"))
    )
      businessError(`rules.${selection.rule.meaning}`, "account");
    matches.push(selection.explanation);
  }
  return matches;
}
function cashServiceDraft(
  event: CashServiceEvent,
  cash: PostingSelection,
  offset: PostingSelection,
): JournalDraft {
  const receive = event.direction === "receive";
  return {
    ...businessDraft(event),
    lines: [
      {
        account: cash.rule.account,
        debit: receive ? event.amount : "",
        credit: receive ? "" : event.amount,
        dimensions: event.dimensions,
        suspense: null,
      },
      {
        account: offset.rule.account,
        debit: receive ? "" : event.amount,
        credit: receive ? event.amount : "",
        dimensions: event.dimensions,
        suspense: null,
      },
    ],
  };
}
export async function cashServicePlan(
  repo: MasterDataRepository,
  journals: JournalPlanner,
  company: string,
  owner: Company,
  event: CashServiceEvent,
): Promise<BusinessEventPart> {
  if (event.currency !== owner.currency) businessError("currency", "shape");
  const service = required(await repo.businessMaster(company, "service", event.service));
  const party =
    event.party === null
      ? null
      : required(await repo.businessMaster(company, "party", event.party));
  if (!service.active || (party && !party.active)) businessError("service", "reference");
  const compiled = compilePostingRules(await repo.postingCatalog(company), event.date);
  const cash = compiled.match(event.direction, "cash", service, party);
  const offset = compiled.match(event.direction, "offset", service, party);
  const matches = await checkedCashAccounts(repo, company, event, cash, offset);
  const master = { ...(party?.dimensions ?? {}), ...service.dimensions };
  const current = await journals.plan(repo, company, cashServiceDraft(event, cash, offset), [
    { ...master, ...cash.rule.dimensions },
    { ...master, ...offset.rule.dimensions },
  ]);
  return { current, matches, statistics: null, clearing: [], evidence: [service, party] };
}
export async function cashServiceCancelPlan(
  repo: MasterDataRepository,
  journals: JournalPlanner,
  company: string,
  event: CancelCashEvent,
): Promise<BusinessEventPart> {
  const original = required(await repo.businessEvent(company, event.originalId));
  if (original.event.operation !== "cash_service" || original.receipt.journalIds.length !== 1)
    businessError("originalId", "reference");
  const current = await journals.plan(repo, company, {
    ...businessDraft(event),
    operation: "reverse",
    originalId: original.receipt.journalIds[0],
  });
  return { current, matches: [], statistics: null, clearing: [], evidence: original.receipt };
}

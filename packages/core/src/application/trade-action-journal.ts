import {
  tradeDimensionKey,
  tradeDocumentError,
  tradeSegments,
  type JournalDraft,
  type TradeActionCommand,
} from "@erp/core/domain";
import type { JournalPreview, JournalService } from "./journals.ts";
import type { TradeActionContext, TradeBranchOutcome } from "./trade-action-context.ts";

export function tradeJournalDraft(
  ctx: TradeActionContext,
  command: TradeActionCommand,
  sourceRef: string,
  { historical, originalId }: TradeBranchOutcome,
): JournalDraft {
  return {
    id: ctx.actionId,
    revision: 0,
    sourceRef,
    date: ctx.day,
    documentDate: command.documentDate,
    taxDate: command.taxDate,
    memo: `${command.kind}: ${"reason" in command ? command.reason : ctx.actionId}`,
    kind: "normal",
    operation: historical ? "reverse" : "journal",
    originalId,
    headerDimensions: {},
    lines: ctx.lines,
  };
}
export async function emptyReversePlan(
  ctx: TradeActionContext,
  command: TradeActionCommand,
  draft: JournalDraft,
): Promise<JournalPreview> {
  const { repo, company, companyCode, actionId, day } = ctx;
  const period = await repo.period(companyCode, day.slice(0, 7));
  if (
    period?.status !== "open" ||
    !period.modules.includes("trade") ||
    !period.modules.includes("tax")
  )
    tradeDocumentError("accountingDate", "reference");
  ctx.dependencies.push(period, await repo.journalConfigurationStamp(companyCode));
  return {
    fingerprint: "",
    plan: {
      version: 1,
      company: companyCode,
      currency: company.currency,
      scale: company.scale,
      draftId: actionId,
      draftRevision: 0,
      sourceRef: draft.sourceRef,
      date: day,
      documentDate: command.documentDate,
      taxDate: command.taxDate,
      module: "TRADE",
      memo: draft.memo,
      operation: "reverse",
      originalId: null,
      journals: [],
    },
  };
}
export async function planTradeJournal(
  ctx: TradeActionContext,
  journals: JournalService,
  command: TradeActionCommand,
  draft: JournalDraft,
  { gross, historical }: TradeBranchOutcome,
): Promise<JournalPreview> {
  const journal = await journals
    .adapter("TRADE")
    .plan(ctx.repo, ctx.companyCode, draft, ctx.master);
  if (historical) return journal;
  for (const entry of ctx.exact)
    if (
      tradeDimensionKey(journal.plan.journals[0].lines[entry.index].dimensions) !==
      tradeDimensionKey(entry.dimensions)
    )
      tradeDocumentError(`lines.${entry.index}.dimensions`, "account");
  if (command.kind === "advance")
    ctx.changes[0] = {
      before: null,
      after: {
        ...ctx.changes[0].after,
        dimensions: journal.plan.journals[0].lines[0].dimensions,
        segments: tradeSegments([
          { dimensions: journal.plan.journals[0].lines[0].dimensions, gross },
        ]),
      },
    };
  if (command.kind === "apply") return withoutZeroNetJournals(journal);
  return journal;
}
function withoutZeroNetJournals(journal: JournalPreview): JournalPreview {
  const net = new Map<string, bigint>();
  for (const line of journal.plan.journals[0].lines) {
    const key = JSON.stringify([line.account, tradeDimensionKey(line.dimensions)]);
    net.set(key, (net.get(key) ?? 0n) + BigInt(line.debit) - BigInt(line.credit));
  }
  if ([...net.values()].every((n) => n === 0n))
    return { ...journal, plan: { ...journal.plan, journals: [] } };
  return journal;
}

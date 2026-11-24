import {
  allocateTradeSegments,
  tradeDimensionKey,
  tradeDocumentError,
  type TradeActionReceipt,
} from "@erp/core/domain";
import {
  journalOutcome,
  required,
  type TradeActionContext,
  type TradeBranchOutcome,
  type TradeCommandOf,
} from "./trade-action-context.ts";
import { changed, consume } from "./trade-action-item-changes.ts";

export async function prepareApply(
  ctx: TradeActionContext,
  command: TradeCommandOf<"apply">,
): Promise<TradeBranchOutcome> {
  const source = await ctx.item(command.sourceId, command.sourceRevision);
  const target = await ctx.item(command.targetId, command.targetRevision);
  if (source.kind === "invoice" || target.kind !== "invoice")
    tradeDocumentError("targetId", "reference");
  if (source.party !== target.party || source.side !== target.side)
    tradeDocumentError("targetId", "party");
  if (source.currency !== target.currency) tradeDocumentError("targetId", "currency");
  // D30: legacy opening items may sit on either same-side trade account role.
  await ctx.account(
    source.controlAccount,
    source.kind === "advance" ? "advanceAccount" : "controlAccount",
    source.side,
    {
      role: source.kind === "advance" ? "controlAccount" : "advanceAccount",
      openingItem: source.itemId,
    },
  );
  await ctx.account(target.controlAccount, "controlAccount", target.side, {
    role: "advanceAccount",
    openingItem: target.itemId,
  });
  const gross = command.gross;
  ctx.changes.push(
    { before: source, after: consume(source, gross) },
    { before: target, after: consume(target, gross) },
  );
  for (const segment of allocateTradeSegments(source, gross))
    ctx.push(source.controlAccount, source.side === "AR", segment.gross, segment.dimensions);
  for (const segment of allocateTradeSegments(target, gross))
    ctx.push(target.controlAccount, target.side === "AP", segment.gross, segment.dimensions);
  return journalOutcome(gross);
}
type ReverseCommand = TradeCommandOf<"reverse">;
export async function prepareReverse(
  ctx: TradeActionContext,
  command: ReverseCommand,
): Promise<TradeBranchOutcome> {
  const { repo, companyCode } = ctx;
  if (await repo.tradeUndo(companyCode, "reverse", command.settlementId))
    tradeDocumentError("settlementId", "duplicate", true);
  const application = await repo.tradeAction(companyCode, command.settlementId);
  const payment = await repo.tradePayment(companyCode, command.settlementId);
  if (application?.command.kind !== "apply" && !payment)
    tradeDocumentError("settlementId", "reference");
  const allocations =
    application?.command.kind === "apply"
      ? reverseAllocations(application.receipt)
      : required(payment).receipt.allocations;
  await restoreReversedItems(ctx, command, allocations);
  const receipt =
    application?.command.kind === "apply" ? application.receipt : required(payment).receipt;
  ctx.dependencies.push(receipt);
  ctx.links.push(command.settlementId);
  const originalId = receipt.journalIds[0] ?? null;
  return {
    gross: receipt.gross,
    originalId,
    historical: true,
    emptyReverse: originalId === null,
  };
}
type PaymentAllocations = NonNullable<
  Awaited<ReturnType<TradeActionContext["repo"]["tradePayment"]>>
>["receipt"]["allocations"];
type ReverseAllocation = ReturnType<typeof reverseAllocations>[number] | PaymentAllocations[number];
function reverseAllocations(receipt: TradeActionReceipt) {
  return receipt.changes.map((c) => ({
    itemId: c.after.itemId,
    gross: required(c.before).remainingGross - c.after.remainingGross,
    net: required(c.before).remainingNet - c.after.remainingNet,
    tax: required(c.before).remainingTax - c.after.remainingTax,
    segments: required(c.before)
      .segments.map((segment) => ({
        dimensions: segment.dimensions,
        gross:
          segment.remainingGross -
          required(
            c.after.segments.find(
              (s) => tradeDimensionKey(s.dimensions) === tradeDimensionKey(segment.dimensions),
            ) ?? null,
          ).remainingGross,
      }))
      .filter((s) => s.gross > 0),
  }));
}
async function restoreReversedItems(
  ctx: TradeActionContext,
  command: ReverseCommand,
  allocations: readonly ReverseAllocation[],
) {
  if (
    allocations.length !== command.items.length ||
    command.items.some((i) => !allocations.some((a) => a.itemId === i.itemId))
  )
    tradeDocumentError("items", "reference");
  for (const allocation of allocations) {
    const selection = required(command.items.find((i) => i.itemId === allocation.itemId) ?? null);
    const current = await ctx.item(selection.itemId, selection.revision);
    ctx.changes.push({
      before: current,
      after: changed(
        current,
        -allocation.gross,
        -allocation.net,
        -allocation.tax,
        allocation.segments ?? [{ dimensions: current.dimensions, gross: allocation.gross }],
      ),
    });
  }
}

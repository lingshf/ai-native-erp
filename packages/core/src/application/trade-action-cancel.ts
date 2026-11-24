import { tradeDocumentError } from "@erp/core/domain";
import {
  required,
  type TradeActionContext,
  type TradeBranchOutcome,
  type TradeCommandOf,
} from "./trade-action-context.ts";
import { changed } from "./trade-action-item-changes.ts";

export async function prepareCancel(
  ctx: TradeActionContext,
  command: TradeCommandOf<"cancel">,
): Promise<TradeBranchOutcome> {
  const { repo, companyCode } = ctx;
  // D30: opening items are legacy balances, not cancellable trade evidence.
  const source = required(await repo.tradeItemSource(companyCode, command.itemId));
  if (source.opening) tradeDocumentError("itemId", "reference");
  const original = await ctx.item(command.itemId, command.revision);
  if (
    original.remainingGross !== original.gross ||
    (await repo.tradeUndo(companyCode, "cancel", original.itemId))
  )
    tradeDocumentError("itemId", "reference");
  if (
    original.kind === "invoice" &&
    (await repo.tradeCreditLines(companyCode, original.itemId)).length
  )
    tradeDocumentError("itemId", "reference");
  if (source.originalId !== null) {
    if (command.relatedRevision === null) tradeDocumentError("relatedRevision", "shape");
    const invoice = await ctx.item(source.originalId, command.relatedRevision);
    ctx.changes.push({
      before: invoice,
      after: { ...invoice, revision: invoice.revision + 1 },
    });
  } else if (command.relatedRevision !== null) tradeDocumentError("relatedRevision", "shape");
  ctx.changes.push({
    before: original,
    after: {
      ...changed(original, original.net + original.tax, original.net, original.tax),
      status: "cancelled",
    },
  });
  return {
    gross: original.gross,
    historical: true,
    originalId: source.journalId,
    emptyReverse: false,
  };
}

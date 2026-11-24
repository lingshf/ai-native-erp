import { tradeDocumentError, tradeEffective, tradeSegments, type OpenItem } from "@erp/core/domain";
import {
  journalOutcome,
  type TradeActionContext,
  type TradeBranchOutcome,
  type TradeCommandOf,
} from "./trade-action-context.ts";

type AdvanceCommand = TradeCommandOf<"advance">;
export async function prepareAdvance(
  ctx: TradeActionContext,
  command: AdvanceCommand,
): Promise<TradeBranchOutcome> {
  const { party, profile } = await advanceProfile(ctx, command);
  ctx.dependencies.push(party, profile);
  await ctx.account(profile.data.advanceAccount, "advanceAccount", command.side);
  await ctx.account(profile.data.cashAccount, "cashAccount", command.side);
  const gross = command.gross;
  ctx.push(
    profile.data.advanceAccount,
    command.side === "AP",
    gross,
    command.dimensions,
    party.data.defaultDimensions,
    false,
  );
  ctx.push(profile.data.cashAccount, command.side !== "AP", gross, {}, {}, false);
  ctx.changes.push({
    before: null,
    after: advanceItem(ctx, command, profile.data.advanceAccount, gross),
  });
  return journalOutcome(gross);
}
async function advanceProfile(
  { repo, company, companyCode, day }: TradeActionContext,
  command: AdvanceCommand,
) {
  if (company.currency !== command.currency) tradeDocumentError("currency", "currency");
  const party = await repo.tradeConfig(companyCode, "tradeParty", command.party);
  if (party?.kind !== "tradeParty" || !tradeEffective(party, day))
    tradeDocumentError("party", "party");
  const profileCode = command.side === "AP" ? party.data.apProfile : party.data.arProfile;
  if (!profileCode) tradeDocumentError("party", "party");
  const profile = await repo.tradeConfig(companyCode, "tradeProfile", profileCode);
  if (
    profile?.kind !== "tradeProfile" ||
    !tradeEffective(profile, day) ||
    profile.data.side !== command.side
  )
    tradeDocumentError("party", "party");
  return { party, profile };
}
function advanceItem(
  { actionId, day }: TradeActionContext,
  command: AdvanceCommand,
  controlAccount: string,
  gross: number,
): OpenItem {
  return {
    kind: "advance",
    itemId: actionId,
    side: command.side,
    party: command.party,
    currency: command.currency,
    accountingDate: day,
    documentDate: command.documentDate,
    dueDate: command.documentDate,
    discountDate: command.documentDate,
    discountPercent: "0",
    allowPartialDiscount: false,
    externalNo: actionId,
    controlAccount,
    dimensions: command.dimensions,
    segments: tradeSegments([{ dimensions: command.dimensions, gross }]),
    gross,
    net: gross,
    tax: 0,
    remainingGross: gross,
    remainingNet: gross,
    remainingTax: 0,
    revision: 1,
    status: "open",
  };
}

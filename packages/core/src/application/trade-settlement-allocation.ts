import {
  allocateTradeSegments,
  quantityMicros,
  roundTradeRatio,
  tradeDocumentError,
  type OpenItem,
  type TradeSegmentAllocation,
  type TradeSettlementAllocation,
  type TradeSettlementCommand,
} from "@erp/core/domain";
import type { MasterDataRepository } from "./master-data.ts";

type SettlementSelection = TradeSettlementCommand["items"][number];

/** An allocation whose control segments are always present, for the journal's control lines. */
export interface SettlementAllocation extends TradeSettlementAllocation {
  readonly segments: readonly TradeSegmentAllocation[];
}

export interface SettlementSelections {
  readonly allocations: SettlementAllocation[];
  /** The open item of each selection, in selection order. */
  readonly controls: OpenItem[];
}

export interface SettlementTotals {
  readonly gross: number;
  readonly cash: number;
  readonly discount: number;
}

/** The payment id must not already be a payment, an action or an open item; checked in that order. */
export async function assertNewSettlementPayment(
  repo: MasterDataRepository,
  command: TradeSettlementCommand,
): Promise<void> {
  if (
    (await repo.tradePayment(command.company, command.paymentId)) ||
    (await repo.tradeAction(command.company, command.paymentId)) ||
    (await repo.openItem(command.company, command.paymentId))
  )
    tradeDocumentError("paymentId", "duplicate", true);
}

/** Reads, checks and allocates each selection in order; a failing selection stops the reads. */
export async function settlementSelections(
  repo: MasterDataRepository,
  command: TradeSettlementCommand,
): Promise<SettlementSelections> {
  const allocations: SettlementAllocation[] = [];
  const controls: OpenItem[] = [];
  for (const [index, selection] of command.items.entries()) {
    const path = `items.${index}`;
    const item = await settlementItem(repo, command, selection, path, controls);
    allocations.push(settlementAllocation(command, selection, item, path));
    controls.push(item);
  }
  return { allocations, controls };
}

/** One selection's open item, after the reference, party, currency, revision, balance and date checks. */
async function settlementItem(
  repo: MasterDataRepository,
  command: TradeSettlementCommand,
  selection: SettlementSelection,
  path: string,
  controls: readonly OpenItem[],
): Promise<OpenItem> {
  const item = await repo.openItem(command.company, selection.itemId);
  if (!item) tradeDocumentError(path, "reference");
  if (item.party !== command.party || item.side !== command.side) tradeDocumentError(path, "party");
  if (item.currency !== command.currency) tradeDocumentError(path, "currency");
  if (item.revision !== selection.revision) tradeDocumentError(path, "stale", true);
  if (selection.gross > item.remainingGross || item.status !== "open")
    tradeDocumentError(path, "quantity");
  if (command.accountingDate < item.accountingDate)
    tradeDocumentError("accountingDate", "reference");
  // Accounting dates, not wall-clock acceptance times, define the dependency chain.
  if ((await repo.latestSettlementDate(command.company, item.itemId)) > command.accountingDate)
    tradeDocumentError("accountingDate", "reference");
  if (controls.length && (controls[0].kind === "invoice") !== (item.kind === "invoice"))
    tradeDocumentError(path, "reference");
  return item;
}

/** The selection's share of the open item: net and tax pro rata, the early-payment discount and segments. */
function settlementAllocation(
  command: TradeSettlementCommand,
  selection: SettlementSelection,
  item: OpenItem,
  path: string,
): SettlementAllocation {
  const gross = selection.gross;
  const net =
    gross === item.remainingGross
      ? item.remainingNet
      : roundTradeRatio(BigInt(item.remainingNet) * BigInt(gross), BigInt(item.remainingGross));
  const tax = gross - net;
  const discountAvailable =
    item.kind === "invoice" &&
    command.accountingDate >= item.documentDate &&
    command.accountingDate <= item.discountDate &&
    quantityMicros(item.discountPercent) > 0n &&
    (item.allowPartialDiscount || (item.remainingGross === item.gross && gross === item.gross));
  if (selection.takeDiscount && !discountAvailable)
    tradeDocumentError(`${path}.takeDiscount`, "reference");
  const discount = selection.takeDiscount
    ? roundTradeRatio(BigInt(net) * quantityMicros(item.discountPercent), 100_000_000n)
    : 0;
  const segments = allocateTradeSegments(item, gross);
  return {
    segments,
    itemId: item.itemId,
    revision: item.revision,
    gross,
    net,
    tax,
    discount,
    cash: gross - discount,
    discountAvailable,
    discountDate: item.discountDate,
    settledGross: item.gross - item.remainingGross + gross,
    remainingGross: item.remainingGross - gross,
    remainingNet: item.remainingNet - net,
    remainingTax: item.remainingTax - tax,
  };
}

/** Gross, cash and discount summed in that order; any total above MAX_SAFE_INTEGER is rejected. */
export function settlementTotals(
  allocations: readonly TradeSettlementAllocation[],
): SettlementTotals {
  const sum = (key: "gross" | "cash" | "discount") => {
    const value = allocations.reduce((n, a) => n + BigInt(a[key]), 0n);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) tradeDocumentError("items", "shape");
    return Number(value);
  };
  const gross = sum("gross"),
    cash = sum("cash"),
    discount = sum("discount");
  return { gross, cash, discount };
}

import {
  allocateTradeSegments,
  changeTradeSegments,
  roundTradeRatio,
  tradeDocumentError,
  type OpenItem,
} from "@erp/core/domain";

export function changed(
  item: OpenItem,
  gross: number,
  net: number,
  tax: number,
  allocations = allocateTradeSegments(item, gross),
): OpenItem {
  const remainingGross = item.remainingGross - gross;
  const remainingNet = item.remainingNet - net;
  const remainingTax = item.remainingTax - tax;
  if (
    remainingGross < 0 ||
    remainingGross > item.gross ||
    remainingNet < 0 ||
    remainingNet > item.net ||
    remainingTax < 0 ||
    remainingTax > item.tax
  )
    tradeDocumentError("gross", "quantity");
  return {
    ...item,
    remainingGross,
    remainingNet,
    remainingTax,
    segments: changeTradeSegments(item, allocations, gross < 0),
    status: remainingGross === 0 ? "settled" : "open",
    revision: item.revision + 1,
  };
}
export function consume(item: OpenItem, gross: number): OpenItem {
  if (gross > item.remainingGross || item.status !== "open")
    tradeDocumentError("gross", "quantity");
  const net =
    gross === item.remainingGross
      ? item.remainingNet
      : roundTradeRatio(BigInt(item.remainingNet) * BigInt(gross), BigInt(item.remainingGross));
  return changed(item, gross, net, gross - net);
}

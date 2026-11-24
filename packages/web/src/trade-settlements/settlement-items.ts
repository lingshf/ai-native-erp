import type { TradeSettlementCommandDto } from "@erp/core/contracts";
import type { CommandItem, OpenItem } from "./settlement-model.ts";

export function discountAvailable(
  row: OpenItem,
  command: TradeSettlementCommandDto,
  selected: CommandItem | undefined,
) {
  return (
    row.kind === "invoice" &&
    command.accountingDate >= row.documentDate &&
    command.accountingDate <= row.discountDate &&
    Number(row.discountPercent) > 0 &&
    (row.allowPartialDiscount ||
      (row.remainingGross === row.gross && (selected?.gross ?? row.remainingGross) === row.gross))
  );
}

export function eligibleForSelection(
  row: OpenItem,
  command: TradeSettlementCommandDto,
  currency: string,
  firstSelected: OpenItem | undefined,
) {
  return (
    row.side === command.side &&
    row.party === command.party &&
    row.currency === currency &&
    (!firstSelected || (firstSelected.kind === "invoice") === (row.kind === "invoice"))
  );
}

export function toggleItem(items: CommandItem[], row: OpenItem, checked: boolean) {
  return checked
    ? [
        ...items,
        {
          itemId: row.itemId,
          revision: row.revision,
          gross: row.remainingGross,
          takeDiscount: false,
        },
      ]
    : items.filter((item) => item.itemId !== row.itemId);
}

export function setItemGross(items: CommandItem[], itemId: string, value: string) {
  return items.map((item) =>
    item.itemId === itemId
      ? {
          ...item,
          gross:
            Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : item.gross,
          takeDiscount: false,
        }
      : item,
  );
}

export function setItemDiscount(items: CommandItem[], itemId: string, takeDiscount: boolean) {
  return items.map((item) => (item.itemId === itemId ? { ...item, takeDiscount } : item));
}

export function settlementTotals(items: CommandItem[], rows: OpenItem[]) {
  // 已选未结项尚未加载时余额未知：NaN 使应付/应收与剩余显示“待加载”，不按 0 推算。
  const due = items.reduce(
    (sum, item) => sum + (rows.find((row) => row.itemId === item.itemId)?.remainingGross ?? NaN),
    0,
  );
  const allocated = items.reduce((sum, item) => sum + item.gross, 0);
  return { due, allocated };
}

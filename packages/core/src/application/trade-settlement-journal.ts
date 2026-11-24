import {
  formatMinor,
  tradeDimensionKey,
  tradeDocumentError,
  type DimensionMap,
  type JournalDraft,
  type JournalInputLine,
  type OpenItem,
  type TradeAccountRole,
  type TradeConfig,
  type TradeSettlementCommand,
  type TradeSide,
} from "@erp/core/domain";
import type { JournalPreview } from "./journals.ts";
import type { SettlementSelections, SettlementTotals } from "./trade-settlement-allocation.ts";

export interface SettlementAccountUse {
  readonly code: string;
  readonly role: TradeAccountRole;
  /** The alternate role applies only when this item is a legacy opening item. */
  readonly alternate?: TradeAccountRole;
  readonly openingItem?: string;
  readonly side?: TradeSide;
  readonly path: string;
}

/** A control line's journal line index and the segment dimensions it must keep after planning. */
export interface SettlementControlLine {
  readonly index: number;
  readonly dimensions: DimensionMap;
}

export interface SettlementJournalLines {
  readonly lines: JournalInputLine[];
  readonly controlLines: SettlementControlLine[];
}

/** Accounts to re-check, in order: each item's control account, then the cash and discount accounts. */
export function settlementAccountRoleInputs(
  command: TradeSettlementCommand,
  profile: TradeConfig<"tradeProfile">,
  controls: readonly OpenItem[],
  { cash, discount }: SettlementTotals,
): SettlementAccountUse[] {
  return [
    ...controls.map((item) => ({
      code: item.controlAccount,
      role: item.kind === "advance" ? ("advanceAccount" as const) : ("controlAccount" as const),
      // D30: a legacy opening item may sit on either same-side trade account role.
      alternate:
        item.kind === "advance" ? ("controlAccount" as const) : ("advanceAccount" as const),
      openingItem: item.itemId,
      side: command.side,
      path: "items",
    })),
    ...(cash
      ? [{ code: profile.data.cashAccount, role: "cashAccount" as const, path: "party" }]
      : []),
    ...(discount
      ? [{ code: profile.data.discountAccount, role: "discountAccount" as const, path: "party" }]
      : []),
  ];
}

/**
 * Every allocated control segment in selection order, then the cash and discount lines; zero
 * amounts are skipped. `controlLines` records each control line's index for the dimension check.
 */
export function settlementJournalLines(
  command: TradeSettlementCommand,
  profile: TradeConfig<"tradeProfile">,
  { allocations, controls }: SettlementSelections,
  { cash, discount }: SettlementTotals,
  scale: number,
): SettlementJournalLines {
  const controlLines: SettlementControlLine[] = [];
  const lines: JournalInputLine[] = [];
  const ap = command.side === "AP";
  const push = (account: string, debit: boolean, amount: number, dimensions: DimensionMap) => {
    if (amount === 0) return;
    lines.push({
      account,
      debit: debit ? formatMinor(amount, scale) : "",
      credit: debit ? "" : formatMinor(amount, scale),
      dimensions,
      suspense: null,
    });
  };
  for (const [index, item] of controls.entries())
    for (const segment of allocations[index].segments) {
      controlLines.push({ index: lines.length, dimensions: segment.dimensions });
      push(
        item.controlAccount,
        item.kind === "invoice" ? ap : !ap,
        segment.gross,
        segment.dimensions,
      );
    }
  push(profile.data.cashAccount, controls[0].kind === "invoice" ? !ap : ap, cash, {});
  push(profile.data.discountAccount, !ap, discount, {});
  return { lines, controlLines };
}

export function settlementDraft(
  command: TradeSettlementCommand,
  lines: JournalInputLine[],
): JournalDraft {
  return {
    id: command.paymentId,
    revision: 0,
    sourceRef: `TRADE-PAY:${command.paymentId}`,
    date: command.accountingDate,
    documentDate: command.documentDate,
    taxDate: command.taxDate,
    memo: `${command.side} book settlement ${command.party}`,
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines,
  };
}

/** The planned control lines must keep their segment dimensions; the path carries the line index. */
export function checkSettlementDimensions(
  journal: JournalPreview,
  controlLines: readonly SettlementControlLine[],
): void {
  for (const { index, dimensions } of controlLines) {
    if (
      tradeDimensionKey(journal.plan.journals[0].lines[index].dimensions) !==
      tradeDimensionKey(dimensions)
    )
      tradeDocumentError(`items.${index}.dimensions`, "account");
  }
}

import type {
  openItemPageSchema,
  tradeSettlementConfirmSchema,
  TradeSettlementCommandDto,
} from "@erp/core/contracts";
import type { label } from "../ui/index.ts";

export type Key = Exclude<Parameters<typeof label>[1], "shell.httpError">;
export type T = (key: Key) => string;
export type Money = (minor: number) => string;
export type Guard = { busy: boolean; unsaved: boolean };

export type Pending = ReturnType<typeof tradeSettlementConfirmSchema.parse>;
export type Saved = { command: TradeSettlementCommandDto; pending: Pending | null };
export type OpenItem = ReturnType<typeof openItemPageSchema.parse>["items"][number];
export type CommandItem = TradeSettlementCommandDto["items"][number];

// Above this many loaded open items the allocation table renders only the rows in view.
export const VIRTUALIZE_AFTER_ROWS = 100;
// One settlement selects at most this many open items.
export const MAX_SELECTED_ITEMS = 100;
export const ROW_HEIGHT_PX = 48;
export const OVERSCAN_ROWS = 5;
export const ALLOCATION_COLUMN_COUNT = 6;
// aria-rowindex is 1-based and the header row is row 1, so data row 0 is row 2.
export const ARIA_ROW_INDEX_OFFSET = 2;

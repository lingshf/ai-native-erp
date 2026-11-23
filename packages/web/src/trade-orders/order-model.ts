import type { tradeOrderSchema } from "@erp/core/contracts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
export type T = (key: TradeOrderKey, params?: Readonly<Record<string, string | number>>) => string;
export type Order = ReturnType<typeof tradeOrderSchema.parse>;
export type Guard = { busy: boolean; unsaved: boolean };
export type Opened = { orderId: string; focus: boolean };
export const idleGuard: Guard = { busy: false, unsaved: false };

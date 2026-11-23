import type { Order } from "./order-model.ts";

export const amountKeys = ["net", "tax", "gross"] as const;
export type AmountKey = (typeof amountKeys)[number];

// Totals only add up the server's per-line amounts; no tax is calculated here (PG-01).
export const orderTotal = (order: Order, key: AmountKey) =>
  order.lines.reduce((sum, line) => sum + line[key], 0);

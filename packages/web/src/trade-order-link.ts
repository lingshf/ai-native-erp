// TORD-07: the order list filters live in the address (same rules as TINV-07, D370 1–7). This
// module owns the keys, reads the applied filters and builds the next address; the page only calls it.
import {
  type tradeOrderInvoicingStatusSchema,
  tradeOrderListQuerySchema,
} from "@erp/core/contracts";

type Invoicing = (typeof tradeOrderInvoicingStatusSchema.options)[number];
export type OrderFilter = {
  party: string;
  side: "" | "AP" | "AR";
  invoicing: "" | Invoicing;
  from: string;
  to: string;
};
export const noOrderFilter: OrderFilter = { party: "", side: "", invoicing: "", from: "", to: "" };
export const orderFilterKeys = ["party", "side", "invoicing", "from", "to"] as const;
// Every write sets these once (dropping duplicates) or deletes them; other keys stay as they are.
const managedKeys = ["company", ...orderFilterKeys, "order"] as const;
export type OrderLinkChange = Partial<Record<(typeof managedKeys)[number], string | null>>;

/**
 * The applied filters in the address. An empty value means "not given"; if any given value is one
 * the list API would reject (same schema), the whole set is ignored and `broken` is true.
 */
export function readOrderFilter(params: URLSearchParams, company: string) {
  const given = Object.fromEntries(
    orderFilterKeys.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])),
  );
  return tradeOrderListQuerySchema.safeParse({ company, ...given }).success
    ? { applied: { ...noOrderFilter, ...given } as OrderFilter, broken: false }
    : { applied: noOrderFilter, broken: true };
}

/** The address change that applies `filter`: unset filters are deleted. */
export function orderFilterChange(filter: OrderFilter): OrderLinkChange {
  return Object.fromEntries(orderFilterKeys.map((key) => [key, filter[key] || null]));
}

/** `current` with `change` applied; untouched managed keys keep their first value. */
export function nextOrderParams(current: URLSearchParams, change: OrderLinkChange) {
  const next = new URLSearchParams(current);
  for (const key of managedKeys) {
    const value = key in change ? change[key] : current.get(key);
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

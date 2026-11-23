import { tradeInvoiceListQuerySchema } from "@erp/core/contracts";

export type InvoiceFilter = { party: string; side: "" | "AP" | "AR"; from: string; to: string };
export const noInvoiceFilter: InvoiceFilter = { party: "", side: "", from: "", to: "" };
export const invoiceFilterKeys = ["party", "side", "from", "to"] as const;
// TINV-07: the address parameters this page reads besides `company` and `fromOrder`.
export const linkParamKeys = ["invoice", ...invoiceFilterKeys] as const;
export const managedKeys = ["company", ...linkParamKeys] as const;
export type LinkChange = Partial<Record<(typeof managedKeys)[number], string | null>>;
// The router's search string as it is now (HashRouter: after the `?` in the hash).
export function addressParams() {
  const hash = window.location.hash;
  const at = hash.indexOf("?");
  return new URLSearchParams(at < 0 ? "" : hash.slice(at + 1));
}
// The applied filters come from the address. Empty values mean "not given"; if any given value is
// one the list API would reject (same schema), the whole set is ignored and the page says so.
export function linkFilter(params: URLSearchParams, company: string) {
  const filter = { ...noInvoiceFilter };
  for (const key of invoiceFilterKeys) {
    const value = params.get(key) ?? "";
    if (value) (filter as Record<string, string>)[key] = value;
  }
  const query = Object.fromEntries(
    invoiceFilterKeys.flatMap((key) => (filter[key] ? [[key, filter[key]]] : [])),
  );
  return tradeInvoiceListQuerySchema.safeParse({ company, ...query }).success
    ? { applied: filter, broken: false }
    : { applied: noInvoiceFilter, broken: true };
}
export type InvoiceFilterState = {
  key: string;
  draft: InvoiceFilter;
  invalid: "party" | "range" | null;
};

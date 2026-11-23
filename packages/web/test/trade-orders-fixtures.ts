// Shared fixtures of trade-orders.test.tsx, moved verbatim (D425) to keep that hotspot file small.
import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { TradeDto } from "@erp/core/contracts";
import { orderLabel, type TradeOrderKey } from "../src/ui/trade-order-labels.ts";

const company = {
  code: "DEFAULT",
  name: "Company",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const window2026 = { from: "2026-01-01", to: "2026-12-31" };
const party: TradeDto = {
  kind: "tradeParty",
  code: "VENDOR",
  active: true,
  revision: 1,
  data: {
    ...window2026,
    name: "Fictional Vendor",
    role: "vendor",
    apProfile: "PAY",
    arProfile: null,
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  },
};
const product: TradeDto = {
  kind: "tradeProduct",
  code: "EXPENSE",
  active: true,
  revision: 1,
  data: {
    ...window2026,
    name: "Fictional Expense",
    type: "expense",
    expenseAccount: "5000",
    revenueAccount: null,
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  },
};
const tax: TradeDto = {
  kind: "taxCode",
  code: "VAT",
  active: true,
  revision: 1,
  data: {
    ...window2026,
    name: "VAT 13%",
    mode: "ordinary",
    rates: [{ id: "R13", ...window2026, ratePercent: "13" }],
    deductiblePercent: "100",
    inputAccount: "1400",
    outputAccount: "2200",
  },
};
const savedOrder = {
  orderId: "PO-1",
  side: "AP",
  party: "VENDOR",
  currency: "CNY",
  orderDate: "2026-04-01",
  priceIncludesTax: false,
  rounding: "line",
  commandHash: "b".repeat(64),
  recordedAt: "2026-04-01T08:00:00.000Z",
  lines: [
    {
      lineId: "L1",
      product: "EXPENSE",
      taxCode: "VAT",
      quantity: "10",
      unitPrice: "10",
      discountPercent: "0",
      taxableCharge: "0",
      lineNo: 1,
      net: 10000,
      tax: 1300,
      gross: 11300,
    },
  ],
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (
  status: number,
  code: string,
  fieldErrors: { path: string; messageKey: string }[],
) =>
  response(
    {
      code,
      messageKey: fieldErrors[0]?.messageKey ?? "api.error.internal",
      params: {},
      fieldErrors,
      requestId: "00000000-0000-4000-8000-000000000001",
      retryable: false,
    },
    status,
  );
const t = (key: TradeOrderKey) => orderLabel("zh", key);
const field = (key: TradeOrderKey, lineId?: string) =>
  screen.getByLabelText<HTMLInputElement>(lineId ? `${t(key)} ${lineId}` : t(key));

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const emptyList: Handler = () => response({ items: [], nextCursor: null });
const invoicingOf = (order: typeof savedOrder, quantities: readonly string[]) => ({
  order,
  invoiced: order.lines.map((line, index) => ({
    lineId: line.lineId,
    invoicedQuantity: quantities[index] ?? "0",
  })),
});
// TINV-02: the order detail reads GET /trade/orders/:orderId/invoicing (TINV-01 scope 4 shape).
const noneInvoiced: Handler = (url) => {
  const orderId = decodeURIComponent(/\/trade\/orders\/([^/?]+)\/invoicing/u.exec(url)?.[1] ?? "");
  return response(invoicingOf({ ...savedOrder, orderId }, []));
};
const oneCompany: Handler = () => response({ items: [company], nextCursor: null });
function stubApi(
  onOrder: Handler,
  onList: Handler = emptyList,
  onInvoicing = noneInvoiced,
  onCompanies = oneCompany,
) {
  const calls: string[] = [];
  const posts: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
    const url = String(path);
    calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
    if (url.startsWith("/api/v1/companies")) return onCompanies(url, init);
    if (url.startsWith("/api/v1/trade/tradeParty?"))
      return response({ items: [party], nextCursor: null });
    if (url.startsWith("/api/v1/trade/tradeProduct?"))
      return response({ items: [product], nextCursor: null });
    if (url.startsWith("/api/v1/trade/taxCode?"))
      return response({ items: [tax], nextCursor: null });
    if (url.startsWith("/api/v1/trade/orders?") && (init?.method ?? "GET") === "GET")
      return onList(url, init);
    if (/^\/api\/v1\/trade\/orders\/[^/?]+\/invoicing\?/u.test(url)) return onInvoicing(url, init);
    if (url.startsWith("/api/v1/trade/orders")) {
      if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
      return onOrder(url, init);
    }
    return response({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, posts };
}
async function fillOrder() {
  await screen.findByRole("form", { name: t("tord.entry") });
  fireEvent.change(field("tord.orderId"), { target: { value: "PO-1" } });
  fireEvent.change(field("tord.party"), { target: { value: "VENDOR" } });
  fireEvent.change(field("tord.orderDate"), { target: { value: "2026-04-01" } });
  fireEvent.change(field("tord.product", "L1"), { target: { value: "EXPENSE" } });
  fireEvent.change(field("tord.taxCode", "L1"), { target: { value: "VAT" } });
  fireEvent.change(field("tord.quantity", "L1"), { target: { value: "10" } });
  fireEvent.change(field("tord.unitPrice", "L1"), { target: { value: "10" } });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: t("tord.save") }));

// Address writes are replaces with a URL; the router's own state-only replace is not one.
const spyWrites = () => {
  const replace = vi.spyOn(window.history, "replaceState");
  const push = vi.spyOn(window.history, "pushState");
  const urls = (spy: typeof replace) => spy.mock.calls.filter(([, , url]) => url).length;
  return () => [urls(replace), urls(push)];
};

export type { Handler };
export {
  company,
  window2026,
  party,
  product,
  tax,
  savedOrder,
  response,
  failure,
  t,
  field,
  emptyList,
  invoicingOf,
  noneInvoiced,
  oneCompany,
  stubApi,
  fillOrder,
  save,
  spyWrites,
};

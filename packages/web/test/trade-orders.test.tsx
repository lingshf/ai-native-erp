import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tradeOrderCommandSchema, type TradeDto } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { formatMinor } from "../src/reports-data.ts";
import { label, preferenceStorageKey } from "../src/ui/index.ts";
import {
  orderLabel,
  tradeOrderEn,
  tradeOrderZh,
  type TradeOrderKey,
} from "../src/ui/trade-order-labels.ts";

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

beforeEach(() => window.history.replaceState(null, "", "/#/trade-orders"));
afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("trade orders", () => {
  it("keeps zh and en labels in step", () => {
    expect(Object.keys(tradeOrderZh).sort()).toEqual(Object.keys(tradeOrderEn).sort());
  });

  it("is reachable from the shell navigation", async () => {
    window.history.replaceState(null, "", "/#/");
    stubApi(() => response({}, 404));
    render(<App />);
    const link = screen.getByRole("link", { name: label("zh", "shell.tradeOrders") });
    expect(link.getAttribute("href")).toBe("#/trade-orders");
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: t("tord.title") })).toBeTruthy();
  });

  it("shows no amounts before save, posts once and then shows the server's amounts", async () => {
    const { calls, posts } = stubApi(() => response(savedOrder, 201));
    render(<App />);
    await fillOrder();
    expect(document.querySelector(".tord-amounts")).toBeNull();
    expect(screen.queryByText(formatMinor(11300, "zh", 2))).toBeNull();
    expect(screen.getByText(t("tord.amountsAfterSave"))).toBeTruthy();
    save();
    const notice = await screen.findByText(orderLabel("zh", "tord.saved", { orderId: "PO-1" }));
    expect(document.activeElement).toBe(notice.closest(".tord-saved"));
    expect(
      within(notice.closest(".tord-saved") as HTMLElement)
        .getByRole("link", { name: t("tord.toInvoices") })
        .getAttribute("href"),
    ).toBe("#/trade-invoices");
    expect(posts).toHaveLength(1);
    expect(tradeOrderCommandSchema.parse(posts[0])).toEqual({
      company: "DEFAULT",
      orderId: "PO-1",
      side: "AP",
      party: "VENDOR",
      currency: "CNY",
      orderDate: "2026-04-01",
      priceIncludesTax: false,
      rounding: "line",
      lines: [
        {
          lineId: "L1",
          product: "EXPENSE",
          taxCode: "VAT",
          quantity: "10",
          unitPrice: "10",
          discountPercent: "0",
          taxableCharge: "0",
        },
      ],
    });
    const total = document.querySelector<HTMLElement>(".tord-amounts .tord-total");
    expect(total?.textContent).toContain(formatMinor(10000, "zh", 2));
    expect(total?.textContent).toContain(formatMinor(1300, "zh", 2));
    expect(total?.textContent).toContain(formatMinor(11300, "zh", 2));
    expect(field("tord.orderId").value).toBe("");
    expect(calls.filter((call) => call === "GET /api/v1/companies")).toHaveLength(1);
    for (const kind of ["tradeParty", "tradeProduct", "taxCode"])
      expect(calls.filter((call) => call === `GET /api/v1/trade/${kind}`)).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith("POST"))).toHaveLength(1);
  });

  it("marks server field errors on the order number and the line tax code", async () => {
    let attempt = 0;
    const { posts } = stubApi(() => {
      attempt += 1;
      return attempt === 1
        ? failure(409, "CONFLICT", [
            { path: "orderId", messageKey: "api.error.tradeDocument.duplicate" },
          ])
        : failure(400, "INVALID_REQUEST", [
            { path: "lines.0.taxCode", messageKey: "api.error.trade.reference" },
            { path: "lines.1.quantity", messageKey: "api.error.trade.quantity" },
          ]);
    });
    render(<App />);
    await fillOrder();
    save();
    expect(await screen.findByText(t("tord.issue.duplicate"))).toBeTruthy();
    expect(field("tord.orderId").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain(t("tord.invalid"));
    fireEvent.change(field("tord.orderId"), { target: { value: "PO-2" } });
    fireEvent.click(screen.getByRole("button", { name: t("tord.addLine") }));
    fireEvent.change(field("tord.product", "L2"), { target: { value: "EXPENSE" } });
    fireEvent.change(field("tord.taxCode", "L2"), { target: { value: "VAT" } });
    fireEvent.change(field("tord.quantity", "L2"), { target: { value: "1" } });
    fireEvent.change(field("tord.unitPrice", "L2"), { target: { value: "5" } });
    save();
    await waitFor(() =>
      expect(field("tord.taxCode", "L1").getAttribute("aria-invalid")).toBe("true"),
    );
    const describedBy = field("tord.taxCode", "L1").getAttribute("aria-describedby");
    expect(document.getElementById(String(describedBy))?.textContent).toBe(
      t("tord.issue.reference"),
    );
    expect(field("tord.orderId").getAttribute("aria-invalid")).toBeNull();
    expect(field("tord.quantity", "L2").getAttribute("aria-invalid")).toBe("true");
    // Removing L1 shifts L2 to index 0: L1's error must leave with it and L2 keeps its own.
    fireEvent.click(screen.getByRole("button", { name: `${t("tord.removeLine")} L1` }));
    expect(screen.queryByLabelText(`${t("tord.taxCode")} L1`)).toBeNull();
    expect(field("tord.taxCode", "L2").getAttribute("aria-invalid")).toBeNull();
    expect(field("tord.quantity", "L2").getAttribute("aria-invalid")).toBe("true");
    const summary = screen.getByRole("alert").textContent ?? "";
    expect(summary).not.toContain(`${t("tord.taxCode")} L`);
    expect(summary).toContain(`${t("tord.quantity")} L2: ${t("tord.issue.quantity")}`);
    expect(posts).toHaveLength(2);
    expect(document.querySelector(".tord-amounts")).toBeNull();
  });

  it("rejects malformed codes locally without a request and reports an uncertain save", async () => {
    const { posts } = stubApi(() => {
      throw new TypeError("network down");
    });
    render(<App />);
    await fillOrder();
    fireEvent.change(field("tord.orderId"), { target: { value: "po 1" } });
    save();
    expect(await screen.findByText(t("tord.issue.shape"))).toBeTruthy();
    expect(field("tord.orderId").getAttribute("aria-invalid")).toBe("true");
    expect(posts).toHaveLength(0);
    fireEvent.change(field("tord.orderId"), { target: { value: "PO-1" } });
    save();
    expect(await screen.findByText(t("tord.uncertain"))).toBeTruthy();
    expect(posts).toHaveLength(1);
  });

  it("asks before leaving an unsaved draft", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    stubApi(() => response({}, 404));
    render(<App />);
    await screen.findByRole("form", { name: t("tord.entry") });
    const invoices = screen.getByRole("link", { name: label("zh", "tinv.title") });
    fireEvent.click(invoices);
    expect(confirm).not.toHaveBeenCalled();
    // Navigate back through the router and wait for each route to settle; a raw replaceState
    // would race the router's pending navigation.
    await waitFor(() => expect(screen.queryByRole("form", { name: t("tord.entry") })).toBeNull());
    fireEvent.click(screen.getByRole("link", { name: label("zh", "shell.tradeOrders") }));
    await screen.findByRole("form", { name: t("tord.entry") });
    fireEvent.change(field("tord.orderId"), { target: { value: "PO-1" } });
    fireEvent.click(screen.getByRole("link", { name: label("zh", "tinv.title") }));
    expect(confirm).toHaveBeenCalledWith(t("tord.leaveConfirm"));
    expect(window.location.hash).toBe("#/trade-orders");
    expect(field("tord.orderId").value).toBe("PO-1");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: label("zh", "tinv.title") }));
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices"));
  });

  it("shows the teaching note only when teaching is on, in the chosen language", async () => {
    stubApi(() => response({}, 404));
    const first = render(<App />);
    await screen.findByRole("form", { name: t("tord.entry") });
    expect(screen.queryByText(t("tord.teaching"))).toBeNull();
    first.unmount();
    window.localStorage.setItem(
      preferenceStorageKey,
      JSON.stringify({ language: "en", theme: "green", teaching: true }),
    );
    render(<App />);
    expect(await screen.findByText(orderLabel("en", "tord.teaching"))).toBeTruthy();
    expect(await screen.findByRole("form", { name: orderLabel("en", "tord.entry") })).toBeTruthy();
  });

  it("looks up a saved order read-only and reports an unknown number", async () => {
    stubApi((url) =>
      url.startsWith("/api/v1/trade/orders/PO-1?company=DEFAULT")
        ? response(savedOrder)
        : failure(404, "NOT_FOUND", []),
    );
    render(<App />);
    const lookup = await screen.findByLabelText<HTMLInputElement>(t("tord.lookupId"));
    fireEvent.change(lookup, { target: { value: "PO-9" } });
    fireEvent.click(screen.getByRole("button", { name: t("tord.lookupButton") }));
    expect(await screen.findByText(t("tord.notFound"))).toBeTruthy();
    fireEvent.change(lookup, { target: { value: "PO-1" } });
    fireEvent.click(screen.getByRole("button", { name: t("tord.lookupButton") }));
    const result = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".tord-lookup-result");
      if (!found) throw new Error("no result");
      return found;
    });
    expect(result.querySelector(".tord-total")?.textContent).toContain(formatMinor(11300, "zh", 2));
    expect(result.querySelector("input")).toBeNull();
  });

  const summary = (
    orderId: string,
    gross: number,
    lineCount = 1,
    invoicing: "none" | "partial" | "full" = "none",
  ) => ({
    orderId,
    side: "AP",
    party: "VENDOR",
    currency: "CNY",
    orderDate: "2026-04-01",
    priceIncludesTax: false,
    rounding: "line",
    recordedAt: "2026-04-01T08:00:00.000Z",
    lineCount,
    net: gross,
    tax: 0,
    gross,
    invoicing,
  });
  const listTable = () => screen.findByRole("table", { name: t("tord.list") });

  it("lists orders page by page and opens a listed order by keyboard through the lookup", async () => {
    const lists: string[] = [];
    const { calls } = stubApi(
      (url) =>
        url.startsWith("/api/v1/trade/orders/PO-1?company=DEFAULT")
          ? response(savedOrder)
          : failure(404, "NOT_FOUND", []),
      (url) => {
        lists.push(url);
        return url.includes("cursor=")
          ? response({ items: [summary("PO-3", 500)], nextCursor: null })
          : response({
              items: [summary("PO-1", 11300), summary("PO-2", 2000, 3)],
              nextCursor: "PO-2",
            });
      },
    );
    render(<App />);
    const table = await listTable();
    const rows = () => within(table).getAllByRole("row").slice(1);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(
      within(rows()[1] as HTMLElement)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "PO-2",
      label("zh", "trade.AP"),
      "VENDOR",
      "2026-04-01",
      "CNY",
      "3",
      formatMinor(2000, "zh", 2),
      `!${t("tord.invoicing.none")}`,
    ]);
    const gross = within(rows()[0] as HTMLElement).getAllByRole("cell")[6] as HTMLElement;
    expect(gross.className).toBe("num");
    expect(lists[0]).toBe("/api/v1/trade/orders?company=DEFAULT&limit=100");

    const more = screen.getByRole("button", { name: label("zh", "master.loadMore") });
    // Native, enabled <button>s are in the Tab order and fire click on Enter; jsdom cannot press
    // keys, so real Tab / Enter is checked in Chrome (PR evidence).
    expect([more.tagName, more.getAttribute("type"), more.tabIndex]).toEqual([
      "BUTTON",
      "button",
      0,
    ]);
    more.focus();
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(lists[1]).toBe("/api/v1/trade/orders?company=DEFAULT&limit=100&cursor=PO-2");
    expect(screen.queryByRole("button", { name: label("zh", "master.loadMore") })).toBeNull();

    const open = within(table).getByRole("button", { name: "PO-1" });
    expect([open.tagName, open.getAttribute("type"), open.tabIndex]).toEqual([
      "BUTTON",
      "button",
      0,
    ]);
    open.focus();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    const result = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".tord-lookup-result");
      if (!found) throw new Error("no result");
      return found;
    });
    expect(document.activeElement).toBe(result);
    expect(screen.getByLabelText<HTMLInputElement>(t("tord.lookupId")).value).toBe("PO-1");
    expect(result.querySelector(".tord-total")?.textContent).toContain(formatMinor(11300, "zh", 2));
    expect(calls.filter((call) => call === "GET /api/v1/trade/orders/PO-1")).toHaveLength(1);
  });

  it.each([
    ["the earlier order answers first", ["PO-1", "PO-2"]],
    ["the earlier order answers last", ["PO-2", "PO-1"]],
  ] as const)("keeps the later list choice when %s", async (_case, answerOrder) => {
    const pending = new Map<string, () => void>();
    stubApi(
      (url) =>
        new Promise<Response>((resolve) => {
          const id = url.includes("/PO-2?") ? "PO-2" : "PO-1";
          pending.set(id, () => resolve(response({ ...savedOrder, orderId: id })));
        }),
      () => response({ items: [summary("PO-1", 11300), summary("PO-2", 11300)], nextCursor: null }),
    );
    render(<App />);
    const table = await listTable();
    fireEvent.click(await within(table).findByRole("button", { name: "PO-1" }));
    await waitFor(() => expect(pending.has("PO-1")).toBe(true));
    fireEvent.click(within(table).getByRole("button", { name: "PO-2" }));
    await waitFor(() => expect(pending.has("PO-2")).toBe(true));
    const input = screen.getByLabelText<HTMLInputElement>(t("tord.lookupId"));
    const shown = () => document.querySelector(".tord-lookup-result .badge")?.textContent ?? null;

    pending.get(answerOrder[0])?.();
    await act(async () => {});
    expect(input.value).toBe("PO-2");
    if (answerOrder[0] === "PO-1") expect(shown()).toBeNull();
    pending.get(answerOrder[1])?.();
    await act(async () => {});
    await waitFor(() => expect(shown()).toMatch(/PO-2$/));
    expect(input.value).toBe("PO-2");
    expect(document.activeElement?.className).toBe("tord-lookup-result");
    expect(document.querySelector("#tord-lookup-body [role=status]")).toBeNull();
  });

  it("opens a listed order even when the lookup section is collapsed", async () => {
    stubApi(
      () => response(savedOrder),
      () => response({ items: [summary("PO-1", 11300)], nextCursor: null }),
    );
    render(<App />);
    const table = await listTable();
    const toggle = await screen.findByRole("button", { name: t("tord.lookup") });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(await within(table).findByRole("button", { name: "PO-1" }));
    await waitFor(() => expect(document.activeElement?.className).toBe("tord-lookup-result"));
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows empty and error states and refreshes the first page after a save", async () => {
    let fail = true;
    let saved = false;
    const lists: string[] = [];
    stubApi(
      () => {
        saved = true;
        return response(savedOrder, 201);
      },
      (url) => {
        lists.push(url);
        if (fail) return failure(500, "INTERNAL", []);
        return response({ items: saved ? [summary("PO-1", 11300)] : [], nextCursor: null });
      },
    );
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(label("zh", "master.error"));
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: label("zh", "master.retry") }));
    expect(await screen.findByText(t("tord.listEmpty"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: label("zh", "master.loadMore") })).toBeNull();
    const before = lists.length;
    await fillOrder();
    save();
    const table = await listTable();
    expect(await within(table).findByRole("button", { name: "PO-1" })).toBeTruthy();
    expect(lists.slice(before)).toEqual(["/api/v1/trade/orders?company=DEFAULT&limit=100"]);
    expect(screen.queryByText(t("tord.listEmpty"))).toBeNull();
  });

  // TORD-05: list filters.
  const base = "/api/v1/trade/orders?company=DEFAULT&limit=100";
  const filterForm = () => screen.findByRole("form", { name: t("tord.filter") });
  const filterField = (key: TradeOrderKey) => screen.getByLabelText<HTMLInputElement>(t(key));
  const setFilters = (values: Partial<Record<"party" | "side" | "from" | "to", string>>) => {
    const keys = {
      party: "tord.filterParty",
      side: "tord.filterSide",
      from: "tord.filterFrom",
      to: "tord.filterTo",
    } as const;
    for (const [name, value] of Object.entries(values))
      fireEvent.change(filterField(keys[name as keyof typeof keys]), { target: { value } });
  };
  const apply = () => fireEvent.click(screen.getByRole("button", { name: t("tord.filterApply") }));

  it("applies filters from the first page, keeps them for load more, applies on Enter and clears", async () => {
    const lists: string[] = [];
    stubApi(
      () => response({}, 404),
      (url) => {
        lists.push(url);
        if (url.includes("side=AR")) return response({ items: [], nextCursor: null });
        if (url.includes("party=VENDOR"))
          return url.includes("cursor=")
            ? response({ items: [summary("PO-3", 500)], nextCursor: null })
            : response({ items: [summary("PO-1", 11300)], nextCursor: "PO-1" });
        return response({
          items: [summary("PO-1", 11300), summary("PO-2", 2000)],
          nextCursor: null,
        });
      },
    );
    render(<App />);
    const table = await listTable();
    const rows = () => within(table).getAllByRole("row").slice(1);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(lists).toEqual([base]);

    setFilters({ party: " VENDOR ", side: "AP", from: "2026-01-01", to: "2026-06-30" });
    expect(lists).toHaveLength(1);
    apply();
    const filtered = `${base}&party=VENDOR&side=AP&from=2026-01-01&to=2026-06-30`;
    await waitFor(() => expect(lists).toEqual([base, filtered]));
    const narrowed = await listTable();
    await waitFor(() => expect(within(narrowed).getAllByRole("row")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() =>
      expect(lists.at(-1)).toBe(
        `${base}&cursor=PO-1&party=VENDOR&side=AP&from=2026-01-01&to=2026-06-30`,
      ),
    );
    await waitFor(() => expect(within(narrowed).getAllByRole("row")).toHaveLength(3));

    // Applying unchanged filters reloads from the first page.
    apply();
    await waitFor(() => expect(lists.at(-1)).toBe(filtered));
    const reloaded = await listTable();
    await waitFor(() => expect(within(reloaded).getAllByRole("row")).toHaveLength(2));

    // Enter in a filter input submits the form (implicit submission; real Enter is checked in Chrome).
    expect(screen.getByRole("button", { name: t("tord.filterApply") }).getAttribute("type")).toBe(
      "submit",
    );
    setFilters({ party: "", side: "AR", from: "", to: "" });
    fireEvent.submit(await filterForm());
    await waitFor(() => expect(lists.at(-1)).toBe(`${base}&side=AR`));
    expect(await screen.findByText(t("tord.listNoMatch"))).toBeTruthy();
    expect(screen.queryByText(t("tord.listEmpty"))).toBeNull();

    const count = lists.length;
    fireEvent.click(screen.getByRole("button", { name: t("tord.filterClear") }));
    await waitFor(() => expect(lists.length).toBe(count + 1));
    expect(lists.at(-1)).toBe(base);
    expect(
      ["tord.filterParty", "tord.filterSide", "tord.filterFrom", "tord.filterTo"].map(
        (key) => filterField(key as TradeOrderKey).value,
      ),
    ).toEqual(["", "", "", ""]);
    const cleared = await listTable();
    await waitFor(() => expect(within(cleared).getAllByRole("row")).toHaveLength(3));
    expect(screen.queryByText(t("tord.listNoMatch"))).toBeNull();
  });

  it("rejects an inverted date range and a malformed partner code without a request", async () => {
    const lists: string[] = [];
    stubApi(
      () => response({}, 404),
      (url) => {
        lists.push(url);
        return response({ items: [], nextCursor: null });
      },
    );
    render(<App />);
    expect(await screen.findByText(t("tord.listEmpty"))).toBeTruthy();
    setFilters({ from: "2026-06-30", to: "2026-01-01" });
    apply();
    const error = await screen.findByText(t("tord.filterRange"));
    expect(error.id).toBe("tord-filter-range-error");
    for (const key of ["tord.filterFrom", "tord.filterTo"] as const) {
      expect(filterField(key).getAttribute("aria-describedby")).toBe(error.id);
      expect(filterField(key).getAttribute("aria-invalid")).toBe("true");
    }
    fireEvent.submit(await filterForm());
    expect(lists).toEqual([base]);
    // Equal dates are a valid one-day range; editing removes the error.
    setFilters({ to: "2026-06-30" });
    expect(screen.queryByText(t("tord.filterRange"))).toBeNull();
    expect(filterField("tord.filterFrom").getAttribute("aria-describedby")).toBeNull();

    setFilters({ party: "vendor" });
    apply();
    const shape = await screen.findByText(t("tord.issue.shape"));
    expect(filterField("tord.filterParty").getAttribute("aria-describedby")).toBe(shape.id);
    expect(lists).toEqual([base]);

    setFilters({ party: "VENDOR" });
    apply();
    await waitFor(() =>
      expect(lists).toEqual([base, `${base}&party=VENDOR&from=2026-06-30&to=2026-06-30`]),
    );
    expect(await screen.findByText(t("tord.listNoMatch"))).toBeTruthy();
  });

  it("refreshes the first page with the current filters after a save", async () => {
    let saved = false;
    const lists: string[] = [];
    stubApi(
      () => {
        saved = true;
        return response(savedOrder, 201);
      },
      (url) => {
        lists.push(url);
        return response({ items: saved ? [summary("PO-1", 11300)] : [], nextCursor: null });
      },
    );
    render(<App />);
    await filterForm();
    setFilters({ party: "VENDOR" });
    apply();
    expect(await screen.findByText(t("tord.listNoMatch"))).toBeTruthy();
    const before = lists.length;
    await fillOrder();
    save();
    const table = await listTable();
    expect(await within(table).findByRole("button", { name: "PO-1" })).toBeTruthy();
    expect(lists.slice(before)).toEqual([`${base}&party=VENDOR`]);
  });

  it("keeps the filter controls in keyboard order before the list", async () => {
    stubApi(
      () => response({}, 404),
      () => response({ items: [summary("PO-1", 11300)], nextCursor: null }),
    );
    render(<App />);
    const table = await listTable();
    await within(table).findByRole("button", { name: "PO-1" });
    const body = document.getElementById("tord-list-body") as HTMLElement;
    const focusable = [...body.querySelectorAll<HTMLElement>("input, select, button")];
    expect(focusable.every((element) => element.tabIndex === 0)).toBe(true);
    expect(focusable.map((element) => element.id || element.textContent)).toEqual([
      "tord-filter-party",
      "tord-filter-side",
      "tord-filter-from",
      "tord-filter-to",
      t("tord.filterApply"),
      t("tord.filterClear"),
      "PO-1",
    ]);
    expect(
      [...(filterField("tord.filterSide") as unknown as HTMLSelectElement).options].map(
        (option) => [option.value, option.textContent],
      ),
    ).toEqual([
      ["", t("tord.filterAll")],
      ["AP", t("tord.filterAP")],
      ["AR", t("tord.filterAR")],
    ]);
  });

  // TORD-04: preview before save.
  const previewed = {
    lines: [{ lineId: "L1", lineNo: 1, net: 9000, tax: 1170, gross: 10170 }],
    net: 9000,
    tax: 1170,
    gross: 10170,
  };
  const previewButton = () => screen.getByRole("button", { name: t("tord.preview") });
  const previewRegion = () =>
    screen.queryByRole("region", { name: new RegExp(t("tord.previewTitle"), "u") });
  const routed =
    (onPreview: Handler, onSave: Handler = () => response(savedOrder, 201)): Handler =>
    (url, init) =>
      url === "/api/v1/trade/orders/preview" ? onPreview(url, init) : onSave(url, init);

  it("previews server amounts by keyboard, marks them as a preview and saves the saved amounts", async () => {
    const { calls, posts } = stubApi(routed(() => response(previewed)));
    render(<App />);
    await fillOrder();
    const form = screen.getByRole("form", { name: t("tord.entry") });
    // jsdom has no native Tab: the first tabbable control of the form is Preview, before Save.
    const tabbable = [
      ...form.querySelectorAll<HTMLElement>("a[href], button, input, select, [tabindex]"),
    ].filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled);
    expect(tabbable.slice(0, 2).map((element) => element.textContent)).toEqual([
      t("tord.preview"),
      t("tord.save"),
    ]);
    // type="button": Enter on it activates Preview only and never submits (saves) the form.
    expect(previewButton().getAttribute("type")).toBe("button");
    previewButton().focus();
    fireEvent.click(document.activeElement as HTMLElement);
    const region = await waitFor(() => {
      const found = previewRegion();
      if (!found) throw new Error("no preview yet");
      return found;
    });
    expect(document.activeElement).toBe(region);
    expect(within(region).getByText(t("tord.previewNote"))).toBeTruthy();
    expect(region.querySelector(".badge")?.textContent).toContain(t("tord.previewBadge"));
    expect(region.textContent).toContain(formatMinor(10170, "zh", 2));
    expect(document.querySelector(".tord-status .badge")?.textContent).toContain(
      t("tord.previewBadge"),
    );
    const lines = screen.getByRole("table", { name: t("tord.lines") });
    const row = within(lines).getByText("L1").closest("tr") as HTMLElement;
    for (const value of [9000, 1170, 10170])
      expect(row.textContent).toContain(formatMinor(value, "zh", 2));
    expect(lines.querySelector(".tord-total")?.textContent).toContain(formatMinor(10170, "zh", 2));
    expect(document.querySelector(".tord-amounts")).toBeNull();
    expect(screen.queryByText(t("tord.amountsAfterSave"))).toBeNull();
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([
      "POST /api/v1/trade/orders/preview",
    ]);
    expect(tradeOrderCommandSchema.parse(posts[0])).toMatchObject({ orderId: "PO-1" });

    save();
    await screen.findByText(orderLabel("zh", "tord.saved", { orderId: "PO-1" }));
    expect(posts[1]).toEqual(posts[0]);
    expect(previewRegion()).toBeNull();
    expect(document.querySelector(".tord-status .badge")).toBeNull();
    const total = document.querySelector<HTMLElement>(".tord-amounts .tord-total");
    expect(total?.textContent).toContain(formatMinor(11300, "zh", 2));
    expect(total?.textContent).not.toContain(formatMinor(10170, "zh", 2));
  });

  it("clears the preview as soon as any field changes", async () => {
    const { posts } = stubApi(routed(() => response(previewed)));
    render(<App />);
    await fillOrder();
    for (const change of [
      () => fireEvent.change(field("tord.quantity", "L1"), { target: { value: "9" } }),
      () => fireEvent.click(field("tord.priceIncludesTax")),
      () => fireEvent.click(screen.getByRole("button", { name: t("tord.addLine") })),
    ]) {
      fireEvent.click(previewButton());
      await waitFor(() => expect(previewRegion()).toBeTruthy());
      change();
      expect(previewRegion()).toBeNull();
      expect(document.querySelector(".tord-lines .tord-total")).toBeNull();
      expect(screen.queryByText(formatMinor(10170, "zh", 2))).toBeNull();
      expect(screen.getByText(t("tord.amountsAfterSave"))).toBeTruthy();
    }
    expect(posts).toHaveLength(3);
  });

  it("shows preview failures in the message bar, on the fields, and returns focus to Preview", async () => {
    let attempt = 0;
    const { posts } = stubApi(
      routed(() => {
        attempt += 1;
        if (attempt === 1)
          return failure(400, "INVALID_REQUEST", [
            { path: "lines.0.taxCode", messageKey: "api.error.trade.missingTax" },
          ]);
        throw new TypeError("network down");
      }),
    );
    render(<App />);
    await fillOrder();
    fireEvent.change(field("tord.orderId"), { target: { value: "po 1" } });
    previewButton().focus();
    fireEvent.click(previewButton());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(t("tord.previewInvalid"));
    expect(field("tord.orderId").getAttribute("aria-invalid")).toBe("true");
    expect(posts).toHaveLength(0);
    expect(document.activeElement).toBe(previewButton());

    fireEvent.change(field("tord.orderId"), { target: { value: "PO-1" } });
    fireEvent.click(previewButton());
    await waitFor(() =>
      expect(field("tord.taxCode", "L1").getAttribute("aria-invalid")).toBe("true"),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      `${t("tord.taxCode")} L1: ${t("tord.issue.missingTax")}`,
    );
    expect(document.activeElement).toBe(previewButton());
    expect(previewRegion()).toBeNull();

    fireEvent.click(previewButton());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(t("tord.previewFailed")),
    );
    expect(document.activeElement).toBe(previewButton());
    expect(previewRegion()).toBeNull();
    expect(posts).toHaveLength(2);
    expect(document.querySelector(".tord-amounts")).toBeNull();
  });

  // TINV-02: invoiced / not-invoiced quantities and the Invoice entry on the order detail.
  const twoLines = {
    ...savedOrder,
    lines: [
      { ...savedOrder.lines[0], quantity: "10.5" },
      { ...savedOrder.lines[0], lineId: "L2", lineNo: 2, quantity: "0.3" },
      { ...savedOrder.lines[0], lineId: "L3", lineNo: 3, quantity: "2" },
    ],
  };
  const invoicingCalls = (calls: string[]) =>
    calls.filter((call) => call === "GET /api/v1/trade/orders/PO-1/invoicing");
  const detail = (root: ParentNode = document) =>
    within(
      root.querySelector<HTMLElement>(".tord-amounts") ??
        (() => {
          throw new Error("no detail");
        })(),
    );
  const quantities = (root?: ParentNode) =>
    detail(root)
      .getAllByRole("row")
      .slice(1, -1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .slice(4, 7)
          .map((cell) => cell.textContent),
      );
  const invoiceEntry = () => screen.getByText(t("tord.invoice"), { selector: "a, button" });

  it("reads invoiced quantities once after save and subtracts them as exact decimals", async () => {
    const { calls } = stubApi(
      () => response(twoLines, 201),
      emptyList,
      () => response(invoicingOf(twoLines, ["3.25", "0.1", "2"])),
    );
    render(<App />);
    await fillOrder();
    save();
    await waitFor(() => expect(quantities()[0]).toEqual(["10.5", "3.25", "7.25"]));
    const headers = detail()
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers.slice(4, 7)).toEqual([
      t("tord.quantity"),
      t("tord.invoicedQuantity"),
      t("tord.uninvoicedQuantity"),
    ]);
    // 0.3 - 0.1 is 0.19999999999999998 in floating point.
    expect(quantities()[1]).toEqual(["0.3", "0.1", "0.2"]);
    const done = detail().getAllByRole("row")[3] as HTMLElement;
    expect(
      within(done).getAllByRole("cell")[6]?.querySelector(".badge.success")?.textContent,
    ).toContain(t("tord.fullyInvoicedBadge"));
    const entry = invoiceEntry();
    expect(entry.tagName).toBe("A");
    expect(entry.getAttribute("href")).toBe("#/trade-invoices?company=DEFAULT&fromOrder=PO-1");
    expect(screen.queryByText(t("tord.fullyInvoiced"))).toBeNull();
    expect(invoicingCalls(calls)).toHaveLength(1);
  });

  it("reads invoiced quantities once after a lookup and disables Invoice with a reason when all is invoiced", async () => {
    const { calls } = stubApi(
      () => response(twoLines),
      () => response({ items: [summary("PO-1", 11300)], nextCursor: null }),
      () => response(invoicingOf(twoLines, ["10.5", "0.3", "2"])),
    );
    render(<App />);
    const table = await listTable();
    fireEvent.click(await within(table).findByRole("button", { name: "PO-1" }));
    const reason = await screen.findByText(t("tord.fullyInvoiced"));
    const result = document.querySelector(".tord-lookup-result") as HTMLElement;
    expect(quantities(result).map((row) => row[2])).toEqual(
      [
        t("tord.fullyInvoicedBadge"),
        t("tord.fullyInvoicedBadge"),
        t("tord.fullyInvoicedBadge"),
      ].map((text) => expect.stringContaining(text)),
    );
    const entry = invoiceEntry();
    expect(entry.tagName).toBe("BUTTON");
    expect((entry as HTMLButtonElement).disabled).toBe(true);
    expect(entry.getAttribute("aria-describedby")).toBe(reason.id);
    expect(within(result).queryByRole("link")).toBeNull();
    expect(invoicingCalls(calls)).toHaveLength(1);
    expect(calls.filter((call) => call === "GET /api/v1/trade/orders/PO-1")).toHaveLength(1);
  });

  it("shows placeholders while loading, keeps the order on failure and retries", async () => {
    let attempt = 0;
    let release = () => {};
    const { calls } = stubApi(
      () => response(twoLines, 201),
      emptyList,
      () => {
        attempt += 1;
        if (attempt === 1) return failure(500, "INTERNAL", []);
        return new Promise<Response>((resolve) => {
          release = () => resolve(response(invoicingOf(twoLines, ["1", "0", "0"])));
        });
      },
    );
    render(<App />);
    await fillOrder();
    save();
    const alert = await screen.findByText(t("tord.invoicingFailed"));
    expect(document.querySelector(".tord-amounts .tord-total")?.textContent).toContain(
      formatMinor(3 * 11300, "zh", 2),
    );
    expect(quantities()[0]).toEqual(["10.5", "\u2026", "\u2026"]);
    expect((invoiceEntry() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(t("tord.fullyInvoiced"))).toBeNull();

    fireEvent.click(
      within(alert.closest(".message-bar") as HTMLElement).getByRole("button", {
        name: label("zh", "master.retry"),
      }),
    );
    expect(await screen.findByText(t("tord.invoicingLoading"))).toBeTruthy();
    expect(screen.queryByText(t("tord.invoicingFailed"))).toBeNull();
    expect(quantities()[0]).toEqual(["10.5", "\u2026", "\u2026"]);
    expect((invoiceEntry() as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(attempt).toBe(2));
    release();
    await waitFor(() => expect(quantities()[0]).toEqual(["10.5", "1", "9.5"]));
    expect(screen.queryByText(t("tord.invoicingLoading"))).toBeNull();
    expect(invoiceEntry().tagName).toBe("A");
    expect(invoicingCalls(calls)).toHaveLength(2);
  });

  // S7 review leftover 8: list filters are not remembered after leaving the page (TORD-05).
  it("resets the list filters after leaving the order page and coming back", async () => {
    const lists: string[] = [];
    stubApi(
      () => response({}, 404),
      (url) => {
        lists.push(url);
        return response({
          items: url.includes("party=") ? [] : [summary("PO-1", 11300)],
          nextCursor: null,
        });
      },
    );
    render(<App />);
    await filterForm();
    setFilters({ party: "VENDOR", side: "AP", from: "2026-01-01", to: "2026-06-30" });
    apply();
    await waitFor(() =>
      expect(lists.at(-1)).toBe(`${base}&party=VENDOR&side=AP&from=2026-01-01&to=2026-06-30`),
    );
    fireEvent.click(screen.getByRole("link", { name: label("zh", "shell.overview") }));
    await waitFor(() => expect(screen.queryByRole("form", { name: t("tord.filter") })).toBeNull());
    const before = lists.length;
    fireEvent.click(screen.getByRole("link", { name: label("zh", "shell.tradeOrders") }));
    await filterForm();
    expect(
      ["tord.filterParty", "tord.filterSide", "tord.filterFrom", "tord.filterTo"].map(
        (key) => filterField(key as TradeOrderKey).value,
      ),
    ).toEqual(["", "", "", ""]);
    // The unfiltered list is shown again; any request made on return carries no filter.
    expect(await within(await listTable()).findByRole("button", { name: "PO-1" })).toBeTruthy();
    expect(screen.queryByText(t("tord.listNoMatch"))).toBeNull();
    for (const url of lists.slice(before)) {
      const params = new URL(url, "http://local").searchParams;
      expect(["party", "side", "from", "to"].filter((key) => params.has(key))).toEqual([]);
    }
  });

  // TINV-03: invoicing status column.
  it("shows each listed order's invoicing status as a text badge in its own column", async () => {
    stubApi(
      () => response({}, 404),
      () =>
        response({
          items: [
            summary("PO-1", 100, 1, "none"),
            summary("PO-2", 200, 2, "partial"),
            summary("PO-3", 300, 1, "full"),
          ],
          nextCursor: null,
        }),
    );
    render(<App />);
    const table = await listTable();
    await within(table).findByRole("button", { name: "PO-3" });
    expect(within(table).getAllByRole("columnheader").at(-1)?.textContent).toBe(
      t("tord.invoicing"),
    );
    const badges = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => {
        const cell = within(row).getAllByRole("cell").at(-1) as HTMLElement;
        const badge = cell.querySelector(".badge") as HTMLElement;
        return [
          badge.className,
          badge.querySelector("[aria-hidden=true]")?.textContent,
          cell.textContent,
        ];
      });
    // Text, not colour alone: the aria-hidden symbol is decoration and the label carries the state.
    expect(badges).toEqual([
      ["badge warning", "!", `!${t("tord.invoicing.none")}`],
      ["badge info", "i", `i${t("tord.invoicing.partial")}`],
      ["badge success", "\u2713", `\u2713${t("tord.invoicing.full")}`],
    ]);
  });

  // TINV-03: `#/trade-orders?company=&order=` deep links (task table "入口参数与异常").
  const branch = { ...company, code: "BRANCH", name: "Branch" };
  const twoCompanies: Handler = () => response({ items: [company, branch], nextCursor: null });
  const linkTo = (search: string) =>
    window.history.replaceState(null, "", `/#/trade-orders${search}`);
  const address = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const shownOrder = () =>
    document.querySelector(".tord-lookup-result h4 .badge")?.textContent ?? null;
  const companySelect = () => document.getElementById("tord-company") as HTMLSelectElement;
  const listToggle = () =>
    document.querySelector<HTMLButtonElement>('[aria-controls="tord-list-body"]');
  const byOrder =
    (answers: Readonly<Record<string, () => Response>>): Handler =>
    (url) => {
      const id = decodeURIComponent(/\/trade\/orders\/([^/?]*)\?/u.exec(url)?.[1] ?? "");
      return answers[id]?.() ?? failure(404, "NOT_FOUND", []);
    };
  const found = byOrder({ "PO-1": () => response(savedOrder) });
  const orderReads = (calls: readonly string[]) =>
    calls.filter((call) => /^GET \/api\/v1\/trade\/orders\/[^/]*$/u.test(call));
  // jsdom has no default keyboard actions: Tab moves focus to the next tabbable element in
  // document order, and a focused native button activates as browsers do (Enter on keydown,
  // Space on keyup). Real keys are checked in Chrome (PR evidence).
  const tabbables = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !(element as HTMLButtonElement).disabled &&
        !element.closest("[hidden]"),
    );
  const tabTo = (target: HTMLElement) => {
    for (let step = 0; document.activeElement !== target; step++) {
      const list = tabbables();
      if (step > list.length) throw new Error("not reachable by Tab");
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab" });
      (list[list.indexOf(document.activeElement as HTMLElement) + 1] ?? list[0])?.focus();
    }
  };
  type Activation = "click" | "Enter" | " ";
  const activate = (button: HTMLElement, how: Activation) => {
    if (how === "click") {
      fireEvent.click(button);
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    tabTo(button);
    expect(document.activeElement).toBe(button);
    expect([button.tagName, button.getAttribute("type")]).toEqual(["BUTTON", "button"]);
    if (fireEvent.keyDown(button, { key: how }) && how === "Enter") fireEvent.click(button);
    if (fireEvent.keyUp(button, { key: how }) && how === " ") fireEvent.click(button);
  };
  const back = async () =>
    within(await screen.findByRole("alert")).getByRole("button", {
      name: t("tord.deepLink.back"),
    });

  it.each([
    ["is unknown", "?company=MISSING&order=PO-1", "MISSING", twoCompanies, "click"],
    ["is empty", "?company=&order=PO-1", "", twoCompanies, "Enter"],
    ["differs in case", "?company=branch", "branch", twoCompanies, " "],
    [
      "is not on the loaded first page",
      "?company=LATER",
      "LATER",
      () => response({ items: [company, branch], nextCursor: "BRANCH" }),
      "Enter",
    ],
  ] as const)(
    "reports a company that %s and goes back to the default list (%s)",
    async (_case, search, value, companies, how) => {
      linkTo(search);
      const lists: string[] = [];
      const { calls } = stubApi(
        found,
        (url) => {
          lists.push(url);
          return response({ items: [summary("PO-1", 11300)], nextCursor: null });
        },
        noneInvoiced,
        companies,
      );
      render(<App />);
      const alert = await screen.findByRole("alert");
      expect(alert.querySelector("p")?.textContent).toBe(
        `${t("tord.deepLink.company")} · ${value}`,
      );
      // No silent fallback: no company's orders, list or lookup is shown or read.
      expect(screen.queryByRole("table", { name: t("tord.list") })).toBeNull();
      expect(screen.queryByRole("form", { name: t("tord.entry") })).toBeNull();
      expect(lists).toEqual([]);
      expect(orderReads(calls)).toEqual([]);

      activate(await back(), how);
      await waitFor(() => expect(address().toString()).toBe(""));
      const table = await listTable();
      expect(await within(table).findByRole("button", { name: "PO-1" })).toBeTruthy();
      expect(lists).toEqual(["/api/v1/trade/orders?company=DEFAULT&limit=100"]);
      expect(companySelect().value).toBe("DEFAULT");
      expect(document.activeElement).toBe(companySelect());
      expect(screen.queryByRole("alert")).toBeNull();
      expect(orderReads(calls)).toEqual([]);
    },
  );

  it("goes back from an unknown company by keyboard with one company and no select change", async () => {
    linkTo("?company=OTHER&order=PO-1");
    const { calls } = stubApi(found, () =>
      response({ items: [summary("PO-1", 11300)], nextCursor: null }),
    );
    render(<App />);
    await screen.findByRole("alert");
    const select = companySelect();
    expect([...select.options].map((option) => option.value)).toEqual(["DEFAULT"]);
    const changes = vi.fn();
    select.addEventListener("change", changes);
    activate(await back(), "Enter");
    await waitFor(() => expect(address().toString()).toBe(""));
    expect(await within(await listTable()).findByRole("button", { name: "PO-1" })).toBeTruthy();
    expect(document.activeElement).toBe(select);
    expect(select.value).toBe("DEFAULT");
    expect(changes).not.toHaveBeenCalled();
    expect(orderReads(calls)).toEqual([]);
  });

  it.each([
    ["an empty order", "?company=DEFAULT&order=", "Enter", 0, "company=DEFAULT"],
    ["a malformed order", "?company=DEFAULT&order=po%201", " ", 0, "company=DEFAULT"],
    ["a malformed order without company", "?order=po%201", "Enter", 0, ""],
    [
      "an order the server rejects (400)",
      "?company=DEFAULT&order=PO-400",
      "click",
      1,
      "company=DEFAULT",
    ],
  ] as const)(
    "reports %s as invalid with one company and goes back to the list (%s)",
    async (_case, search, how, reads, after) => {
      expect(tradeOrderCommandSchema.shape.orderId.safeParse("po 1").success).toBe(false);
      linkTo(search);
      const { calls } = stubApi(
        byOrder({ "PO-400": () => failure(400, "INVALID_REQUEST", []) }),
        () => response({ items: [summary("PO-1", 11300)], nextCursor: null }),
      );
      render(<App />);
      const alert = await screen.findByRole("alert");
      expect(alert.querySelector("p")?.textContent).toBe(t("tord.issue.shape"));
      expect(screen.queryByText(t("tord.notFound"))).toBeNull();
      expect(orderReads(calls)).toHaveLength(reads);
      const select = companySelect();
      expect(select.options).toHaveLength(1);
      const changes = vi.fn();
      select.addEventListener("change", changes);

      activate(await back(), how);
      await waitFor(() => expect(address().has("order")).toBe(false));
      expect(address().toString()).toBe(after);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(document.activeElement).toBe(listToggle());
      expect(await within(await listTable()).findByRole("button", { name: "PO-1" })).toBeTruthy();
      expect(shownOrder()).toBeNull();
      expect(changes).not.toHaveBeenCalled();
      expect(orderReads(calls)).toHaveLength(reads);
    },
  );

  // Recovery removes only `order`: an absent `company` stays absent.
  it.each([
    ["?company=DEFAULT&order=PO-9", "company=DEFAULT"],
    ["?order=PO-9", ""],
  ] as const)(
    "reports an order that does not exist and goes back to the list by Space (%s)",
    async (search, after) => {
      linkTo(search);
      const { calls } = stubApi(found, () =>
        response({ items: [summary("PO-1", 11300)], nextCursor: null }),
      );
      render(<App />);
      const alert = await screen.findByRole("alert");
      expect(alert.querySelector("p")?.textContent).toBe(t("tord.notFound"));
      expect(orderReads(calls)).toEqual(["GET /api/v1/trade/orders/PO-9"]);
      activate(await back(), " ");
      await waitFor(() => expect(address().has("order")).toBe(false));
      expect(address().toString()).toBe(after);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(document.activeElement).toBe(listToggle());
      expect(companySelect().value).toBe("DEFAULT");
      expect(orderReads(calls)).toHaveLength(1);
    },
  );

  it.each(["click", "Enter", " "] as const)(
    "retries a failed company or order read with the same request (%s)",
    async (how) => {
      linkTo("?company=BRANCH&order=PO-1");
      let companiesFail = true;
      let orderFails = true;
      const { calls } = stubApi(
        byOrder({
          "PO-1": () => (orderFails ? failure(500, "INTERNAL_ERROR", []) : response(savedOrder)),
        }),
        emptyList,
        noneInvoiced,
        () => (companiesFail ? failure(500, "INTERNAL_ERROR", []) : twoCompanies("")),
      );
      render(<App />);
      let alert = await screen.findByRole("alert");
      expect(alert.querySelector("p")?.textContent).toBe(label("zh", "master.error"));
      companiesFail = false;
      activate(within(alert).getByRole("button", { name: label("zh", "master.retry") }), how);
      await waitFor(() => expect(orderReads(calls)).toHaveLength(1));
      alert = await screen.findByRole("alert");
      expect(alert.querySelector("p")?.textContent).toBe(label("zh", "master.error"));
      expect(companySelect().value).toBe("BRANCH");
      orderFails = false;
      activate(within(alert).getByRole("button", { name: label("zh", "master.retry") }), how);
      await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
      expect(orderReads(calls)).toEqual([
        "GET /api/v1/trade/orders/PO-1",
        "GET /api/v1/trade/orders/PO-1",
      ]);
      expect(calls.filter((call) => call.startsWith("GET /api/v1/trade/orders/PO-1"))).toContain(
        "GET /api/v1/trade/orders/PO-1",
      );
      expect(address().toString()).toBe("company=BRANCH&order=PO-1");
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("shows loading and does not judge the company before the first company page arrives", async () => {
    linkTo("?company=BRANCH&order=PO-1");
    let answer: (value: Response) => void = () => {};
    const { calls } = stubApi(
      found,
      emptyList,
      noneInvoiced,
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    render(<App />);
    expect(await screen.findByText(label("zh", "master.loading"))).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(orderReads(calls)).toEqual([]);
    await act(async () => answer(response({ items: [company, branch], nextCursor: null })));
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
    expect(companySelect().value).toBe("BRANCH");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the linked order of the linked company, keeps it on refresh and follows later choices", async () => {
    linkTo("?company=BRANCH&order=PO-1");
    const lists: string[] = [];
    const reads: string[] = [];
    const stub = () =>
      stubApi(
        (url) => {
          reads.push(url);
          return found(url);
        },
        (url) => {
          lists.push(url);
          return response({
            items: [summary("PO-1", 11300), summary("PO-2", 11300, 1, "partial")],
            nextCursor: null,
          });
        },
        noneInvoiced,
        twoCompanies,
      );
    stub();
    const view = render(<App />);
    const result = await waitFor(() => {
      const shown = document.querySelector<HTMLElement>(".tord-lookup-result");
      if (!shown) throw new Error("no result");
      return shown;
    });
    expect(shownOrder()).toMatch(/PO-1$/u);
    expect(reads).toEqual(["/api/v1/trade/orders/PO-1?company=BRANCH"]);
    expect(companySelect().value).toBe("BRANCH");
    // The opened detail is reachable by keyboard: focus moves to it.
    expect(document.activeElement).toBe(result);
    expect(address().toString()).toBe("company=BRANCH&order=PO-1");

    // Refresh: a new page load of the same address shows the same view.
    view.unmount();
    vi.unstubAllGlobals();
    stub();
    render(<App />);
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
    expect(reads).toEqual([
      "/api/v1/trade/orders/PO-1?company=BRANCH",
      "/api/v1/trade/orders/PO-1?company=BRANCH",
    ]);
    expect(companySelect().value).toBe("BRANCH");

    // Opening another order in the list writes it into the address.
    const table = await listTable();
    fireEvent.click(await within(table).findByRole("button", { name: "PO-2" }));
    await waitFor(() => expect(address().toString()).toBe("company=BRANCH&order=PO-2"));
    expect(await screen.findByText(t("tord.notFound"))).toBeTruthy();
    // The lookup form follows the same path.
    fireEvent.change(screen.getByLabelText(t("tord.lookupId")), { target: { value: "PO-1" } });
    fireEvent.click(screen.getByRole("button", { name: t("tord.lookupButton") }));
    await waitFor(() => expect(address().toString()).toBe("company=BRANCH&order=PO-1"));
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));

    // Choosing another company replaces `company` and drops `order`.
    fireEvent.change(companySelect(), { target: { value: "DEFAULT" } });
    await waitFor(() => expect(address().toString()).toBe("company=DEFAULT"));
    await waitFor(() =>
      expect(lists.at(-1)).toBe("/api/v1/trade/orders?company=DEFAULT&limit=100"),
    );
    expect(shownOrder()).toBeNull();
  });

  it("opens a linked order in the current company when `company` is absent", async () => {
    linkTo("?order=PO-1");
    const reads: string[] = [];
    stubApi(
      (url) => {
        reads.push(url);
        return found(url);
      },
      emptyList,
      noneInvoiced,
      twoCompanies,
    );
    render(<App />);
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
    expect(reads).toEqual(["/api/v1/trade/orders/PO-1?company=DEFAULT"]);
    expect(companySelect().value).toBe("DEFAULT");
    expect(address().toString()).toBe("order=PO-1");
  });

  it("only switches the company when `order` is absent", async () => {
    linkTo("?company=BRANCH");
    const lists: string[] = [];
    const { calls } = stubApi(
      found,
      (url) => {
        lists.push(url);
        return response({ items: [summary("PO-1", 11300)], nextCursor: null });
      },
      noneInvoiced,
      twoCompanies,
    );
    render(<App />);
    expect(await within(await listTable()).findByRole("button", { name: "PO-1" })).toBeTruthy();
    expect(companySelect().value).toBe("BRANCH");
    expect(lists).toEqual(["/api/v1/trade/orders?company=BRANCH&limit=100"]);
    expect(orderReads(calls)).toEqual([]);
    expect(shownOrder()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [false, "keeps the draft and the address"],
    [true, "opens the linked order"],
  ] as const)(
    "asks before a deep link replaces an unsaved draft (confirm %s %s)",
    async (answer, _outcome) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(answer);
      const { calls } = stubApi(found, () =>
        response({ items: [summary("PO-2", 11300)], nextCursor: null }),
      );
      render(<App />);
      await screen.findByRole("form", { name: t("tord.entry") });
      fireEvent.change(field("tord.orderId"), { target: { value: "PO-DRAFT" } });
      // The page rewrites its own address while the draft is open; a cancel returns to that address.
      fireEvent.click(await within(await listTable()).findByRole("button", { name: "PO-2" }));
      await screen.findByText(t("tord.notFound"));
      const before = window.location.href;
      expect(address().toString()).toBe("company=DEFAULT&order=PO-2");
      expect(confirm).not.toHaveBeenCalled();
      window.history.pushState(null, "", "/#/trade-orders?company=DEFAULT&order=PO-1");
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(confirm).toHaveBeenCalledWith(t("tord.leaveConfirm"));
      if (answer) {
        await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
        expect(orderReads(calls)).toEqual([
          "GET /api/v1/trade/orders/PO-2",
          "GET /api/v1/trade/orders/PO-1",
        ]);
      } else {
        expect(window.location.href).toBe(before);
        await act(async () => {});
        expect(orderReads(calls)).toEqual(["GET /api/v1/trade/orders/PO-2"]);
        expect(screen.getByText(t("tord.notFound"))).toBeTruthy();
      }
      expect(field("tord.orderId").value).toBe("PO-DRAFT");
    },
  );

  // react-router's history writes { usr, key, idx } into history.state on every in-app push; the
  // guard trusts only such positions (D273). These entries stand for ones the router pushed earlier.
  const routerEntry = (idx: number, search: string, push = true) =>
    window.history[push ? "pushState" : "replaceState"](
      { usr: null, key: `k${idx}`, idx },
      "",
      `/#/trade-orders${search}`,
    );

  // D272: history A → B → C holds router entries, then real Back / Forward. A cancel must not add
  // or rewrite entries: the order and the forward entries stay, a retry in the same direction
  // reaches the original target, and each navigation asks once.
  it.each([
    ["Back", "PO-2", "PO-1"],
    ["Forward", "PO-1", "PO-2"],
  ] as const)(
    "cancels a real %s without changing the history and retries it in the same direction",
    async (direction, start, target) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      stubApi(found, emptyList, noneInvoiced);
      routerEntry(0, "?company=DEFAULT&order=PO-1", false);
      routerEntry(1, "?company=DEFAULT&order=PO-2");
      routerEntry(2, "?company=DEFAULT&order=PO-3");
      render(<App />);
      const order = () => address().get("order");
      await waitFor(() => expect(order()).toBe("PO-3"));
      await screen.findByText(t("tord.notFound"));
      window.history.back();
      await waitFor(() => expect(order()).toBe("PO-2"));
      if (start === "PO-1") {
        window.history.back();
        await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
      }
      expect(confirm).not.toHaveBeenCalled();
      fireEvent.change(field("tord.orderId"), { target: { value: "PO-DRAFT" } });
      const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));
      const move = (way: "Back" | "Forward") =>
        way === "Back" ? window.history.back() : window.history.forward();
      const length = window.history.length;

      move(direction);
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      await settle();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(order()).toBe(start);
      expect(window.history.length).toBe(length);
      expect(field("tord.orderId").value).toBe("PO-DRAFT");

      confirm.mockReturnValue(true);
      move(direction);
      await waitFor(() => expect(order()).toBe(target));
      await settle();
      expect(confirm).toHaveBeenCalledTimes(2);
      // The forward entries are still there, in their order.
      const rest = direction === "Back" ? ["PO-2", "PO-3"] : ["PO-3"];
      for (const [step, id] of rest.entries()) {
        window.history.forward();
        await waitFor(() => expect(order()).toBe(id));
        await settle();
        expect(confirm).toHaveBeenCalledTimes(3 + step);
      }
      expect(window.history.length).toBe(length);
      expect(field("tord.orderId").value).toBe("PO-DRAFT");
    },
  );
  // D273: an entry the router did not write (B, another page reached by a plain fragment link)
  // has no trusted position, and neither has the order page reached from it (C). From C, a Back
  // across two entries to A must ask once and keep C's address and draft; no position is invented.
  it("asks once when a Back crosses an entry without a router position", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    stubApi(found, emptyList, noneInvoiced);
    routerEntry(0, "?company=DEFAULT&order=PO-1", false);
    render(<App />);
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
    window.location.hash = "#/trade-invoices";
    await waitFor(() => expect(screen.queryByLabelText(t("tord.lookupId"))).toBeNull());
    window.location.hash = "#/trade-orders?company=DEFAULT&order=PO-2";
    await screen.findByText(t("tord.notFound"));
    const here = window.location.href;
    fireEvent.change(field("tord.orderId"), { target: { value: "PO-DRAFT" } });

    window.history.go(-2);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(here);
    expect(field("tord.orderId").value).toBe("PO-DRAFT");

    confirm.mockReturnValue(true);
    window.history.back();
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
  // D274: after a typed hash (B, no idx), the router writes the next push as idx null + 1 = 1, so
  // C's idx is wrong. Returning from a cancelled Back to A lands on B; the guard checks the landing
  // (URL and router key) and, as it is not C, falls back to pushing C without asking again.
  it("falls back without asking again when a cancel lands on the wrong entry", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    stubApi(found, emptyList, noneInvoiced);
    routerEntry(0, "?company=DEFAULT&order=PO-1", false);
    render(<App />);
    await waitFor(() => expect(shownOrder()).toMatch(/PO-1$/u));
    window.location.hash = "#/trade-orders?company=DEFAULT&order=PO-2";
    await screen.findByText(t("tord.notFound"));
    fireEvent.click(screen.getByRole("link", { name: label("zh", "shell.tradeOrders") }));
    await waitFor(() => expect(address().get("order")).toBeNull());
    expect(window.history.state).toMatchObject({ idx: 1 });
    const here = window.location.href;
    fireEvent.change(field("tord.orderId"), { target: { value: "PO-DRAFT" } });

    window.history.go(-2);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(here);
    expect(field("tord.orderId").value).toBe("PO-DRAFT");

    confirm.mockReturnValue(true);
    window.history.back();
    await waitFor(() => expect(address().get("order")).toBe("PO-2"));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
function stubApi(onOrder: Handler, onList: Handler = emptyList) {
  const calls: string[] = [];
  const posts: unknown[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
    const url = String(path);
    calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
    if (url.startsWith("/api/v1/companies"))
      return response({ items: [company], nextCursor: null });
    if (url.startsWith("/api/v1/trade/tradeParty?"))
      return response({ items: [party], nextCursor: null });
    if (url.startsWith("/api/v1/trade/tradeProduct?"))
      return response({ items: [product], nextCursor: null });
    if (url.startsWith("/api/v1/trade/taxCode?"))
      return response({ items: [tax], nextCursor: null });
    if (url.startsWith("/api/v1/trade/orders?") && (init?.method ?? "GET") === "GET")
      return onList(url, init);
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

  const summary = (orderId: string, gross: number, lineCount = 1) => ({
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
});

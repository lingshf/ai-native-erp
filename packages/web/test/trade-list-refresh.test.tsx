// TLIST-01: "Refresh list" on the order and invoice lists re-reads the first page of the applied
// filters (the address's), leaving the filter bar's unapplied inputs, the address and drafts alone.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";
import { detailLabel } from "../src/ui/trade-invoice-detail-labels.ts";
import { orderLabel, type TradeOrderKey } from "../src/ui/trade-order-labels.ts";
import { company, failure, response, stubApi, type Handler } from "./trade-orders-fixtures.ts";

type FilterKey = "party" | "side" | "from" | "to";
type ListCase = {
  name: string;
  page: string;
  prefix: "tord" | "tinv";
  base: string;
  nextCursor: string;
  party: string;
  clear: string;
  refresh: string;
  refreshIn: (language: "zh" | "en") => string;
  brokenText: string;
  draftLabel: string;
  stub: (list: Handler) => void;
  row: (n: number) => unknown;
  rowId: (n: number) => string;
};

const zh = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const tord = (key: TradeOrderKey) => orderLabel("zh", key);

const orderRow = (n: number) => ({
  orderId: `PO-${n}`,
  side: "AP",
  party: "VENDOR",
  currency: "CNY",
  orderDate: "2026-04-01",
  priceIncludesTax: false,
  rounding: "line",
  recordedAt: "2026-04-01T08:00:00.000Z",
  lineCount: 1,
  net: 100 * n,
  tax: 0,
  gross: 100 * n,
  invoicing: "none",
});
const invoiceRow = (n: number) => ({
  documentId: `00000000-0000-4000-8000-00000000000${n}`,
  side: "AP",
  party: "V1",
  externalNo: `INV-${n}`,
  accountingDate: "2026-03-31",
  documentDate: "2026-03-30",
  dueDate: "2026-04-30",
  poMatch: "notApplicable",
  gross: 1000 * n,
  currency: "CNY",
  journalId: `00000000-0000-4000-8000-00000000001${n}`,
  orderId: null,
  cursor: String(n),
});
// The invoice page needs only the companies and its list; everything else is not found.
const stubInvoices = (list: Handler) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url.startsWith("/api/v1/trade/invoices?")) return list(url, init);
      return response({}, 404);
    }),
  );

const cases: ListCase[] = [
  {
    name: "order list",
    page: "/#/trade-orders",
    prefix: "tord",
    base: "/api/v1/trade/orders?company=DEFAULT&limit=100",
    nextCursor: "PO-2",
    party: "VENDOR",
    clear: tord("tord.filterClear"),
    refresh: tord("tord.listRefresh"),
    refreshIn: (language) => orderLabel(language, "tord.listRefresh"),
    brokenText: tord("tord.filterLinkInvalid"),
    draftLabel: tord("tord.orderId"),
    stub: (list) => stubApi(() => response({}, 404), list),
    row: orderRow,
    rowId: (n) => `PO-${n}`,
  },
  {
    name: "invoice list",
    page: "/#/trade-invoices",
    prefix: "tinv",
    base: "/api/v1/trade/invoices?company=DEFAULT&limit=100",
    nextCursor: "2",
    party: "V1",
    clear: zh("tinv.filter.clear"),
    refresh: zh("tinv.listRefresh"),
    refreshIn: (language) => label(language, "tinv.listRefresh"),
    brokenText: detailLabel("zh", "tinv.filter.linkInvalid"),
    draftLabel: zh("tinv.party"),
    stub: stubInvoices,
    row: invoiceRow,
    rowId: (n) => `INV-${n}`,
  },
];

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const pause = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

describe.each(cases)("TLIST-01 $name refresh", (list) => {
  const { base } = list;
  const applied = `${base}&party=${list.party}&side=AP`;
  // Pages: rows 1 and 2, then (cursor) row 3. Records every list URL and its abort signal.
  const stubPages = (answer?: () => Response | Promise<Response | undefined> | undefined) => {
    const urls: string[] = [];
    const signals: AbortSignal[] = [];
    list.stub(async (url, init) => {
      urls.push(url);
      if (init?.signal) signals.push(init.signal);
      const custom = await answer?.();
      if (custom) return custom;
      return url.includes("cursor=")
        ? response({ items: [list.row(3)], nextCursor: null })
        : response({ items: [list.row(1), list.row(2)], nextCursor: list.nextCursor });
    });
    return { urls, signals };
  };
  const open = (search = `?company=DEFAULT&party=${list.party}&side=AP`) => {
    window.history.replaceState(null, "", `${list.page}${search}`);
    render(<App />);
  };
  const form = () =>
    document.querySelector<HTMLFormElement>(`.${list.prefix}-filter`) as HTMLFormElement;
  const input = (key: FilterKey) =>
    document.getElementById(`${list.prefix}-filter-${key}`) as HTMLInputElement;
  const refreshButton = () => within(form()).getByRole("button", { name: list.refresh });
  const refresh = () => fireEvent.click(refreshButton());
  // The listed rows by number, once per row, so a duplicated row shows up twice.
  const shownRows = () =>
    [...document.querySelectorAll("tr")].flatMap((row) =>
      [1, 2, 3].filter((n) => row.textContent?.includes(list.rowId(n))),
    );
  const expectRows = (rows: number[]) => waitFor(() => expect(shownRows()).toEqual(rows));
  const loadTwoPages = async () => {
    await expectRows([1, 2]);
    fireEvent.click(screen.getByRole("button", { name: zh("master.loadMore") }));
    await expectRows([1, 2, 3]);
  };

  it("U2: after two pages, sends one first-page request with the applied filters and shows only that page", async () => {
    const { urls } = stubPages();
    open();
    await loadTwoPages();
    expect(urls).toEqual([
      applied,
      `${base}&cursor=${list.nextCursor}&party=${list.party}&side=AP`,
    ]);
    refresh();
    await expectRows([1, 2]);
    await pause();
    expect(urls.slice(2)).toEqual([applied]);
  });

  it("U3: keeps unapplied inputs, the address, the history and the draft, without asking", async () => {
    const { urls } = stubPages();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    open();
    await expectRows([1, 2]);
    fireEvent.change(screen.getByLabelText(list.draftLabel), { target: { value: "DRAFT-1" } });
    fireEvent.change(input("party"), { target: { value: "OTHER" } });
    const [hash, length] = [window.location.hash, window.history.length];
    refresh();
    await waitFor(() => expect(urls).toHaveLength(2));
    await pause();
    expect(urls).toEqual([applied, applied]);
    expect(input("party").value).toBe("OTHER");
    expect([window.location.hash, window.history.length]).toEqual([hash, length]);
    expect(screen.getByLabelText<HTMLInputElement>(list.draftLabel).value).toBe("DRAFT-1");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("U4: keeps the bar's validation errors and the broken-link notice while refreshing", async () => {
    const { urls } = stubPages();
    open();
    await waitFor(() => expect(urls).toHaveLength(1));
    fireEvent.change(input("party"), { target: { value: "bad code" } });
    fireEvent.submit(form());
    await screen.findByText((_, node) => node?.id === `${list.prefix}-filter-party-error`);
    refresh();
    await waitFor(() => expect(urls).toEqual([applied, applied]));
    expect(input("party").getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(`${list.prefix}-filter-party-error`)).not.toBeNull();

    fireEvent.change(input("from"), { target: { value: "2026-06-30" } });
    fireEvent.change(input("to"), { target: { value: "2026-01-01" } });
    fireEvent.change(input("party"), { target: { value: "" } });
    fireEvent.submit(form());
    await waitFor(() => expect(input("from").getAttribute("aria-invalid")).toBe("true"));
    refresh();
    await waitFor(() => expect(urls).toEqual([applied, applied, applied]));
    expect(input("to").getAttribute("aria-invalid")).toBe("true");
  });

  it("U4: refreshes every record's first page under a broken link and keeps the notice", async () => {
    const { urls } = stubPages();
    open("?company=DEFAULT&side=XX");
    expect(await screen.findByText(list.brokenText)).toBeTruthy();
    await waitFor(() => expect(urls).toEqual([base]));
    refresh();
    await waitFor(() => expect(urls).toEqual([base, base]));
    expect(screen.getByText(list.brokenText)).toBeTruthy();
  });

  it("U5: a second click cancels the first request and shows the first page once", async () => {
    const held: (() => void)[] = [];
    let calls = 0;
    const { signals } = stubPages(() =>
      ++calls > 1
        ? new Promise<undefined>((resolve) => held.push(() => resolve(undefined)))
        : undefined,
    );
    open();
    await expectRows([1, 2]);
    refresh();
    await waitFor(() => expect(held).toHaveLength(1));
    refresh();
    await waitFor(() => expect(held).toHaveLength(2));
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(false);
    for (const release of held) release();
    await pause();
    expect(shownRows()).toEqual([1, 2]);
  });

  it("U5: a failed refresh shows the list's existing error state", async () => {
    let fail = false;
    const { urls } = stubPages(() => (fail ? failure(500, "INTERNAL", []) : undefined));
    open();
    await expectRows([1, 2]);
    fail = true;
    refresh();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: zh("master.retry") })).toBeTruthy();
    // Applying the same filters while the server fails shows the same state.
    const refreshed = alert.textContent;
    fireEvent.submit(form());
    await waitFor(() => expect(urls).toHaveLength(3));
    expect((await screen.findByRole("alert")).textContent).toBe(refreshed);
  });

  it("U6 / U7: labels the button in zh and en and places it after Clear as a non-submit button", async () => {
    const { urls } = stubPages();
    open();
    await waitFor(() => expect(urls).toHaveLength(1));
    expect([list.refreshIn("zh"), list.refreshIn("en")]).toEqual(["刷新列表", "Refresh list"]);
    const button = refreshButton();
    const buttons = [...form().querySelectorAll(".actions button")].map((node) => node.textContent);
    expect(buttons.slice(-2)).toEqual([list.clear, list.refresh]);
    expect([button.getAttribute("type"), button.className]).toEqual([
      "button",
      "btn btn-secondary",
    ]);
    expect(button.hasAttribute("disabled")).toBe(false);
    // Enter in a filter input still applies the bar's inputs.
    fireEvent.change(input("side"), { target: { value: "AR" } });
    fireEvent.submit(form());
    await waitFor(() => expect(urls.at(-1)).toBe(`${base}&party=${list.party}&side=AR`));
  });
});

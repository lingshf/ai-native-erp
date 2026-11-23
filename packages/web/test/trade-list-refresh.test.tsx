// TLIST-01: "Refresh list" on the order and invoice lists re-reads the first page of the applied
// filters (the address's), leaving the filter bar's unapplied inputs, the address and drafts alone.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

type Answer = () => Response | Promise<Response | undefined> | undefined;

// Helpers bound to one list: its stubbed pages, the address, the filter bar and the shown rows.
const listHarness = (list: ListCase) => {
  const applied = `${list.base}&party=${list.party}&side=AP`;
  const page = (rows: number[], nextCursor: string | null = null) =>
    response({ items: rows.map(list.row), nextCursor });
  // Pages: rows 1 and 2, then (cursor) row 3, unless `answer` gives a response. Records every
  // list URL, its abort signal and how many requests have been answered.
  const stubPages = (answer?: Answer) => {
    const record = { urls: [] as string[], signals: [] as AbortSignal[], answered: 0 };
    list.stub(async (url, init) => {
      record.urls.push(url);
      if (init?.signal) record.signals.push(init.signal);
      const custom = await answer?.();
      record.answered += 1;
      if (custom) return custom;
      return url.includes("cursor=") ? page([3]) : page([1, 2], list.nextCursor);
    });
    return record;
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
      [1, 2, 3, 4, 5].filter((n) => row.textContent?.includes(list.rowId(n))),
    );
  const expectRows = (rows: number[]) => waitFor(() => expect(shownRows()).toEqual(rows));
  const loadTwoPages = async () => {
    await expectRows([1, 2]);
    fireEvent.click(screen.getByRole("button", { name: zh("master.loadMore") }));
    await expectRows([1, 2, 3]);
  };
  return {
    list,
    applied,
    page,
    stubPages,
    open,
    form,
    input,
    refreshButton,
    refresh,
    shownRows,
    expectRows,
    loadTwoPages,
  };
};
type Harness = ReturnType<typeof listHarness>;

const refreshesFirstPageOnly = async (h: Harness) => {
  const { base, nextCursor, party } = h.list;
  const { urls } = h.stubPages();
  h.open();
  await h.loadTwoPages();
  expect(urls).toEqual([h.applied, `${base}&cursor=${nextCursor}&party=${party}&side=AP`]);
  h.refresh();
  await waitFor(() => expect(urls).toHaveLength(3));
  await h.expectRows([1, 2]);
  expect(urls.slice(2)).toEqual([h.applied]);
};

const keepsInputsAddressAndDraft = async (h: Harness) => {
  const { urls } = h.stubPages();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  h.open();
  await h.expectRows([1, 2]);
  fireEvent.change(screen.getByLabelText(h.list.draftLabel), { target: { value: "DRAFT-1" } });
  fireEvent.change(h.input("party"), { target: { value: "OTHER" } });
  const [hash, length] = [window.location.hash, window.history.length];
  h.refresh();
  await waitFor(() => expect(urls).toEqual([h.applied, h.applied]));
  await h.expectRows([1, 2]);
  expect(h.input("party").value).toBe("OTHER");
  expect([window.location.hash, window.history.length]).toEqual([hash, length]);
  expect(screen.getByLabelText<HTMLInputElement>(h.list.draftLabel).value).toBe("DRAFT-1");
  expect(confirm).not.toHaveBeenCalled();
};

const keepsValidationErrors = async (h: Harness) => {
  const { applied, input, form } = h;
  const { urls } = h.stubPages();
  h.open();
  await waitFor(() => expect(urls).toHaveLength(1));
  fireEvent.change(input("party"), { target: { value: "bad code" } });
  fireEvent.submit(form());
  await screen.findByText((_, node) => node?.id === `${h.list.prefix}-filter-party-error`);
  h.refresh();
  await waitFor(() => expect(urls).toEqual([applied, applied]));
  expect(input("party").getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(`${h.list.prefix}-filter-party-error`)).not.toBeNull();

  fireEvent.change(input("from"), { target: { value: "2026-06-30" } });
  fireEvent.change(input("to"), { target: { value: "2026-01-01" } });
  fireEvent.change(input("party"), { target: { value: "" } });
  fireEvent.submit(form());
  await waitFor(() => expect(input("from").getAttribute("aria-invalid")).toBe("true"));
  h.refresh();
  await waitFor(() => expect(urls).toEqual([applied, applied, applied]));
  expect(input("to").getAttribute("aria-invalid")).toBe("true");
};

const keepsBrokenLinkNotice = async (h: Harness) => {
  const { base, brokenText } = h.list;
  const { urls } = h.stubPages();
  h.open("?company=DEFAULT&side=XX");
  expect(await screen.findByText(brokenText)).toBeTruthy();
  await waitFor(() => expect(urls).toEqual([base]));
  h.refresh();
  await waitFor(() => expect(urls).toEqual([base, base]));
  expect(screen.getByText(brokenText)).toBeTruthy();
};

// Refreshes 1 and 2 are held; the cancelled one answers row 4, the winner row 5.
const showsOnlyTheWinner = async (h: Harness) => {
  const held: ((rows: number[]) => void)[] = [];
  const hold = () => new Promise<Response>((resolve) => held.push((rows) => resolve(h.page(rows))));
  let requests = 0;
  const record = h.stubPages(() => (++requests > 1 ? hold() : undefined));
  h.open();
  await h.expectRows([1, 2]);
  h.refresh();
  await waitFor(() => expect(held).toHaveLength(1));
  h.refresh();
  await waitFor(() => expect(held).toHaveLength(2));
  expect(record.signals[1]?.aborted).toBe(true);
  expect(record.signals[2]?.aborted).toBe(false);
  const [cancelled, winner] = held;
  winner?.([5]);
  await h.expectRows([5]);
  cancelled?.([4]);
  await waitFor(() => expect(record.answered).toBe(3));
  await h.expectRows([5]);
};

const showsTheErrorState = async (h: Harness) => {
  let fail = false;
  const { urls } = h.stubPages(() => (fail ? failure(500, "INTERNAL", []) : undefined));
  h.open();
  await h.expectRows([1, 2]);
  fail = true;
  h.refresh();
  const alert = await screen.findByRole("alert");
  expect(within(alert).getByRole("button", { name: zh("master.retry") })).toBeTruthy();
  // Applying the same filters while the server fails shows the same state.
  const refreshed = alert.textContent;
  fireEvent.submit(h.form());
  await waitFor(() => expect(urls).toHaveLength(3));
  expect((await screen.findByRole("alert")).textContent).toBe(refreshed);
};

const labelsAndPlacesTheButton = async (h: Harness) => {
  const { list, form } = h;
  const { urls } = h.stubPages();
  h.open();
  await waitFor(() => expect(urls).toHaveLength(1));
  expect([list.refreshIn("zh"), list.refreshIn("en")]).toEqual(["刷新列表", "Refresh list"]);
  const button = h.refreshButton();
  const buttons = [...form().querySelectorAll(".actions button")].map((node) => node.textContent);
  expect(buttons.slice(-2)).toEqual([list.clear, list.refresh]);
  expect([button.getAttribute("type"), button.className]).toEqual(["button", "btn btn-secondary"]);
  expect(button.hasAttribute("disabled")).toBe(false);
  // Enter in a filter input still applies the bar's inputs.
  fireEvent.change(h.input("side"), { target: { value: "AR" } });
  fireEvent.submit(form());
  await waitFor(() => expect(urls.at(-1)).toBe(`${list.base}&party=${list.party}&side=AR`));
};

describe.each(cases)("TLIST-01 $name refresh", (list) => {
  const h = listHarness(list);
  it("U2: after two pages, sends one first-page request with the applied filters and shows only that page", async () => {
    await refreshesFirstPageOnly(h);
  });
  it("U3: keeps unapplied inputs, the address, the history and the draft, without asking", async () => {
    await keepsInputsAddressAndDraft(h);
  });
  it("U4: keeps the bar's validation errors while refreshing", async () => {
    await keepsValidationErrors(h);
  });
  it("U4: refreshes every record's first page under a broken link and keeps the notice", async () => {
    await keepsBrokenLinkNotice(h);
  });
  it("U5: a second click cancels the first request and shows only the winner's rows", async () => {
    await showsOnlyTheWinner(h);
  });
  it("U5: a failed refresh shows the list's existing error state", async () => {
    await showsTheErrorState(h);
  });
  it("U6 / U7: labels the button in zh and en and places it after Clear as a non-submit button", async () => {
    await labelsAndPlacesTheButton(h);
  });
});

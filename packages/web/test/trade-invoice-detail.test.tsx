import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeInvoiceDetailSchema,
  type TradeInvoiceDetailDto,
  type TradeOrderInvoicingDto,
} from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label, preferenceStorageKey, type LabelKey } from "../src/ui/index.ts";
import { detailLabel, type TradeInvoiceDetailKey } from "../src/ui/trade-invoice-detail-labels.ts";

const company = {
  code: "DEFAULT",
  name: "Company",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fingerprint = "a".repeat(64);
const documentId = uuid(1);
const itemId = uuid(2);
const journalId = uuid(3);
const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const d = (key: TradeInvoiceDetailKey) => detailLabel("zh", key);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const error = (status: number, code: string) =>
  response(
    {
      code,
      messageKey: "api.error.notFound",
      params: {},
      fieldErrors: [],
      requestId: uuid(99),
      retryable: false,
    },
    status,
  );
const amounts = {
  net: 10000,
  tax: 1300,
  gross: 11300,
  deductibleTax: 1300,
  nonDeductibleTax: 0,
  expense: 10000,
  cashDiscountBase: 11300,
};

type Options = {
  side?: "AP" | "AR";
  orderId?: string | null;
  remainingGross?: number;
  status?: "open" | "settled" | "cancelled";
  settlements?: TradeInvoiceDetailDto["settlements"];
  actions?: TradeInvoiceDetailDto["actions"];
};
function detail(options: Options = {}): TradeInvoiceDetailDto {
  const side = options.side ?? "AP";
  const orderId = options.orderId === undefined ? "PO-1" : options.orderId;
  const remainingGross = options.remainingGross ?? 11300;
  const item = {
    kind: "invoice" as const,
    segments: [{ dimensions: {}, gross: 11300, remainingGross }],
    discountPercent: "0",
    allowPartialDiscount: false,
    itemId,
    side,
    party: "V1",
    externalNo: "INV-1",
    controlAccount: "2100",
    dimensions: {},
    currency: "CNY",
    accountingDate: "2026-03-31",
    documentDate: "2026-03-31",
    dueDate: "2026-04-30",
    discountDate: "2026-04-07",
    gross: 11300,
    net: 10000,
    tax: 1300,
    remainingGross,
    remainingNet: 0,
    remainingTax: 0,
    status: options.status ?? "open",
    revision: 1,
  };
  return tradeInvoiceDetailSchema.parse({
    actions: options.actions ?? [],
    settlements: options.settlements ?? [],
    document: {
      documentId,
      side,
      party: "V1",
      externalNo: "INV-1",
      externalNoNormalized: "INV-1",
      currency: "CNY",
      accountingDate: "2026-03-31",
      documentDate: "2026-03-30",
      taxDate: "2026-03-29",
      dueDate: "2026-04-30",
      discountDate: "2026-04-07",
      orderId,
      poMatch: orderId ? "matched" : "notApplicable",
      exceptionReason: null,
      net: 10000,
      tax: 1300,
      gross: 11300,
      journalId,
      receiptKey: uuid(4),
      fingerprint,
      commandHash: fingerprint,
      postedAt: "2026-03-31T00:00:00.000Z",
      controlAccount: "2100",
      controlDimensions: {},
      lines: [
        {
          lineId: "L1",
          lineNo: 1,
          product: "RENT",
          account: "5000",
          taxCode: "VAT",
          taxRateId: "VAT13",
          ratePercent: "13",
          quantity: "10",
          unitPrice: "10",
          discountPercent: "0",
          taxableCharge: "0",
          net: 10000,
          tax: 1300,
          gross: 11300,
          deductibleTax: 1300,
          orderId,
          orderLineId: orderId ? "OL1" : null,
          expectedNet: orderId ? 10000 : null,
          matchStatus: orderId ? "matched" : "notApplicable",
        },
      ],
    },
    calculation: {
      ...amounts,
      algorithm: "trade-v1-half-up-largest-remainder",
      currency: "CNY",
      scale: 2,
      priceMode: "exclusive",
      rounding: "line",
      lines: [
        {
          ...amounts,
          id: "L1",
          taxCode: "VAT",
          treatment: "standard",
          roundingSource: {
            lineIndex: 0,
            group: ["VAT", "standard", "13", "100"],
            exactTaxNumerator: "1300",
            exactTaxDenominator: "1",
            lineRoundedTax: 1300,
            adjustment: 0,
          },
        },
      ],
    },
    matches: [],
    receipt: {
      company: "DEFAULT",
      documentId,
      idempotencyKey: uuid(5),
      fingerprint,
      sourceRef: `TRADE:${documentId}`,
      journalIds: [journalId],
      poMatch: orderId ? "matched" : "notApplicable",
      gross: 11300,
      postedAt: "2026-03-31T00:00:00.000Z",
    },
    openItem: item,
  });
}
const allocation = (id: string, gross: number, cash: number, discount: number) => ({
  itemId: id,
  revision: 1,
  gross,
  net: gross,
  tax: 0,
  discount,
  cash,
  discountAvailable: discount > 0,
  discountDate: "2026-04-07",
  settledGross: gross,
  remainingGross: 0,
  remainingNet: 0,
  remainingTax: 0,
});
const settlement = (n: number, postedAt: string, allocations: ReturnType<typeof allocation>[]) => ({
  gross: allocations.reduce((sum, row) => sum + row.gross, 0),
  cash: allocations.reduce((sum, row) => sum + row.cash, 0),
  discount: allocations.reduce((sum, row) => sum + row.discount, 0),
  allocations,
  company: "DEFAULT",
  paymentId: uuid(100 + n),
  idempotencyKey: uuid(200 + n),
  fingerprint,
  sourceRef: `PAY-${n}`,
  journalIds: [uuid(300 + n)],
  postedAt,
});
const action = (
  n: number,
  kind: "credit" | "reverse",
  gross: number,
  postedAt: string,
): TradeInvoiceDetailDto["actions"][number] => {
  const after = detail().openItem;
  const header = {
    company: "DEFAULT",
    actionId: uuid(400 + n),
    accountingDate: "2026-04-10",
    documentDate: "2026-04-10",
    taxDate: "2026-04-10",
  };
  return {
    command:
      kind === "credit"
        ? {
            ...header,
            kind,
            invoiceId: documentId,
            revision: 1,
            lines: [{ sourceLineId: "L1", quantity: "1" }],
          }
        : {
            ...header,
            kind,
            settlementId: uuid(101),
            reason: "wrong payment",
            items: [{ itemId, revision: 1 }],
          },
    commandHash: fingerprint,
    receipt: {
      fingerprint,
      kind,
      gross,
      changes: [{ before: null, after }],
      creditLines: [],
      links: [],
      company: "DEFAULT",
      actionId: header.actionId,
      idempotencyKey: uuid(500 + n),
      sourceRef: `ACT-${n}`,
      journalIds: [uuid(600 + n)],
      postedAt,
    },
  };
};
const row = (value: TradeInvoiceDetailDto) => ({
  documentId,
  side: value.document.side,
  party: "V1",
  externalNo: "INV-1",
  accountingDate: "2026-03-31",
  documentDate: "2026-03-31",
  dueDate: "2026-04-30",
  poMatch: value.document.poMatch,
  gross: 11300,
  currency: "CNY",
  journalId,
  orderId: value.document.orderId,
  cursor: "1",
});

const detailPath = `/api/v1/trade/invoices/${documentId}?company=DEFAULT`;
type Reply = (call: number) => Response | Promise<Response>;
// `pages: 2` serves a second list page (INV-2) behind Load more.
function serve(value: TradeInvoiceDetailDto, reply?: Reply, pages: 1 | 2 = 1) {
  let detailCalls = 0;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path) => {
    const url = String(path);
    if (url.startsWith("/api/v1/companies"))
      return response({ items: [company], nextCursor: null });
    if (url === detailPath) {
      detailCalls += 1;
      return reply ? reply(detailCalls) : response(value);
    }
    if (url.startsWith("/api/v1/trade/invoices?"))
      return pages === 2 && url.includes("&cursor=1")
        ? response({
            items: [{ ...row(value), documentId: uuid(900), externalNo: "INV-2", cursor: "2" }],
            nextCursor: null,
          })
        : response({ items: [row(value)], nextCursor: pages === 2 ? "1" : null });
    return response({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    detailCalls: () => fetchMock.mock.calls.filter(([path]) => String(path) === detailPath).length,
    listCalls: () =>
      fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/v1/trade/invoices?"))
        .length,
  };
}
const trigger = () =>
  screen.findByRole<HTMLButtonElement>("button", { name: `${d("tinv.detail.open")} INV-1` });
const dialogTitle = `${d("tinv.detail.title")} · INV-1`;
async function open() {
  const button = await trigger();
  button.focus();
  fireEvent.click(button);
  return screen.findByRole("dialog", { name: dialogTitle });
}
const money = (minor: number) => (minor / 100).toFixed(2);

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterAll(() => {
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
beforeEach(() => window.history.replaceState(null, "", "/#/trade-invoices"));
afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("TINV-06 invoice detail dialog", () => {
  it("AP invoice with a source order: header, the 9 line columns in order, totals, source order as plain text", async () => {
    serve(detail());
    render(<App />);
    const button = await trigger();
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.textContent).toBe("INV-1");
    const dialog = await open();
    const header = await within(dialog).findByRole("region", { name: d("tinv.detail.header") });
    const fact = (key: Parameters<typeof t>[0]) =>
      within(header).getByText(t(key)).nextElementSibling?.textContent;
    expect(fact("tinv.side")).toBe(t("trade.AP"));
    expect(fact("tinv.party")).toBe("V1");
    expect(fact("tinv.externalInvoice")).toBe("INV-1");
    expect(fact("tinv.accountingDate")).toBe("2026-03-31");
    expect(fact("tinv.documentDate")).toBe("2026-03-30");
    expect(fact("tinv.taxDate")).toBe("2026-03-29");
    expect(fact("tinv.dueDate")).toBe("2026-04-30");
    expect(
      within(header).getByText(d("tinv.detail.currency")).nextElementSibling?.textContent,
    ).toBe("CNY");
    expect(fact("tinv.controlAccount")).toBe("2100");
    expect(fact("tinv.poMatch")).toBe(t("tinv.matched"));
    expect(fact("tinv.sourceOrder")).toBe("PO-1");
    expect(within(header).queryByText(t("tinv.exceptionReason"))).toBeNull();
    expect(dialog.querySelector("a")).toBeNull();

    const lines = within(dialog).getByRole("table", { name: t("tinv.lines") });
    expect(
      within(lines)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual([
      d("tinv.detail.lineNo"),
      t("tinv.product"),
      t("tinv.quantity"),
      t("tinv.unitPrice"),
      t("tinv.discountPercent"),
      t("tinv.net"),
      t("tinv.tax"),
      t("tinv.gross"),
      d("tinv.detail.matchStatus"),
    ]);
    expect(
      within(lines)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual([
      "1",
      "RENT",
      "10",
      "10",
      "0",
      money(10000),
      money(1300),
      money(11300),
      t("tinv.matched"),
    ]);
    const totals = within(dialog).getByRole("region", { name: d("tinv.detail.totals") });
    expect(within(totals).getByText(t("tinv.gross")).nextElementSibling?.textContent).toBe(
      money(11300),
    );
  });

  it("AR invoice without a source order shows the no-source-order text and empty record states", async () => {
    serve(detail({ side: "AR", orderId: null }));
    render(<App />);
    const dialog = await open();
    const header = await within(dialog).findByRole("region", { name: d("tinv.detail.header") });
    expect(within(header).getByText(t("tinv.side")).nextElementSibling?.textContent).toBe(
      t("trade.AR"),
    );
    expect(within(header).getByText(t("tinv.sourceOrder")).nextElementSibling?.textContent).toBe(
      t("tinv.noSourceOrder"),
    );
    expect(dialog.querySelector("a")).toBeNull();
    expect(within(dialog).getByText(d("tinv.detail.noSettlements"))).toBeTruthy();
    expect(within(dialog).getByText(d("tinv.detail.noActions"))).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /POST|过账/u })).toBeNull();
  });

  it("partial settlement: open balance is openItem.remainingGross and records show this invoice's allocation", async () => {
    serve(
      detail({
        remainingGross: 6300,
        settlements: [
          settlement(1, "2026-04-05T08:00:00.000Z", [
            allocation(uuid(77), 9000, 9000, 0),
            allocation(itemId, 5000, 4900, 100),
          ]),
        ],
      }),
    );
    render(<App />);
    const dialog = await open();
    const item = await within(dialog).findByRole("region", { name: d("tinv.detail.openItem") });
    expect(within(item).getByText(t("tadj.status")).nextElementSibling?.textContent).toBe(
      t("tadj.open"),
    );
    expect(within(item).getByText(d("tinv.detail.remaining")).nextElementSibling?.textContent).toBe(
      money(6300),
    );
    const records = within(dialog).getByRole("table", { name: d("tinv.detail.settlements") });
    expect(
      within(records)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["2026-04-05", "PAY-1", money(5000), money(4900), money(100)]);
  });

  it("credit and reverse actions list date, kind, amount and source reference by postedAt", async () => {
    serve(
      detail({
        actions: [
          action(2, "reverse", 5000, "2026-04-12T00:00:00.000Z"),
          action(1, "credit", 1130, "2026-04-10T00:00:00.000Z"),
        ],
      }),
    );
    render(<App />);
    const dialog = await open();
    const records = await within(dialog).findByRole("table", { name: d("tinv.detail.actions") });
    expect(
      within(records)
        .getAllByRole("row")
        .slice(1)
        .map((tr) =>
          within(tr)
            .getAllByRole("cell")
            .map((td) => td.textContent),
        ),
    ).toEqual([
      ["2026-04-10", t("tadj.credit"), money(1130), "ACT-1"],
      ["2026-04-12", t("tadj.reverse"), money(5000), "ACT-2"],
    ]);
  });

  it("404 shows notFound; 500 shows the error and Retry re-sends the same request", async () => {
    serve(detail(), () => error(404, "NOT_FOUND"));
    const { unmount } = render(<App />);
    let dialog = await open();
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      d("tinv.detail.notFound"),
    );
    expect(within(dialog).queryByRole("button", { name: t("master.retry") })).toBeNull();
    unmount();

    const value = detail();
    const served = serve(value, (call) => (call === 1 ? error(500, "INTERNAL") : response(value)));
    render(<App />);
    dialog = await open();
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      d("tinv.detail.error"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: t("master.retry") }));
    expect(await within(dialog).findByRole("table", { name: t("tinv.lines") })).toBeTruthy();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(served.detailCalls()).toBe(2);
  });

  it("can be closed while loading", async () => {
    serve(detail(), () => new Promise<Response>(() => {}));
    render(<App />);
    const dialog = await open();
    expect(within(dialog).getByRole("status").textContent).toBe(d("tinv.detail.loading"));
    fireEvent.click(within(dialog).getByRole("button", { name: d("tinv.detail.close") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(await trigger());
  });

  it("keyboard: focus moves into the dialog, Tab / Shift+Tab cycle, Esc returns focus; no history change or confirm", async () => {
    serve(detail());
    const confirm = vi.spyOn(window, "confirm");
    render(<App />);
    const button = await trigger();
    const length = window.history.length;
    const dialog = await open();
    // TINV-07: the open invoice is in the address (replace, no history entry).
    expect(window.location.hash).toBe(`#/trade-invoices?company=DEFAULT&invoice=${documentId}`);
    expect(document.activeElement).toBe(dialog);
    await within(dialog).findByRole("table", { name: t("tinv.lines") });
    const close = within(dialog).getByRole("button", { name: d("tinv.detail.close") });
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>("button:not(:disabled),[tabindex='0']"),
    );
    // The lines' scroll region is a Tab stop inside the dialog (keyboard sideways scroll at 390).
    const region = within(dialog).getByRole("region", { name: t("tinv.lines") });
    expect(region.tabIndex).toBe(0);
    expect(focusables).toEqual([close, region]);
    const last = focusables.at(-1) as HTMLElement;
    expect(last).toBe(region);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
    expect(window.history.length).toBe(length);
    expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("closing keeps the filter values, loaded pages and the draft; each open fetches once", async () => {
    const served = serve(detail(), undefined, 2);
    const confirm = vi.spyOn(window, "confirm");
    render(<App />);
    await trigger();
    fireEvent.click(screen.getByRole("button", { name: t("master.loadMore") }));
    const second = `${d("tinv.detail.open")} INV-2`;
    expect(await screen.findByRole("button", { name: second })).toBeTruthy();
    const pageCalls = served.fetchMock.mock.calls.filter(([path]) =>
      String(path).includes("&cursor=1"),
    );
    expect(pageCalls).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(t("tinv.filter.party")), { target: { value: "V9" } });
    fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
    const draftKey = "erp.tradeInvoices.v1.DEFAULT";
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).not.toBeNull());
    const draft = window.sessionStorage.getItem(draftKey);
    const lists = served.listCalls();

    let dialog = await open();
    await within(dialog).findByRole("table", { name: t("tinv.lines") });
    expect(served.detailCalls()).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: d("tinv.detail.close") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    dialog = await open();
    await within(dialog).findByRole("table", { name: t("tinv.lines") });
    expect(served.detailCalls()).toBe(2);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(screen.getByLabelText<HTMLInputElement>(t("tinv.filter.party")).value).toBe("V9");
    // Both loaded pages are still on screen and neither was fetched again.
    expect(screen.getByRole("button", { name: `${d("tinv.detail.open")} INV-1` })).toBeTruthy();
    expect(screen.getByRole("button", { name: second })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("master.loadMore") })).toBeNull();
    expect(served.listCalls()).toBe(lists);
    expect(window.sessionStorage.getItem(draftKey)).toBe(draft);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("teaching mode on shows the posting note with the journal and control account; off renders none (en)", async () => {
    window.localStorage.setItem(
      preferenceStorageKey,
      JSON.stringify({ language: "en", theme: "green", teaching: true }),
    );
    serve(detail());
    const { unmount } = render(<App />);
    const en = (key: Parameters<typeof t>[0]) => label("en", key);
    let button = await screen.findByRole("button", {
      name: `${detailLabel("en", "tinv.detail.open")} INV-1`,
    });
    fireEvent.click(button);
    let dialog = await screen.findByRole("dialog", {
      name: `${detailLabel("en", "tinv.detail.title")} · INV-1`,
    });
    await within(dialog).findByRole("table", { name: en("tinv.lines") });
    const tip = within(dialog).getByRole("complementary", { name: en("master.teachingTitle") });
    expect(tip.textContent).toContain(
      `${detailLabel("en", "tinv.detail.teachingPosting")} ${journalId}`,
    );
    expect(tip.textContent).toContain(`${detailLabel("en", "tinv.detail.teachingControl")} 2100`);
    expect(tip.textContent).toContain(detailLabel("en", "tinv.detail.teachingSettle"));
    unmount();

    window.localStorage.setItem(
      preferenceStorageKey,
      JSON.stringify({ language: "en", theme: "green", teaching: false }),
    );
    render(<App />);
    button = await screen.findByRole("button", {
      name: `${detailLabel("en", "tinv.detail.open")} INV-1`,
    });
    fireEvent.click(button);
    dialog = await screen.findByRole("dialog", {
      name: `${detailLabel("en", "tinv.detail.title")} · INV-1`,
    });
    await within(dialog).findByRole("table", { name: en("tinv.lines") });
    expect(within(dialog).queryByRole("complementary")).toBeNull();
    await act(async () => {});
  });
});

// TINV-07 (S12 decisions 1–10, D370): the open invoice and the applied filters live in the
// address. Every write is a replace from a user action; mounting writes nothing except the
// existing `fromOrder` removal. One case per row P1–P19, then A5 and A6.
describe("TINV-07 invoice links in the address", () => {
  const at = (search: string) =>
    window.history.replaceState(null, "", `/#/trade-invoices${search}`);
  const acme = { ...company, code: "ACME", name: "Acme" };
  // Address writes (a replace with a URL); the router's own state-only replace is not one.
  const countWrites = () => {
    const spy = vi.spyOn(window.history, "replaceState");
    return () => spy.mock.calls.filter(([, , url]) => typeof url === "string" && url).length;
  };
  const query = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  type Route = (url: string) => Response | Promise<Response> | undefined;
  function setUp(options: { route?: Route; reply?: Reply; companies?: (typeof company)[] } = {}) {
    const served = serve(detail(), options.reply);
    const fallback = served.fetchMock.getMockImplementation() as typeof fetch;
    served.fetchMock.mockImplementation(async (path, init) => {
      const url = String(path);
      const routed = options.route?.(url);
      if (routed) return routed;
      if (url.startsWith("/api/v1/companies") && options.companies)
        return response({ items: options.companies, nextCursor: null });
      return fallback(path, init);
    });
    const calls = () => served.fetchMock.mock.calls.map(([path]) => String(path));
    return {
      ...served,
      lists: () => calls().filter((url) => url.startsWith("/api/v1/trade/invoices?")),
      details: () => calls().filter((url) => /^\/api\/v1\/trade\/invoices\/[^?]/.test(url)),
      calls,
    };
  }
  const base = "/api/v1/trade/invoices?company=DEFAULT&limit=100";
  const scroller = () => screen.getByRole("region", { name: t("tinv.list") });
  const close = async (dialog: HTMLElement) => {
    fireEvent.click(within(dialog).getByRole("button", { name: d("tinv.detail.close") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  };
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

  it("A1: ?invoice= opens the detail on load with one request; closing drops it and focuses the row's button", async () => {
    const served = setUp();
    const confirm = vi.spyOn(window, "confirm");
    at(`?company=DEFAULT&invoice=${documentId}`);
    const writes = countWrites();
    const length = window.history.length;
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: dialogTitle });
    await within(dialog).findByRole("table", { name: t("tinv.lines") });
    await trigger();
    await settle();
    expect(served.detailCalls()).toBe(1);
    expect(writes()).toBe(0);
    await close(dialog);
    expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
    expect(writes()).toBe(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: `${d("tinv.detail.open")} INV-1` }),
      ),
    );
    expect(window.history.length).toBe(length);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("A1: an invoice outside the loaded rows takes its title from the response; closing focuses the list", async () => {
    const other = uuid(777);
    const value = detail();
    setUp({
      route: (url) =>
        url === `/api/v1/trade/invoices/${other}?company=DEFAULT`
          ? response({
              ...value,
              document: { ...value.document, documentId: other, externalNo: "INV-77" },
            })
          : undefined,
    });
    at(`?company=DEFAULT&invoice=${other}`);
    render(<App />);
    const dialog = await screen.findByRole("dialog", {
      name: `${d("tinv.detail.title")} · INV-77`,
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(scroller()));
  });

  it.each([
    ["missing", `?invoice=${documentId}`],
    ["empty", `?company=&invoice=${documentId}`],
  ])("P1: company %s uses the current company and writes nothing on mount", async (_, search) => {
    const served = setUp();
    at(search);
    const writes = countWrites();
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: dialogTitle });
    expect(served.calls()).toContain(detailPath);
    await settle();
    expect(writes()).toBe(0);
    await close(dialog);
    expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
  });

  it("P2: an unknown company with a link renders no draft or list and sends nothing; Back drops the link once", async () => {
    const served = setUp();
    at(`?company=NOPE&party=V1&invoice=${documentId}`);
    const writes = countWrites();
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(`${d("tinv.link.company")} · NOPE`);
    expect(alert.className).toContain("danger");
    expect(screen.queryByLabelText(t("tinv.party"))).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await settle();
    expect(served.lists()).toEqual([]);
    expect(served.details()).toEqual([]);
    expect(writes()).toBe(0);
    fireEvent.click(within(alert).getByRole("button", { name: d("tinv.link.back") }));
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices"));
    expect(writes()).toBe(1);
    expect(document.activeElement?.id).toBe("tinv-company");
    await trigger();
    expect(served.lists()).toEqual([base]);
    expect(served.details()).toEqual([]);
  });

  it("P3: an unknown company without a link falls back to the first company as before", async () => {
    const served = setUp();
    at("?company=NOPE");
    const writes = countWrites();
    render(<App />);
    await trigger();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(served.lists()).toEqual([base]);
    expect(writes()).toBe(0);
  });

  it("P4: an unknown company with fromOrder and a link: fromOrder dropped once, one alert, nothing sent; cancel drops the link once and never takes the order again", async () => {
    const served = setUp();
    at(`?company=NOPE&fromOrder=PO-1&side=AP&invoice=${documentId}`);
    const writes = countWrites();
    render(<App />);
    const alert = await screen.findByRole("alert");
    await waitFor(() =>
      expect(window.location.hash).toBe(
        `#/trade-invoices?company=NOPE&side=AP&invoice=${documentId}`,
      ),
    );
    await settle();
    expect(writes()).toBe(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert.textContent).toContain(`${t("tinv.fromOrder.company")} · NOPE`);
    expect(screen.queryByLabelText(t("tinv.party"))).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(served.lists()).toEqual([]);
    expect(served.details()).toEqual([]);
    fireEvent.click(within(alert).getByRole("button", { name: t("master.cancel") }));
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices"));
    expect(await screen.findByLabelText(t("tinv.party"))).toBeTruthy();
    await settle();
    expect(writes()).toBe(2);
    expect((screen.getByLabelText(t("tinv.party")) as HTMLInputElement).value).toBe("");
    expect(served.calls().some((url) => url.includes("/invoicing"))).toBe(false);
    expect(served.details()).toEqual([]);
  });

  it.each([
    ["empty", ""],
    ["blank", "%20%20"],
  ])(
    "P5: an %s invoice opens nothing, is kept on mount and dropped by the next write",
    async (_, value) => {
      const served = setUp();
      at(`?company=DEFAULT&invoice=${value}&side=AP`);
      const writes = countWrites();
      render(<App />);
      await trigger();
      await settle();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(served.details()).toEqual([]);
      expect(writes()).toBe(0);
      fireEvent.change(screen.getByLabelText(t("tinv.filter.side")), { target: { value: "AR" } });
      fireEvent.click(screen.getByRole("button", { name: t("tinv.filter.apply") }));
      await waitFor(() =>
        expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT&side=AR"),
      );
    },
  );

  it.each([
    ["abc", "abc"],
    ["35 characters", documentId.slice(1)],
    ["a g", `${documentId.slice(0, -1)}g`],
  ])(
    "P6: a malformed invoice (%s) shows not found without a request; Close focuses the list",
    async (_, id) => {
      const served = setUp();
      at(`?company=DEFAULT&invoice=${id}`);
      render(<App />);
      const dialog = await screen.findByRole("dialog", { name: d("tinv.detail.title") });
      expect(within(dialog).getByText(d("tinv.detail.notFound"))).toBeTruthy();
      expect(within(dialog).queryByText(d("tinv.detail.loading"))).toBeNull();
      expect(within(dialog).queryByRole("button", { name: t("master.retry") })).toBeNull();
      await trigger();
      await close(dialog);
      expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
      await waitFor(() => expect(document.activeElement).toBe(scroller()));
      expect(served.details()).toEqual([]);
    },
  );

  it("P7: an unknown invoice (404) shows not found once with no retry; Close focuses the list", async () => {
    const missing = uuid(404);
    const served = setUp({
      route: (url) =>
        url === `/api/v1/trade/invoices/${missing}?company=DEFAULT`
          ? error(404, "NOT_FOUND")
          : undefined,
    });
    at(`?company=DEFAULT&invoice=${missing}`);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: d("tinv.detail.title") });
    expect(await within(dialog).findByText(d("tinv.detail.notFound"))).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: t("master.retry") })).toBeNull();
    expect(served.details()).toEqual([`/api/v1/trade/invoices/${missing}?company=DEFAULT`]);
    await trigger();
    await close(dialog);
    expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
    await waitFor(() => expect(document.activeElement).toBe(scroller()));
  });

  it("P8: another company's invoice is not found in the linked company; nothing switches companies", async () => {
    const served = setUp({
      companies: [company, acme],
      route: (url) =>
        url.startsWith("/api/v1/trade/invoices?company=ACME")
          ? response({ items: [], nextCursor: null })
          : url === `/api/v1/trade/invoices/${documentId}?company=ACME`
            ? error(404, "NOT_FOUND")
            : undefined,
    });
    at(`?company=ACME&invoice=${documentId}`);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: d("tinv.detail.title") });
    expect(await within(dialog).findByText(d("tinv.detail.notFound"))).toBeTruthy();
    expect((screen.getByLabelText(t("master.company")) as HTMLSelectElement).value).toBe("ACME");
    expect(served.details()).toEqual([`/api/v1/trade/invoices/${documentId}?company=ACME`]);
    await close(dialog);
    expect(window.location.hash).toBe("#/trade-invoices?company=ACME");
  });

  it.each([
    ["403", () => error(403, "FORBIDDEN")],
    ["500", () => error(500, "INTERNAL")],
    ["503", () => error(503, "UNAVAILABLE")],
    ["network", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("P9: a %s failure shows the error with Retry, which reads again", async (_, fail) => {
    const served = serve(detail(), (call) => (call === 1 ? fail() : response(detail())));
    at(`?company=DEFAULT&invoice=${documentId}`);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: dialogTitle });
    expect(await within(dialog).findByText(d("tinv.detail.error"), { exact: false })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: t("master.retry") }));
    await within(dialog).findByRole("table", { name: t("tinv.lines") });
    expect(served.detailCalls()).toBe(2);
  });

  it("P10: when companies fail to load the dialog waits; Retry loads them and opens it", async () => {
    let failed = false;
    const served = setUp({
      route: (url) => {
        if (!url.startsWith("/api/v1/companies") || failed) return undefined;
        failed = true;
        return error(500, "INTERNAL");
      },
    });
    at(`?company=DEFAULT&invoice=${documentId}`);
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(served.details()).toEqual([]);
    fireEvent.click(within(alert).getByRole("button", { name: t("master.retry") }));
    await screen.findByRole("dialog", { name: dialogTitle });
    expect(served.detailCalls()).toBe(1);
  });

  const orderInvoicing: TradeOrderInvoicingDto = {
    order: {
      orderId: "PO-1",
      side: "AR",
      party: "C1",
      currency: "CNY",
      orderDate: "2026-01-10",
      priceIncludesTax: true,
      rounding: "document",
      commandHash: fingerprint,
      recordedAt: "2026-01-10T00:00:00.000Z",
      lines: [
        {
          lineId: "OL1",
          lineNo: 1,
          product: "P-OL1",
          taxCode: "VAT13",
          quantity: "10",
          unitPrice: "12.5",
          discountPercent: "2",
          taxableCharge: "0.75",
          net: 100,
          tax: 13,
          gross: 113,
        },
      ],
    },
    invoiced: [{ lineId: "OL1", invoicedQuantity: "0" }],
  };
  it.each([
    ["given", "company=DEFAULT&"],
    ["missing", ""],
  ])(
    "P11: fromOrder with an invoice (company %s): fromOrder dropped once, the draft filled and the detail open; Close drops only invoice",
    async (_, prefix) => {
      const served = setUp({
        route: (url) =>
          url === "/api/v1/trade/orders/PO-1/invoicing?company=DEFAULT"
            ? response(orderInvoicing)
            : undefined,
      });
      at(`?${prefix}fromOrder=PO-1&side=AP&invoice=${documentId}`);
      const writes = countWrites();
      render(<App />);
      const dialog = await screen.findByRole("dialog", { name: dialogTitle });
      await waitFor(() =>
        expect(window.location.hash).toBe(
          `#/trade-invoices?${prefix}side=AP&invoice=${documentId}`,
        ),
      );
      await waitFor(() =>
        expect((screen.getByLabelText(t("tinv.party")) as HTMLInputElement).value).toBe("C1"),
      );
      await settle();
      expect(writes()).toBe(1);
      expect(served.detailCalls()).toBe(1);
      await close(dialog);
      expect(Object.fromEntries(query())).toEqual({ company: "DEFAULT", side: "AP" });
      expect(writes()).toBe(2);
    },
  );

  it("P12: empty filter values count as not given", async () => {
    const served = setUp();
    at("?company=DEFAULT&party=&side=AP&from=&to=");
    const writes = countWrites();
    render(<App />);
    await trigger();
    await settle();
    expect(served.lists()).toEqual([`${base}&side=AP`]);
    expect(screen.queryByText(d("tinv.filter.linkInvalid"))).toBeNull();
    expect(writes()).toBe(0);
  });

  it.each([
    ["P13 party lower case", "party=v1"],
    ["P13 party with a space", "party=V%201"],
    ["P13 party with surrounding blanks", "party=%20V1%20"],
    ["P13 party over 60 characters", `party=${"A".repeat(61)}`],
    ["P13 party starting with _", "party=_V1"],
    ["P14 side XX", "side=XX&party=V1"],
    ["P14 side ap", "side=ap"],
    ["P15 from 2026-02-30", "from=2026-02-30"],
    ["P15 from 2026-13-01", "from=2026-13-01"],
    ["P15 to 2026-2-1", "to=2026-2-1"],
    ["P15 from with a time", "from=2026-01-01T00:00"],
    ["P16 from after to", "from=2026-06-30&to=2026-01-01"],
  ])(
    "%s: the whole filter set is ignored with a warning; Clear drops the four keys once",
    async (_, search) => {
      const served = setUp();
      at(`?company=DEFAULT&${search}&zzz=1`);
      const writes = countWrites();
      render(<App />);
      await trigger();
      expect(served.lists()).toEqual([base]);
      const warning = await screen.findByText(d("tinv.filter.linkInvalid"));
      expect(
        ["party", "side", "from", "to"].map(
          (key) => (document.getElementById(`tinv-filter-${key}`) as HTMLInputElement).value,
        ),
      ).toEqual(["", "", "", ""]);
      await settle();
      expect(writes()).toBe(0);
      const bar = warning.closest("[role=status]") as HTMLElement;
      fireEvent.click(within(bar).getByRole("button", { name: t("tinv.filter.clear") }));
      await waitFor(() =>
        expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT&zzz=1"),
      );
      expect(writes()).toBe(1);
      expect(screen.queryByText(d("tinv.filter.linkInvalid"))).toBeNull();
      expect(served.calls().some((url) => url.includes("tinv") || url.includes("=XX"))).toBe(false);
    },
  );

  it("P17: repeated keys use the first value on mount; the next write sets every managed key once and keeps unknown keys", async () => {
    const served = setUp();
    at(
      `?company=DEFAULT&company=ACME&side=AP&side=AR&invoice=${documentId}&invoice=${uuid(9)}&x=1&x=2`,
    );
    const writes = countWrites();
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: dialogTitle });
    await trigger();
    await settle();
    expect(served.lists()).toEqual([`${base}&side=AP`]);
    expect(served.details()).toEqual([detailPath]);
    expect(writes()).toBe(0);
    await close(dialog);
    const after = query();
    expect(after.getAll("company")).toEqual(["DEFAULT"]);
    expect(after.getAll("side")).toEqual(["AP"]);
    expect(after.has("invoice")).toBe(false);
    expect(after.getAll("x")).toEqual(["1", "2"]);
  });

  it("A3 + P18: filters in the address are applied on load and shown; an unknown party is an empty filtered page", async () => {
    const served = setUp({
      route: (url) =>
        url.includes("party=NOPARTY") ? response({ items: [], nextCursor: null }) : undefined,
    });
    at("?company=DEFAULT&party=NOPARTY&side=AP&from=2026-01-01&to=2026-06-30");
    const writes = countWrites();
    render(<App />);
    expect(await screen.findByText(t("tinv.filter.none"))).toBeTruthy();
    expect(served.lists()).toEqual([`${base}&party=NOPARTY&side=AP&from=2026-01-01&to=2026-06-30`]);
    expect(
      ["party", "side", "from", "to"].map(
        (key) => (document.getElementById(`tinv-filter-${key}`) as HTMLInputElement).value,
      ),
    ).toEqual(["NOPARTY", "AP", "2026-01-01", "2026-06-30"]);
    expect(writes()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: t("tinv.filter.clear") }));
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT"));
    await trigger();
  });

  it("P19: cursor, limit and unknown keys are neither read nor removed", async () => {
    const served = setUp();
    at("?company=DEFAULT&cursor=5&limit=7&zzz=1&side=AP");
    const writes = countWrites();
    render(<App />);
    await trigger();
    await settle();
    expect(served.lists()).toEqual([`${base}&side=AP`]);
    expect(writes()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: t("tinv.filter.clear") }));
    await waitFor(() =>
      expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT&cursor=5&limit=7&zzz=1"),
    );
  });

  it("A5: switching company keeps only the new company and unknown keys, closes the detail, adds no entry and asks nothing", async () => {
    setUp({
      companies: [company, acme],
      route: (url) =>
        url.startsWith("/api/v1/trade/invoices?company=ACME")
          ? response({ items: [], nextCursor: null })
          : undefined,
    });
    const confirm = vi.spyOn(window, "confirm");
    at(`?company=DEFAULT&side=AP&zzz=1&invoice=${documentId}`);
    const length = window.history.length;
    render(<App />);
    await screen.findByRole("dialog", { name: dialogTitle });
    fireEvent.change(screen.getByLabelText(t("master.company")), { target: { value: "ACME" } });
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices?company=ACME&zzz=1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.history.length).toBe(length);
    expect(confirm).not.toHaveBeenCalled();
  });

  const draftKey = "erp.tradeInvoices.v1.DEFAULT";
  async function dirty() {
    fireEvent.change(await screen.findByLabelText(t("tinv.party")), { target: { value: "V1" } });
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).not.toBeNull());
    return window.sessionStorage.getItem(draftKey);
  }

  it("A6a: with a dirty draft, opening, closing, applying, clearing and switching company only replace: no confirmation, same draft, same history length", async () => {
    setUp({
      companies: [company, acme],
      route: (url) =>
        url.startsWith("/api/v1/trade/invoices?company=ACME")
          ? response({ items: [], nextCursor: null })
          : undefined,
    });
    const confirm = vi.spyOn(window, "confirm");
    render(<App />);
    const draft = await dirty();
    const length = window.history.length;
    const push = vi.spyOn(window.history, "pushState");
    const writes = countWrites();
    fireEvent.change(screen.getByLabelText(t("tinv.filter.side")), { target: { value: "AP" } });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.filter.apply") }));
    await waitFor(() =>
      expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT&side=AP"),
    );
    const dialog = await open();
    expect(window.location.hash).toBe(
      `#/trade-invoices?company=DEFAULT&side=AP&invoice=${documentId}`,
    );
    await close(dialog);
    fireEvent.click(screen.getByRole("button", { name: t("tinv.filter.clear") }));
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT"));
    fireEvent.change(screen.getByLabelText(t("master.company")), { target: { value: "ACME" } });
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices?company=ACME"));
    await settle();
    expect(writes()).toBe(5);
    expect(push).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
    expect(window.sessionStorage.getItem(draftKey)).toBe(draft);
  });

  it("A6b: a cancelled sidebar click keeps everything and the forward history; a cancelled Back restores the latest address and truncates it; a confirmed Back leaves", async () => {
    setUp();
    const confirm = vi.spyOn(window, "confirm");
    const go = vi.spyOn(window.history, "go");
    window.history.replaceState(null, "", "/#/trade-orders");
    window.history.pushState(null, "", "/#/trade-invoices");
    window.history.pushState(null, "", "/#/trade-reports");
    render(<App />);
    await act(async () => window.history.back());
    await waitFor(() => expect(window.location.hash).toBe("#/trade-invoices"));
    const draft = await dirty();
    fireEvent.change(screen.getByLabelText(t("tinv.filter.side")), { target: { value: "AP" } });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.filter.apply") }));
    await open();
    const here = window.location.href;
    expect(here).toContain(`side=AP&invoice=${documentId}`);
    const length = window.history.length;

    // Sidebar click, cancelled: no traversal, the entry ahead is still there.
    confirm.mockReturnValueOnce(false);
    const nav = document.querySelector<HTMLAnchorElement>('nav a[href="#/trade-reports"]');
    if (!nav) throw new Error("no sidebar link");
    fireEvent.click(nav);
    expect(confirm).toHaveBeenCalledTimes(1);
    await settle();
    expect(window.location.href).toBe(here);
    expect(window.history.length).toBe(length);
    expect(screen.getByRole("dialog", { name: dialogTitle })).toBeTruthy();
    expect(window.sessionStorage.getItem(draftKey)).toBe(draft);

    // Back, cancelled (D275): the latest address returns and the entries ahead are gone.
    confirm.mockReturnValueOnce(false);
    await act(async () => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    await settle();
    expect(window.location.href).toBe(here);
    expect(screen.getByRole("dialog", { name: dialogTitle })).toBeTruthy();
    expect(window.sessionStorage.getItem(draftKey)).toBe(draft);
    await act(async () => window.history.forward());
    await settle();
    expect(window.location.href).toBe(here);
    expect(confirm).toHaveBeenCalledTimes(2);

    // Back, confirmed: the invoice page is left.
    confirm.mockReturnValueOnce(true);
    await act(async () => window.history.back());
    await waitFor(() => expect(window.location.hash).toBe("#/trade-orders"));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(go).not.toHaveBeenCalled();
  });
});

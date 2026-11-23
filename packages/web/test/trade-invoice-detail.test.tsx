import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TradeInvoiceDetailDto } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { formatDecimal } from "../src/decimal-format.ts";
import type { Tone } from "../src/ui/components/index.tsx";
import { label, preferenceStorageKey, type Language } from "../src/ui/index.ts";
import { detailLabel } from "../src/ui/trade-invoice-detail-labels.ts";
import {
  d,
  detail,
  documentId,
  error,
  fingerprint,
  itemId,
  journalId,
  open,
  response,
  serve,
  setUpInvoicePageTests,
  t,
  trigger,
  uuid,
} from "./support/trade-invoice-fixtures.ts";

// TINV-07 (address links and filters) lives in trade-invoice-links.test.tsx.
setUpInvoicePageTests();

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
const money = (minor: number) => (minor / 100).toFixed(2);

// TINV-08: a status is a Badge: `.badge.<tone>`, an aria-hidden symbol first, then the label.
const visibleText = (element: Element) => {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent;
};
function expectBadge(container: Element | null | undefined, tone: Tone, text: string) {
  const badge = container?.querySelector(".badge");
  expect(badge?.classList.contains(tone)).toBe(true);
  expect(badge?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  expect(badge && visibleText(badge)).toBe(text);
}

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
    expectBadge(
      within(header).getByText(t("tinv.poMatch")).nextElementSibling,
      "success",
      t("tinv.matched"),
    );
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
    const cells = within(lines).getAllByRole("cell");
    expect(cells.slice(0, -1).map((td) => td.textContent)).toEqual([
      "1",
      "RENT",
      "10",
      "10",
      "0",
      money(10000),
      money(1300),
      money(11300),
    ]);
    expectBadge(cells.at(-1), "success", t("tinv.matched"));
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
    expectBadge(
      within(item).getByText(t("tadj.status")).nextElementSibling,
      "warning",
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

type PoMatch = TradeInvoiceDetailDto["document"]["poMatch"];
function withPoMatch(value: TradeInvoiceDetailDto, poMatch: PoMatch): TradeInvoiceDetailDto {
  const exceptionReason = poMatch === "exception" ? "price variance" : null;
  const lines = value.document.lines.map((line) => ({ ...line, matchStatus: poMatch }));
  return { ...value, document: { ...value.document, poMatch, exceptionReason, lines } };
}
function storePreferences(language: Language) {
  window.localStorage.setItem(
    preferenceStorageKey,
    JSON.stringify({ language, theme: language === "zh" ? "red" : "green", teaching: false }),
  );
}
const tabStops = (container: Element) =>
  Array.from(container.querySelectorAll("a[href],button:not(:disabled),[tabindex='0']"));

const badgeCases = [
  { language: "zh", poMatch: "matched", status: "open", poTone: "success", statusTone: "warning" },
  {
    language: "en",
    poMatch: "exception",
    status: "settled",
    poTone: "warning",
    statusTone: "success",
  },
  {
    language: "zh",
    poMatch: "notApplicable",
    status: "cancelled",
    poTone: "info",
    statusTone: "info",
  },
] as const;

describe("TINV-08 status badges", () => {
  it.each(badgeCases)(
    "$language: $poMatch / $status are badges in the list, header, lines and open item; Tab stops unchanged",
    async ({ language, poMatch, status, poTone, statusTone }) => {
      storePreferences(language);
      const orderId = poMatch === "notApplicable" ? null : "PO-1";
      serve(withPoMatch(detail({ orderId, status }), poMatch));
      render(<App />);
      const tl = (key: Parameters<typeof t>[0]) => label(language, key);
      const poText = tl(`tinv.${poMatch}`);
      const trigger = await screen.findByRole("button", {
        name: `${detailLabel(language, "tinv.detail.open")} INV-1`,
      });
      const list = screen.getByRole("table", { name: tl("tinv.list") });
      const column = within(list)
        .getAllByRole("columnheader")
        .findIndex((th) => th.textContent === tl("tinv.poMatch"));
      const row = trigger.closest("tr") as HTMLTableRowElement;
      expectBadge(within(row).getAllByRole("cell")[column], poTone, poText);
      expect(tabStops(row)).toEqual(orderId ? [trigger, within(row).getByRole("link")] : [trigger]);

      fireEvent.click(trigger);
      const dialog = await screen.findByRole("dialog");
      const header = await within(dialog).findByRole("region", {
        name: detailLabel(language, "tinv.detail.header"),
      });
      expectBadge(within(header).getByText(tl("tinv.poMatch")).nextElementSibling, poTone, poText);
      const lines = within(dialog).getByRole("table", { name: tl("tinv.lines") });
      expectBadge(within(lines).getAllByRole("cell").at(-1), poTone, poText);
      const item = within(dialog).getByRole("region", {
        name: detailLabel(language, "tinv.detail.openItem"),
      });
      const statusCell = within(item).getByText(tl("tadj.status")).nextElementSibling;
      expectBadge(statusCell, statusTone, tl(`tadj.${status}`));
      // The open balance stays the last value of the open item (read by tests:trade-e2e).
      expect(Array.from(item.querySelectorAll("dd")).at(-1)?.querySelector(".badge")).toBeNull();
      const close = within(dialog).getByRole("button", {
        name: detailLabel(language, "tinv.detail.close"),
      });
      expect(tabStops(dialog)).toEqual([
        close,
        within(dialog).getByRole("region", { name: tl("tinv.lines") }),
      ]);
    },
  );
});

describe("TINV-08 large invoice display", () => {
  it("large invoice: totals use the totals modifier with money text only; lines group quantity and unit price", async () => {
    const value = detail();
    const [line] = value.document.lines;
    if (!line) throw new Error("fixture has one line");
    const totals = { net: 109_255_565_500, tax: 14_203_223_512, gross: 123_458_789_012 };
    serve({
      ...value,
      document: {
        ...value.document,
        ...totals,
        lines: [
          { ...line, ...totals, quantity: "1234.5", unitPrice: "88501.25", discountPercent: "0" },
        ],
      },
    });
    render(<App />);
    const dialog = await open();
    const lines = await within(dialog).findByRole("table", { name: t("tinv.lines") });
    const [, , quantity, unitPrice, discount] = within(lines).getAllByRole("cell");
    expect(quantity?.textContent).toBe(formatDecimal("1234.5", "zh"));
    expect(unitPrice?.textContent).toBe(formatDecimal("88501.25", "zh"));
    expect(discount?.textContent).toBe("0");
    const region = within(dialog).getByRole("region", { name: d("tinv.detail.totals") });
    expect(region.querySelector("dl")?.className).toBe("tinv-facts tinv-totals");
    // innerHTML: each total is plain money text, no badge or other markup (tests:trade-e2e reads it).
    expect(Array.from(region.querySelectorAll("dd")).map((dd) => dd.innerHTML)).toEqual([
      `${formatDecimal("1092555655", "zh")}.00`,
      `${formatDecimal("142032235", "zh")}.12`,
      `${formatDecimal("1234587890", "zh")}.12`,
    ]);
  });
});

describe("formatDecimal", () => {
  const separator = (language: Language) => new Intl.NumberFormat(language).format(1000).charAt(1);

  it.each(["zh", "en"] as const)(
    "groups the integer part by %s and keeps the fraction as written",
    (language) => {
      const s = separator(language);
      expect(formatDecimal("1234567.5", language)).toBe(`1${s}234${s}567.5`);
      expect(formatDecimal("999999999999.999999", language)).toBe(
        `999${s}999${s}999${s}999.999999`,
      );
      for (const plain of ["0.000001", "0", "12"])
        expect(formatDecimal(plain, language)).toBe(plain);
    },
  );

  it.each(["1e3", "", "-1", "01", "1."])("returns %j unchanged", (invalid) => {
    expect(formatDecimal(invalid, "en")).toBe(invalid);
  });
});

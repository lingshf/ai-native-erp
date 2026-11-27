import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TradeOrderInvoicingDto } from "@erp/core/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import { App } from "../src/App.tsx";
import { TradeInvoices } from "../src/TradeInvoices.tsx";
import { defaultPreferences } from "../src/ui/preferences.ts";
import {
  company,
  d,
  detail,
  detailPath,
  dialogTitle,
  documentId,
  error,
  fingerprint,
  open,
  type Reply,
  response,
  serve,
  setUpInvoicePageTests,
  t,
  trigger,
  uuid,
} from "./support/trade-invoice-fixtures.ts";

// TINV-07 (S12 decisions 1–10, D370): the open invoice and the applied filters live in the
// address. Every write is a replace from a user action; mounting writes nothing except the
// existing `fromOrder` removal. One case per row P1–P19 and A1–A6, grouped by responsibility:
// the invoice link, the company and fromOrder entry, company list failures, filters, and
// leaving or history.
setUpInvoicePageTests();

const at = (search: string) => window.history.replaceState(null, "", `/#/trade-invoices${search}`);
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
// The page over a company list already in the cache: "fresh" is what the App holds after a
// visit (no refetch on mount), "stale" refetches on mount while the cached rows stay visible.
async function renderCached(cache: "fresh" | "stale", rows: (typeof company)[] = [company]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  client.setQueryData(["companies"], {
    pages: [{ items: rows, nextCursor: null }],
    pageParams: [""],
  });
  if (cache === "stale")
    await client.invalidateQueries({ queryKey: ["companies"], refetchType: "none" });
  render(
    <QueryClientProvider client={client}>
      <HashRouter>
        <TradeInvoices preferences={defaultPreferences} />
      </HashRouter>
    </QueryClientProvider>,
  );
}

describe("TINV-07 invoice link: opening, closing and values that open nothing", () => {
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
    ["with surrounding blanks", `%20${documentId}%20`],
    ["breaking a CSS selector", "x%22%5D%5B"],
    ["36 dashes", "-".repeat(36)],
    ["all zero", "00000000-0000-0000-0000-000000000000"],
    ["version not 4", "00000000-0000-1000-8000-000000000001"],
    ["variant not 8/9/a/b", "00000000-0000-4000-c000-000000000001"],
    ["upper case", "0000000A-000B-4000-8000-00000000000C"],
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
});

describe("TINV-07 company in the link and the fromOrder entry", () => {
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

  it.each([
    {
      name: "with a link, companies loading",
      search: `?company=NOPE&fromOrder=PO-1&side=AP&invoice=${documentId}`,
      kept: `?company=NOPE&side=AP&invoice=${documentId}`,
      cache: null,
    },
    {
      name: "with a link, companies cached",
      search: `?company=NOPE&fromOrder=PO-1&side=AP&invoice=${documentId}`,
      kept: `?company=NOPE&side=AP&invoice=${documentId}`,
      cache: "fresh",
    },
    // Only fromOrder: the intake effect runs after the first render, so the gate must hold before it.
    {
      name: "only fromOrder, companies cached",
      search: "?company=NOPE&fromOrder=PO-1",
      kept: "?company=NOPE",
      cache: "fresh",
    },
  ] as const)(
    "P4: an unknown company with fromOrder ($name): fromOrder dropped once, one alert, the default company never mounts and nothing is sent; cancel drops the link once and never takes the order again",
    async ({ search, kept, cache }) => {
      const served = setUp();
      at(search);
      const writes = countWrites();
      // Record whether the draft ever mounted, even for a single frame.
      let drafted = false;
      const watcher = new MutationObserver(() => {
        if (document.getElementById("tinv-party")) drafted = true;
      });
      watcher.observe(document.body, { childList: true, subtree: true });
      if (cache) await renderCached(cache);
      else render(<App />);
      const alert = await screen.findByRole("alert");
      await waitFor(() => expect(window.location.hash).toBe(`#/trade-invoices${kept}`));
      await settle();
      watcher.disconnect();
      expect(drafted).toBe(false);
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
    },
  );

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
    invoiced: [{ lineId: "OL1", invoicedQuantity: "0", creditedQuantity: "0" }],
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
});

describe("TINV-07 company list failures and the cached company list", () => {
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

  it("P10: a failed company reload with rows still cached never opens the link in another company; Retry resolves it", async () => {
    let failed = false;
    const served = setUp({
      route: (url) => {
        if (url.startsWith("/api/v1/companies")) {
          if (failed) return response({ items: [company, acme], nextCursor: null });
          failed = true;
          return error(500, "INTERNAL");
        }
        if (url.startsWith("/api/v1/trade/invoices?company=ACME"))
          return response({ items: [], nextCursor: null });
        if (url === `/api/v1/trade/invoices/${documentId}?company=ACME`) return response(detail());
        return undefined;
      },
    });
    // The cache holds only DEFAULT and is stale, so mounting refetches; that refetch fails and
    // React Query keeps the cached rows (status error, data still present).
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["companies"], {
      pages: [{ items: [company], nextCursor: null }],
      pageParams: [""],
    });
    await client.invalidateQueries({ queryKey: ["companies"], refetchType: "none" });
    at(`?company=ACME&invoice=${documentId}`);
    render(
      <QueryClientProvider client={client}>
        <HashRouter>
          <TradeInvoices preferences={defaultPreferences} />
        </HashRouter>
      </QueryClientProvider>,
    );
    const alert = await screen.findByRole("alert");
    await settle();
    expect(within(alert).getByRole("button", { name: t("master.retry") })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText(t("tinv.party"))).toBeNull();
    expect(served.lists()).toEqual([]);
    expect(served.details()).toEqual([]);
    fireEvent.click(within(alert).getByRole("button", { name: t("master.retry") }));
    await screen.findByRole("dialog", { name: dialogTitle });
    expect((screen.getByLabelText(t("master.company")) as HTMLSelectElement).value).toBe("ACME");
    expect(served.details()).toEqual([`/api/v1/trade/invoices/${documentId}?company=ACME`]);
    expect(served.lists().every((url) => url.includes("company=ACME"))).toBe(true);
  });

  it.each([
    ["the linked company", `?company=DEFAULT&invoice=${documentId}`],
    ["the implicit default company", `?invoice=${documentId}`],
    ["the default company behind a filter link", "?side=AP"],
  ])(
    "P10: a failed company reload with %s still cached shows the error, mounts nothing and opens nothing; Retry opens it",
    async (_, search) => {
      let failed = false;
      const served = setUp({
        route: (url) => {
          if (!url.startsWith("/api/v1/companies") || failed) return undefined;
          failed = true;
          return error(500, "INTERNAL");
        },
      });
      at(search);
      await renderCached("stale");
      const alert = await screen.findByRole("alert");
      await settle();
      expect(within(alert).getByRole("button", { name: t("master.retry") })).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByLabelText(t("tinv.party"))).toBeNull();
      expect(served.lists()).toEqual([]);
      expect(served.details()).toEqual([]);
      fireEvent.click(within(alert).getByRole("button", { name: t("master.retry") }));
      expect(await screen.findByLabelText(t("tinv.party"))).toBeTruthy();
      if (search.includes("invoice=")) {
        await screen.findByRole("dialog", { name: dialogTitle });
        expect(served.details()).toEqual([detailPath]);
      } else {
        await waitFor(() => expect(served.lists()).toEqual([`${base}&side=AP`]));
      }
    },
  );
});

describe("TINV-07 filters in the address", () => {
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
});

describe("TINV-07 company switch, leave confirmation and history", () => {
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

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeInvoiceConfirmSchema,
  tradeInvoiceCommandSchema,
  type TradeInvoicePreviewDto,
  type TradeOrderInvoicingDto,
} from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";

const company = {
  code: "DEFAULT",
  name: "Company",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const fingerprint = "a".repeat(64);
const line = (account: string, debit: number, credit: number) => ({
  account,
  debit,
  credit,
  dimensions: {},
  dimensionOrigins: {},
  role: "business",
  suspense: null,
  historical: null,
  balancing: null,
  group: null,
});
const amounts = {
  net: 10000,
  tax: 1300,
  gross: 11300,
  deductibleTax: 1300,
  nonDeductibleTax: 0,
  expense: 10000,
  cashDiscountBase: 11300,
};
const preview = (documentId: string): TradeInvoicePreviewDto =>
  ({
    fingerprint,
    side: "AP",
    externalNoNormalized: "INV-1",
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
    poMatch: "matched",
    matches: [
      {
        lineId: "L1",
        orderLineId: "OL1",
        orderQuantity: "10",
        previouslyInvoiced: "0",
        quantity: "10",
        expectedNet: 10000,
        invoiceNet: 10000,
        variance: 0,
        withinTolerance: true,
      },
    ],
    dueDate: "2026-04-30",
    discountDate: "2026-04-07",
    controlAccount: "2100",
    journal: {
      version: 1,
      company: "DEFAULT",
      currency: "CNY",
      scale: 2,
      draftId: documentId,
      draftRevision: 1,
      sourceRef: `TRADE:${documentId}`,
      date: "2026-03-31",
      documentDate: "2026-03-31",
      taxDate: "2026-03-31",
      module: "TRADE",
      memo: "AP V1 INV-1",
      operation: "journal",
      originalId: null,
      journals: [
        {
          kind: "normal",
          role: "normal",
          debit: 11300,
          credit: 11300,
          lines: [line("5000", 10000, 0), line("1400", 1300, 0), line("2100", 0, 11300)],
        },
      ],
    },
  }) as TradeInvoicePreviewDto;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);

beforeEach(() => window.history.replaceState(null, "", "/#/trade-invoices"));
afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});
describe("trade invoices", () => {
  it("previews the calculation breakdown, blocks stale posting and retries an uncertain post with the same key", async () => {
    const posts: unknown[] = [];
    let confirmCalls = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url === "/api/v1/trade/invoices/preview") {
        const command = tradeInvoiceCommandSchema.parse(JSON.parse(String(init?.body)));
        if (command.lines[0]?.unitPrice === "11")
          return response(
            {
              code: "INVALID_REQUEST",
              messageKey: "api.error.invalidInput",
              params: {},
              fieldErrors: [
                { path: "lines.0.unitPrice", messageKey: "api.error.tradeDocument.price" },
              ],
              requestId: "00000000-0000-4000-8000-000000000001",
              retryable: false,
            },
            400,
          );
        return response(preview(command.documentId));
      }
      if (url === "/api/v1/trade/invoices" && init?.method === "POST") {
        const body = tradeInvoiceConfirmSchema.parse(JSON.parse(String(init.body)));
        posts.push(body);
        confirmCalls += 1;
        if (confirmCalls === 1) throw new TypeError("network down");
        return response(
          {
            company: "DEFAULT",
            documentId: body.command.documentId,
            idempotencyKey: body.idempotencyKey,
            fingerprint: body.fingerprint,
            sourceRef: `TRADE:${body.command.documentId}`,
            journalIds: [body.command.documentId],
            poMatch: "matched",
            gross: 11300,
            postedAt: "2026-03-31T00:00:00.000Z",
          },
          201,
        );
      }
      if (url.startsWith("/api/v1/trade/invoices?"))
        return response({ items: [], nextCursor: null });
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.change(await screen.findByLabelText(t("tinv.party")), { target: { value: "V1" } });
    fireEvent.change(screen.getByLabelText(t("tinv.externalInvoice")), {
      target: { value: "inv-1" },
    });
    fireEvent.change(screen.getByLabelText(t("tinv.orderId")), { target: { value: "PO-1" } });
    fireEvent.change(screen.getByLabelText(`${t("tinv.product")} L1`), {
      target: { value: "RENT" },
    });
    fireEvent.change(screen.getByLabelText(`${t("tinv.quantity")} L1`), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(`${t("tinv.unitPrice")} L1`), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByLabelText(`${t("tinv.orderLineId")} L1`), {
      target: { value: "OL1" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    expect(await screen.findByText(`${t("tinv.issue.price")} (lines.0.unitPrice)`)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: t("tinv.confirm") }).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText(`${t("tinv.unitPrice")} L1`), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    const breakdown = await screen.findByRole("region", { name: t("tinv.previewTitle") });
    expect(within(breakdown).getAllByText("113.00").length).toBeGreaterThan(0);
    expect(within(breakdown).getByText("2026-04-30")).toBeTruthy();
    expect(within(breakdown).getByText(t("tinv.matched"))).toBeTruthy();
    expect(within(breakdown).getAllByText("2100")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "N", altKey: true, shiftKey: true });
    expect(screen.getByLabelText(`${t("tinv.product")} L2`)).toBeTruthy();
    expect(screen.getByText(t("tinv.stale"))).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: t("tinv.confirm") }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: `${t("tinv.removeLine")} L2` }));
    expect(screen.queryByText(t("tinv.stale"))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("tinv.confirm") }));
    fireEvent.click(await screen.findByRole("button", { name: t("tinv.retryConfirm") }));
    expect(await screen.findByText(new RegExp(t("tinv.posted")))).toBeTruthy();
    expect(posts).toHaveLength(2);
    const [first, second] = posts.map((post) => tradeInvoiceConfirmSchema.parse(post));
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.command).toEqual(first?.command);
    expect(first?.command).toMatchObject({
      side: "AP",
      party: "V1",
      externalInvoice: "inv-1",
      orderId: "PO-1",
      currency: "CNY",
      matchingException: null,
      lines: [
        { product: "RENT", quantity: "10", unitPrice: "10", taxCode: null, orderLineId: "OL1" },
      ],
    });
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>(t("tinv.party")).value).toBe(""),
    );
    expect(
      fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/v1/trade/invoices?"))
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps drafts per company and the uncertain post envelope across company switches and leaving the page", async () => {
    const other = { ...company, code: "C2", name: "Other" };
    const posts: unknown[] = [];
    const gate: { release?: (value: Response) => void } = {};
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company, other], nextCursor: null });
      if (url === "/api/v1/trade/invoices/preview") {
        const command = tradeInvoiceCommandSchema.parse(JSON.parse(String(init?.body)));
        return response(preview(command.documentId));
      }
      if (url === "/api/v1/trade/invoices" && init?.method === "POST") {
        const body = tradeInvoiceConfirmSchema.parse(JSON.parse(String(init.body)));
        posts.push(body);
        if (posts.length === 1)
          return new Promise<Response>((resolve) => {
            gate.release = resolve;
          });
        return response(
          {
            company: "DEFAULT",
            documentId: body.command.documentId,
            idempotencyKey: body.idempotencyKey,
            fingerprint: body.fingerprint,
            sourceRef: `TRADE:${body.command.documentId}`,
            journalIds: [body.command.documentId],
            poMatch: "matched",
            gross: 11300,
            postedAt: "2026-03-31T00:00:00.000Z",
          },
          201,
        );
      }
      if (url.startsWith("/api/v1/trade/invoices?"))
        return response({ items: [], nextCursor: null });
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    const select = await screen.findByLabelText<HTMLSelectElement>(t("master.company"));
    await waitFor(() => expect(select.options).toHaveLength(2));
    fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
    fireEvent.change(select, { target: { value: "C2" } });
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>(t("tinv.party")).value).toBe(""),
    );
    fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "C-OTHER" } });
    fireEvent.change(select, { target: { value: "DEFAULT" } });
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>(t("tinv.party")).value).toBe("V1"),
    );
    fireEvent.click(screen.getByRole("link", { name: t("trade.title") }));
    expect(window.location.hash).toBe("#/trade");
    fireEvent.click(screen.getByRole("link", { name: t("tinv.title") }));
    expect((await screen.findByLabelText<HTMLInputElement>(t("tinv.party"))).value).toBe("V1");

    fireEvent.change(screen.getByLabelText(t("tinv.externalInvoice")), {
      target: { value: "inv-1" },
    });
    for (const [field, value] of [
      ["product", "RENT"],
      ["quantity", "10"],
      ["unitPrice", "10"],
    ] as const)
      fireEvent.change(screen.getByLabelText(`${t(`tinv.${field}`)} L1`), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await screen.findByRole("region", { name: t("tinv.previewTitle") });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.confirm") }));
    await waitFor(() => expect(posts).toHaveLength(1));
    // While the post is in flight the company and route cannot change.
    expect(screen.getByLabelText<HTMLSelectElement>(t("master.company")).disabled).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: t("trade.title") }));
    expect(window.location.hash).toBe("#/trade-invoices");
    gate.release?.(response({}, 503));
    expect(await screen.findByText(t("tinv.uncertain"))).toBeTruthy();
    // Leaving is allowed again once the page reports the post is no longer in flight.
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLSelectElement>(t("master.company")).disabled).toBe(false),
    );

    fireEvent.click(screen.getByRole("link", { name: t("trade.title") }));
    expect(window.location.hash).toBe("#/trade");
    fireEvent.click(screen.getByRole("link", { name: t("tinv.title") }));
    expect(await screen.findByText(t("tinv.uncertain"))).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t("master.company")), { target: { value: "C2" } });
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>(t("tinv.party")).value).toBe("C-OTHER"),
    );
    fireEvent.change(screen.getByLabelText(t("master.company")), {
      target: { value: "DEFAULT" },
    });
    fireEvent.click(await screen.findByRole("button", { name: t("tinv.retryConfirm") }));
    expect(await screen.findByText(new RegExp(t("tinv.posted")))).toBeTruthy();
    const [first, second] = posts.map((post) => tradeInvoiceConfirmSchema.parse(post));
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(second?.fingerprint).toBe(first?.fingerprint);
    expect(second?.command).toEqual(first?.command);
    expect(window.sessionStorage.getItem("erp.tradeInvoices.v1.DEFAULT")).toBeNull();
    expect(window.sessionStorage.getItem("erp.tradeInvoices.v1.C2")).not.toBeNull();
  });

  it("does not send a post when the original envelope cannot be stored first", async () => {
    const posts: unknown[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url === "/api/v1/trade/invoices/preview") {
        const command = tradeInvoiceCommandSchema.parse(JSON.parse(String(init?.body)));
        return response(preview(command.documentId));
      }
      if (url === "/api/v1/trade/invoices" && init?.method === "POST") {
        const body = tradeInvoiceConfirmSchema.parse(JSON.parse(String(init.body)));
        posts.push(body);
        expect(
          JSON.parse(window.sessionStorage.getItem("erp.tradeInvoices.v1.DEFAULT") ?? "null"),
        ).toMatchObject({
          pending: {
            command: body.command,
            fingerprint: body.fingerprint,
            key: body.idempotencyKey,
          },
        });
        return response({}, 503);
      }
      if (url.startsWith("/api/v1/trade/invoices?"))
        return response({ items: [], nextCursor: null });
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    fireEvent.change(await screen.findByLabelText(t("tinv.party")), { target: { value: "V1" } });
    fireEvent.change(screen.getByLabelText(t("tinv.externalInvoice")), {
      target: { value: "inv-1" },
    });
    for (const [field, value] of [
      ["product", "RENT"],
      ["quantity", "10"],
      ["unitPrice", "10"],
    ] as const)
      fireEvent.change(screen.getByLabelText(`${t(`tinv.${field}`)} L1`), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await screen.findByRole("region", { name: t("tinv.previewTitle") });
    const quota = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Fictional quota", "QuotaExceededError");
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: t("tinv.confirm") }));
      expect(await screen.findByText(t("tinv.storageFailed"))).toBeTruthy();
      expect(posts).toHaveLength(0);
      expect(screen.queryByRole("button", { name: t("tinv.retryConfirm") })).toBeNull();
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: t("tinv.confirm") }).disabled,
      ).toBe(false);
    } finally {
      quota.mockRestore();
    }
    fireEvent.click(screen.getByRole("button", { name: t("tinv.confirm") }));
    expect(await screen.findByText(t("tinv.uncertain"))).toBeTruthy();
    expect(posts).toHaveLength(1);
  });

  it("shows the add-line shortcut in kbd without changing the button's accessible name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path) => {
        const url = String(path);
        if (url.startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (url.startsWith("/api/v1/trade/invoices?"))
          return response({ items: [], nextCursor: null });
        return response({}, 404);
      }),
    );
    render(<App />);
    await screen.findByLabelText(t("tinv.party"));
    const add = screen.getByRole("button", { name: t("tinv.addLine") });
    expect(add.getAttribute("aria-label")).toBeNull();
    expect(add.getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+N");
    expect(add.querySelector("kbd")?.textContent).toBe("Alt+Shift+N");
    expect(add.querySelector("kbd")?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(t("tinv.addLine")).not.toContain("Alt+Shift+N");
    fireEvent.click(add);
    expect(screen.getByLabelText(`${t("tinv.product")} L2`)).toBeTruthy();
  });
});

describe("trade invoices from an order (TINV-01)", () => {
  const orderLine = (lineId: string, lineNo: number, quantity: string) => ({
    lineId,
    lineNo,
    product: `P-${lineId}`,
    taxCode: "VAT13",
    quantity,
    unitPrice: "12.5",
    discountPercent: "2",
    taxableCharge: "0.75",
    net: 100,
    tax: 13,
    gross: 113,
  });
  const invoicing = (invoiced: [string, string, string]): TradeOrderInvoicingDto => ({
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
      lines: [orderLine("OL1", 1, "10"), orderLine("OL2", 2, "2"), orderLine("OL3", 3, "1.5")],
    },
    invoiced: [
      { lineId: "OL1", invoicedQuantity: invoiced[0] },
      { lineId: "OL2", invoicedQuantity: invoiced[1] },
      { lineId: "OL3", invoicedQuantity: invoiced[2] },
    ],
  });
  const invoicingPath = "/api/v1/trade/orders/PO-1/invoicing?company=DEFAULT";
  const notFound = {
    code: "NOT_FOUND",
    messageKey: "api.error.notFound",
    params: {},
    fieldErrors: [],
    requestId: "00000000-0000-4000-8000-000000000001",
    retryable: false,
  };
  const mockApi = (
    invoicingResponse: () => Response | Promise<Response>,
    posts: unknown[] = [],
  ) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url === invoicingPath) return invoicingResponse();
      if (url === "/api/v1/trade/invoices/preview") {
        const command = tradeInvoiceCommandSchema.parse(JSON.parse(String(init?.body)));
        return response(preview(command.documentId));
      }
      if (url === "/api/v1/trade/invoices" && init?.method === "POST") {
        const body = tradeInvoiceConfirmSchema.parse(JSON.parse(String(init.body)));
        posts.push(body);
        return response(
          {
            company: "DEFAULT",
            documentId: body.command.documentId,
            idempotencyKey: body.idempotencyKey,
            fingerprint: body.fingerprint,
            sourceRef: `TRADE:${body.command.documentId}`,
            journalIds: [body.command.documentId],
            poMatch: "matched",
            gross: 11300,
            postedAt: "2026-03-31T00:00:00.000Z",
          },
          201,
        );
      }
      if (url.startsWith("/api/v1/trade/invoices?"))
        return response({ items: [], nextCursor: null });
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    return () => fetchMock.mock.calls.filter(([path]) => String(path) === invoicingPath).length;
  };
  const value = (name: string) => screen.getByLabelText<HTMLInputElement>(name).value;
  const enter = (orderId = "PO-1") =>
    window.history.replaceState(
      null,
      "",
      `/#/trade-invoices?company=DEFAULT&fromOrder=${encodeURIComponent(orderId)}`,
    );

  it("fills the header and uninvoiced lines once, drops fromOrder and posts by keyboard flow", async () => {
    const posts: unknown[] = [];
    const reads = mockApi(() => response(invoicing(["4", "2", "0"])), posts);
    enter();
    const view = render(<App />);
    expect(await screen.findByText(`${t("tinv.fromOrder.loaded")} · PO-1`)).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>(t("tinv.side")).value).toBe("AR");
    expect(value(t("tinv.party"))).toBe("C1");
    expect(value(t("tinv.orderId"))).toBe("PO-1");
    expect(value(t("tinv.externalInvoice"))).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>(t("tinv.priceIncludesTax")).checked).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>(t("tinv.rounding")).value).toBe("document");
    const filled = (lineId: string) =>
      lineFields.map((field) => value(`${t(`tinv.${field}`)} ${lineId}`));
    const lineFields = [
      "orderLineId",
      "product",
      "taxCode",
      "quantity",
      "unitPrice",
      "discountPercent",
      "taxableCharge",
    ] as const;
    expect(filled("L1")).toEqual(["OL1", "P-OL1", "VAT13", "6", "12.5", "2", "0.75"]);
    expect(filled("L2")).toEqual(["OL3", "P-OL3", "VAT13", "1.5", "12.5", "2", "0.75"]);
    expect(screen.queryByLabelText(`${t("tinv.product")} L3`)).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(t("tinv.externalInvoice"))),
    );
    expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
    expect(reads()).toBe(1);

    // A refresh keeps the user's edits and does not fill again.
    fireEvent.change(screen.getByLabelText(`${t("tinv.quantity")} L1`), { target: { value: "5" } });
    view.unmount();
    render(<App />);
    await waitFor(() => expect(value(`${t("tinv.quantity")} L1`)).toBe("5"));
    expect(screen.queryByText(`${t("tinv.fromOrder.loaded")} · PO-1`)).toBeNull();
    expect(reads()).toBe(1);

    // Enter in a header field submits the preview form; confirm is a focusable button.
    const external = screen.getByLabelText(t("tinv.externalInvoice"));
    fireEvent.change(external, { target: { value: "inv-9" } });
    fireEvent.submit(external.closest("form") as HTMLFormElement);
    await screen.findByRole("region", { name: t("tinv.previewTitle") });
    const confirm = screen.getByRole<HTMLButtonElement>("button", { name: t("tinv.confirm") });
    expect(confirm.disabled).toBe(false);
    confirm.focus();
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByText(new RegExp(t("tinv.posted")))).toBeTruthy();
    expect(tradeInvoiceConfirmSchema.parse(posts[0]).command).toMatchObject({
      side: "AR",
      party: "C1",
      externalInvoice: "inv-9",
      orderId: "PO-1",
      priceIncludesTax: true,
      rounding: "document",
      lines: [
        { lineId: "L1", orderLineId: "OL1", quantity: "5", taxCode: "VAT13" },
        { lineId: "L2", orderLineId: "OL3", quantity: "1.5", taxCode: "VAT13" },
      ],
    });
  });

  it("shows the order teaching note only with teaching mode on", async () => {
    window.localStorage.setItem(
      "erp.workspace.preferences.v1",
      JSON.stringify({ language: "zh", theme: "red", teaching: true }),
    );
    try {
      mockApi(() => response(invoicing(["0", "0", "0"])));
      enter();
      render(<App />);
      const tip = await screen.findByRole("complementary", { name: t("master.teachingTitle") });
      await waitFor(() => expect(tip.textContent).toContain(t("tinv.fromOrder.teaching")));
      expect(tip.textContent).toContain(t("tinv.teaching"));
      fireEvent.click(document.querySelector<HTMLInputElement>("#workspace-teaching")!);
      expect(screen.queryByText(t("tinv.fromOrder.teaching"))).toBeNull();
    } finally {
      window.localStorage.clear();
    }
  });

  it("reports a missing order, a fully invoiced order and a failed read without filling", async () => {
    mockApi(() => response(notFound, 404));
    enter();
    const missing = render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(`${t("tinv.fromOrder.notFound")} · PO-1`);
    expect(alert.className).toContain("danger");
    expect(value(t("tinv.party"))).toBe("");
    expect(value(t("tinv.orderId"))).toBe("");
    expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
    missing.unmount();

    mockApi(() => response(invoicing(["10", "2", "1.5"])));
    enter();
    const done = render(<App />);
    expect(await screen.findByText(`${t("tinv.fromOrder.fullyInvoiced")} · PO-1`)).toBeTruthy();
    expect(value(t("tinv.party"))).toBe("");
    expect(value(`${t("tinv.product")} L1`)).toBe("");
    done.unmount();

    let attempts = 0;
    const reads = mockApi(() => {
      attempts += 1;
      if (attempts === 1) return response({ ...notFound, code: "INVALID_REQUEST" }, 400);
      return attempts === 2 ? response({}, 503) : response(invoicing(["0", "2", "0"]));
    });
    enter();
    render(<App />);
    // A 400 without NOT_FOUND is a failed read, not a missing order, and stays retryable.
    expect(await screen.findByText(`${t("tinv.fromOrder.failed")} · PO-1`)).toBeTruthy();
    expect(screen.queryByText(`${t("tinv.fromOrder.notFound")} · PO-1`)).toBeNull();
    expect(value(t("tinv.party"))).toBe("");
    fireEvent.click(screen.getByRole("button", { name: t("master.retry") }));
    await waitFor(() => expect(reads()).toBe(2));
    expect(await screen.findByText(`${t("tinv.fromOrder.failed")} · PO-1`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("master.retry") }));
    expect(await screen.findByText(`${t("tinv.fromOrder.loaded")} · PO-1`)).toBeTruthy();
    expect(value(`${t("tinv.quantity")} L1`)).toBe("10");
    expect(value(`${t("tinv.orderLineId")} L2`)).toBe("OL3");
    expect(reads()).toBe(3);
  });

  it("reports a link company outside the loaded companies instead of filling another company", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = String(path);
      // ACME exists, but only on a later page that this page has not loaded.
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: "DEFAULT" });
      if (url.includes("/invoicing")) return response(invoicing(["0", "0", "0"]));
      if (url.startsWith("/api/v1/trade/invoices?"))
        return response({ items: [], nextCursor: null });
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const reads = () =>
      fetchMock.mock.calls.filter(([path]) => String(path).includes("/invoicing")).length;
    window.history.replaceState(null, "", "/#/trade-invoices?company=ACME&fromOrder=PO-1");
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(`${t("tinv.fromOrder.company")} · ACME`);
    expect(alert.className).toContain("danger");
    expect(window.location.hash).toBe("#/trade-invoices?company=ACME");
    expect(screen.queryByLabelText(t("tinv.party"))).toBeNull();
    // DEFAULT is already the selected (only) option, so the alert's own action is the way back.
    expect(value(t("master.company"))).toBe("DEFAULT");
    fireEvent.click(within(alert).getByRole("button", { name: t("tinv.fromOrder.manual") }));
    expect(await screen.findByLabelText(t("tinv.party"))).toBeTruthy();
    expect(value(t("tinv.party"))).toBe("");
    expect(screen.queryByText(`${t("tinv.fromOrder.company")} · ACME`)).toBeNull();
    expect(reads()).toBe(0);
  });
  it("asks before replacing an unsaved draft and keeps it when cancelled", async () => {
    const reads = mockApi(() => response(invoicing(["0", "0", "0"])));
    const view = render(<App />);
    fireEvent.change(await screen.findByLabelText(t("tinv.party")), { target: { value: "V7" } });
    fireEvent.change(screen.getByLabelText(`${t("tinv.product")} L1`), {
      target: { value: "RENT" },
    });
    view.unmount();
    const ask = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      enter();
      const kept = render(<App />);
      await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
      expect(ask).toHaveBeenCalledWith(t("tinv.fromOrder.replaceConfirm"));
      await waitFor(() => expect(value(t("tinv.party"))).toBe("V7"));
      expect(value(`${t("tinv.product")} L1`)).toBe("RENT");
      expect(value(t("tinv.orderId"))).toBe("");
      expect(window.location.hash).toBe("#/trade-invoices?company=DEFAULT");
      kept.unmount();

      enter();
      render(<App />);
      expect(await screen.findByText(`${t("tinv.fromOrder.loaded")} · PO-1`)).toBeTruthy();
      expect(ask).toHaveBeenCalledTimes(2);
      expect(value(t("tinv.party"))).toBe("C1");
      expect(value(`${t("tinv.product")} L1`)).toBe("P-OL1");
      expect(reads()).toBe(2);
    } finally {
      ask.mockRestore();
    }
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeInvoiceConfirmSchema,
  tradeInvoiceCommandSchema,
  type TradeInvoicePreviewDto,
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

import { fireEvent, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { tradeInvoiceDetailSchema, type TradeInvoiceDetailDto } from "@erp/core/contracts";
import { label, type LabelKey } from "../../src/ui/index.ts";
import {
  detailLabel,
  type TradeInvoiceDetailKey,
} from "../../src/ui/trade-invoice-detail-labels.ts";

// Shared by the TINV-06 detail dialog tests and the TINV-07 address tests: one invoice (INV-1),
// its detail response, and a fetch stub serving the company list, the invoice list and the detail.

export const company = {
  code: "DEFAULT",
  name: "Company",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const fingerprint = "a".repeat(64);
export const documentId = uuid(1);
export const itemId = uuid(2);
export const journalId = uuid(3);
export const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
export const d = (key: TradeInvoiceDetailKey) => detailLabel("zh", key);
export const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
export const error = (status: number, code: string) =>
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
export function detail(options: Options = {}): TradeInvoiceDetailDto {
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

export const row = (value: TradeInvoiceDetailDto) => ({
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

export const detailPath = `/api/v1/trade/invoices/${documentId}?company=DEFAULT`;
export type Reply = (call: number) => Response | Promise<Response>;
// `pages: 2` serves a second list page (INV-2) behind Load more.
export function serve(value: TradeInvoiceDetailDto, reply?: Reply, pages: 1 | 2 = 1) {
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
export const trigger = () =>
  screen.findByRole<HTMLButtonElement>("button", { name: `${d("tinv.detail.open")} INV-1` });
export const dialogTitle = `${d("tinv.detail.title")} · INV-1`;
export async function open() {
  const button = await trigger();
  button.focus();
  fireEvent.click(button);
  return screen.findByRole("dialog", { name: dialogTitle });
}

/**
 * jsdom has no modal `<dialog>`; every file starts on the invoice page and leaves a clean
 * address and session storage. Call once at the top level of each test file: with
 * `isolate: false` this module is evaluated once per worker, so hooks registered on import
 * would only reach the first file.
 */
export function setUpInvoicePageTests() {
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
}

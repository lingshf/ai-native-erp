import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";

const id = "00000000-0000-4000-8000-000000000001";
const journalId = "00000000-0000-4000-8000-000000000002";
const fingerprint = "a".repeat(64);
const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const reply = (value: unknown) => new Response(JSON.stringify(value));
const company = {
  code: "DEFAULT",
  name: "Fictional",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const selected = {
  kind: "invoice",
  side: "AP",
  documentId: id,
  party: "V1",
  currency: "CNY",
  externalNo: "INV-HISTORY",
  version: 1,
  currentVersion: 2,
  accountingDate: "2026-01-05",
  documentDate: "2026-01-05",
  dueDate: "2026-02-04",
  remainingNetMinor: 7254,
  remainingTaxMinor: 943,
  remainingGrossMinor: 8197,
  overdueDays: 0,
  ageingBucket: "notDue",
  controlAccount: "2100",
  sourceReference: `TRADE-AP-INV:${id}`,
  journalId,
};
const totals = {
  invoiceGrossMinor: 8197,
  notDue: 8197,
  overdue1_30: 0,
  overdue31_60: 0,
  overdue61_90: 0,
  overdue91Plus: 0,
  creditGrossMinor: 0,
  advanceGrossMinor: 0,
};
const report = {
  company: "DEFAULT",
  basis: "monthEnd",
  asOf: "2026-01-31",
  ageingDate: "2026-01-31",
  snapshot: fingerprint,
  items: [selected],
  totals,
  nextCursor: null,
};
const current = {
  kind: "invoice",
  itemId: id,
  side: "AP",
  party: "V1",
  externalNo: "INV-HISTORY",
  controlAccount: "2100",
  dimensions: {},
  segments: [{ dimensions: {}, gross: 8197, remainingGross: 4098 }],
  currency: "CNY",
  accountingDate: "2026-01-05",
  documentDate: "2026-01-05",
  dueDate: "2026-02-04",
  discountDate: "2026-01-12",
  discountPercent: "1.5",
  allowPartialDiscount: true,
  gross: 8197,
  net: 7254,
  tax: 943,
  remainingGross: 4098,
  remainingNet: 3627,
  remainingTax: 471,
  status: "open",
  revision: 2,
};
const document = {
  documentId: id,
  side: "AP",
  party: "V1",
  externalNo: "INV-HISTORY",
  externalNoNormalized: "INV-HISTORY",
  currency: "CNY",
  accountingDate: "2026-01-05",
  documentDate: "2026-01-05",
  taxDate: "2026-01-05",
  dueDate: "2026-02-04",
  discountDate: "2026-01-12",
  orderId: null,
  poMatch: "notApplicable",
  exceptionReason: null,
  net: 7254,
  tax: 943,
  gross: 8197,
  journalId,
  receiptKey: id,
  fingerprint,
  commandHash: fingerprint,
  postedAt: "2026-01-05T00:00:00.000Z",
  controlAccount: "2100",
  controlDimensions: {},
  lines: [
    {
      lineId: "L1",
      lineNo: 1,
      product: "SERVICE",
      account: "5000",
      taxCode: "VAT",
      taxRateId: "VAT13",
      ratePercent: "13",
      quantity: "1",
      unitPrice: "81.97",
      discountPercent: "0",
      taxableCharge: "0",
      net: 7254,
      tax: 943,
      gross: 8197,
      deductibleTax: 943,
      orderId: null,
      orderLineId: null,
      expectedNet: null,
      matchStatus: "notApplicable",
    },
  ],
};
function mockApi(held = false) {
  const reads: string[] = [];
  let release: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      reads.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/api/v1/companies")
        return reply({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/trade/reports/open-items") {
        if (held && url.searchParams.get("month") === "2026-02")
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return reply(report);
      }
      if (url.pathname === `/api/v1/trade/reports/open-items/${id}`)
        return reply({
          company: "DEFAULT",
          asOf: "2026-01-31",
          selected,
          current,
          document,
          originalDocumentId: null,
          actions: [],
          settlements: [],
        });
      if (url.pathname === "/api/v1/trade/reports/reconciliation")
        return reply({
          company: "DEFAULT",
          asOf: "2026-01-31",
          basis: "debitMinusCredit",
          scope: "companyAllParties",
          rows: [
            {
              account: "2100",
              subledgerMinor: -8197,
              tradeGlMinor: -7000,
              openingGlMinor: -1197,
              otherSourceMinor: -700,
              glMinor: -8897,
              tradeDifferenceMinor: 0,
              differenceMinor: -700,
            },
          ],
        });
      if (url.pathname === `/api/v1/journals/${journalId}`)
        return reply({
          chain: [],
          businessEventId: null,
          entry: {
            id: journalId,
            sourceRef: selected.sourceReference,
            date: "2026-01-05",
            documentDate: "2026-01-05",
            taxDate: "2026-01-05",
            module: "TRADE",
            memo: "Original fictional voucher",
            operation: "journal",
            postedAt: "2026-01-05T00:00:00.000Z",
            fingerprint,
            kind: "normal",
            role: "normal",
            debit: 8197,
            credit: 8197,
            lines: ["2100", "5000"].map((account, index) => ({
              account,
              debit: index ? 8197 : 0,
              credit: index ? 0 : 8197,
              dimensions: {},
              dimensionOrigins: {},
              role: "business",
              suspense: null,
              balancing: null,
              historical: null,
              group: null,
            })),
          },
        });
      if (["/api/v1/journals", "/api/v1/accounts", "/api/v1/dimensions"].includes(url.pathname))
        return reply({ items: [], nextCursor: null });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  return {
    reads,
    release: (response: Response) => {
      if (!release) throw new Error("Missing delayed response");
      release(response);
    },
  };
}
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/#/trade-reports?company=DEFAULT&month=2026-01");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
describe("trade historical reports", () => {
  it("drills an open item into its saved document and original voucher without AI sharing", async () => {
    const { reads } = mockApi();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "INV-HISTORY" }));
    const detail = await screen.findByRole("region", { name: t("trpt.detail") });
    expect(within(detail).getByRole("table", { name: t("trpt.document") }).textContent).toContain(
      "SERVICE",
    );
    expect(detail.textContent).toContain("81.97");
    expect(detail.textContent).toContain("40.98");
    fireEvent.click(within(detail).getByRole("link", { name: t("journal.title") }));
    await screen.findByText("Original fictional voucher");
    expect(window.location.hash).toContain(`id=${journalId}`);
    expect(reads.some((url) => url.startsWith("/api/v1/ai"))).toBe(false);
  });
  it("preserves filter input and preferences, and exposes other-source differences on the explicit company-wide reconciliation scope", async () => {
    const { reads } = mockApi();
    render(<App />);
    await screen.findByRole("button", { name: "INV-HISTORY" });
    fireEvent.change(screen.getByLabelText(t("trpt.party")), { target: { value: "V2" } });
    expect((screen.getByLabelText(t("master.company")) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "green" } });
    expect((screen.getByLabelText("Party filter") as HTMLInputElement).value).toBe("V2");
    const before = reads.length;
    fireEvent.click(screen.getByLabelText("Show teaching explanations"));
    expect(reads).toHaveLength(before);
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(reads.some((url) => url.includes("party=V2"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "GL reconciliation" }));
    const table = await screen.findByRole("table", { name: "GL reconciliation" });
    expect(table.textContent).toContain("-7.00");
    expect(within(table).getByRole("columnheader", { name: "Opening" })).toBeTruthy();
    expect(table.textContent).toContain("-11.97");
    expect(screen.getByText(/all company parties and AP\/AR/u)).toBeTruthy();
    expect(reads.find((url) => url.includes("/reconciliation"))).not.toContain("party=");
  });
  it("does not paint an abandoned month's delayed response over the current month", async () => {
    const api = mockApi(true);
    render(<App />);
    await screen.findByRole("button", { name: "INV-HISTORY" });
    fireEvent.change(screen.getByLabelText(t("trpt.month")), { target: { value: "2026-02" } });
    fireEvent.click(screen.getByRole("button", { name: t("trpt.apply") }));
    await waitFor(() => expect(api.reads.some((url) => url.includes("month=2026-02"))).toBe(true));
    fireEvent.change(screen.getByLabelText(t("trpt.month")), { target: { value: "2026-01" } });
    fireEvent.click(screen.getByRole("button", { name: t("trpt.apply") }));
    await screen.findByRole("button", { name: "INV-HISTORY" });
    await act(async () =>
      api.release(
        reply({
          ...report,
          asOf: "2026-02-28",
          items: [{ ...selected, externalNo: "LATE-FEBRUARY" }],
        }),
      ),
    );
    expect(screen.queryByText("LATE-FEBRUARY")).toBeNull();
    expect(screen.getByRole("button", { name: "INV-HISTORY" })).toBeTruthy();
  });
  it("marks the current view as pressed and renders the teaching tip only when teaching is on", async () => {
    mockApi();
    render(<App />);
    await screen.findByRole("button", { name: "INV-HISTORY" });
    const views = within(screen.getByRole("navigation", { name: t("trpt.title") }));
    const pressed = () =>
      (["openItems", "ageing", "reconciliation"] as const).map((key) =>
        views.getByRole("button", { name: t(`trpt.${key}`) }).getAttribute("aria-pressed"),
      );
    expect(pressed()).toEqual(["true", "false", "false"]);
    expect(screen.queryByRole("complementary", { name: "教学说明" })).toBeNull();
    expect(screen.getByText(t("trpt.boundary"))).toBeTruthy();
    fireEvent.click(views.getByRole("button", { name: t("trpt.reconciliation") }));
    await screen.findByRole("table", { name: t("trpt.reconciliation") });
    expect(pressed()).toEqual(["false", "false", "true"]);
    expect(screen.getByText(t("trpt.reconcileNote"))).toBeTruthy();
    fireEvent.click(screen.getByLabelText(t("shell.showTeachingExplanations")));
    expect(screen.getByRole("complementary", { name: "教学说明" }).textContent).toContain(
      t("trpt.teaching"),
    );
  });
});

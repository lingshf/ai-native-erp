import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeSettlementCommandSchema,
  tradeSettlementConfirmSchema,
  type TradeSettlementCommandDto,
} from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";

const itemId = "00000000-0000-4000-8000-000000000001";
const company = {
  code: "DEFAULT",
  name: "Fictional",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const item = {
  kind: "invoice",
  segments: [{ dimensions: {}, gross: 11300, remainingGross: 11300 }],
  itemId,
  side: "AP",
  party: "V1",
  externalNo: "INV-1",
  controlAccount: "2100",
  dimensions: {},
  currency: "CNY",
  accountingDate: "2026-01-20",
  documentDate: "2026-01-18",
  dueDate: "2026-02-17",
  discountDate: "2026-01-25",
  discountPercent: "1.5",
  allowPartialDiscount: true,
  gross: 11300,
  net: 10000,
  tax: 1300,
  remainingGross: 11300,
  remainingNet: 10000,
  remainingTax: 1300,
  status: "open",
  revision: 1,
};
const fingerprint = "a".repeat(64);
const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function calculation(command: TradeSettlementCommandDto) {
  const selected = command.items[0];
  const discount = selected.takeDiscount ? 75 : 0;
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
  return {
    fingerprint,
    gross: 5650,
    cash: 5650 - discount,
    discount,
    allocations: [
      {
        itemId,
        revision: 1,
        gross: 5650,
        net: 5000,
        tax: 650,
        discount,
        cash: 5650 - discount,
        discountAvailable: true,
        discountDate: "2026-01-25",
        settledGross: 5650,
        remainingGross: 5650,
        remainingNet: 5000,
        remainingTax: 650,
      },
    ],
    journal: {
      version: 1,
      company: "DEFAULT",
      currency: "CNY",
      scale: 2,
      draftId: command.paymentId,
      draftRevision: 0,
      sourceRef: `TRADE-PAY:${command.paymentId}`,
      date: command.accountingDate,
      documentDate: command.documentDate,
      taxDate: command.taxDate,
      module: "TRADE",
      memo: "AP V1",
      operation: "journal",
      originalId: null,
      journals: [
        {
          kind: "normal",
          role: "normal",
          debit: 5650,
          credit: 5650,
          lines: [
            line("2100", 5650, 0),
            line("1000", 0, 5650 - discount),
            ...(discount ? [line("4000", 0, discount)] : []),
          ],
        },
      ],
    },
  };
}
function mockApi(unknownFirst = false) {
  const previews: TradeSettlementCommandDto[] = [];
  const posts: ReturnType<typeof tradeSettlementConfirmSchema.parse>[] = [];
  let posted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url.startsWith("/api/v1/trade/open-items"))
        return response({
          items: [
            posted
              ? {
                  ...item,
                  revision: 2,
                  remainingGross: 5650,
                  remainingNet: 5000,
                  remainingTax: 650,
                }
              : item,
          ],
          nextCursor: null,
        });
      if (url === "/api/v1/trade/settlements/preview") {
        const command = tradeSettlementCommandSchema.parse(JSON.parse(String(init?.body)));
        previews.push(command);
        return response(calculation(command));
      }
      if (url === "/api/v1/trade/settlements") {
        const envelope = tradeSettlementConfirmSchema.parse(JSON.parse(String(init?.body)));
        posts.push(envelope);
        if (unknownFirst && posts.length === 1) throw new TypeError("Synthetic lost response");
        posted = true;
        const { journal: _, ...amounts } = calculation(envelope.command);
        return response(
          {
            ...amounts,
            company: "DEFAULT",
            paymentId: envelope.command.paymentId,
            idempotencyKey: envelope.idempotencyKey,
            sourceRef: `TRADE-PAY:${envelope.command.paymentId}`,
            journalIds: [itemId],
            postedAt: "2026-01-25T10:00:00.000Z",
          },
          201,
        );
      }
      throw new Error(`Unexpected request ${url}`);
    }),
  );
  return { previews, posts };
}
async function selectPartial() {
  await screen.findByText("INV-1");
  fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
  fireEvent.change(screen.getByLabelText(t("tinv.accountingDate")), {
    target: { value: "2026-01-25" },
  });
  fireEvent.click(screen.getByLabelText(`${t("tset.select")} INV-1`));
  fireEvent.change(screen.getByLabelText(`${t("tset.amount")} INV-1`), {
    target: { value: "5650" },
  });
}
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/#/trade-settlements");
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("trade payments and receipts", () => {
  it("requires explicit selection and discount, invalidates a changed preview, and shows remaining balances and accounting links", async () => {
    const { previews, posts } = mockApi();
    render(<App />);
    await selectPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await screen.findByRole("region", { name: t("tset.result") });
    expect(previews[0].items).toEqual([{ itemId, revision: 1, gross: 5650, takeDiscount: false }]);
    fireEvent.click(screen.getByLabelText(`${t("tset.discount")} INV-1`));
    expect(screen.getByRole("button", { name: t("tset.confirm") }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t("tset.confirm") }).matches(":disabled")).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await screen.findByRole("status");
    expect(posts).toHaveLength(1);
    expect(posts[0].command.items[0]).toMatchObject({ gross: 5650, takeDiscount: true });
    expect(screen.getByRole("status").textContent).toContain("TRADE-PAY:");
    expect(screen.getByRole("region", { name: t("tset.result") }).textContent).toContain("56.50");
    expect(screen.getByText(t("tset.boundary"))).not.toBeNull();
  });

  it("locks unknown outcomes, preserves the original envelope across remount and language switches, then retries safely", async () => {
    const { posts } = mockApi(true);
    const first = render(<App />);
    await selectPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t("tset.confirm") }).matches(":disabled")).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
    expect(screen.getByLabelText(t("tinv.party")).matches(":disabled")).toBe(true);
    first.unmount();
    render(<App />);
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    expect(screen.getByLabelText("Partner code").getAttribute("value")).toBe("V1");
    fireEvent.click(screen.getByRole("button", { name: "Retry posting safely" }));
    await screen.findByRole("status");
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeActionCommandSchema,
  tradeActionConfirmSchema,
  type TradeActionCommandDto,
} from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";

const invoiceId = "00000000-0000-4000-8000-000000000001";
const advanceId = "00000000-0000-4000-8000-000000000002";
const company = {
  code: "DEFAULT",
  name: "Fictional",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const invoice = {
  kind: "invoice" as const,
  itemId: invoiceId,
  side: "AP" as const,
  party: "V1",
  externalNo: "INV-1",
  controlAccount: "2100",
  dimensions: {},
  segments: [{ dimensions: {}, gross: 11300, remainingGross: 11300 }],
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
  status: "open" as const,
  revision: 3,
};
const advance = {
  ...invoice,
  kind: "advance" as const,
  itemId: advanceId,
  externalNo: "ADV-1",
  controlAccount: "1250",
  discountPercent: "0",
  allowPartialDiscount: false,
  revision: 2,
};
const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function preview(command: TradeActionCommandDto) {
  const gross = "gross" in command ? command.gross : 1130;
  const after =
    command.kind === "advance"
      ? {
          ...advance,
          itemId: command.actionId,
          party: command.party,
          side: command.side,
          gross,
          net: gross,
          tax: 0,
          remainingGross: gross,
          remainingNet: gross,
          remainingTax: 0,
          segments: [{ dimensions: {}, gross, remainingGross: gross }],
          revision: 1,
        }
      : invoice;
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
    fingerprint: "a".repeat(64),
    kind: command.kind,
    gross,
    changes: [{ before: command.kind === "advance" ? null : invoice, after }],
    creditLines: [],
    links: command.kind === "advance" ? [] : [invoiceId],
    journal: {
      version: 1,
      company: "DEFAULT",
      currency: "CNY",
      scale: 2,
      draftId: command.actionId,
      draftRevision: 0,
      sourceRef: `TRADE-${command.kind.toUpperCase()}:${command.actionId}`,
      date: command.accountingDate,
      documentDate: command.documentDate,
      taxDate: command.taxDate,
      module: "TRADE",
      memo: "Fictional action",
      operation: "journal",
      originalId: null,
      journals: [
        {
          kind: "normal",
          role: "normal",
          debit: gross,
          credit: gross,
          lines: [line("1250", gross, 0), line("1000", 0, gross)],
        },
      ],
    },
  };
}
function mockApi(unknownFirst = false) {
  const previews: TradeActionCommandDto[] = [];
  const posts: ReturnType<typeof tradeActionConfirmSchema.parse>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url.startsWith("/api/v1/trade/open-items"))
        return response({ items: [invoice, advance], nextCursor: null });
      if (url === "/api/v1/trade/actions/preview") {
        const command = tradeActionCommandSchema.parse(JSON.parse(String(init?.body)));
        previews.push(command);
        return response(preview(command));
      }
      if (url === "/api/v1/trade/actions") {
        const envelope = tradeActionConfirmSchema.parse(JSON.parse(String(init?.body)));
        posts.push(envelope);
        if (unknownFirst && posts.length === 1) throw new TypeError("Fictional lost response");
        const { journal, ...result } = preview(envelope.command);
        return response(
          {
            ...result,
            company: "DEFAULT",
            actionId: envelope.command.actionId,
            idempotencyKey: envelope.idempotencyKey,
            sourceRef: journal.sourceRef,
            journalIds: [envelope.command.actionId],
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
async function open() {
  render(<App />);
  await screen.findByLabelText(t("tadj.kind"));
}
async function plan() {
  fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: t("tadj.confirm") }).matches(":disabled")).toBe(
      false,
    ),
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/#/trade-adjustments");
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
describe("typed trade adjustments", () => {
  it("previews customer advances without automatic posting, preserves inputs on language changes and invalidates changed amounts", async () => {
    const { previews, posts } = mockApi();
    await open();
    fireEvent.change(screen.getByLabelText(t("trade.side")), { target: { value: "AR" } });
    fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "C1" } });
    fireEvent.change(screen.getByLabelText(t("tadj.gross")), { target: { value: "1234" } });
    await plan();
    expect(previews[0]).toMatchObject({ kind: "advance", side: "AR", gross: 1234, dimensions: {} });
    expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    expect(screen.getByLabelText("Partner code").getAttribute("value")).toBe("C1");
    fireEvent.change(screen.getByLabelText("Gross amount (integer minor units)"), {
      target: { value: "1235" },
    });
    expect(screen.getByRole("button", { name: "Confirm action" }).matches(":disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh" } });
    await plan();
    fireEvent.click(screen.getByRole("button", { name: t("tadj.confirm") }));
    await screen.findByRole("status");
    expect(posts[0].command).toMatchObject({ gross: 1235 });
    expect(screen.getByText(t("tadj.boundary"))).not.toBeNull();
  });
  it.each(["credit", "apply", "cancel", "reverse"] as const)(
    "builds a strict %s command from typed fields and current item revisions",
    async (kind) => {
      const { previews } = mockApi();
      await open();
      fireEvent.change(screen.getByLabelText(t("tadj.kind")), { target: { value: kind } });
      if (kind !== "reverse") {
        await screen.findByRole("option", {
          name: new RegExp(kind === "apply" ? "ADV-1" : "INV-1"),
        });
        fireEvent.change(screen.getByLabelText(t("tadj.source")), {
          target: { value: kind === "apply" ? advanceId : invoiceId },
        });
      }
      if (kind === "credit") {
        fireEvent.change(screen.getByLabelText(t("tadj.sourceLine")), { target: { value: "L1" } });
        fireEvent.change(screen.getByLabelText(t("tinv.quantity")), { target: { value: "0.5" } });
      }
      if (kind === "apply") {
        fireEvent.change(screen.getByLabelText(t("tadj.target")), { target: { value: invoiceId } });
        fireEvent.change(screen.getByLabelText(t("tadj.gross")), { target: { value: "1000" } });
      }
      if (kind === "reverse") {
        fireEvent.change(screen.getByLabelText(t("tadj.settlementId")), {
          target: { value: advanceId },
        });
        fireEvent.click(screen.getByLabelText(new RegExp(`INV-1.*${invoiceId}`)));
      }
      if (kind === "cancel" || kind === "reverse")
        fireEvent.change(screen.getByLabelText(t("tadj.reason")), {
          target: { value: "Fictional correction" },
        });
      await plan();
      expect(previews[0].kind).toBe(kind);
      if (kind === "credit")
        expect(previews[0]).toMatchObject({
          invoiceId,
          revision: 3,
          lines: [{ sourceLineId: "L1", quantity: "0.5" }],
        });
      if (kind === "apply")
        expect(previews[0]).toMatchObject({
          sourceId: advanceId,
          sourceRevision: 2,
          targetId: invoiceId,
          targetRevision: 3,
        });
      if (kind === "cancel")
        expect(previews[0]).toMatchObject({
          itemId: invoiceId,
          revision: 3,
          relatedRevision: null,
        });
      if (kind === "reverse")
        expect(previews[0]).toMatchObject({
          settlementId: advanceId,
          items: [{ itemId: invoiceId, revision: 3 }],
        });
    },
  );
  it("locks unknown outcomes and replays exactly the stored confirmation after remount and language switch", async () => {
    const { posts } = mockApi(true);
    const first = render(<App />);
    await screen.findByLabelText(t("tadj.kind"));
    fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
    fireEvent.change(screen.getByLabelText(t("tadj.gross")), { target: { value: "500" } });
    await plan();
    fireEvent.click(screen.getByRole("button", { name: t("tadj.confirm") }));
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
    expect(screen.getByLabelText(t("tadj.kind")).matches(":disabled")).toBe(true);
    first.unmount();
    render(<App />);
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry posting safely" }));
    await screen.findByRole("status");
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
  });
});

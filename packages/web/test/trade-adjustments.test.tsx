import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeActionCommandSchema,
  tradeActionConfirmSchema,
  type TradeActionCommandDto,
} from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { TradeAdjustments } from "../src/TradeAdjustments.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";
import { adjustmentTeaching } from "../src/ui/trade-adjustment-teaching.ts";
import { partyFilterLabels } from "../src/ui/trade-adjustment-filter-labels.ts";

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
const otherInvoice = {
  ...invoice,
  itemId: "00000000-0000-4000-8000-000000000003",
  party: "V2",
  externalNo: "INV-2",
};
// `unknownFirst` loses the first post's response; a promise holds that post in flight until it settles.
function mockApi(unknownFirst: boolean | Promise<void> = false, paged = false) {
  const previews: TradeActionCommandDto[] = [];
  const posts: ReturnType<typeof tradeActionConfirmSchema.parse>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = String(path);
      if (url.startsWith("/api/v1/companies"))
        return response({ items: [company], nextCursor: null });
      if (url.startsWith("/api/v1/trade/open-items")) {
        const query = new URL(url, "http://erp.test").searchParams;
        const party = query.get("party");
        if (party === "V2") return response({ items: [otherInvoice], nextCursor: null });
        if (party) return response({ items: [], nextCursor: null });
        if (paged && !query.get("cursor")) return response({ items: [invoice], nextCursor: "P2" });
        return response({ items: paged ? [advance] : [invoice, advance], nextCursor: null });
      }
      if (url === "/api/v1/trade/actions/preview") {
        const command = tradeActionCommandSchema.parse(JSON.parse(String(init?.body)));
        previews.push(command);
        return response(preview(command));
      }
      if (url === "/api/v1/trade/actions") {
        const envelope = tradeActionConfirmSchema.parse(JSON.parse(String(init?.body)));
        posts.push(envelope);
        if (unknownFirst && posts.length === 1) {
          await unknownFirst;
          throw new TypeError("Fictional lost response");
        }
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
  it("reloads current items when returning from another trade page despite an infinitely fresh cache", async () => {
    mockApi();
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const mount = () =>
      render(
        <QueryClientProvider client={client}>
          <TradeAdjustments preferences={{ language: "zh", theme: "red", teaching: false }} />
        </QueryClientProvider>,
      );
    const reads = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).startsWith("/api/v1/trade/open-items")).length;
    const first = mount();
    await waitFor(() => expect(reads()).toBe(1));
    first.unmount();
    mount();
    await waitFor(() => expect(reads()).toBe(2));
    client.clear();
  });
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
  it("renders the correction teaching tip only while teaching is on and keeps the boundary visible", async () => {
    mockApi();
    await open();
    const tip = (language: "zh" | "en") =>
      screen.queryByText(adjustmentTeaching(language, label(language, "tadj.teaching")));
    expect(tip("zh")).toBeNull();
    expect(screen.getByText(t("tadj.boundary"))).toBeTruthy();
    fireEvent.click(screen.getByLabelText(t("shell.showTeachingExplanations")));
    expect(tip("zh")?.closest("aside")?.getAttribute("aria-label")).toBe(t("master.teachingTitle"));
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    expect(tip("zh")).toBeNull();
    expect(tip("en")?.closest("aside")?.getAttribute("aria-label")).toBe(
      label("en", "master.teachingTitle"),
    );
    fireEvent.click(screen.getByLabelText(label("en", "shell.showTeachingExplanations")));
    expect(tip("en")).toBeNull();
    expect(screen.getByText(label("en", "tadj.boundary"))).toBeTruthy();
  });
  it("styles only the irreversible cancel and reverse confirmations as dangerous", async () => {
    mockApi();
    await open();
    const confirm = () => screen.getByRole("button", { name: t("tadj.confirm") });
    for (const [kind, danger] of [
      ["advance", false],
      ["credit", false],
      ["apply", false],
      ["cancel", true],
      ["reverse", true],
    ] as const) {
      fireEvent.change(screen.getByLabelText(t("tadj.kind")), { target: { value: kind } });
      expect(confirm().classList.contains("btn-danger")).toBe(danger);
    }
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
  it("filters open items by partner on the server, clears chosen items and restores the unfiltered list", async () => {
    mockApi();
    await open();
    const reads = () =>
      vi
        .mocked(fetch)
        .mock.calls.map(([url]) => String(url))
        .filter((url) => url.startsWith("/api/v1/trade/open-items"));
    const options = (field: "tadj.source" | "tadj.target") =>
      [...(screen.getByLabelText(t(field)) as HTMLSelectElement).options].map(
        (option) => option.textContent,
      );
    fireEvent.change(screen.getByLabelText(t("tadj.kind")), { target: { value: "apply" } });
    await screen.findByRole("option", { name: /ADV-1/ });
    expect(reads()).toEqual(["/api/v1/trade/open-items?company=DEFAULT&limit=100"]);
    const before = { source: options("tadj.source"), target: options("tadj.target") };
    fireEvent.change(screen.getByLabelText(t("tadj.source")), { target: { value: advanceId } });
    fireEvent.change(screen.getByLabelText(t("tadj.target")), { target: { value: invoiceId } });
    const filter = screen.getByLabelText(partyFilterLabels.zh.label);
    expect(filter.getAttribute("placeholder")).toBe(partyFilterLabels.zh.all);
    fireEvent.change(filter, { target: { value: " V2 " } });
    fireEvent.keyDown(filter, { key: "Enter" });
    await screen.findByRole("option", { name: /INV-2/ });
    expect(reads()).toEqual([
      "/api/v1/trade/open-items?company=DEFAULT&limit=100",
      "/api/v1/trade/open-items?company=DEFAULT&party=V2&limit=100",
    ]);
    expect((filter as HTMLInputElement).value).toBe("V2");
    expect(options("tadj.target")).toEqual([
      t("tadj.choose"),
      expect.stringContaining("INV-2 · V2"),
    ]);
    expect(options("tadj.source")).toEqual([t("tadj.choose")]);
    expect((screen.getByLabelText(t("tadj.source")) as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText(t("tadj.target")) as HTMLSelectElement).value).toBe("");
    fireEvent.blur(filter);
    expect(reads()).toHaveLength(2);
    fireEvent.change(filter, { target: { value: "" } });
    fireEvent.blur(filter);
    await screen.findByRole("option", { name: /ADV-1/ });
    expect(reads()[2]).toBe("/api/v1/trade/open-items?company=DEFAULT&limit=100");
    expect({ source: options("tadj.source"), target: options("tadj.target") }).toEqual(before);
  });
  it("resets paging when the partner filter changes and rejects malformed partner codes without a request", async () => {
    mockApi(false, true);
    await open();
    const reads = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).startsWith("/api/v1/trade/open-items")).length;
    fireEvent.change(screen.getByLabelText(t("tadj.kind")), { target: { value: "cancel" } });
    fireEvent.click(await screen.findByRole("button", { name: t("master.loadMore") }));
    await screen.findByRole("option", { name: /ADV-1/ });
    fireEvent.change(screen.getByLabelText(t("tadj.source")), { target: { value: advanceId } });
    const filter = screen.getByLabelText(partyFilterLabels.zh.label);
    fireEvent.change(filter, { target: { value: "v 1" } });
    fireEvent.blur(filter);
    expect(filter.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(partyFilterLabels.zh.invalid)).toBeTruthy();
    expect((screen.getByLabelText(t("tadj.source")) as HTMLSelectElement).value).toBe(advanceId);
    expect(reads()).toBe(2);
    fireEvent.change(filter, { target: { value: "V1" } });
    fireEvent.keyDown(filter, { key: "Enter" });
    await waitFor(() => expect(reads()).toBe(3));
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).not.toContain("cursor=");
    expect((screen.getByLabelText(t("tadj.source")) as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("button", { name: t("master.loadMore") })).toBeNull();
    fireEvent.change(filter, { target: { value: "" } });
    fireEvent.keyDown(filter, { key: "Enter" });
    await screen.findByRole("button", { name: t("master.loadMore") });
    expect(screen.queryByRole("option", { name: /ADV-1/ })).toBeNull();
    expect(screen.getByRole("option", { name: /INV-1/ })).toBeTruthy();
  });
  it("keeps the partner filter labels in matching Chinese and English keys and follows the language switch", async () => {
    mockApi();
    await open();
    expect(Object.keys(partyFilterLabels.en).sort()).toEqual(
      Object.keys(partyFilterLabels.zh).sort(),
    );
    for (const language of ["zh", "en"] as const)
      for (const text of Object.values(partyFilterLabels[language])) expect(text).not.toBe("");
    fireEvent.change(screen.getByLabelText(t("tadj.kind")), { target: { value: "cancel" } });
    fireEvent.change(screen.getByLabelText(partyFilterLabels.zh.label), {
      target: { value: "V2" },
    });
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    const filter = screen.getByLabelText(partyFilterLabels.en.label);
    expect((filter as HTMLInputElement).value).toBe("V2");
    expect(filter.getAttribute("placeholder")).toBe(partyFilterLabels.en.all);
    expect(screen.getByText(partyFilterLabels.en.hint)).toBeTruthy();
  });
  it.each(["missing", "changed", "unreadable"] as const)(
    "does not post when the saved confirmation envelope is %s on readback",
    async (failure) => {
      const { posts } = mockApi();
      await open();
      fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
      fireEvent.change(screen.getByLabelText(t("tadj.gross")), { target: { value: "500" } });
      await plan();
      const storage = sessionStorage;
      const read = Storage.prototype.getItem;
      const write = vi.spyOn(Storage.prototype, "setItem");
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
        this: Storage,
        key: string,
      ) {
        if (this === storage && key === "erp.tradeActions.v1.DEFAULT") {
          if (failure === "unreadable") throw new Error("Fictional unavailable storage");
          return failure === "missing" ? null : "{}";
        }
        return read.call(this, key);
      });
      fireEvent.click(screen.getByRole("button", { name: t("tadj.confirm") }));
      await screen.findByText(t("tinv.storageFailed"));
      expect(write).toHaveBeenCalledWith(
        "erp.tradeActions.v1.DEFAULT",
        expect.stringContaining('"pending":{'),
      );
      expect(posts).toHaveLength(0);
      expect(screen.getByRole("button", { name: t("tadj.confirm") }).matches(":disabled")).toBe(
        true,
      );
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
  it("reports an unknown outcome only after the first send fails, never while it is in flight", async () => {
    let lose = () => {};
    const { posts } = mockApi(new Promise<void>((resolve) => (lose = resolve)));
    await open();
    fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
    fireEvent.change(screen.getByLabelText(t("tadj.gross")), { target: { value: "500" } });
    await plan();
    fireEvent.click(screen.getByRole("button", { name: t("tadj.confirm") }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByText(t("tinv.uncertain"))).toBeNull();
    expect(screen.queryByRole("button", { name: t("tinv.retryConfirm") })).toBeNull();
    lose();
    const retry = await screen.findByRole<HTMLButtonElement>("button", {
      name: t("tinv.retryConfirm"),
    });
    expect(retry.disabled).toBe(false);
    expect(screen.getByText(t("tinv.uncertain"))).toBeTruthy();
  });
});

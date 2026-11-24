import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradeSettlementCommandSchema,
  tradeSettlementConfirmSchema,
  type TradeSettlementCommandDto,
} from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { TradeSettlements } from "../src/TradeSettlements.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";
import { settlementTeaching } from "../src/ui/trade-settlement-teaching.ts";

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
// `unknownFirst` loses the first post's response; a promise holds that post in flight until it settles.
function mockApi(unknownFirst: boolean | Promise<void> = false) {
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
        if (unknownFirst && posts.length === 1) {
          await unknownFirst;
          throw new TypeError("Synthetic lost response");
        }
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
  it("reloads current balances when returning from another trade page despite an infinitely fresh cache", async () => {
    mockApi();
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const mount = () =>
      render(
        <QueryClientProvider client={client}>
          <TradeSettlements preferences={{ language: "zh", theme: "red", teaching: false }} />
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
  it("does not post if the pending envelope cannot be read back byte-for-byte", async () => {
    const { posts } = mockApi();
    render(<App />);
    await selectPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await screen.findByRole("region", { name: t("tset.result") });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await screen.findByText(t("tinv.storageFailed"));
    expect(posts).toEqual([]);
  });
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
  it("reports an unknown outcome only after the first send fails, never while it is in flight", async () => {
    let lose = () => {};
    const { posts } = mockApi(new Promise<void>((resolve) => (lose = resolve)));
    render(<App />);
    await selectPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: t("tset.confirm") }).matches(":disabled")).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
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
  it("does not derive due or remaining from a refreshed draft before its open items load", async () => {
    mockApi();
    const first = render(<App />);
    await selectPartial();
    first.unmount();
    const stub = vi.mocked(fetch);
    const real = stub.getMockImplementation();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stub.mockImplementation(async (path, init) => {
      if (String(path).startsWith("/api/v1/trade/open-items")) await gate;
      return real?.(path, init) as Promise<Response>;
    });
    render(<App />);
    const kpis = await screen.findByText(t("tset.allocated"));
    const card = () => kpis.closest("dl")?.textContent ?? "";
    await waitFor(() => expect(card()).toContain("56.50"));
    expect(card().split(t("tset.unloaded")).length).toBe(3);
    expect(card()).not.toContain("-56.50");
    expect(card()).not.toContain("−56.50");
    release();
    await screen.findByText("INV-1");
    await waitFor(() => expect(card()).toContain("113.00"));
    expect(card()).not.toContain(t("tset.unloaded"));
  });
  it("renders the settlement teaching tip only while teaching is on and keeps the boundary visible", async () => {
    mockApi();
    render(<App />);
    await screen.findByText("INV-1");
    const tip = (language: "zh" | "en") =>
      screen.queryByText(settlementTeaching(language, label(language, "tset.teaching")));
    expect(tip("zh")).toBeNull();
    expect(screen.getByText(t("tset.boundary"))).toBeTruthy();
    fireEvent.click(screen.getByLabelText(t("shell.showTeachingExplanations")));
    expect(tip("zh")?.closest("aside")?.getAttribute("aria-label")).toBe(t("master.teachingTitle"));
    fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
    expect(tip("zh")).toBeNull();
    expect(tip("en")?.closest("aside")?.getAttribute("aria-label")).toBe(
      label("en", "master.teachingTitle"),
    );
    fireEvent.click(screen.getByLabelText(label("en", "shell.showTeachingExplanations")));
    expect(tip("en")).toBeNull();
    expect(screen.getByText(label("en", "tset.boundary"))).toBeTruthy();
    expect(screen.getByText("INV-1")).toBeTruthy();
  });
  it("asks before leaving an unsaved settlement and keeps it on cancel", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockApi();
    render(<App />);
    await selectPartial();
    fireEvent.click(screen.getByRole("link", { name: t("tinv.title") }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(t("trade.leaveConfirm"));
    expect(window.location.hash).toBe("#/trade-settlements");
    expect(screen.getByLabelText<HTMLInputElement>(`${t("tset.amount")} INV-1`).value).toBe("5650");
  });
});

// TLIST-06: "Refresh list" re-reads the loaded open-item pages and leaves the draft alone.
const PAGE_SIZE = 100;
const LOADED_PAGES = 2;
const SECOND_PAGE_CURSOR = "OPEN-2";
const SECOND_PAGE_AMOUNT = 4321;
const REDUCED_BALANCE = 9040;
const draftKey = "erp.tradeSettlements.v1.DEFAULT";
const openItemsUrl = `/api/v1/trade/open-items?company=DEFAULT&status=open&limit=${PAGE_SIZE}`;
const secondPageUrl = `${openItemsUrl}&cursor=${SECOND_PAGE_CURSOR}`;
// Open items are numbered: 1 is `item`, 2–100 fill page one and 101–200 are page two.
const filler = (n: number) => ({
  ...item,
  itemId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  externalNo: `FILL-${n}`,
});
const fillers = (from: number, count: number) =>
  Array.from({ length: count }, (_, offset) => filler(from + offset));
const secondPageItem = filler(PAGE_SIZE + 1);
const openItemPage = (items: unknown[], nextCursor: string | null = null) =>
  response({ items, nextCursor });
// mockApi with two open-item pages; `state.balance` is `item`'s remaining gross on page one and
// `state.fail` makes open-item reads fail.
function mockOpenItemPages(unknownFirst: boolean | Promise<void> = false) {
  const api = mockApi(unknownFirst);
  const state = { balance: item.remainingGross, fail: false };
  const stub = vi.mocked(fetch);
  const real = stub.getMockImplementation();
  stub.mockImplementation(async (path, init) => {
    const url = String(path);
    if (!url.startsWith("/api/v1/trade/open-items")) return real?.(path, init) as Promise<Response>;
    if (state.fail) return response({}, 500);
    if (url.includes("cursor=")) return openItemPage(fillers(PAGE_SIZE + 1, PAGE_SIZE));
    const first = [{ ...item, remainingGross: state.balance }, ...fillers(2, PAGE_SIZE - 1)];
    return openItemPage(first, SECOND_PAGE_CURSOR);
  });
  const urls = () => stub.mock.calls.map(([url]) => String(url));
  const reads = () => urls().filter((url) => url.startsWith("/api/v1/trade/open-items")).length;
  return { ...api, state, urls, reads };
}
function seedSecondPageSelection() {
  const day = "2026-01-25";
  const head = { company: "DEFAULT", paymentId: crypto.randomUUID(), side: "AP", party: "V1" };
  const dates = { currency: "CNY", accountingDate: day, documentDate: day, taxDate: day };
  const selected = { itemId: secondPageItem.itemId, revision: 1, gross: SECOND_PAGE_AMOUNT };
  const command = { ...head, ...dates, items: [{ ...selected, takeDiscount: false }] };
  window.sessionStorage.setItem(draftKey, JSON.stringify({ command, pending: null }));
}
const refreshButton = (language: "zh" | "en" = "zh") =>
  screen.getByRole("button", { name: label(language, "master.listRefresh") });
const kpis = () => screen.getByText(t("tset.allocated")).closest("dl")?.textContent ?? "";
const disabled = (name: string) => screen.getByRole("button", { name }).matches(":disabled");
const expectFollows = (first: Node | null | undefined, next: Node | null) =>
  expect(first && next && first.compareDocumentPosition(next)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
async function previewPartial() {
  await selectPartial();
  fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
  await waitFor(() => expect(disabled(t("tset.confirm"))).toBe(false));
}

describe("TLIST-06 refresh the open items", () => {
  let client = new QueryClient();
  const mount = (language: "zh" | "en" = "zh") => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TradeSettlements preferences={{ language, theme: "red", teaching: false }} />
      </QueryClientProvider>,
    );
  };
  afterEach(() => client.clear());
  it.each(["zh", "en"] as const)(
    "S2 (%s): one Refresh list button, in the allocation tab before the table and outside its fieldset",
    async (language) => {
      mockOpenItemPages();
      mount(language);
      await screen.findByText("INV-1");
      const name = label(language, "master.listRefresh");
      expect(screen.getAllByRole("button", { name })).toHaveLength(1);
      const button = refreshButton(language);
      const table = document.querySelector("#tset-allocation-body table");
      expect(button.closest("#tset-allocation-body")).not.toBeNull();
      expect(button.closest("fieldset")).toBeNull();
      expectFollows(button, table);
    },
  );
  it("S3: re-reads both loaded pages in order and keeps them (due stays known), the selection and its amount", async () => {
    seedSecondPageSelection();
    const { urls } = mockOpenItemPages();
    mount();
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByRole("button", { name: t("master.loadMore") }));
    await waitFor(() => expect(kpis()).not.toContain(t("tset.unloaded")));
    const draft = window.sessionStorage.getItem(draftKey);
    const before = urls().length;
    fireEvent.click(refreshButton());
    await waitFor(() => expect(urls()).toHaveLength(before + LOADED_PAGES));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(urls().slice(before)).toEqual([openItemsUrl, secondPageUrl]);
    const key = ["tradeOpenItems", "DEFAULT"];
    const pages = client.getQueryData<InfiniteData<{ items: unknown[] }>>(key)?.pages ?? [];
    expect(pages).toHaveLength(LOADED_PAGES);
    expect(pages.flatMap((page) => page.items)).toHaveLength(LOADED_PAGES * PAGE_SIZE);
    expect(window.sessionStorage.getItem(draftKey)).toBe(draft);
    expect(kpis()).toContain("113.00");
  });
  it("S4: shows a selected item's reduced balance and neither clears nor recomputes the preview", async () => {
    const { previews, state } = mockOpenItemPages();
    mount();
    await previewPartial();
    const result = () => screen.getByRole("region", { name: t("tset.result") }).textContent;
    const shown = result();
    state.balance = REDUCED_BALANCE;
    fireEvent.click(refreshButton());
    const row = screen.getByLabelText(`${t("tset.select")} INV-1`).closest("tr");
    await waitFor(() => expect(row?.textContent).toContain("90.40"));
    expect(kpis()).toContain("90.40");
    expect(result()).toBe(shown);
    expect(previews).toHaveLength(1);
  });
  it("S5: stays enabled while a confirmation is pending and leaves the envelope and buttons alone", async () => {
    const ask = vi.spyOn(window, "confirm");
    let lose = () => {};
    const { posts, reads } = mockOpenItemPages(new Promise<void>((resolve) => (lose = resolve)));
    mount();
    await previewPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const envelope = window.sessionStorage.getItem(draftKey);
    const buttons = () => [disabled(t("tinv.preview")), disabled(t("tset.confirm"))];
    const before = [buttons(), reads()] as const;
    expect(refreshButton().matches(":disabled")).toBe(false);
    fireEvent.click(refreshButton());
    await waitFor(() => expect(reads()).toBe(before[1] + 1));
    expect(screen.getByLabelText(`${t("tset.select")} INV-1`).matches(":disabled")).toBe(true);
    expect(buttons()).toEqual(before[0]);
    expect(window.sessionStorage.getItem(draftKey)).toBe(envelope);
    expect(ask).not.toHaveBeenCalled();
    lose();
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
  });
  it("S6: keeps the unknown-outcome notice and retries with the same envelope after a refresh", async () => {
    const { posts, reads } = mockOpenItemPages(true);
    mount();
    await previewPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
    const before = reads();
    fireEvent.click(refreshButton());
    await waitFor(() => expect(reads()).toBe(before + 1));
    expect(screen.getByText(t("tinv.uncertain"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("tinv.retryConfirm") }));
    await screen.findByRole("status");
    expect(posts).toHaveLength(2);
    expect(JSON.stringify(posts[1])).toBe(JSON.stringify(posts[0]));
  });
  it("S7: a native button between the general tab and the table; two clicks show one copy, a failure the error bar", async () => {
    const { state, reads } = mockOpenItemPages();
    mount();
    await screen.findByText("INV-1");
    const button = refreshButton();
    const lastGeneral = [...document.querySelectorAll("#tset-general-body input")].at(-1);
    const firstSelect = document.querySelector("#tset-allocation-body tbody input[type=checkbox]");
    expect([button.tagName, button.getAttribute("type")]).toEqual(["BUTTON", "button"]);
    expectFollows(lastGeneral, button);
    expectFollows(button, firstSelect);
    const before = reads();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(reads()).toBe(before + 2));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getAllByText("INV-1")).toHaveLength(1);
    expect(document.querySelectorAll("#tset-allocation-body tbody tr")).toHaveLength(PAGE_SIZE);
    state.fail = true;
    fireEvent.click(button);
    expect(await screen.findByText(t("master.error"))).toBeTruthy();
  });
});

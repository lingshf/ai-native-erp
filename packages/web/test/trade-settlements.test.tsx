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
import { ROW_HEIGHT_PX } from "../src/trade-settlements/settlement-model.ts";
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
// mockApi plus two open-item pages; `state` changes `item`'s page-one balance or fails reads.
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
const field = (key: "tset.select" | "tset.amount") =>
  screen.getByLabelText<HTMLInputElement>(`${t(key)} ${secondPageItem.externalNo}`);
async function editSecondPageItem() {
  fireEvent.change(screen.getByLabelText(t("tinv.party")), { target: { value: "V1" } });
  const table = document.querySelector("#tset-allocation-body .accounts-scroll") as Element;
  fireEvent.scroll(table, { target: { scrollTop: PAGE_SIZE * ROW_HEIGHT_PX } });
  fireEvent.click(await waitFor(() => field("tset.select")));
  fireEvent.change(field("tset.amount"), { target: { value: String(SECOND_PAGE_AMOUNT) } });
}
const refreshButton = (language: "zh" | "en" = "zh") =>
  screen.getByRole("button", { name: label(language, "master.listRefresh") });
const kpis = () => screen.getByText(t("tset.allocated")).closest("dl")?.textContent ?? "";
const disabled = (name: string) => screen.getByRole("button", { name }).matches(":disabled");
const expectFollows = (first: Node | null | undefined, next: Node | null) =>
  expect(next && first?.compareDocumentPosition(next)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
  const openItemsKey = ["tradeOpenItems", "DEFAULT"];
  const loadedPages = () =>
    client.getQueryData<InfiniteData<{ items: unknown[] }>>(openItemsKey)?.pages ?? [];
  // Clicks Refresh list and waits until the re-read data is stored and rendered.
  async function refreshAndSettle() {
    const updates = () => client.getQueryState(openItemsKey)?.dataUpdateCount ?? 0;
    const before = updates();
    fireEvent.click(refreshButton());
    await waitFor(() => expect([updates() > before, client.isFetching()]).toEqual([true, 0]));
  }
  it.each(["zh", "en"] as const)(
    "S2 (%s): one Refresh list button, in the allocation tab before the table and outside its fieldset",
    async (language) => {
      mockOpenItemPages();
      mount(language);
      await screen.findByText("INV-1");
      const button = refreshButton(language);
      expect(button.closest("#tset-allocation-body")).not.toBeNull();
      expect(button.closest("fieldset")).toBeNull();
      expectFollows(button, document.querySelector("#tset-allocation-body table"));
    },
  );
  it("S3: re-reads both loaded pages in order and keeps them (due stays known), the selection and its amount", async () => {
    // A 480 px viewport lets the virtualizer render the rows around the scroll position.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(480);
    const { urls } = mockOpenItemPages();
    mount();
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByRole("button", { name: t("master.loadMore") }));
    await waitFor(() => expect(loadedPages()).toHaveLength(LOADED_PAGES));
    await editSecondPageItem();
    const draft = window.sessionStorage.getItem(draftKey);
    expect(draft).toContain(`"gross":${SECOND_PAGE_AMOUNT}`);
    const before = urls().length;
    await refreshAndSettle();
    expect(urls().slice(before)).toEqual([openItemsUrl, secondPageUrl]);
    expect(loadedPages().flatMap((page) => page.items)).toHaveLength(LOADED_PAGES * PAGE_SIZE);
    const edited = [field("tset.select").checked, field("tset.amount").value];
    expect(edited).toEqual([true, String(SECOND_PAGE_AMOUNT)]);
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
    const { posts } = mockOpenItemPages(new Promise<void>((resolve) => (lose = resolve)));
    mount();
    await previewPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const envelope = window.sessionStorage.getItem(draftKey);
    const buttons = () => [disabled(t("tinv.preview")), disabled(t("tset.confirm"))];
    const before = buttons();
    expect(refreshButton().matches(":disabled")).toBe(false);
    await refreshAndSettle();
    expect(screen.getByLabelText(`${t("tset.select")} INV-1`).matches(":disabled")).toBe(true);
    expect(buttons()).toEqual(before);
    expect(window.sessionStorage.getItem(draftKey)).toBe(envelope);
    expect(ask).not.toHaveBeenCalled();
    lose();
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
  });
  it("S6: keeps the unknown-outcome notice and retries with the same envelope after a refresh", async () => {
    const { posts } = mockOpenItemPages(true);
    mount();
    await previewPartial();
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await screen.findByRole("button", { name: t("tinv.retryConfirm") });
    await refreshAndSettle();
    expect(screen.getByText(t("tinv.uncertain"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("tinv.retryConfirm") }));
    await screen.findByRole("status");
    expect(posts).toStrictEqual([posts[0], posts[0]]);
  });
  it("S7: a native button between the general tab and the table; two clicks show one copy, a failure the error bar", async () => {
    const { state, reads } = mockOpenItemPages();
    mount();
    await screen.findByText("INV-1");
    const button = refreshButton();
    const lastGeneral = [...document.querySelectorAll("#tset-general-body input")].at(-1);
    expect([button.tagName, button.getAttribute("type")]).toEqual(["BUTTON", "button"]);
    expectFollows(lastGeneral, button);
    expectFollows(button, document.querySelector("#tset-allocation-body tbody input"));
    const before = reads();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect([reads() - before, client.isFetching()]).toEqual([2, 0]));
    expect(screen.getAllByText("INV-1")).toHaveLength(1);
    expect(document.querySelectorAll("#tset-allocation-body tbody tr")).toHaveLength(PAGE_SIZE);
    state.fail = true;
    fireEvent.click(button);
    expect(await screen.findByText(t("master.error"))).toBeTruthy();
  });
});

// TSET-01 (D516): a selected item missing from fully loaded open items is flagged, never auto-removed.
const fillerItem = filler(2);
// mockApi plus one open-item page of `item` and `fillerItem`; `state` drops one, adds a cursor or holds reads.
type SettledPageState = { omit: string; nextCursor: string | null; hold: Promise<void> | null };
function mockSettledPage(held?: Promise<void>) {
  const api = mockApi(held);
  const state: SettledPageState = { omit: "", nextCursor: null, hold: null };
  const stub = vi.mocked(fetch);
  const real = stub.getMockImplementation();
  stub.mockImplementation(async (path, init) => {
    if (!String(path).startsWith("/api/v1/trade/open-items"))
      return real?.(path, init) as Promise<Response>;
    await state.hold;
    const open = [item, fillerItem].filter((row) => row.itemId !== state.omit);
    return openItemPage(open, state.nextCursor);
  });
  return { ...api, state };
}
const draftItems = (): { itemId: string }[] =>
  JSON.parse(window.sessionStorage.getItem(draftKey) ?? "{}").command?.items;
const removeButton = (language: "zh" | "en" = "zh") =>
  screen.queryByRole<HTMLButtonElement>("button", { name: label(language, "tset.removeMissing") });

describe("TSET-01 selected items no longer open", () => {
  let client = new QueryClient();
  afterEach(() => client.clear());
  // Selects `item` and `fillerItem` with amounts and previews; `held` is passed on to mockApi.
  async function selectBoth(language: "zh" | "en", held?: Promise<void>) {
    const l = (key: Parameters<typeof t>[0]) => label(language, key);
    const api = mockSettledPage(held);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TradeSettlements preferences={{ language, theme: "red", teaching: false }} />
      </QueryClientProvider>,
    );
    await screen.findByText("INV-1");
    fireEvent.change(screen.getByLabelText(l("tinv.party")), { target: { value: "V1" } });
    fireEvent.change(screen.getByLabelText(l("tinv.accountingDate")), {
      target: { value: "2026-01-25" },
    });
    const pick = (externalNo: string, amount: number) => {
      fireEvent.click(screen.getByLabelText(`${l("tset.select")} ${externalNo}`));
      const field = screen.getByLabelText(`${l("tset.amount")} ${externalNo}`);
      fireEvent.change(field, { target: { value: String(amount) } });
    };
    pick("INV-1", 5650);
    pick(fillerItem.externalNo, SECOND_PAGE_AMOUNT);
    fireEvent.click(screen.getByRole("button", { name: l("tinv.preview") }));
    await screen.findByRole("region", { name: l("tset.result") });
    return api;
  }
  // `fillerItem` is settled elsewhere; Refresh list re-reads and the notice appears.
  async function settleOneAndRefresh(state: SettledPageState, language: "zh" | "en" = "zh") {
    state.omit = fillerItem.itemId;
    fireEvent.click(refreshButton(language));
    await waitFor(() => expect(removeButton(language)).not.toBeNull());
  }
  async function selectBothThenSettleOne(language: "zh" | "en" = "zh") {
    const api = await selectBoth(language);
    const before = { draft: window.sessionStorage.getItem(draftKey), items: draftItems() };
    await settleOneAndRefresh(api.state, language);
    return { ...api, before };
  }
  const notice = () => removeButton()?.closest('[role="status"]');
  const card = (language: "zh" | "en" = "zh") =>
    screen.getByText(label(language, "tset.allocated")).closest("dl")?.textContent ?? "";
  it.each(["zh", "en"] as const)(
    "M1/M3 (%s): a warning with count 1 and the remove button; KPIs say not open; the draft is untouched",
    async (language) => {
      const { before } = await selectBothThenSettleOne(language);
      const bar = removeButton(language)?.closest('[role="status"]');
      expect(bar?.className).toBe("message-bar warning");
      expect(bar?.textContent).toContain(`1 ${label(language, "tset.missingNotice")}`);
      expect(card(language).split(label(language, "tset.notOpen")).length).toBe(3);
      expect(card(language)).not.toContain(label(language, "tset.unloaded"));
      expect(draftItems()).toEqual(before.items);
      expect(window.sessionStorage.getItem(draftKey)).toBe(before.draft);
    },
  );
  it("M2/M5: removes only the missing item, clears the preview, focuses Refresh list and previews the rest", async () => {
    const { before, previews } = await selectBothThenSettleOne();
    fireEvent.click(removeButton() as HTMLButtonElement);
    const kept = before.items.filter((selected) => selected.itemId !== fillerItem.itemId);
    expect([kept.length, draftItems()]).toEqual([1, kept]);
    expect(kept[0]).toMatchObject({ itemId, gross: 5650 });
    expect(removeButton()).toBeNull();
    expect(screen.queryByRole("region", { name: t("tset.result") })).toBeNull();
    expect(card()).toContain("113.00");
    expect(document.activeElement).toBe(refreshButton());
    fireEvent.click(screen.getByRole("button", { name: t("tinv.preview") }));
    await waitFor(() => expect(previews).toHaveLength(2));
    expect(previews[1]).toEqual({ ...previews[0], items: kept });
  });
  it("M4: while a confirmation is pending the notice shows but its button is disabled", async () => {
    const api = await selectBoth("zh", new Promise<void>(() => {}));
    fireEvent.click(screen.getByRole("button", { name: t("tset.confirm") }));
    await waitFor(() => expect(api.posts).toHaveLength(1));
    const envelope = window.sessionStorage.getItem(draftKey);
    await settleOneAndRefresh(api.state);
    const button = removeButton() as HTMLButtonElement;
    expect(button.matches(":disabled")).toBe(true);
    // A disabled button takes no focus, so Enter cannot reach it; a click must not act either.
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).not.toBe(button);
    expect(window.sessionStorage.getItem(draftKey)).toBe(envelope);
  });
  // Holds the next open-item read, refreshes, and records whether the notice node is ever removed.
  async function refreshHeld(state: SettledPageState) {
    let release = () => {};
    state.hold = new Promise<void>((resolve) => (release = resolve));
    const shown = notice();
    const removals: Node[] = [];
    const observer = new MutationObserver((records) =>
      removals.push(...records.flatMap((r) => [...r.removedNodes])),
    );
    observer.observe(document.body, { childList: true, subtree: true });
    fireEvent.click(refreshButton());
    await waitFor(() => expect(client.isFetching()).toBe(1));
    expect([notice(), card().split(t("tset.notOpen")).length]).toEqual([shown, 3]);
    release();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    observer.disconnect();
    return { flickered: removals.some((node) => node === shown || node.contains(shown as Node)) };
  }
  it("M6: a refresh that still lacks the item keeps the notice in place throughout", async () => {
    const { state } = await selectBothThenSettleOne();
    const { flickered } = await refreshHeld(state);
    expect(flickered).toBe(false);
    expect(notice()?.textContent).toContain(`1 ${t("tset.missingNotice")}`);
    expect(card()).toContain(t("tset.notOpen"));
  });
  it("M7: a refresh that brings the item back keeps the notice until it returns, then drops it", async () => {
    const { state, before } = await selectBothThenSettleOne();
    state.omit = "";
    await refreshHeld(state);
    expect(removeButton()).toBeNull();
    expect(card()).toContain("226.00");
    expect(window.sessionStorage.getItem(draftKey)).toBe(before.draft);
  });
  it("N1: with a next page still unloaded a missing item stays 'not loaded' and no notice shows", async () => {
    const { state } = await selectBoth("zh");
    Object.assign(state, { omit: fillerItem.itemId, nextCursor: SECOND_PAGE_CURSOR });
    fireEvent.click(refreshButton());
    await waitFor(() => expect(card()).toContain(t("tset.unloaded")));
    expect(document.querySelector("#tset-allocation-body [role='status']")).toBeNull();
  });
});

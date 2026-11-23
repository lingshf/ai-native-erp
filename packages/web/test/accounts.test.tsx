import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountCommand, AccountDto } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label } from "../src/ui/index.ts";

const company = {
  code: "DEFAULT",
  name: "Teaching",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "monthly-teaching",
  revision: 1,
};
const account: AccountDto = {
  code: "1500",
  name: "Equipment",
  category: "ASSET",
  reportGroup: "fixedAssets",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  manualAllowed: true,
  active: true,
  builtin: false,
  revision: 1,
};
const conflict = {
  code: "CONFLICT",
  messageKey: "api.error.conflict",
  params: {},
  fieldErrors: [],
  requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
  retryable: false,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  window.history.replaceState(null, "", "/#/accounts");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});
function install(initial: AccountDto[] = [], save?: (command: AccountCommand) => Response) {
  let rows = initial;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
    const url = new URL(String(path), "http://localhost");
    if (url.pathname === "/api/v1/companies")
      return response({ items: [company], nextCursor: null });
    if (init?.method) {
      const { company: owner, ...command }: AccountCommand = JSON.parse(String(init.body));
      expect(owner).toBe("DEFAULT");
      if (save) return save({ company: owner, ...command });
      const saved = { ...command, builtin: false, revision: command.revision + 1 };
      rows = [saved];
      return response(saved, init.method === "POST" ? 201 : 200);
    }
    return response({ items: rows, nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function accountRow(code: string) {
  const row = screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryAllByRole("cell")[0]?.textContent === code);
  if (!row) throw new Error(`missing account row ${code}`);
  return row;
}
// The read-only active column: the row keeps no checkbox, only one badge whose visible text names the state.
function activeBadge(code: string) {
  const row = accountRow(code);
  expect(within(row).queryByRole("checkbox")).toBeNull();
  const badges = row.querySelectorAll<HTMLElement>(".badge");
  expect(badges).toHaveLength(1);
  const badge = badges[0];
  const symbol = badge.querySelector('[aria-hidden="true"]')?.textContent ?? "";
  return {
    text: (badge.textContent ?? "").slice(symbol.length),
    tone: badge.className,
  };
}
describe("account editing", () => {
  it("shows the read-only active state as unfocusable badges without changing the Tab sequence", async () => {
    install([account, { ...account, code: "2200", name: "Retired", active: false }]);
    render(<App />);
    await screen.findByRole("button", { name: "编辑 1500" });
    expect(activeBadge("1500")).toEqual({
      text: label("zh", "master.active"),
      tone: "badge success",
    });
    expect(accountRow("1500").querySelector(".badge")?.textContent).toBe(
      `✓${label("zh", "master.active")}`,
    );
    expect(activeBadge("2200")).toEqual({ text: label("zh", "master.inactive"), tone: "badge" });
    const region = screen.getByRole("region", { name: label("zh", "master.title") });
    const badges = [...region.querySelectorAll<HTMLElement>(".badge")];
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.hasAttribute("tabindex")).toBe(false);
      expect(badge.querySelector("[tabindex], a, button, input")).toBeNull();
    }
    // jsdom has no native Tab: walk the region's tabbable elements in DOM order, as the browser would.
    const tabbable = [
      region,
      ...region.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    ].filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled);
    const visited = tabbable.map((element) => {
      element.focus();
      const focused = document.activeElement as HTMLElement;
      expect(badges.some((badge) => badge.contains(focused))).toBe(false);
      return focused === region
        ? "region"
        : (focused.getAttribute("aria-label") ?? focused.textContent);
    });
    expect(visited).toEqual(["region", "编辑 1500", "编辑 2200"]);
  });
  it("requires an explicit control module and creates/deactivates without losing drafts on preference changes", async () => {
    const fetcher = install();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "master.new") }));
    fireEvent.change(screen.getByLabelText(label("zh", "master.code")), {
      target: { value: "1500" },
    });
    const name = screen.getByLabelText<HTMLInputElement>(label("zh", "master.name"));
    fireEvent.change(name, { target: { value: "Retained draft" } });
    fireEvent.change(screen.getByLabelText(label("zh", "master.purpose")), {
      target: { value: "control" },
    });
    const module = screen.getByLabelText<HTMLSelectElement>(label("zh", "master.controlModule"));
    expect(module.value).toBe("");
    expect(module.required).toBe(true);
    expect(screen.getByText(label("zh", "master.moduleHint"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.save") }));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
    expect(name.value).toBe("Retained draft");
    fireEvent.change(module, { target: { value: "AR" } });
    const requests = fetcher.mock.calls.length;
    fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
      target: { value: "en" },
    });
    fireEvent.change(screen.getByLabelText(label("en", "shell.theme")), {
      target: { value: "green" },
    });
    expect(screen.getByLabelText(label("en", "master.name"))).toBe(name);
    expect(name.value).toBe("Retained draft");
    expect(fetcher.mock.calls).toHaveLength(requests);
    fireEvent.click(screen.getByRole("button", { name: label("en", "master.save") }));
    await screen.findByRole("button", { name: "Edit 1500" });
    expect(activeBadge("1500")).toEqual({
      text: label("en", "master.active"),
      tone: "badge success",
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit 1500" }));
    fireEvent.click(screen.getByLabelText(label("en", "master.active")));
    fireEvent.click(screen.getByRole("button", { name: label("en", "master.save") }));
    await waitFor(() => expect(screen.queryByLabelText(label("en", "master.name"))).toBeNull());
    expect(activeBadge("1500")).toEqual({ text: label("en", "master.inactive"), tone: "badge" });
    expect(
      fetcher.mock.calls
        .filter(([, init]) => init?.method)
        .map(([, init]) => JSON.parse(String(init?.body)).revision),
    ).toEqual([0, 1]);
    expect(
      fetcher.mock.calls
        .filter(([, init]) => init?.method)
        .map(([, init]) => JSON.parse(String(init?.body)).controlModule),
    ).toEqual(["AR", "AR"]);
  });
  it("retains drafts with actionable field validation and distinguishes CAS without retrying or overwriting", async () => {
    let rejected = {
      status: 400,
      body: {
        ...conflict,
        code: "INVALID_REQUEST",
        messageKey: "api.error.invalidRequest",
        fieldErrors: [{ path: "contraOf", messageKey: "api.error.account.contraParent" }],
      },
    };
    const fetcher = install([account], () => response(rejected.body, rejected.status));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "编辑 1500" }));
    fireEvent.change(screen.getByLabelText(label("zh", "master.name")), {
      target: { value: "My pending edit" },
    });
    const parent = screen.getByLabelText<HTMLInputElement>(label("zh", "master.contraOf"));
    fireEvent.change(parent, { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.save") }));
    expect(await screen.findByText(label("zh", "master.contraInvalid"))).toBeTruthy();
    expect(parent.getAttribute("aria-describedby")).toBe("account-contraOf-error");
    expect(parent.value).toBe("9999");
    expect(screen.queryByRole("button", { name: label("zh", "master.reload") })).toBeNull();
    rejected.body.fieldErrors = [
      { path: "purpose", messageKey: "api.error.account.contraChildren" },
    ];
    fireEvent.change(parent, { target: { value: "" } });
    const purpose = screen.getByLabelText(label("zh", "master.purpose"));
    fireEvent.change(purpose, { target: { value: "clearing" } });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.save") }));
    expect(await screen.findByText(label("zh", "master.contraChildren"))).toBeTruthy();
    expect(purpose.getAttribute("aria-describedby")).toBe("account-purpose-error");
    expect(screen.getByLabelText<HTMLInputElement>(label("zh", "master.name")).value).toBe(
      "My pending edit",
    );
    expect(screen.queryByRole("button", { name: label("zh", "master.reload") })).toBeNull();
    rejected = { status: 409, body: conflict };
    fireEvent.change(purpose, { target: { value: "general" } });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.save") }));
    expect(await screen.findByText(label("zh", "master.conflict"))).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(label("zh", "master.name")).value).toBe(
      "My pending edit",
    );
    expect(screen.getByText("Equipment")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.reload") }));
    await waitFor(() => expect(screen.queryByLabelText(label("zh", "master.name"))).toBeNull());
  });
  it("loads bounded pages and virtualizes the DOM only when the loaded chart exceeds 100 rows", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, 1000, 480),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const rows = Array.from({ length: 200 }, (_, index) => ({
      ...account,
      code: String(6000 + index),
      name: `Account ${index}`,
    }));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      expect(url.searchParams.get("limit")).toBe("100");
      const next = url.searchParams.has("cursor");
      return response({
        items: next ? rows.slice(100) : rows.slice(0, 100),
        nextCursor: next ? null : "6099",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    expect(await screen.findByText("Account 0")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(101);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: label("zh", "master.loadMore") })).toBeNull(),
    );
    expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("201");
    expect(screen.getAllByRole("row").length).toBeLessThan(40);
    expect(fetcher.mock.calls).toHaveLength(3);
  });
  it("keeps a late accepted write scoped to its company and refreshes its chart on return", async () => {
    let accept: (reply: Response) => void = () => {
      throw new Error("Save was not started");
    };
    let accepted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
        if (init?.method)
          return new Promise<Response>((resolve) => {
            accept = resolve;
          });
        const url = new URL(String(path), "http://localhost");
        if (url.pathname === "/api/v1/companies")
          return response({
            items: [company, { ...company, code: "B", name: "Beta" }],
            nextCursor: null,
          });
        return response({
          items: url.searchParams.get("company") === "DEFAULT" && accepted ? [account] : [],
          nextCursor: null,
        });
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "master.new") }));
    fireEvent.change(screen.getByLabelText(label("zh", "master.code")), {
      target: { value: "1500" },
    });
    fireEvent.change(screen.getByLabelText(label("zh", "master.name")), {
      target: { value: "Equipment" },
    });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.save") }));
    fireEvent.change(screen.getByLabelText(label("zh", "master.company")), {
      target: { value: "B" },
    });
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "master.new") }));
    fireEvent.change(screen.getByLabelText(label("zh", "master.name")), {
      target: { value: "Keep Beta draft" },
    });
    await act(async () => {
      accepted = true;
      accept(response(account, 201));
    });
    expect(screen.getByLabelText<HTMLInputElement>(label("zh", "master.name")).value).toBe(
      "Keep Beta draft",
    );
    fireEvent.change(screen.getByLabelText(label("zh", "master.company")), {
      target: { value: "DEFAULT" },
    });
    expect(await screen.findByText("Equipment")).toBeTruthy();
  });
});

it("shows the page description verbatim in zh and en whether teaching is off or on (UI-16)", async () => {
  window.history.replaceState(null, "", "/#/accounts");
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockImplementation(async (path) =>
        new URL(String(path), "http://localhost").pathname === "/api/v1/companies"
          ? response({ items: [company], nextCursor: null })
          : response({ items: [], nextCursor: null }),
      ),
  );
  const expected = {
    zh: "按公司维护会计科目的类别、报表分组、余额方向与手工录入权限。",
    en: "Maintain each company's accounts: category, report group, normal side and manual-entry permission.",
  };
  expect(Array.from(expected.zh).length).toBeLessThanOrEqual(40);
  expect(expected.en.length).toBeLessThanOrEqual(120);
  const { container } = render(<App />);
  await screen.findByRole("heading", { level: 2, name: label("zh", "master.title") });
  const assertHeader = (language: "zh" | "en", teaching: boolean) => {
    const heading = screen.getByRole("heading", {
      level: 2,
      name: label(language, "master.title"),
    });
    const description = heading.nextElementSibling;
    expect(description?.tagName).toBe("P");
    expect(description?.textContent).toBe(expected[language]);
    expect(label(language, "master.description")).toBe(expected[language]);
    const tips = [...container.querySelectorAll("aside.teaching-tip")].filter(
      (tip) => tip.getAttribute("aria-label") === label(language, "master.teachingTitle"),
    );
    expect(tips).toHaveLength(teaching ? 1 : 0);
  };
  const switchTo = (from: "zh" | "en", to: "zh" | "en") =>
    fireEvent.change(screen.getByLabelText(label(from, "shell.language")), {
      target: { value: to },
    });
  for (const teaching of [false, true]) {
    if (teaching)
      fireEvent.click(screen.getByLabelText(label("zh", "shell.showTeachingExplanations")));
    assertHeader("zh", teaching);
    switchTo("zh", "en");
    assertHeader("en", teaching);
    switchTo("en", "zh");
  }
});
// TLIST-03: "Refresh list" re-reads page one of the selected company's chart, and nothing else.
const PAGE_SIZE = 100;
const PAGE_ROWS = PAGE_SIZE + 1; // aria-rowcount counts the header row.
const REFRESH_TEXT = { zh: "刷新列表", en: "Refresh list" } as const;
const VIEWPORT = new DOMRect(0, 0, 1000, 480);
const beta = { ...company, code: "B", name: "Beta" };
const pageRows = (page: number) =>
  Array.from({ length: PAGE_SIZE }, (_, index) => ({
    ...account,
    code: String(6000 + page * PAGE_SIZE + index),
    name: `Account ${page * PAGE_SIZE + index}`,
  }));
const pageFor = (url: URL) =>
  url.searchParams.has("cursor")
    ? response({ items: pageRows(1), nextCursor: null })
    : response({ items: pageRows(0), nextCursor: String(6000 + PAGE_SIZE - 1) });
// Two companies, each with two chart pages; `answer` may override a chart reply. Chart reads are recorded.
function stubTwoPages(answer?: () => Promise<Response> | undefined) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(VIEWPORT);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const reads: { url: URL; signal: AbortSignal }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/v1/companies")
      return response({ items: [company, beta], nextCursor: null });
    reads.push({ url, signal: init.signal as AbortSignal });
    return (await answer?.()) ?? pageFor(url);
  });
  return reads;
}
const refreshButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: REFRESH_TEXT.zh });
const newButton = () => screen.getByRole("button", { name: label("zh", "master.new") });
const retryButton = () => screen.getByRole("button", { name: label("zh", "master.retry") });
const rowCount = () => screen.getByRole("table").getAttribute("aria-rowcount");
const readQuery = ({ url }: { url: URL }) => url.search;
const firstPageQuery = (code: string) => `?company=${code}&limit=${PAGE_SIZE}`;
// Clicks Refresh list, then expects exactly one more chart read, of `code`'s first page, shown alone.
async function expectOneReread(reads: { url: URL }[], code = "DEFAULT") {
  const from = reads.length;
  fireEvent.click(refreshButton());
  await waitFor(() => expect(reads.slice(from).map(readQuery)).toEqual([firstPageQuery(code)]));
  await waitFor(() => expect(rowCount()).toBe(String(PAGE_ROWS)));
  expect(screen.getAllByText("Account 0")).toHaveLength(1);
}
describe("TLIST-03 chart of accounts refresh list", () => {
  it("L2: places a secondary Refresh list button after New account in zh and en", async () => {
    stubTwoPages();
    render(<App />);
    for (const language of ["zh", "en"] as const) {
      const languageSelect = await screen.findByLabelText(label("zh", "shell.language"));
      fireEvent.change(languageSelect, { target: { value: language } });
      const text = REFRESH_TEXT[language];
      const refresh = await screen.findByRole("button", { name: text });
      expect(refresh.parentElement?.textContent).toBe(`${label(language, "master.new")}${text}`);
      expect(refresh.outerHTML).toMatch(/^<button type="button" class="btn btn-secondary">/);
    }
  });
  it("L3: after two pages, re-reads only the first page and offers Load more again", async () => {
    const reads = stubTwoPages();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() => expect(rowCount()).toBe(String(2 * PAGE_SIZE + 1)));
    await expectOneReread(reads);
    expect(screen.getByRole("button", { name: label("zh", "master.loadMore") })).toBeTruthy();
  });
  it("L4 / L7: Refresh list is the native button after New and refreshes an open dirty editor without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const reads = stubTwoPages();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "master.new") }));
    const name = screen.getByLabelText<HTMLInputElement>(label("zh", "master.name"));
    fireEvent.change(name, { target: { value: "Unsaved draft" } });
    expect(newButton().nextElementSibling).toBe(refreshButton());
    expect(refreshButton().outerHTML).toMatch(/^<button type="button" class="btn btn-secondary">/);
    expect(refreshButton().disabled).toBe(false);
    await expectOneReread(reads);
    expect(screen.getByLabelText(label("zh", "master.name"))).toBe(name);
    expect(name.value).toBe("Unsaved draft");
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("DEFAULT · Teaching").id).toBe("master-company");
  });
  it("L5: a second click cancels the first request and shows page one once; a failure shows the notice", async () => {
    const held: (() => void)[] = [];
    let answer: (() => Promise<Response>) | undefined;
    const reads = stubTwoPages(() => answer?.());
    render(<App />);
    await screen.findByText("Account 0");
    answer = () => new Promise((resolve) => held.push(() => resolve(pageFor(reads[0].url))));
    fireEvent.click(refreshButton());
    fireEvent.click(refreshButton());
    await waitFor(() => expect(held).toHaveLength(2));
    expect(reads.slice(-2).map(({ signal }) => signal.aborted)).toEqual([true, false]);
    for (const release of held) release();
    await waitFor(() => expect(rowCount()).toBe(String(PAGE_ROWS)));
    expect(screen.getAllByText("Account 0")).toHaveLength(1);
    answer = () => Promise.reject(new TypeError("offline"));
    fireEvent.click(refreshButton());
    expect(await screen.findByRole("alert")).toBe(retryButton().parentElement);
  });
  it("L6: refreshes the selected second company and never the first", async () => {
    const reads = stubTwoPages();
    render(<App />);
    await screen.findByText("Account 0");
    fireEvent.change(screen.getByLabelText(label("zh", "master.company")), {
      target: { value: beta.code },
    });
    await waitFor(() => expect(reads.map(readQuery).at(-1)).toBe(firstPageQuery(beta.code)));
    await screen.findByText("Account 0");
    await expectOneReread(reads, beta.code);
  });
});

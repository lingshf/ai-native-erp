import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { label } from "../src/ui/index.ts";
import type { DimensionDto } from "@erp/core/contracts";
const company = {
  code: "DEFAULT",
  name: "Teaching",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "monthly-teaching",
  revision: 1,
};
const dimension: DimensionDto = {
  kind: "dimension",
  code: "DEPT",
  name: "Department",
  revision: 1,
  active: true,
  from: "2026-01-01",
  to: "2026-12-31",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => window.history.replaceState(null, "", "/#/dimensions"));
afterEach(() => window.history.replaceState(null, "", "/"));
describe("dimension maintenance", () => {
  it("creates and edits definitions, loads bounded value pages with virtual DOM and preserves draft preferences", async () => {
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
    let rows: DimensionDto[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      if (options?.method) {
        const body = JSON.parse(String(options.body));
        const saved = { ...body.config, revision: body.config.revision + 1 };
        rows = [saved];
        return response(saved, options.method === "POST" ? 201 : 200);
      }
      if (url.searchParams.get("kind") === "value") {
        expect(url.searchParams.get("limit")).toBe("100");
        const next = url.searchParams.has("cursor");
        return response({
          items: Array.from({ length: 100 }, (_, index) => ({
            ...dimension,
            kind: "value",
            dimension: "DEPT",
            code: `V${String(index + (next ? 100 : 0)).padStart(3, "0")}`,
            name: `Value ${index + (next ? 100 : 0)}`,
          })),
          nextCursor: next ? null : "V099",
        });
      }
      return response({ items: rows, nextCursor: null });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "dim.new") }));
    fireEvent.change(screen.getByLabelText(label("zh", "dim.code")), { target: { value: "DEPT" } });
    const name = screen.getByLabelText<HTMLInputElement>(label("zh", "dim.name"));
    fireEvent.change(name, { target: { value: "Department" } });
    fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
      target: { value: "en" },
    });
    expect(screen.getByLabelText(label("en", "dim.name"))).toBe(name);
    fireEvent.click(screen.getByRole("button", { name: label("en", "dim.save") }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit configuration DEPT" }));
    fireEvent.click(screen.getByLabelText(label("en", "master.active")));
    fireEvent.click(screen.getByRole("button", { name: label("en", "dim.save") }));
    await waitFor(() => expect(screen.queryByLabelText(label("en", "dim.name"))).toBeNull());
    fireEvent.change(screen.getByLabelText(label("en", "dim.kind")), {
      target: { value: "value" },
    });
    fireEvent.change(await screen.findByLabelText(label("en", "dim.parent")), {
      target: { value: "DEPT" },
    });
    expect(await screen.findByText("Value 0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: label("en", "master.loadMore") }));
    await waitFor(() =>
      expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("201"),
    );
    expect(screen.getAllByRole("row").length).toBeLessThan(40);
    expect(
      fetcher.mock.calls
        .filter(([, options]) => options?.method)
        .map(([, options]) => JSON.parse(String(options?.body)).config.revision),
    ).toEqual([0, 1]);
  });
  it("keeps structure input and localizes the exact error path without pretending validation is CAS", async () => {
    let command: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (options?.method) {
          command = JSON.parse(String(options.body));
          return response(
            {
              code: "INVALID_REQUEST",
              messageKey: "api.error.invalidRequest",
              params: {},
              fieldErrors: [{ path: "required.0", messageKey: "api.error.dimensions.reference" }],
              requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
              retryable: false,
            },
            400,
          );
        }
        return response({ items: [], nextCursor: null });
      }),
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText(label("zh", "dim.kind")), {
      target: { value: "structure" },
    });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "dim.new") }));
    fireEvent.change(screen.getByLabelText(label("zh", "dim.code")), { target: { value: "1000" } });
    const required = screen.getByLabelText<HTMLInputElement>(label("zh", "dim.required"));
    fireEvent.change(required, { target: { value: "MISSING" } });
    expect(screen.getByText(label("zh", "dim.allowedHint"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "dim.save") }));
    expect(
      await screen.findByText(`required.0: ${label("zh", "dim.issue.reference")}`),
    ).toBeTruthy();
    expect(required.value).toBe("MISSING");
    expect(required.getAttribute("aria-describedby")).toBe("dim-required-error");
    expect(screen.queryByRole("button", { name: label("zh", "master.reload") })).toBeNull();
    fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
      target: { value: "en" },
    });
    expect(screen.getByText(`required.0: ${label("en", "dim.issue.reference")}`)).toBeTruthy();
    expect(command).toMatchObject({ config: { kind: "structure", required: ["MISSING"] } });
    expect(Object.hasOwn((command as { config: object }).config, "match")).toBe(false);
  });
});

it("shows the page description verbatim in zh and en whether teaching is off or on (UI-16)", async () => {
  window.history.replaceState(null, "", "/#/dimensions");
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
    zh: "配置维度、维度值、科目维度结构、默认值、派生规则与平衡维度。",
    en: "Configure dimensions, values, account structures, defaults, derivation rules and balancing dimensions.",
  };
  expect(Array.from(expected.zh).length).toBeLessThanOrEqual(40);
  expect(expected.en.length).toBeLessThanOrEqual(120);
  const { container } = render(<App />);
  await screen.findByRole("heading", { level: 2, name: label("zh", "dim.title") });
  const assertHeader = (language: "zh" | "en", teaching: boolean) => {
    const heading = screen.getByRole("heading", { level: 2, name: label(language, "dim.title") });
    const description = heading.nextElementSibling;
    expect(description?.tagName).toBe("P");
    expect(description?.textContent).toBe(expected[language]);
    expect(label(language, "dim.description")).toBe(expected[language]);
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
// TLIST-04: "Refresh list" re-reads page one of the current dimension list, and nothing else.
const PAGE_SIZE = 100;
const PAGE_ROWS = PAGE_SIZE + 1; // aria-rowcount counts the header row.
const REFRESH_TEXT = { zh: "刷新列表", en: "Refresh list" } as const;
const beta = { ...company, code: "B", name: "Beta" };
const valueRows = (page: number) =>
  Array.from({ length: PAGE_SIZE }, (_, index) => ({
    ...dimension,
    kind: "value",
    dimension: dimension.code,
    code: `V${String(page * PAGE_SIZE + index).padStart(3, "0")}`,
    name: `Value ${page * PAGE_SIZE + index}`,
  }));
const valuePage = (next: boolean) =>
  response({ items: valueRows(next ? 1 : 0), nextCursor: next ? null : `V${PAGE_SIZE - 1}` });
// Two companies, DEPT and two value pages; `answer` may override a value reply. Reads are recorded.
function stubValuePages(answer?: () => Promise<Response> | undefined) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1000, 480),
  );
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
    if (url.searchParams.get("kind") !== "value")
      return response({ items: [dimension], nextCursor: null });
    return (await answer?.()) ?? valuePage(url.searchParams.has("cursor"));
  });
  return reads;
}
const refreshButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: REFRESH_TEXT.zh });
const newButton = () => screen.getByRole("button", { name: label("zh", "dim.new") });
const rowCount = () => screen.getByRole("table").getAttribute("aria-rowcount");
const readPath = ({ url }: { url: URL }) => `${url.pathname}${url.search}`;
const firstPagePath = (code: string) =>
  `/api/v1/dimensions?company=${code}&kind=value&limit=${PAGE_SIZE}&dimension=${dimension.code}`;
const choose = async (text: string, value: string) =>
  fireEvent.change(await screen.findByLabelText(text), { target: { value } });
async function openValues() {
  await choose(label("zh", "dim.kind"), "value");
  await screen.findByRole("option", { name: dimension.code });
  await choose(label("zh", "dim.parent"), dimension.code);
  await screen.findByText("Value 0");
}
// Clicks Refresh list; expects exactly one more read (no kind=dimension), of page one, shown alone.
async function expectOneReread(reads: { url: URL }[], code = company.code) {
  const from = reads.length;
  fireEvent.click(refreshButton());
  await waitFor(() => expect(reads.slice(from).map(readPath)).toEqual([firstPagePath(code)]));
  await waitFor(() => expect(rowCount()).toBe(String(PAGE_ROWS)));
  expect(screen.getAllByText("Value 0")).toHaveLength(1);
}
describe("TLIST-04 financial dimensions refresh list", () => {
  it("L2: places a secondary Refresh list button after New configuration in zh and en for both kinds", async () => {
    stubValuePages();
    render(<App />);
    const expectActions = async (language: "zh" | "en") => {
      const text = REFRESH_TEXT[language];
      const refresh = await screen.findByRole("button", { name: text });
      expect(refresh.parentElement?.textContent).toBe(`${label(language, "dim.new")}${text}`);
      expect(refresh.outerHTML).toMatch(/^<button type="button" class="btn btn-secondary">/);
    };
    await expectActions("zh");
    await openValues();
    await expectActions("zh");
    await choose(label("zh", "shell.language"), "en");
    await expectActions("en");
    await choose(label("en", "dim.kind"), "dimension");
    await expectActions("en");
  });
  it("L3: after two value pages, re-reads only the first page and offers Load more again", async () => {
    const reads = stubValuePages();
    render(<App />);
    await openValues();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() => expect(rowCount()).toBe(String(2 * PAGE_SIZE + 1)));
    await expectOneReread(reads);
    expect(screen.getByRole("button", { name: label("zh", "master.loadMore") })).toBeTruthy();
  });
  it("L4 / L7: Refresh list is the native button after New and refreshes an open dirty editor without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const reads = stubValuePages();
    render(<App />);
    await openValues();
    fireEvent.click(newButton());
    const name = screen.getByLabelText<HTMLInputElement>(label("zh", "dim.name"));
    fireEvent.change(name, { target: { value: "Unsaved draft" } });
    expect(newButton().nextElementSibling).toBe(refreshButton());
    expect(refreshButton().disabled).toBe(false);
    await expectOneReread(reads);
    expect(screen.getByLabelText(label("zh", "dim.name"))).toBe(name);
    expect(name.value).toBe("Unsaved draft");
    expect(confirm).not.toHaveBeenCalled();
    const selected = (key: "dim.kind" | "dim.parent") =>
      screen.getByLabelText<HTMLSelectElement>(label("zh", key)).value;
    expect([selected("dim.kind"), selected("dim.parent")]).toEqual(["value", dimension.code]);
  });
  it("L5: a second click cancels the first request and shows page one once; a failure shows the notice", async () => {
    const held: (() => void)[] = [];
    let answer: (() => Promise<Response>) | undefined;
    const reads = stubValuePages(() => answer?.());
    render(<App />);
    await openValues();
    answer = () => new Promise((resolve) => held.push(() => resolve(valuePage(false))));
    fireEvent.click(refreshButton());
    fireEvent.click(refreshButton());
    await waitFor(() => expect(held).toHaveLength(2));
    expect(reads.slice(-2).map(({ signal }) => signal.aborted)).toEqual([true, false]);
    for (const release of held) release();
    await waitFor(() => expect(rowCount()).toBe(String(PAGE_ROWS)));
    expect(screen.getAllByText("Value 0")).toHaveLength(1);
    answer = () => Promise.reject(new TypeError("offline"));
    fireEvent.click(refreshButton());
    const alert = await screen.findByRole("alert");
    expect(alert.contains(screen.getByText(label("zh", "master.retry")))).toBe(true);
  });
  it("L6: refreshes the selected second company and never the first", async () => {
    const reads = stubValuePages();
    render(<App />);
    await choose(label("zh", "master.company"), beta.code);

    await openValues();
    await expectOneReread(reads, beta.code);
  });
});

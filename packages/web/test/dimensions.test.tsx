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

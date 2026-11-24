import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";
import { masterTeaching } from "../src/ui/trade-master-teaching.ts";
import type { TradeDto } from "@erp/core/contracts";

const company = {
  code: "DEFAULT",
  name: "Company",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const terms: TradeDto = {
  kind: "tradeTerms",
  code: "NET30",
  active: true,
  revision: 1,
  data: {
    name: "Net 30",
    from: "2026-01-01",
    to: "2026-12-31",
    dueDays: 30,
    discountDays: 7,
    discountPercent: "1.5",
    allowPartialDiscount: true,
  },
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function tradeRow(code: string) {
  const row = screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryAllByRole("cell")[0]?.textContent === code);
  if (!row) throw new Error(`missing trade row ${code}`);
  return row;
}
// The read-only active column: the row keeps no checkbox, only one badge whose visible text names the state.
function activeBadge(code: string) {
  const row = tradeRow(code);
  expect(within(row).queryByRole("checkbox")).toBeNull();
  const badges = row.querySelectorAll<HTMLElement>(".badge");
  expect(badges).toHaveLength(1);
  const badge = badges[0];
  expect(badge.hasAttribute("tabindex")).toBe(false);
  expect(badge.querySelector("[tabindex], a, button, input")).toBeNull();
  const symbol = badge.querySelector('[aria-hidden="true"]')?.textContent ?? "";
  return { text: (badge.textContent ?? "").slice(symbol.length), tone: badge.className };
}
beforeEach(() => window.history.replaceState(null, "", "/#/trade"));
afterEach(() => window.history.replaceState(null, "", "/"));
describe("trade master maintenance", () => {
  it("shows the read-only active state of every kind as unfocusable badges", async () => {
    const period = { name: "Fixture", from: "2026-01-01", to: "2026-12-31" };
    const fixtures: { [K in TradeDto["kind"]]: Extract<TradeDto, { kind: K }>["data"] } = {
      tradeParty: {
        ...period,
        role: "vendor",
        apProfile: "AP",
        arProfile: null,
        terms: "NET30",
        allowedTaxCodes: [],
        defaultDimensions: {},
      },
      tradeProduct: {
        ...period,
        type: "expense",
        expenseAccount: "5000",
        revenueAccount: null,
        allowedTaxCodes: [],
        defaultDimensions: {},
      },
      tradeProfile: {
        ...period,
        side: "AP",
        controlAccount: "2100",
        advanceAccount: "1250",
        cashAccount: "1000",
        discountAccount: "4000",
      },
      tradeTerms: terms.data as Extract<TradeDto, { kind: "tradeTerms" }>["data"],
      taxCode: {
        ...period,
        mode: "ordinary",
        rates: [{ id: "R", from: "2026-01-01", to: "2026-12-31", ratePercent: "13" }],
        deductiblePercent: "100",
        inputAccount: "1400",
        outputAccount: "2200",
      },
    };
    const kinds = Object.keys(fixtures) as TradeDto["kind"][];
    const code = (kind: string, state: string) => `${kind.toUpperCase()}-${state}`;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        const kind = new URL(String(path), "http://localhost").pathname
          .split("/")
          .at(-1) as TradeDto["kind"];
        const row = { kind, active: true, revision: 1, data: fixtures[kind] };
        return response({
          items: [
            { ...row, code: code(kind, "ON") },
            { ...row, code: code(kind, "OFF"), active: false },
          ],
          nextCursor: null,
        });
      }),
    );
    render(<App />);
    await screen.findByRole("button", { name: label("zh", "trade.new") });
    let current: "zh" | "en" = "zh";
    for (const [index, kind] of kinds.entries()) {
      const language = index % 2 ? "en" : "zh";
      fireEvent.change(screen.getByLabelText(label(current, "shell.language")), {
        target: { value: language },
      });
      current = language;
      fireEvent.change(screen.getByLabelText(label(language, "trade.kind")), {
        target: { value: kind },
      });
      await screen.findByRole("button", {
        name: `${label(language, "trade.edit")} ${code(kind, "OFF")}`,
      });
      expect(activeBadge(code(kind, "ON"))).toEqual({
        text: label(language, "master.active"),
        tone: "badge success",
      });
      expect(tradeRow(code(kind, "ON")).querySelector(".badge")?.textContent).toBe(
        `✓${label(language, "master.active")}`,
      );
      expect(activeBadge(code(kind, "OFF"))).toEqual({
        text: label(language, "master.inactive"),
        tone: "badge",
      });
      const list = screen.getByRole("region", { name: label(language, `trade.${kind}`) });
      expect(list.querySelectorAll(".badge")).toHaveLength(2);
      expect(within(list).queryAllByRole("checkbox")).toHaveLength(0);
    }
  });
  it("preserves dirty drafts by locking object switches and confirming explicit cancellation or navigation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation(async (path) =>
          String(path).startsWith("/api/v1/companies")
            ? response({ items: [company, { ...company, code: "OTHER" }], nextCursor: null })
            : response({ items: [terms, { ...terms, code: "NET60" }], nextCursor: null }),
        ),
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText(label("zh", "trade.kind")), {
      target: { value: "tradeTerms" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: `${label("zh", "trade.edit")} NET30` }),
    );
    fireEvent.change(screen.getByLabelText(label("zh", "trade.name")), {
      target: { value: "Unfinished" },
    });
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "trade.kind")).disabled).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "master.company")).disabled).toBe(
      true,
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: label("zh", "trade.new") }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: `${label("zh", "trade.edit")} NET60` })
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.cancel") }));
    expect(confirm).toHaveBeenCalledWith(label("zh", "trade.discard"));
    fireEvent.click(screen.getByRole("link", { name: label("zh", "master.title") }));
    expect(window.location.hash).toBe("#/trade");
    expect(screen.getByLabelText<HTMLInputElement>(label("zh", "trade.name")).value).toBe(
      "Unfinished",
    );
    const sidebar = screen.getByRole("link", { name: label("zh", "master.title") });
    const cancelNavigation = (event: Event) => event.preventDefault();
    confirm.mockClear().mockReturnValue(true);
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      sidebar.addEventListener("click", cancelNavigation, { once: true });
      fireEvent.click(sidebar, modifier);
      expect(window.location.hash).toBe("#/trade");
      expect(confirm).not.toHaveBeenCalled();
    }
    confirm.mockReturnValue(false);
    fireEvent.click(sidebar);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText<HTMLInputElement>(label("zh", "trade.name")).value).toBe(
      "Unfinished",
    );
    confirm.mockReturnValue(true);
    sidebar.addEventListener("click", cancelNavigation, { once: true });
    fireEvent.click(sidebar);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe("#/trade");
    confirm.mockReturnValue(false);
    fireEvent.click(sidebar);
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(window.location.hash).toBe("#/trade");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.cancel") }));
    expect(screen.queryByLabelText(label("zh", "trade.name"))).toBeNull();
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "trade.kind")).disabled).toBe(
      false,
    );
  });
  // D275: a cancelled real Back asks once, never calls history.go, keeps the address and the draft,
  // and leaves on the next confirmed Back (leave-guard-history.ts).
  it("cancels a real Back by keeping the address and draft, and leaves on a confirmed Back", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const go = vi.spyOn(window.history, "go");
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation(async (path) =>
          String(path).startsWith("/api/v1/companies")
            ? response({ items: [company], nextCursor: null })
            : response({ items: [terms], nextCursor: null }),
        ),
    );
    window.history.replaceState(null, "", "/#/accounts");
    window.history.pushState(null, "", "/#/trade");
    render(<App />);
    fireEvent.change(await screen.findByLabelText(label("zh", "trade.kind")), {
      target: { value: "tradeTerms" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: `${label("zh", "trade.edit")} NET30` }),
    );
    const name = () => screen.getByLabelText<HTMLInputElement>(label("zh", "trade.name"));
    fireEvent.change(name(), { target: { value: "Unfinished" } });
    const here = window.location.href;
    const back = async (calls: number) => {
      await act(async () => window.history.back());
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(calls));
      await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
      expect(confirm).toHaveBeenCalledTimes(calls);
    };
    for (const calls of [1, 2]) {
      await back(calls);
      expect(window.location.href).toBe(here);
      expect(name().value).toBe("Unfinished");
    }
    confirm.mockReturnValue(true);
    await back(3);
    await waitFor(() => expect(window.location.hash).toBe("#/accounts"));
    await waitFor(() => expect(screen.queryByLabelText(label("zh", "trade.name"))).toBeNull());
    expect(go).not.toHaveBeenCalled();
  });
  it("blocks context, sidebar and browser navigation until a write response settles without aborting it", async () => {
    let finish: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (options?.method) {
          expect(options.signal).toBeUndefined();
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        }
        return response({ items: [terms], nextCursor: null });
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    fireEvent.change(await screen.findByLabelText(label("zh", "trade.kind")), {
      target: { value: "tradeTerms" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: `${label("zh", "trade.edit")} NET30` }),
    );
    fireEvent.change(screen.getByLabelText(label("zh", "trade.name")), {
      target: { value: "Saving" },
    });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "dim.save") }));
    await screen.findByText(label("zh", "master.saving"));
    fireEvent.click(screen.getByRole("link", { name: label("zh", "master.title") }));
    expect(window.location.hash).toBe("#/trade");
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "trade.kind")).disabled).toBe(true);
    expect(
      screen
        .getByRole<HTMLButtonElement>("button", { name: label("zh", "master.cancel") })
        .closest("fieldset")?.disabled,
    ).toBe(true);
    act(() => {
      window.history.pushState(null, "", "/#/accounts");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(window.location.hash).toBe("#/trade");
    await act(async () => {
      finish?.(response({ ...terms, revision: 2, data: { ...terms.data, name: "Saving" } }));
    });
    await waitFor(() => expect(screen.queryByLabelText(label("zh", "trade.name"))).toBeNull());
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "trade.kind")).disabled).toBe(
      false,
    );
  });
  it("locks unknown outcomes and reconciles a committed save by retrying the identical CAS command", async () => {
    const writes: unknown[] = [];
    let saved: TradeDto = terms;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (options?.method) {
          const command = JSON.parse(String(options.body));
          writes.push(command);
          if (writes.length === 1) {
            saved = { ...terms, revision: 2, data: command.data };
            throw new TypeError("Lost response after commit");
          }
          if (writes.length === 2)
            return response(
              {
                code: "INVALID_REQUEST",
                messageKey: "api.error.invalidRequest",
                params: {},
                fieldErrors: [],
                requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
                retryable: false,
              },
              400,
            );
          return response(
            {
              code: "CONFLICT",
              messageKey: "api.error.conflict",
              params: {},
              fieldErrors: [],
              requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
              retryable: false,
            },
            409,
          );
        }
        if (String(path).includes("/NET30?")) return response(saved);
        return response({ items: [terms], nextCursor: null });
      }),
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText(label("zh", "trade.kind")), {
      target: { value: "tradeTerms" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: `${label("zh", "trade.edit")} NET30` }),
    );
    fireEvent.change(screen.getByLabelText(label("zh", "trade.name")), {
      target: { value: "Accepted" },
    });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "dim.save") }));
    await screen.findByText(label("zh", "trade.uncertain"));
    expect(writes).toHaveLength(1);
    fireEvent.click(screen.getByRole("link", { name: label("zh", "master.title") }));
    expect(window.location.hash).toBe("#/trade");
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "trade.kind")).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "trade.reconcile") }));
    await waitFor(() => {
      expect(writes).toHaveLength(2);
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: label("zh", "trade.reconcile") })
          .disabled,
      ).toBe(false);
    });
    expect(screen.getByText(label("zh", "trade.uncertain"))).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>(label("zh", "trade.kind")).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: label("zh", "trade.reconcile") }));
    await waitFor(() => expect(screen.queryByLabelText(label("zh", "trade.name"))).toBeNull());
    expect(writes).toHaveLength(3);
    expect(writes[1]).toEqual(writes[0]);
    expect(writes[2]).toEqual(writes[0]);
  });
  it("creates and edits all five kinds with exact decimal input, CAS and immutable code; language changes preserve drafts", async () => {
    let rows: TradeDto[] = [];
    const writes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (options?.method) {
          const { expectedRevision, company: _, ...command } = JSON.parse(String(options.body));
          writes.push(JSON.parse(String(options.body)));
          const saved = { ...command, revision: expectedRevision + 1 };
          rows = [saved];
          return response(saved, options.method === "POST" ? 201 : 200);
        }
        const kind = new URL(String(path), "http://localhost").pathname.split("/").at(-1);
        return response({ items: rows.filter((row) => row.kind === kind), nextCursor: null });
      }),
    );
    render(<App />);
    await screen.findByRole("button", { name: label("zh", "trade.new") });
    for (const [kind, code, fields] of [
      ["tradeTerms", "NET30", {}],
      [
        "tradeProfile",
        "AP",
        {
          controlAccount: "2100",
          advanceAccount: "1250",
          cashAccount: "1000",
          discountAccount: "4000",
        },
      ],
      [
        "taxCode",
        "VAT",
        {
          rates: '[{"id":"R","from":"2026-01-01","to":"2026-12-31","ratePercent":"12"}]',
          inputAccount: "1400",
          outputAccount: "2200",
        },
      ],
      ["tradeParty", "VENDOR", { apProfile: "AP", terms: "NET30", allowedTaxCodes: "VAT" }],
      ["tradeProduct", "EXPENSE", { expenseAccount: "5000", allowedTaxCodes: "VAT" }],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label("zh", "trade.kind")), {
        target: { value: kind },
      });
      fireEvent.click(await screen.findByRole("button", { name: label("zh", "trade.new") }));
      fireEvent.change(screen.getByLabelText(label("zh", "trade.code")), {
        target: { value: code },
      });
      const name = screen.getByLabelText<HTMLInputElement>(label("zh", "trade.name"));
      fireEvent.change(name, { target: { value: `Name ${code}` } });
      for (const [field, value] of Object.entries(fields))
        fireEvent.change(
          screen.getByLabelText(label("zh", `trade.${field as keyof typeof fields}`)),
          { target: { value } },
        );
      fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
        target: { value: "en" },
      });
      expect(screen.getByLabelText(label("en", "trade.name"))).toBe(name);
      fireEvent.click(screen.getByRole("button", { name: label("en", "dim.save") }));
      fireEvent.click(
        await screen.findByRole("button", { name: `${label("en", "trade.edit")} ${code}` }),
      );
      expect(screen.getByLabelText<HTMLInputElement>(label("en", "trade.code")).disabled).toBe(
        true,
      );
      fireEvent.click(screen.getByLabelText(label("en", "master.active")));
      fireEvent.click(screen.getByRole("button", { name: label("en", "dim.save") }));
      await waitFor(() => expect(screen.queryByLabelText(label("en", "trade.name"))).toBeNull());
      fireEvent.change(screen.getByLabelText(label("en", "shell.language")), {
        target: { value: "zh" },
      });
    }
    expect(writes).toHaveLength(10);
    expect(writes[0]).toMatchObject({
      kind: "tradeTerms",
      expectedRevision: 0,
      data: { discountPercent: "1.5" },
    });
    expect(writes[1]).toMatchObject({ expectedRevision: 1, active: false });
    expect(writes[6]).toMatchObject({
      kind: "tradeParty",
      data: { arProfile: null, allowedTaxCodes: ["VAT"] },
    });
    expect(writes[8]).toMatchObject({ kind: "tradeProduct", data: { revenueAccount: null } });
  });
  it("virtualizes more than 100 rows and sends bounded, company-scoped prefix search requests", async () => {
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
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return response({ items: [company], nextCursor: null });
      expect(url.searchParams.get("company")).toBe("DEFAULT");
      expect(url.searchParams.get("limit")).toBe("100");
      if (url.searchParams.get("search"))
        return response({
          items: [{ ...terms, data: { ...terms.data, name: "Filtered" } }],
          nextCursor: null,
        });
      const next = url.searchParams.has("cursor");
      return response({
        items: Array.from({ length: 100 }, (_, index) => ({
          ...terms,
          code: `N${String(index + (next ? 100 : 0)).padStart(3, "0")}`,
        })),
        nextCursor: next ? null : "N099",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await screen.findByText("N000");
    fireEvent.click(screen.getByRole("button", { name: label("zh", "master.loadMore") }));
    await waitFor(() =>
      expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("201"),
    );
    expect(screen.getAllByRole("row").length).toBeLessThan(40);
    fireEvent.change(screen.getByLabelText(label("zh", "trade.search")), {
      target: { value: "Literal_%" },
    });
    expect(await screen.findByText("Filtered")).toBeTruthy();
    expect(fetcher.mock.calls.some(([path]) => String(path).includes("search=Literal_%25"))).toBe(
      true,
    );
  });
  it("renders the master data teaching tip only while teaching is on and keeps errors visible", async () => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (options?.method)
          return response(
            {
              code: "INVALID_REQUEST",
              messageKey: "api.error.invalidRequest",
              params: {},
              fieldErrors: [{ path: "data.rates", messageKey: "api.error.trade.window" }],
              requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
              retryable: false,
            },
            400,
          );
        return response({ items: [], nextCursor: null });
      }),
    );
    render(<App />);
    const tip = (language: "zh" | "en") =>
      screen.queryByText(masterTeaching(language, label(language, "trade.teaching")));
    fireEvent.change(await screen.findByLabelText(label("zh", "trade.kind")), {
      target: { value: "tradeTerms" },
    });
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "trade.new") }));
    expect(tip("zh")).toBeNull();
    fireEvent.click(screen.getByLabelText(label("zh", "shell.showTeachingExplanations")));
    expect(tip("zh")?.closest("aside")?.getAttribute("aria-label")).toBe(
      label("zh", "master.teachingTitle"),
    );
    fireEvent.change(screen.getByLabelText(label("zh", "shell.language")), {
      target: { value: "en" },
    });
    expect(tip("zh")).toBeNull();
    expect(tip("en")?.closest("aside")?.getAttribute("aria-label")).toBe(
      label("en", "master.teachingTitle"),
    );
    fireEvent.change(screen.getByLabelText(label("en", "trade.code")), {
      target: { value: "NET30" },
    });
    fireEvent.change(screen.getByLabelText(label("en", "trade.name")), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: label("en", "dim.save") }));
    const issue = `data.rates: ${label("en", "trade.issue.window")}`;
    expect(await screen.findByText(issue)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(label("en", "shell.showTeachingExplanations")));
    expect(tip("en")).toBeNull();
    expect(screen.getByText(issue)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(label("en", "trade.name")).value).toBe("Draft");
    fireEvent.change(screen.getByLabelText(label("en", "shell.language")), {
      target: { value: "zh" },
    });
    window.localStorage.clear();
  });
  it("keeps failed drafts and distinguishes field errors from stale-revision reload", async () => {
    let conflict = false;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
        if (String(path).startsWith("/api/v1/companies"))
          return response({ items: [company], nextCursor: null });
        if (options?.method)
          return response(
            {
              code: conflict ? "CONFLICT" : "INVALID_REQUEST",
              messageKey: "api.error.invalidRequest",
              params: {},
              fieldErrors: conflict
                ? []
                : [{ path: "data.rates", messageKey: "api.error.trade.window" }],
              requestId: "4bf203b5-e54f-434c-9100-969da1cd7e73",
              retryable: false,
            },
            conflict ? 409 : 400,
          );
        return response({ items: [], nextCursor: null });
      }),
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText(label("zh", "trade.kind")), {
      target: { value: "tradeTerms" },
    });
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "trade.new") }));
    fireEvent.change(screen.getByLabelText(label("zh", "trade.code")), {
      target: { value: "NET30" },
    });
    fireEvent.change(screen.getByLabelText(label("zh", "trade.name")), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: label("zh", "dim.save") }));
    expect(
      await screen.findByText(`data.rates: ${label("zh", "trade.issue.window")}`),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(label("zh", "trade.name")).value).toBe("Draft");
    expect(screen.queryByRole("button", { name: label("zh", "master.reload") })).toBeNull();
    conflict = true;
    fireEvent.click(screen.getByRole("button", { name: label("zh", "dim.save") }));
    fireEvent.click(await screen.findByRole("button", { name: label("zh", "master.reload") }));
    expect(screen.queryByLabelText(label("zh", "trade.name"))).toBeNull();
  });
});
// TLIST-02: "Refresh list" re-reads page one of the current company, kind and search, and no more.
const zh = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const FIRST_PAGE = ["NET01", "NET02"];
const SECOND_PAGE = ["NET03"];
const NEXT_CURSOR = "NET02";
const SEARCH = "NET";
const REFRESH_TEXT = { zh: "刷新列表", en: "Refresh list" } as const;
const CODE_CELLS = ".ui-master-scroll td:first-child";
const listUrl = (kind: string, search = "") =>
  `/api/v1/trade/${kind}?company=DEFAULT&limit=100${search ? `&search=${search}` : ""}`;
const termsUrl = listUrl("tradeTerms", SEARCH);
const listPage = (codes: string[], nextCursor: string | null = null) =>
  response({ items: codes.map((code) => ({ ...terms, code })), nextCursor });
const pageFor = (url: string) =>
  url.includes("cursor=") ? listPage(SECOND_PAGE) : listPage(FIRST_PAGE, NEXT_CURSOR);
// Lists answer `answer`'s reply, if any, or their page; every list URL and abort signal is recorded.
function stubTwoPages(answer?: () => Promise<Response> | undefined) {
  const record = { urls: [] as string[], signals: [] as AbortSignal[] };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url.startsWith("/api/v1/companies"))
      return response({ items: [company], nextCursor: null });
    record.urls.push(url);
    record.signals.push(init.signal as AbortSignal);
    return (await answer?.()) ?? pageFor(url);
  });
  return record;
}
const shownCodes = () => [...document.querySelectorAll(CODE_CELLS)].map((cell) => cell.textContent);
const expectCodes = (codes: string[]) => waitFor(() => expect(shownCodes()).toEqual(codes));
const refreshButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: REFRESH_TEXT.zh });
const newButton = () => screen.getByRole<HTMLButtonElement>("button", { name: zh("trade.new") });
const clickRefresh = () => fireEvent.click(refreshButton());
const selectKind = async (kind: string) =>
  fireEvent.change(await screen.findByLabelText(zh("trade.kind")), { target: { value: kind } });
// Runs `trigger`, then expects exactly one more list request, to `url`, showing the first page.
async function expectOneReread(urls: string[], trigger: () => void, url = termsUrl) {
  const from = urls.length;
  trigger();
  await waitFor(() => expect(urls.slice(from)).toEqual([url]));
  await expectCodes(FIRST_PAGE);
}
async function openTermsSearch(urls: string[]) {
  render(<App />);
  await selectKind("tradeTerms");
  const search = screen.getByLabelText(zh("trade.search"));
  await expectOneReread(urls, () => fireEvent.change(search, { target: { value: SEARCH } }));
}
describe("TLIST-02 trade master refresh list", () => {
  it("L2: places a secondary Refresh list button after New configuration in zh and en", async () => {
    stubTwoPages();
    render(<App />);
    for (const language of ["zh", "en"] as const) {
      const languageSelect = await screen.findByLabelText(label("zh", "shell.language"));
      fireEvent.change(languageSelect, { target: { value: language } });
      const text = REFRESH_TEXT[language];
      const refresh = await screen.findByRole("button", { name: text });
      expect(refresh.parentElement?.textContent).toBe(`${label(language, "trade.new")}${text}`);
      expect(refresh.outerHTML).toMatch(/^<button type="button" class="btn btn-secondary">/);
    }
  });
  it("L3 / L6: after two pages, re-reads only the first page of the search, then of a switched kind", async () => {
    const { urls } = stubTwoPages();
    await openTermsSearch(urls);
    fireEvent.click(screen.getByRole("button", { name: zh("master.loadMore") }));
    await expectCodes([...FIRST_PAGE, ...SECOND_PAGE]);
    await expectOneReread(urls, clickRefresh);
    await expectOneReread(urls, () => void selectKind("tradeProduct"), listUrl("tradeProduct"));
    await expectOneReread(urls, clickRefresh, listUrl("tradeProduct"));
  });
  it("L5: a second click cancels the first request and shows the winner once; a failure shows the notice", async () => {
    const held: ((codes: string[]) => void)[] = [];
    let answer: (() => Promise<Response>) | undefined;
    const { urls, signals } = stubTwoPages(() => answer?.());
    await openTermsSearch(urls);
    answer = () => new Promise((resolve) => held.push((codes) => resolve(listPage(codes))));
    clickRefresh();
    await waitFor(() => expect(held).toHaveLength(1));
    clickRefresh();
    await waitFor(() => expect(held).toHaveLength(2));
    expect(signals.slice(-2).map((signal) => signal.aborted)).toEqual([true, false]);
    held[0]?.(["NET08"]); // The cancelled request answers first; only the winner is listed.
    held[1]?.(["NET09"]);
    await expectCodes(["NET09"]);
    answer = () => Promise.reject(new TypeError("offline"));
    clickRefresh();
    within(await screen.findByRole("alert")).getByRole("button", { name: zh("master.retry") });
  });
  it("L4 / L7: Refresh list is the native button after New and stays enabled to refresh a dirty draft without asking", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { urls } = stubTwoPages();
    await openTermsSearch(urls);
    expect(newButton().nextElementSibling).toBe(refreshButton());
    expect(refreshButton().hasAttribute("tabindex")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: `${zh("trade.edit")} NET01` }));
    fireEvent.change(screen.getByLabelText(zh("trade.name")), { target: { value: "Unfinished" } });
    expect([newButton().disabled, refreshButton().disabled]).toEqual([true, false]);
    await expectOneReread(urls, clickRefresh);
    const kept = (["trade.name", "trade.search", "trade.kind", "master.company"] as const).map(
      (key) => screen.getByLabelText<HTMLInputElement | HTMLSelectElement>(zh(key)).value,
    );
    expect(kept).toEqual(["Unfinished", SEARCH, "tradeTerms", "DEFAULT"]);
    expect(confirm).not.toHaveBeenCalled();
  });
});
// TMAS-01 (D539): both term-day fields take only whole numbers 0–3650 and show one dedicated message.
type DayField = "dueDays" | "discountDays";
type TermsField = "name" | DayField | "discountPercent" | "rates";
// Records every save (POST / PUT) body; lists stay empty.
function stubTradeWrites() {
  const writes: { data: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/v1/companies"))
      return response({ items: [company], nextCursor: null });
    if (!init?.method) return response({ items: [], nextCursor: null });
    const command = JSON.parse(String(init.body));
    writes.push(command);
    const { company: _, expectedRevision, ...saved } = command;
    return response({ ...saved, revision: expectedRevision + 1 }, 201);
  });
  return writes;
}
const fill = (fields: Partial<Record<TermsField, string>>) => {
  for (const [field, value] of Object.entries(fields))
    fireEvent.change(screen.getByLabelText(zh(`trade.${field as TermsField}`)), {
      target: { value },
    });
};
// Submits the form directly, as a script would, so native `required` does not intervene.
const submitDraft = () =>
  fireEvent.submit(screen.getByRole("button", { name: zh("dim.save") }).closest("form") as Element);
async function openNew(
  kind: "tradeTerms" | "taxCode",
  fields: Partial<Record<TermsField, string>>,
) {
  await selectKind(kind);
  fireEvent.click(await screen.findByRole("button", { name: zh("trade.new") }));
  fill({ name: "Terms", ...fields });
  fireEvent.change(screen.getByLabelText(zh("trade.code")), {
    target: { value: "T1" },
  });
}
const errorBar = () => document.getElementById("trade-error")?.textContent;
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
// What the user sees after one submit: the error bar, the field's ARIA and DOM, and saves sent.
function outcome(field: DayField, writes: unknown[], language: "zh" | "en" = "zh") {
  const input = screen.queryByLabelText<HTMLInputElement>(label(language, `trade.${field}`));
  return {
    error: errorBar(),
    invalid: input?.getAttribute("aria-invalid"),
    describedBy: input?.getAttribute("aria-describedby"),
    type: input?.getAttribute("type"),
    required: input?.required,
    extra: ["min", "max", "inputmode", "pattern"].filter((name) => input?.hasAttribute(name)),
    requests: writes.length,
  };
}
const wholeDaysIssue = (field: DayField, language: "zh" | "en" = "zh") => ({
  error: `data.${field}: ${label(language, "trade.issue.wholeDays")}`,
  invalid: "true",
  describedBy: "trade-error",
  type: "text",
  required: true,
  extra: [],
  requests: 0,
});
// Submits each value in a fresh editor, so a value that saves cannot hide the next one.
async function submitEach(
  field: DayField,
  values: string[],
  fields: Partial<Record<TermsField, string>> = {},
) {
  const writes = stubTradeWrites();
  const seen: Record<string, ReturnType<typeof outcome>> = {};
  let view: ReturnType<typeof render> | undefined;
  for (const value of values) {
    view?.unmount();
    writes.length = 0;
    view = render(<App />);
    await openNew("tradeTerms", { ...fields, [field]: value });
    submitDraft();
    await settle();
    seen[value] = outcome(field, writes);
  }
  return seen;
}
const expectEach = (field: DayField, values: string[], seen: Record<string, unknown>) =>
  expect(seen).toEqual(Object.fromEntries(values.map((value) => [value, wholeDaysIssue(field)])));
describe("TMAS-01 trade term days validation", () => {
  for (const [id, field, values] of [
    ["V1", "dueDays", ["30.0"]],
    ["V2", "discountDays", ["1e2", "0x10"]],
    ["V3", "dueDays", ["", "   "]],
    ["V4", "dueDays", ["-1", "3651", "abc", "３０"]],
  ] as const)
    it(`TMAS-01 ${id} / N4: rejects ${field} ${values.map((value) => JSON.stringify(value)).join(", ")} with a dedicated message and no request`, async () => {
      expectEach(field, [...values], await submitEach(field, [...values]));
    });
  it("TMAS-01 V5: the whitespace-only due date message follows a zh → en switch", async () => {
    const writes = stubTradeWrites();
    render(<App />);
    await openNew("tradeTerms", { dueDays: "   " });
    submitDraft();
    await settle();
    fireEvent.change(screen.getByLabelText(zh("shell.language")), {
      target: { value: "en" },
    });
    expect(errorBar()).toBe("data.dueDays: Enter a whole number from 0 to 3650.");
    expect(outcome("dueDays", writes, "en")).toEqual(wholeDaysIssue("dueDays", "en"));
  });
  it("TMAS-01 V6: reports the days field before contract issues such as an empty name", async () => {
    expectEach("dueDays", ["x"], await submitEach("dueDays", ["x"], { name: "" }));
  });
  it("TMAS-01 N1: saves trimmed whole days with leading zeros as JSON numbers", async () => {
    const writes = stubTradeWrites();
    render(<App />);
    for (const [value, days] of [
      ["0", 0],
      ["3650", 3650],
      [" 45 ", 45],
      ["007", 7],
    ] as const) {
      await openNew("tradeTerms", { dueDays: value, discountDays: value });
      submitDraft();
      await waitFor(() => expect(screen.queryByLabelText(zh("trade.code"))).toBeNull());
      expect(writes.at(-1)?.data).toMatchObject({
        dueDays: days,
        discountDays: days,
      });
    }
    expect(writes).toHaveLength(4);
  });
  it("TMAS-01 N2: other fields keep the generic shape message", async () => {
    const writes = stubTradeWrites();
    render(<App />);
    await openNew("tradeTerms", { discountPercent: "abc" });
    submitDraft();
    expect(errorBar()).toBe(`data.discountPercent: ${zh("trade.issue.shape")}`);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: zh("master.cancel") }));
    await openNew("taxCode", { rates: "[" });
    submitDraft();
    expect(errorBar()).toBe(`data.rates: ${zh("trade.issue.shape")}`);
    await settle();
    expect(writes).toEqual([]);
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { App } from "../src/App.tsx";
import { label } from "../src/ui/index.ts";
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
beforeEach(() => window.history.replaceState(null, "", "/#/trade"));
afterEach(() => window.history.replaceState(null, "", "/"));
describe("trade master maintenance", () => {
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

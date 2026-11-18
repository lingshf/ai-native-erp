import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
describe("account editing", () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Edit 1500" }));
    fireEvent.click(screen.getByLabelText(label("en", "master.active")));
    fireEvent.click(screen.getByRole("button", { name: label("en", "master.save") }));
    await waitFor(() => expect(screen.queryByLabelText(label("en", "master.name"))).toBeNull());
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Active 1500" }).checked).toBe(
      false,
    );
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

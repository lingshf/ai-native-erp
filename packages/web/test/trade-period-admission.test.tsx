import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { periodCommandSchema } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";
const t = (key: Exclude<LabelKey, "shell.httpError">) => label("zh", key);
const key = "erp.tradePeriod.v1.DEFAULT.2026-01";
const reply = (value: unknown) => new Response(JSON.stringify(value));
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/#/period-close?company=DEFAULT&month=2026-01");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
function mockApi() {
  const puts: string[] = [];
  let modules: ("trade" | "tax")[] = [],
    revision = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return reply({
          items: [
            {
              code: "DEFAULT",
              name: "Fictional",
              currency: "CNY",
              scale: 2,
              year: 2026,
              closeMode: "annual",
              revision: 1,
            },
          ],
          nextCursor: null,
        });
      if (url.pathname === "/api/v1/periods" && init?.method === "PUT") {
        const serialized = String(init.body);
        expect(sessionStorage.getItem(key)).toBe(serialized);
        const body = periodCommandSchema.parse(JSON.parse(serialized));
        modules = body.modules;
        revision++;
        puts.push(serialized);
        return reply({ month: "2026-01", status: "open", revision, modules });
      }
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [{ month: "2026-01", status: "open", revision, modules }],
          nextCursor: null,
        });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  return puts;
}
async function enter() {
  fireEvent.click(await screen.findByLabelText(t("trpt.trade")));
  fireEvent.click(screen.getByLabelText(t("trpt.taxModule")));
  fireEvent.change(screen.getByLabelText(t("trpt.reason")), {
    target: { value: "Fictional explicit admission" },
  });
}
it("defaults both new modules off and persists/readbacks the exact explicit confirmation before saving", async () => {
  const puts = mockApi();
  render(<App />);
  expect(((await screen.findByLabelText(t("trpt.trade"))) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText(t("trpt.taxModule")) as HTMLInputElement).checked).toBe(false);
  await enter();
  expect((screen.getByLabelText(t("ledger.period")) as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: t("trpt.save") }));
  await waitFor(() => expect(puts).toHaveLength(1));
  await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  expect(JSON.parse(puts[0]).modules).toEqual(["trade", "tax"]);
});
it("refuses a silently lost confirmation write before issuing any mutation", async () => {
  const puts = mockApi();
  render(<App />);
  await enter();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: t("trpt.save") }));
  await screen.findByText(t("trpt.storage"));
  expect(puts).toEqual([]);
});

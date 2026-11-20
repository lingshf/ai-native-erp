import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { periodCommandSchema, type PeriodDto } from "@erp/core/contracts";
import { App } from "../src/App.tsx";
import { label, type LabelKey } from "../src/ui/index.ts";
import { admissionTeaching } from "../src/ui/trade-admission-teaching.ts";
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
function mockApi(loseFirstResponse = false) {
  const puts: string[] = [],
    writes: string[] = [];
  let modules: ("trade" | "tax")[] = [],
    revision = 1;
  let status: PeriodDto["status"] = "open";
  let accepted: { command: string; result: unknown } | null = null;
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
        puts.push(serialized);
        if (body.revision !== revision) {
          expect(accepted?.command).toBe(serialized);
          return reply(accepted?.result);
        }
        modules = body.modules;
        revision++;
        writes.push(serialized);
        accepted = {
          command: serialized,
          result: { month: "2026-01", status: "open", revision, modules },
        };
        if (loseFirstResponse) throw new TypeError("Connection lost after commit");
        return reply(accepted.result);
      }
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [{ month: "2026-01", status, revision, modules }],
          nextCursor: null,
        });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  return {
    puts,
    writes,
    revoke() {
      modules = [];
      revision++;
    },
    close() {
      status = "closed";
      revision++;
    },
  };
}
async function enter() {
  fireEvent.click(await screen.findByLabelText(t("trpt.trade")));
  fireEvent.click(screen.getByLabelText(t("trpt.taxModule")));
  fireEvent.change(screen.getByLabelText(t("trpt.reason")), {
    target: { value: "Fictional explicit admission" },
  });
}
it("renders the admission teaching tip only while teaching is on and keeps the admission rule visible", async () => {
  mockApi();
  render(<App />);
  await screen.findByLabelText(t("trpt.trade"));
  const tip = (language: "zh" | "en") => screen.queryByText(admissionTeaching[language].text);
  expect(tip("zh")).toBeNull();
  expect(screen.getByText(t("trpt.admissionNote"))).toBeTruthy();
  fireEvent.click(screen.getByLabelText(t("shell.showTeachingExplanations")));
  expect(tip("zh")?.closest("aside")?.getAttribute("aria-label")).toBe(admissionTeaching.zh.title);
  fireEvent.change(screen.getByLabelText(t("shell.language")), { target: { value: "en" } });
  expect(tip("zh")).toBeNull();
  expect(tip("en")?.closest("aside")?.getAttribute("aria-label")).toBe(admissionTeaching.en.title);
  fireEvent.click(screen.getByLabelText(label("en", "shell.showTeachingExplanations")));
  expect(tip("en")).toBeNull();
  expect(screen.getByText(label("en", "trpt.admissionNote"))).toBeTruthy();
});
it("defaults both new modules off and persists/readbacks the exact explicit confirmation before saving", async () => {
  const { puts } = mockApi();
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
  const { puts } = mockApi();
  render(<App />);
  await enter();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: t("trpt.save") }));
  await screen.findByText(t("trpt.storage"));
  expect(puts).toEqual([]);
});
it("restores and retries the original confirmation after commit/response loss, then reports its accepted result without a second write", async () => {
  const { puts, writes } = mockApi(true);
  const first = render(<App />);
  await enter();
  fireEvent.click(screen.getByRole("button", { name: t("trpt.save") }));
  await screen.findByText(t("trpt.unknown"));
  const envelope = sessionStorage.getItem(key);
  expect(envelope).toBe(puts[0]);
  expect(writes).toHaveLength(1);
  first.unmount();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: t("master.retry") }));
  await screen.findByText(t("trpt.saved"));
  expect(puts).toEqual([envelope, envelope]);
  expect(writes).toHaveLength(1);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(screen.queryByText(t("master.error"))).toBeNull();
  expect((screen.getByLabelText(t("ledger.period")) as HTMLSelectElement).disabled).toBe(false);
  expect((screen.getByLabelText(t("trpt.trade")) as HTMLInputElement).checked).toBe(true);
});
it.for(["open", "closed"] as const)(
  "keeps the refreshed %s period revoked after recovering an older accepted admission",
  async (status) => {
    const api = mockApi(true);
    const first = render(<App />);
    await enter();
    fireEvent.click(screen.getByRole("button", { name: t("trpt.save") }));
    await screen.findByText(t("trpt.unknown"));
    const envelope = sessionStorage.getItem(key);
    first.unmount();
    api.revoke();
    if (status === "closed") api.close();
    render(<App />);
    const retry = await screen.findByRole("button", { name: t("master.retry") });
    expect(retry.matches(":disabled")).toBe(false);
    fireEvent.click(retry);
    await screen.findByText(t("trpt.saved"));
    expect(api.puts).toEqual([envelope, envelope]);
    expect(api.writes).toHaveLength(1);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect((screen.getByLabelText(t("trpt.trade")) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(t("trpt.taxModule")) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(t("trpt.reason")) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(t("ledger.period")) as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByLabelText(t("trpt.trade")).matches(":disabled")).toBe(status === "closed");
    expect(screen.getByRole("button", { name: t("trpt.save") }).matches(":disabled")).toBe(true);
  },
);

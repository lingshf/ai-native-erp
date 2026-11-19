import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildReports, type Account } from "@erp/core/domain";
import { App } from "../src/App.tsx";
import { VirtualRows } from "../src/Journals.tsx";
const company = {
  code: "DEFAULT",
  name: "Synthetic",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual" as const,
  revision: 1,
};
const account: Account = {
  code: "1000",
  name: "Cash",
  category: "ASSET",
  reportGroup: "cash",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  manualAllowed: true,
  active: true,
  builtin: true,
  revision: 1,
};
const id = "00000000-0000-4000-8000-000000000001";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function geometry() {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(440);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}
it("drills live report group → account → paged GL → original journal, preserves stage and surfaces failures", async () => {
  geometry();
  window.history.replaceState(
    null,
    "",
    "/#/ledger-reports?company=DEFAULT&month=2026-01&stage=unadjusted",
  );
  const report = buildReports(company, "2026-01", "unadjusted", [
    { ...account, opening: 0, debit: 123, credit: 0, closing: 123, yearNet: 123 },
    {
      ...account,
      code: "4000",
      name: "Revenue",
      category: "REVENUE",
      reportGroup: "sales",
      normalSide: "CREDIT",
      opening: 0,
      debit: 0,
      credit: 123,
      closing: -123,
      yearNet: -123,
    },
  ]);
  let ledgerCalls = 0,
    broken = false;
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      requests.push(url.pathname + url.search);
      if (url.pathname === "/api/v1/companies")
        return reply({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [{ month: "2026-01", status: "open", revision: 1 }],
          nextCursor: null,
        });
      if (url.pathname.startsWith("/api/v1/reports/")) return reply(report);
      if (url.pathname === "/api/v1/ledger") {
        ledgerCalls++;
        if (broken) return reply({ invalid: true });
        return reply({
          company: "DEFAULT",
          month: "2026-01",
          account: "1000",
          currency: "CNY",
          scale: 2,
          stage: "unadjusted",
          opening: 0,
          debit: 123,
          credit: 0,
          closing: 123,
          total: 2,
          watermark: 1,
          items: [
            {
              entryId: id,
              lineNo: ledgerCalls === 1 ? 1 : 2,
              date: "2026-01-03",
              sourceRef: "SYNTHETIC-1",
              memo: "Synthetic",
              debit: ledgerCalls === 1 ? 100 : 23,
              credit: 0,
              dimensions: {},
              balance: ledgerCalls === 1 ? 100 : 123,
            },
          ],
          nextCursor: ledgerCalls === 1 ? "next" : null,
        });
      }
      if (url.pathname === "/api/v1/journals") return reply({ items: [], nextCursor: null });
      if (url.pathname === "/api/v1/accounts") return reply({ items: [account], nextCursor: null });
      if (url.pathname === "/api/v1/dimensions") return reply({ items: [], nextCursor: null });
      if (url.pathname === `/api/v1/journals/${id}`)
        return reply({
          entry: {
            id,
            sourceRef: "SYNTHETIC-1",
            date: "2026-01-03",
            memo: "Original exact journal",
            kind: "normal",
            operation: "journal",
            role: "normal",
            postedAt: "2026-01-03T00:00:00.000Z",
            fingerprint: "a".repeat(64),
            debit: 123,
            credit: 123,
            lines: ["1000", "4000"].map((code, index) => ({
              account: code,
              debit: index ? 0 : 123,
              credit: index ? 123 : 0,
              dimensions: {},
              dimensionOrigins: {},
              role: "business",
              suspense: null,
              balancing: null,
              historical: null,
              group: null,
            })),
          },
          chain: [],
          businessEventId: null,
        });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  render(<App />);
  const groups = await screen.findByRole("table", { name: "报表类别" });
  fireEvent.click(
    within(within(groups).getByRole("row", { name: "货币资金 1.23" })).getByRole("link", {
      name: "1.23",
    }),
  );
  await waitFor(() => expect(window.location.hash).toContain("group=cash"));
  const table = screen.getByRole("table", { name: "试算平衡" });
  fireEvent.click(within(table).getAllByRole("link", { name: "1.23" }).at(-1)!);
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 1" });
  expect(requests.find((path) => path.startsWith("/api/v1/ledger?"))).toContain("stage=unadjusted");
  fireEvent.scroll(screen.getByRole("region", { name: "总账明细" }), {
    target: { scrollTop: 1000 },
  });
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 2" });
  expect(requests.find((path) => path.includes("cursor=next"))).toBeDefined();
  broken = true;
  fireEvent.click(screen.getByRole("button", { name: "刷新为最新账簿" }));
  expect((await screen.findByRole("alert")).textContent).toContain("未显示为零");
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  fireEvent.click(await screen.findByRole("link", { name: "SYNTHETIC-1 / 2" }));
  expect(await screen.findByRole("heading", { name: "SYNTHETIC-1 · 2026-01-03" })).toBeTruthy();
  expect(screen.getByText("Original exact journal")).toBeTruthy();
});
it("bounds the paged virtual table DOM while scrolling within a full page", async () => {
  geometry();
  const items = Array.from({ length: 500 }, (_, index) => index);
  render(
    <VirtualRows
      forceVirtual
      items={items}
      title="Paged ledger"
      header={["Row"]}
      render={(index) => <td>ROW-{index}</td>}
    />,
  );
  const region = screen.getByRole("region", { name: "Paged ledger" });
  await screen.findByText("ROW-0");
  const count = () => region.querySelectorAll("tbody tr:not([aria-hidden])").length;
  expect(count()).toBeLessThanOrEqual(Math.ceil(440 / 44) + 2 * 5 + 1);
  fireEvent.scroll(region, { target: { scrollTop: 11_000 } });
  await screen.findByText("ROW-250");
  expect(screen.queryByText("ROW-0")).toBeNull();
  expect(count()).toBeLessThanOrEqual(Math.ceil(440 / 44) + 2 * 5 + 1);
  expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("501");
});

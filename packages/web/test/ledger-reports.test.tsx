import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { buildReports, type Account, type ReportRow } from "@erp/core/domain";
import { App } from "../src/App.tsx";
import { VirtualRows } from "../src/journals/virtual-rows.tsx";
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
const secondId = "00000000-0000-4000-8000-000000000002";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const initialOnline = onlineManager.isOnline();
afterEach(() => {
  window.history.replaceState(null, "", "/");
  focusManager.setFocused(undefined);
  onlineManager.setOnline(initialOnline);
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
it("preserves report snapshots, statement-period drilldowns and latest journal selection across failures", async () => {
  geometry();
  window.history.replaceState(
    null,
    "",
    "/#/ledger-reports?company=DEFAULT&month=2026-01&stage=unadjusted",
  );
  const report = buildReports(company, "2026-01", "unadjusted", [
    { ...account, opening: 10000, debit: 3000, credit: 0, closing: 13000, yearNet: 3000 },
    {
      ...account,
      code: "4400",
      builtin: false,
      name: "Revenue",
      category: "REVENUE",
      reportGroup: "sales",
      normalSide: "CREDIT",
      opening: -10000,
      debit: 0,
      credit: 3000,
      closing: -13000,
      yearNet: -3000,
    },
  ]);
  const operatingRows: ReportRow[] = [
    {
      ...report.trial.rows[0],
      opening: 0,
      debit: 10000,
      credit: 0,
      closing: 10000,
      yearNet: 10000,
    },
    {
      ...report.trial.rows[1],
      code: "4000",
      opening: 0,
      debit: 0,
      credit: 10000,
      closing: -10000,
      yearNet: -10000,
    },
    {
      ...account,
      code: "3100",
      name: "Retained",
      category: "EQUITY",
      reportGroup: "retainedEarnings",
      normalSide: "CREDIT",
      opening: 0,
      debit: 0,
      credit: 0,
      closing: 0,
      yearNet: 0,
    },
  ];
  const closedReport = buildReports(
    company,
    "2026-01",
    "postClosing",
    operatingRows.map((row) =>
      row.code === "4000"
        ? { ...row, debit: 10000, closing: 0 }
        : row.code === "3100"
          ? { ...row, credit: 10000, closing: -10000 }
          : row,
    ),
    operatingRows,
  );
  let latestWatermark = 1,
    accountRevision = 8,
    broken = false;
  let resolveOriginal: (() => void) | undefined;
  let originalSignal: AbortSignal | null | undefined;
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      requests.push(url.pathname + url.search);
      const after = /^next-(\d+)-(\d+)$/u.exec(url.searchParams.get("cursor") ?? "");
      const requestedRevision = url.searchParams.get("accountRevision") ?? after?.[2];
      if (
        (url.pathname.startsWith("/api/v1/reports/") || url.pathname === "/api/v1/ledger") &&
        requestedRevision !== undefined &&
        Number(requestedRevision) !== accountRevision
      )
        return reply(
          {
            code: "CONFLICT",
            messageKey: "api.error.conflict",
            params: {},
            fieldErrors: [],
            requestId: id,
            retryable: false,
          },
          409,
        );
      if (url.pathname === "/api/v1/companies")
        return reply({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [{ month: "2026-01", status: "open", revision: 1 }],
          nextCursor: null,
        });
      if (
        url.pathname.startsWith("/api/v1/reports/") &&
        url.searchParams.get("stage") === "postClosing"
      )
        return reply({
          ...closedReport,
          watermark: Number(url.searchParams.get("watermark") ?? latestWatermark),
          accountRevision,
        });
      if (url.pathname.startsWith("/api/v1/reports/"))
        return reply({
          ...(accountRevision === 8
            ? report
            : buildReports(
                company,
                "2026-01",
                "unadjusted",
                report.trial.rows.map((row) =>
                  row.code === "4400" ? { ...row, reportGroup: "otherRevenue", revision: 2 } : row,
                ),
              )),
          watermark: Number(url.searchParams.get("watermark") ?? latestWatermark),
          accountRevision,
        });
      if (url.pathname === "/api/v1/ledger") {
        const watermark = Number(
          url.searchParams.get("watermark") ?? after?.[1] ?? latestWatermark,
        );
        if (watermark > latestWatermark)
          return reply(
            {
              code: "CONFLICT",
              messageKey: "api.error.conflict",
              params: {},
              fieldErrors: [],
              requestId: id,
              retryable: false,
            },
            409,
          );
        if (broken) return reply({ invalid: true });
        if (url.searchParams.get("account") === "4000") {
          const postClosing = url.searchParams.get("stage") === "postClosing";
          return reply({
            company: "DEFAULT",
            month: "2026-01",
            account: "4000",
            currency: "CNY",
            scale: 2,
            stage: postClosing ? "postClosing" : "adjusted",
            opening: 0,
            debit: postClosing ? 10000 : 0,
            credit: 10000,
            closing: postClosing ? 0 : -10000,
            total: postClosing ? 2 : 1,
            watermark,
            accountRevision,
            items: [
              {
                entryId: id,
                lineNo: 1,
                date: "2026-01-03",
                sourceRef: "SALES-100",
                memo: "Income",
                debit: 0,
                credit: 10000,
                dimensions: {},
                balance: -10000,
              },
              ...(postClosing
                ? [
                    {
                      entryId: secondId,
                      lineNo: 1,
                      date: "2026-01-31",
                      sourceRef: "CLOSE",
                      memo: "Closing",
                      debit: 10000,
                      credit: 0,
                      dimensions: {},
                      balance: 0,
                    },
                  ]
                : []),
            ],
            nextCursor: null,
          });
        }
        const firstPage = !url.searchParams.has("cursor"),
          revenue = url.searchParams.get("account") === "4400",
          direction = revenue ? -1 : 1,
          monthly = watermark === 1 ? 3000 : 5000;
        return reply({
          company: "DEFAULT",
          month: "2026-01",
          account: url.searchParams.get("account"),
          currency: "CNY",
          scale: 2,
          stage: "unadjusted",
          opening: direction * 10000,
          debit: revenue ? 0 : monthly,
          credit: revenue ? monthly : 0,
          closing: direction * (10000 + monthly),
          total: 2,
          watermark,
          accountRevision,
          items: [
            {
              entryId: id,
              lineNo: firstPage ? 1 : 2,
              date: "2026-01-03",
              sourceRef: "SYNTHETIC-1",
              memo: "Synthetic",
              debit: revenue ? 0 : firstPage ? 1000 : monthly - 1000,
              credit: revenue ? (firstPage ? 1000 : monthly - 1000) : 0,
              dimensions: {},
              balance: direction * (firstPage ? 11000 : 10000 + monthly),
            },
          ],
          nextCursor: firstPage ? `next-${watermark}-${accountRevision}` : null,
        });
      }
      if (url.pathname === "/api/v1/journals")
        return reply({
          items: [
            {
              id: secondId,
              date: "2026-01-03",
              sourceRef: "SYNTHETIC-2",
              memo: "Selected journal B",
              operation: "journal",
              revision: null,
            },
          ],
          nextCursor: null,
        });
      if (url.pathname === "/api/v1/accounts") return reply({ items: [account], nextCursor: null });
      if (url.pathname === "/api/v1/dimensions") return reply({ items: [], nextCursor: null });
      if (
        url.pathname === `/api/v1/journals/${id}` ||
        url.pathname === `/api/v1/journals/${secondId}`
      ) {
        const first = url.pathname.endsWith(id),
          detail = {
            entry: {
              id: first ? id : secondId,
              sourceRef: first ? "SYNTHETIC-1" : "SYNTHETIC-2",
              date: "2026-01-03",
              documentDate: "2026-01-03",
              taxDate: "2026-01-03",
              module: null,
              memo: first ? "Original exact journal" : "Selected journal B",
              kind: "normal",
              operation: "journal",
              role: "normal",
              postedAt: "2026-01-03T00:00:00.000Z",
              fingerprint: "a".repeat(64),
              debit: 3000,
              credit: 3000,
              lines: ["1000", "4400"].map((code, index) => ({
                account: code,
                debit: index ? 0 : 3000,
                credit: index ? 3000 : 0,
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
          };
        if (first) {
          originalSignal = options?.signal;
          return new Promise<Response>((resolve) => {
            resolveOriginal = () => resolve(reply(detail));
          });
        }
        return reply(detail);
      }
      throw new Error(`Unexpected ${url}`);
    }),
  );
  const mount = vi.spyOn(QueryClient.prototype, "mount");
  render(<App />);
  await screen.findByRole("table", { name: "报表类别" });
  const client = mount.mock.contexts.find((context) => context instanceof QueryClient);
  if (!(client instanceof QueryClient)) throw new Error("Missing mounted QueryClient");
  fireEvent.change(screen.getByLabelText("报表"), { target: { value: "income" } });
  const originalSales = await screen.findByRole("row", { name: "销售收入 30.00" });
  fireEvent.click(within(originalSales).getByRole("link", { name: "30.00" }));
  await screen.findByRole("table", { name: "利润表科目" });
  expect(window.location.hash).toContain("accountRevision=8");
  accountRevision = 9;
  const beforeReclassificationRead = requests.length;
  fireEvent.click(
    within(screen.getByRole("row", { name: "销售收入 30.00" })).getByRole("link", {
      name: "30.00",
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("科目配置已变更");
  expect(screen.queryByRole("table", { name: "利润表科目" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("科目配置已变更"));
  expect(window.location.hash).toContain("accountRevision=8");
  expect(
    requests
      .slice(beforeReclassificationRead)
      .filter((path) => path.startsWith("/api/v1/reports/"))
      .every((path) => path.includes("watermark=1") && path.includes("accountRevision=8")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "刷新为最新账簿" }));
  await waitFor(() => expect(window.location.hash).not.toContain("accountRevision="));
  const regrouped = await screen.findByRole("table", { name: "报表类别" });
  fireEvent.click(within(regrouped).getByRole("link", { name: "30.00" }));
  await screen.findByRole("table", { name: "利润表科目" });
  expect(window.location.hash).toContain("group=otherRevenue");
  expect(window.location.hash).toContain("accountRevision=9");
  fireEvent.change(screen.getByLabelText("报表"), { target: { value: "trial" } });
  const groups = await screen.findByRole("table", { name: "报表类别" });
  fireEvent.click(
    within(within(groups).getByRole("row", { name: "货币资金 130.00" })).getByRole("link", {
      name: "130.00",
    }),
  );
  await waitFor(() => expect(window.location.hash).toContain("group=cash"));
  expect(window.location.hash).toContain("watermark=1");
  expect(window.location.hash).toContain("accountRevision=9");
  latestWatermark = 2;
  const table = await screen.findByRole("table", { name: "试算平衡" });
  fireEvent.click(within(table).getAllByRole("link", { name: "130.00" }).at(-1)!);
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 1" });
  expect(requests.find((path) => path.startsWith("/api/v1/ledger?"))).toContain("stage=unadjusted");
  expect(requests.find((path) => path.startsWith("/api/v1/ledger?"))).toContain("watermark=1");
  expect(requests.find((path) => path.startsWith("/api/v1/ledger?"))).toContain(
    "accountRevision=9",
  );
  expect(screen.getByText(/期末余额: 130.00/)).toBeTruthy();
  fireEvent.scroll(screen.getByRole("region", { name: "总账明细" }), {
    target: { scrollTop: 1000 },
  });
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 2" });
  expect(requests.find((path) => path.includes("cursor=next"))).toBeDefined();
  accountRevision = 10;
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("科目配置已变更"));
  expect(window.location.hash).toContain("watermark=1");
  expect(window.location.hash).toContain("accountRevision=9");
  expect(screen.queryByRole("link", { name: "SYNTHETIC-1 / 2" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "刷新为最新账簿" }));
  await screen.findByText(/期末余额: 150.00/);
  expect(window.location.hash).toContain("watermark=2");
  expect(window.location.hash).toContain("accountRevision=10");
  await act(async () => {
    window.location.hash =
      "/ledger-reports?company=DEFAULT&month=2026-01&stage=unadjusted&view=income&watermark=1&accountRevision=10";
  });
  const incomeGroups = await screen.findByRole("table", { name: "报表类别" });
  fireEvent.click(
    within(incomeGroups).getByRole("link", {
      name: "30.00",
    }),
  );
  await waitFor(() => expect(window.location.hash).toContain("group=otherRevenue"));
  const incomeAccounts = await screen.findByRole("table", { name: "利润表科目" });
  expect(
    within(incomeAccounts).getByRole("columnheader", { name: "本期金额（报表方向）" }),
  ).toBeTruthy();
  const revenue = within(incomeAccounts).getByRole("row", { name: /4400 · Revenue/ });
  expect(within(revenue).getByRole("link", { name: "-100.00" })).toBeTruthy();
  expect(within(revenue).getByRole("link", { name: "-130.00" })).toBeTruthy();
  expect(screen.getByText("本期金额（报表方向）: 30.00")).toBeTruthy();
  fireEvent.click(
    within(within(revenue).getAllByRole("cell")[0]).getByRole("link", { name: "30.00" }),
  );
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 1" });
  expect(
    requests.some(
      (path) =>
        path.includes("/api/v1/ledger?") &&
        path.includes("account=4400") &&
        path.includes("watermark=1"),
    ),
  ).toBe(true);
  const standaloneStart = requests.length;
  await act(async () => {
    window.location.hash = "/ledger?company=DEFAULT&month=2026-01&stage=unadjusted&account=1000";
  });
  await screen.findByText(/期末余额: 150.00/);
  expect(window.location.hash).toContain("watermark=2");
  expect(window.location.hash).toContain("accountRevision=10");
  fireEvent.change(screen.getByLabelText("科目"), { target: { value: "4400" } });
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await screen.findByText(/期末余额: -150.00/);
  fireEvent.change(screen.getByLabelText("科目"), { target: { value: "1000" } });
  fireEvent.click(screen.getByRole("button", { name: "查询" }));
  await screen.findByText(/期末余额: 150.00/);
  const standaloneRequests = requests
    .slice(standaloneStart)
    .filter((path) => path.startsWith("/api/v1/ledger?"));
  expect(standaloneRequests.filter((path) => !path.includes("watermark="))).toHaveLength(1);
  expect(
    standaloneRequests
      .slice(1)
      .every((path) => path.includes("watermark=2") && path.includes("accountRevision=10")),
  ).toBe(true);
  accountRevision = 11;
  fireEvent.scroll(screen.getByRole("region", { name: "总账明细" }), {
    target: { scrollTop: 1000 },
  });
  await waitFor(() => {
    expect(screen.getByRole("alert").textContent).toContain("科目配置已变更");
    expect(screen.getByRole("button", { name: "查询" })).toHaveProperty("disabled", true);
  });
  expect(requests.at(-1)).toContain("cursor=next-2-10");
  const conflictStart = requests.length;
  const apply = screen.getByRole("button", { name: "查询" });
  fireEvent.click(apply);
  const form = apply.closest("form");
  if (!form) throw new Error("Missing ledger filter form");
  fireEvent.submit(form);
  await act(async () => {
    focusManager.setFocused(false);
    onlineManager.setOnline(false);
  });
  await act(async () => {
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
    await client.invalidateQueries({ queryKey: ["ledger-live", "DEFAULT"] });
    await client.refetchQueries({ queryKey: ["ledger-live", "DEFAULT"], type: "active" });
    await client.resetQueries({ queryKey: ["ledger-live", "DEFAULT"] });
  });
  expect(screen.getByRole("alert").textContent).toContain("科目配置已变更");
  expect(window.location.hash).toContain("accountRevision=10");
  expect(
    requests.slice(conflictStart).filter((path) => path.startsWith("/api/v1/ledger?")),
  ).toEqual([]);
  expect(screen.queryByRole("link", { name: "SYNTHETIC-1 / 1" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "刷新为最新账簿" }));
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 1" });
  expect(window.location.hash).toContain("watermark=2");
  expect(window.location.hash).toContain("accountRevision=11");
  expect(
    requests
      .slice(conflictStart)
      .filter((path) => path.startsWith("/api/v1/ledger?") && !path.includes("watermark=")),
  ).toHaveLength(1);
  const refetchStart = requests.length;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["ledger-live", "DEFAULT"] });
  });
  await screen.findByRole("link", { name: "SYNTHETIC-1 / 1" });
  const refetched = requests
    .slice(refetchStart)
    .filter((path) => path.startsWith("/api/v1/ledger?"));
  expect(refetched.length).toBeGreaterThan(0);
  expect(
    refetched.every((path) => path.includes("watermark=2") && path.includes("accountRevision=11")),
  ).toBe(true);
  await act(async () => {
    window.location.hash =
      "/ledger?company=DEFAULT&month=2026-01&stage=unadjusted&account=1000&watermark=99&accountRevision=11";
  });
  expect((await screen.findByRole("alert")).textContent).toContain("来源账簿水位不可用");
  expect(window.location.hash).toContain("watermark=99");
  broken = true;
  fireEvent.click(screen.getByRole("button", { name: "刷新为最新账簿" }));
  await waitFor(() => expect(window.location.hash).not.toContain("watermark="));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("未显示为零"));
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  fireEvent.click(await screen.findByRole("link", { name: "SYNTHETIC-1 / 1" }));
  fireEvent.click(await screen.findByRole("button", { name: "查看 SYNTHETIC-2" }));
  expect(await screen.findByRole("heading", { name: "SYNTHETIC-2 · 2026-01-03" })).toBeTruthy();
  expect(originalSignal?.aborted).toBe(true);
  expect(resolveOriginal).toBeDefined();
  await act(async () => {
    resolveOriginal?.();
  });
  expect(screen.getByRole("heading", { name: "SYNTHETIC-2 · 2026-01-03" })).toBeTruthy();
  expect(screen.queryByText("Original exact journal")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => {
    window.location.hash =
      "/ledger-reports?company=DEFAULT&month=2026-01&view=income&stage=postClosing";
  });
  const closedIncome = await screen.findByRole("table", { name: "利润表科目" });
  const incomeRow = within(closedIncome).getByRole("row", { name: /4000 · Revenue/u });
  const cells = within(incomeRow).getAllByRole("cell");
  for (const cell of cells.slice(1)) {
    const href = within(cell).getByRole("link").getAttribute("href") ?? "";
    expect(href).toContain("stage=postClosing");
    expect(href).toContain("watermark=2");
    expect(href).toContain("accountRevision=11");
  }
  const incomeLink = within(cells[0]).getByRole("link", { name: "100.00" });
  const href = incomeLink.getAttribute("href") ?? "";
  expect(href).toContain("stage=adjusted");
  expect(href).toContain("watermark=2");
  expect(href).toContain("accountRevision=11");
  fireEvent.click(incomeLink);
  await screen.findByRole("link", { name: "SALES-100 / 1" });
  expect(screen.getByText(/本期借方: 0.00/u)).toBeTruthy();
  expect(screen.getByText(/本期贷方: 100.00/u)).toBeTruthy();
  expect(screen.getByText(/期末余额: -100.00/u)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "CLOSE / 1" })).toBeNull();
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
  // The scroll arms @tanstack/virtual-core's 150 ms scroll-reset debounce, which is never
  // cleared on unmount. Left on the real clock, this file's last scroll could fire it after
  // the fork's jsdom teardown, where React reads the deleted `window` (FLAKE-08). Arm it on
  // a test-owned clock and finish it while the table is still mounted.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => vi.useRealTimers());
  fireEvent.scroll(region, { target: { scrollTop: 11_000 } });
  expect(vi.getTimerCount(), "scroll-reset debounce armed by the scroll").toBe(1);
  act(() => vi.advanceTimersByTime(150));
  expect(vi.getTimerCount(), "scroll-reset debounce still pending").toBe(0);
  vi.useRealTimers();
  await screen.findByText("ROW-250");
  expect(screen.queryByText("ROW-0")).toBeNull();
  expect(count()).toBeLessThanOrEqual(Math.ceil(440 / 44) + 2 * 5 + 1);
  expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("501");
});
it("gives both virtual spacer cells the component class instead of relying on global td rules", async () => {
  geometry();
  const items = Array.from({ length: 101 }, (_, index) => index);
  render(
    <VirtualRows
      items={items}
      title="Long list"
      header={["A", "B"]}
      render={(index) => <td>R-{index}</td>}
    />,
  );
  const region = screen.getByRole("region", { name: "Long list" });
  await screen.findByText("R-0");
  const spacers = [...region.querySelectorAll("tbody tr[aria-hidden='true'] > td")];
  expect(spacers).toHaveLength(2);
  for (const td of spacers) {
    expect(td.className).toBe("journal-spacer");
    expect(td.getAttribute("colspan")).toBe("2");
  }
});

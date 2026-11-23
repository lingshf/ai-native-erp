import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, it, expect, vi } from "vitest";
import type { ClosePreviewDto, CloseResultDto } from "@erp/core/contracts";
import { buildReports, defaultAccounts } from "@erp/core/domain";
import { App } from "../src/App.tsx";
afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("drills preview amounts at the same compound pin and retries unknown close/next commands without switching or silently saving", async () => {
  window.history.replaceState(null, "", "/#/ledger-reports?company=DEFAULT&month=2026-12");
  const company = {
    code: "DEFAULT",
    name: "Synthetic",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual" as const,
    revision: 1,
  };
  const confirmations: Record<string, unknown>[] = [],
    advances: unknown[] = [],
    mutations: string[] = [];
  let preview: ClosePreviewDto | undefined,
    result: CloseResultDto | undefined,
    previewCount = 0,
    closed = false,
    advanced = false;
  const reply = (value: unknown) => new Response(JSON.stringify(value));
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      if (options?.method && options.method !== "GET") mutations.push(url.pathname);
      if (url.pathname === "/api/v1/companies")
        return reply({
          items: [company],
          nextCursor: null,
        });
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [
            { month: "2026-12", status: closed ? "closed" : "open", revision: closed ? 2 : 1 },
            ...(advanced ? [{ month: "2027-01", status: "open", revision: 1 }] : []),
          ],
          nextCursor: null,
        });
      if (url.pathname.endsWith("/close-preview")) {
        previewCount++;
        preview = {
          ...body,
          month: "2026-12",
          fingerprint: "a".repeat(64),
          action: "close",
          snapshot: { watermark: 1, accountRevision: 8 },
          date: "2026-12-31",
          netProfit: 3000,
          blockers: [],
          lines: ["4000", "3100"].map((account, index) => ({
            account,
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
        };
        return reply(preview);
      }
      if (url.pathname.endsWith("/close")) {
        confirmations.push(body);
        closed = true;
        if (confirmations.length === 1) throw new TypeError("Lost committed close response");
        if (!preview) throw new Error("Missing preview");
        result = {
          preview,
          period: { month: "2026-12", status: "closed", revision: 2, modules: [] },
          receipt: {
            company: "DEFAULT",
            sourceRef: "CLOSE:2026-12:1",
            idempotencyKey: body.commandId,
            draftId: body.commandId,
            draftRevision: 1,
            fingerprint: body.fingerprint,
            operation: "period.close",
            module: null,
            journalIds: ["10000000-0000-4000-8000-000000000001"],
            postedAt: "2026-12-31T12:00:00.000Z",
          },
        };
        return reply(result);
      }
      if (url.pathname.endsWith("/open-next")) {
        advances.push(body);
        advanced = true;
        if (advances.length === 1) throw new TypeError("Lost open-next response");
        return reply({ month: "2027-01", status: "open", revision: 1 });
      }
      if (url.pathname.startsWith("/api/v1/reports/"))
        return reply({
          ...buildReports(
            company,
            url.searchParams.get("month") ?? "2026-12",
            "adjusted",
            defaultAccounts().map((account) => ({
              ...account,
              opening: 0,
              debit: 0,
              credit: 0,
              closing: 0,
              yearNet: 0,
            })),
          ),
          watermark: 1,
          accountRevision: 8,
        });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  const mount = vi.spyOn(QueryClient.prototype, "mount");
  render(<App />);
  await screen.findByRole("table", { name: "报表类别" });
  fireEvent.click(screen.getByRole("link", { name: "期末结账" }));
  fireEvent.click(await screen.findByRole("button", { name: "预览结账" }));
  const table = await screen.findByRole("table", { name: "结转分录" });
  for (const link of within(table).getAllByRole("link", { name: "30.00" })) {
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect(url.hash).toContain("watermark=1");
    expect(url.hash).toContain("accountRevision=8");
    expect(url.hash).toContain("stage=adjusted");
  }
  fireEvent.click(screen.getByRole("button", { name: "确认结账" }));
  await screen.findByText(/结果未知/u);
  expect(screen.getByLabelText("准入贸易").matches(":disabled")).toBe(true);
  const client = mount.mock.contexts.find((context) => context instanceof QueryClient);
  if (!(client instanceof QueryClient)) throw new Error("Missing mounted QueryClient");
  await act(async () => {
    await client.resetQueries({ queryKey: ["companies"] });
    await client.resetQueries({ queryKey: ["close-periods"] });
  });
  expect(screen.getByRole("button", { name: "重试原命令" })).toHaveProperty("disabled", false);
  expect(screen.getByLabelText("公司")).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("期间")).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "预览结账" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "确认结账" })).toHaveProperty("disabled", true);
  expect(screen.queryByRole("button", { name: "打开下一期间" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重试原命令" }));
  await screen.findByText("冻结或关闭期间不可再过账。");
  expect(confirmations).toHaveLength(2);
  expect(confirmations[1]).toEqual(confirmations[0]);
  fireEvent.click(screen.getByRole("button", { name: "打开下一期间" }));
  await screen.findByText(/结果未知/u);
  expect(screen.getByLabelText("期间")).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "打开下一期间" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "重试原命令" }));
  await waitFor(() => expect(screen.getByLabelText("期间")).toHaveProperty("value", "2027-01"));
  expect(screen.getByRole("button", { name: "预览结账" })).toHaveProperty("disabled", false);
  expect(advances).toEqual([
    { company: "DEFAULT", revision: 2 },
    { company: "DEFAULT", revision: 2 },
  ]);
  expect(previewCount).toBe(1);
  expect(mutations).toEqual([
    "/api/v1/periods/2026-12/close-preview",
    "/api/v1/periods/2026-12/close",
    "/api/v1/periods/2026-12/close",
    "/api/v1/periods/2026-12/open-next",
    "/api/v1/periods/2026-12/open-next",
  ]);
  expect(client.getQueryState(["ledger-periods", "DEFAULT"])?.isInvalidated).toBe(true);
  await act(async () => {
    window.location.hash = "/ledger-reports?company=DEFAULT&month=2026-12";
  });
  await screen.findByRole("table", { name: "报表类别" });
  expect(
    within(screen.getByLabelText("期间")).getByRole("option", { name: "2027-01" }),
  ).toBeTruthy();
  const stalePeriods = {
    pages: [{ items: [{ month: "2026-12", status: "closed", revision: 2 }], nextCursor: null }],
    pageParams: [""],
  };
  await act(async () => {
    client.setQueryData(["ledger-periods", "DEFAULT"], stalePeriods);
    window.location.hash = "/ledger-reports?company=DEFAULT&month=2027-01";
  });
  await waitFor(() => expect(screen.getByLabelText("期间")).toHaveProperty("value", "2027-01"));
  await screen.findByRole("table", { name: "报表类别" });
  await act(async () => {
    client.setQueryData(["ledger-periods", "DEFAULT"], stalePeriods);
  });
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "刷新为最新账簿" }));
  await waitFor(() => expect(screen.getByLabelText("期间")).toHaveProperty("value", "2027-01"));
  await screen.findByRole("table", { name: "报表类别" });
});
it("shows period status badges, keeps derived numbers hidden until preview, and surfaces blockers as alerts", async () => {
  window.history.replaceState(null, "", "/#/period-close?company=DEFAULT&month=2026-02");
  const company = {
    code: "DEFAULT",
    name: "Synthetic",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual" as const,
    revision: 1,
  };
  const reply = (value: unknown) => new Response(JSON.stringify(value));
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://localhost");
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      if (url.pathname === "/api/v1/companies")
        return reply({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [
            { month: "2026-01", status: "frozen", revision: 2, modules: ["trade"] },
            { month: "2026-02", status: "open", revision: 1, modules: [] },
          ],
          nextCursor: null,
        });
      if (url.pathname.endsWith("/close-preview"))
        return reply({
          ...body,
          month: "2026-02",
          fingerprint: "b".repeat(64),
          action: "freeze",
          snapshot: { watermark: 1, accountRevision: 8 },
          date: "2026-02-28",
          netProfit: 0,
          blockers: ["priorPeriods"],
          lines: [],
        });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  render(<App />);
  const list = await screen.findByRole("table", { name: "期间列表" });
  const current = within(list).getByRole("row", { current: true });
  expect(within(current).getByText("2026-02")).toBeTruthy();
  expect(within(current).getByText("开放").closest(".badge")?.className).toBe("badge info");
  expect(within(list).getByText("冻结").closest(".badge")?.className).toBe("badge warning");
  expect(screen.getByText("贸易", { selector: ".badge" }).className).toBe("badge warning");
  expect(screen.getByRole("group", { name: "期末结账" })).toBeTruthy();
  expect(screen.getByRole("group", { name: "期间贸易模块准入" })).toBeTruthy();
  expect(screen.queryByText("本次结转净额")).toBeNull();
  const previewButton = screen.getByRole("button", { name: "预览结账" });
  expect(previewButton.className).toBe("btn btn-secondary");
  fireEvent.click(previewButton);
  const blocker = await screen.findByRole("alert");
  expect(blocker.textContent).toContain("请先处理前面的期间。");
  const confirm = screen.getByRole("button", { name: "确认结账" });
  expect(confirm.className).toBe("btn btn-primary");
  expect(confirm).toHaveProperty("disabled", true);
  expect(screen.getByText("本次结转净额")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "打开下一期间" })).toBeNull();
});
it("keeps open-next a secondary action on a closed period without offering a new preview", async () => {
  window.history.replaceState(null, "", "/#/period-close?company=DEFAULT&month=2026-12");
  const company = {
    code: "DEFAULT",
    name: "Synthetic",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual" as const,
    revision: 1,
  };
  const reply = (value: unknown) => new Response(JSON.stringify(value));
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const url = new URL(String(path), "http://localhost");
      if (url.pathname === "/api/v1/companies")
        return reply({ items: [company], nextCursor: null });
      if (url.pathname === "/api/v1/periods")
        return reply({
          items: [{ month: "2026-12", status: "closed", revision: 2, modules: [] }],
          nextCursor: null,
        });
      throw new Error(`Unexpected ${url}`);
    }),
  );
  render(<App />);
  const next = await screen.findByRole("button", { name: "打开下一期间" });
  expect(next.className).toBe("btn btn-secondary");
  expect(next).toHaveProperty("disabled", false);
  expect(screen.getByText("冻结或关闭期间不可再过账。").closest(".message-bar")?.className).toBe(
    "message-bar info",
  );
  expect(screen.queryByRole("button", { name: "预览结账" })).toBeNull();
});

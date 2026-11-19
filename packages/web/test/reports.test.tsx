import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { label, preferenceStorageKey } from "../src/ui/index.ts";
import { App } from "../src/App.tsx";
import { formatMinor, parseContext, parseLedgerPage, parseTrial } from "../src/reports-data.ts";

const source = {
  sourceKind: "verified-teaching-snapshot",
  baseline: "M00-verified-snapshot",
  live: false,
  snapshotSha256: "a".repeat(64),
  snapshotBytes: 123,
  scale: 2,
} as const;
const context = {
  contractVersion: "1",
  source,
  periods: [
    { month: "2025-01", status: "closed" },
    { month: "2025-02", status: "open" },
  ],
} as const;
const balance = {
  rows: [{ code: "1100", name: "原始 Cash", category: "ASSET", debit: 12345, credit: 0 }],
  debit: 12345,
  credit: 0,
};
const trial = (month = "2025-02") => ({
  contractVersion: "1",
  source,
  month,
  trialBalances: { unadjusted: balance, adjusted: balance, postClosing: balance },
});
const entry = (lineId: number) => ({
  id: 8,
  lineId,
  date: "2025-02-01",
  memo: `原始 memo ${lineId}`,
  kind: "normal",
  reversal_of: null,
  source_kind: null,
  account: "1100",
  debit: 100,
  credit: 0,
  dimensions: { project: "原始项目" },
  balance: 100,
});
const page = (lineId = 1) => ({
  contractVersion: "1",
  source,
  month: "2025-02",
  account: "1100",
  opening: 0,
  closing: 200,
  debit: 200,
  credit: 0,
  totalEntries: 2,
  entries: [entry(lineId)],
  ...(lineId === 1 ? { nextCursor: "next_1" } : {}),
});
const scope = { source, month: "2025-02", account: "1100" };
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function reports(path = "/reports/trial") {
  window.location.hash = path;
}
function installFetch(ledger = vi.fn().mockResolvedValue(response(page()))) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/context")) return response(context);
    if (url.pathname.endsWith("/trial")) return response(trial(url.searchParams.get("month")!));
    if (url.pathname.endsWith("/ledger")) return ledger(input, init);
    return response({
      service: "ai-native-erp",
      contractVersion: "1",
      profile: "local",
      data: "unconfigured",
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("keeps missing snapshots neutral, supports explicit retry and leaves runtime status independent", async () => {
  reports();
  let available = false;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    if (String(input).endsWith("/context")) {
      if (available) return response(context);
      return response(
        {
          code: "UNAVAILABLE",
          messageKey: "api.error.unavailable",
          params: {},
          fieldErrors: [],
          requestId: "12345678-1234-4234-8234-123456789abc",
          retryable: true,
        },
        503,
      );
    }
    if (String(input).includes("/trial?")) return response(trial());
    return response({
      service: "ai-native-erp",
      contractVersion: "1",
      profile: "local",
      data: "configured",
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await screen.findByText(label("zh", "reports.unconfigured"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen
      .getAllByRole("link", { name: label("zh", "ledger.title") })
      .every((link) => link.getAttribute("href") === "#/ledger-reports"),
  ).toBe(true);
  fireEvent.change(document.querySelector("#workspace-language")!, { target: { value: "en" } });
  expect(screen.getByText(label("en", "reports.unconfigured"))).toBeTruthy();
  await cycleQueryManagers();
  expect(fetcher).toHaveBeenCalledTimes(1);
  available = true;
  fireEvent.click(screen.getByRole("button", { name: label("en", "reports.reload") }));
  await screen.findByRole("link", { name: "1100 原始 Cash" });
  expect(screen.queryByText(label("en", "reports.unconfigured"))).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: label("en", "shell.overview") }));
  await screen.findByText(label("en", "shell.connected"));
  expect(fetcher.mock.calls.map(([path]) => String(path))).toEqual([
    "/api/v1/legacy/context",
    "/api/v1/legacy/context",
    `/api/v1/legacy/trial?snapshot=${source.snapshotSha256}&month=2025-02`,
    "/api/v1/health",
  ]);
  expect(screen.queryByRole("alert")).toBeNull();
});
it.each([
  [503, { message: "private-path" }, "reports.invalidResponse"],
  [
    500,
    {
      code: "INTERNAL_ERROR",
      messageKey: "api.error.internal",
      params: {},
      fieldErrors: [],
      requestId: "12345678-1234-4234-8234-123456789abc",
      retryable: false,
    },
    "reports.internal",
  ],
] as const)("does not hide context failures with status %s", async (status, body, key) => {
  reports();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(body, status));
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await screen.findByRole("alert");
  expect(screen.getByText(label("zh", key))).toBeTruthy();
  expect(screen.queryByText(label("zh", "reports.unconfigured"))).toBeNull();
  expect(document.body.textContent).not.toContain("private-path");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
const initialOnline = onlineManager.isOnline();
beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
  focusManager.setFocused(undefined);
  onlineManager.setOnline(initialOnline);
});
async function cycleQueryManagers() {
  await act(async () => {
    focusManager.setFocused(false);
    onlineManager.setOnline(false);
  });
  await act(async () => {
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
  });
}

describe("TC-AM03-03/10/11 strict report boundaries", () => {
  it.each(["zh", "en"] as const)(
    "formats every safe cent exactly in %s without float division",
    (language) => {
      expect(formatMinor(Number.MAX_SAFE_INTEGER, language)).toBe("90,071,992,547,409.91");
      expect(formatMinor(-Number.MAX_SAFE_INTEGER, language)).toBe("-90,071,992,547,409.91");
      expect(formatMinor(0, language)).toBe("0.00");
      expect(formatMinor(-1, language)).toBe("-0.01");
      expect(() => formatMinor(Number.MAX_SAFE_INTEGER + 1, language)).toThrow();
    },
  );
  it("rejects malformed or unordered periods and strict/incorrect source and month echoes", () => {
    expect(parseContext(context)).toEqual(context);
    expect(() => parseContext({ ...context, periods: [...context.periods].reverse() })).toThrow();
    expect(() =>
      parseContext({ ...context, periods: [context.periods[0], context.periods[0]] }),
    ).toThrow();
    expect(() => parseTrial({ ...trial(), extra: true }, scope)).toThrow();
    expect(() => parseTrial(trial("2025-01"), scope)).toThrow();
    expect(() =>
      parseTrial({ ...trial(), source: { ...source, snapshotBytes: 999 } }, scope),
    ).toThrow();
    expect(() => parseTrial({ ...trial(), month: "2025-13" }, scope)).toThrow();
  });
  it("keeps legitimate repeated journal IDs but rejects duplicate line IDs and broken page chains", () => {
    const first = parseLedgerPage(page(), scope, [], undefined);
    expect(parseLedgerPage(page(2), scope, [first], "next_1").entries[0]?.id).toBe(8);
    for (const bad of [
      { ...page(2), entries: [entry(1)] },
      { ...page(2), nextCursor: "next_1" },
      { ...page(2), debit: 201 },
      { ...page(2), totalEntries: 3 },
      { ...page(2), account: "1200" },
      { ...page(2), entries: [] },
      { ...page(2), entries: [entry(2), entry(3)] },
    ])
      expect(() => parseLedgerPage(bad, scope, [first], "next_1")).toThrow();
    expect(() => parseLedgerPage({ ...page(), entries: [] }, scope, [], undefined)).toThrow();
    expect(() =>
      parseLedgerPage(
        { ...page(), entries: [{ ...entry(1), account: "1200" }] },
        scope,
        [],
        undefined,
      ),
    ).toThrow();
    expect(() =>
      parseLedgerPage(
        { ...page(), entries: [{ ...entry(1), date: "2025-01-31" }] },
        scope,
        [],
        undefined,
      ),
    ).toThrow();
    expect(() =>
      parseLedgerPage(
        { ...page(), entries: [{ ...entry(1), date: "2025-02-30" }] },
        scope,
        [],
        undefined,
      ),
    ).toThrow();
    expect(() =>
      parseLedgerPage(
        { ...page(), source: { ...source, snapshotSha256: "b".repeat(64) } },
        scope,
        [],
        undefined,
      ),
    ).toThrow();
    expect(() => parseLedgerPage({ ...page(), month: "2025-01" }, scope, [], undefined)).toThrow();
    expect(() => parseLedgerPage({ ...page(), data: page() }, scope, [], undefined)).toThrow();
    expect(
      parseLedgerPage({ ...page(2), totalEntries: 0, entries: [] }, scope, [], undefined).entries,
    ).toEqual([]);
  });
  it("rejects a cursor cycling to an earlier page rather than just the immediately preceding cursor", () => {
    const first = parseLedgerPage(
      { ...page(), totalEntries: 4, nextCursor: "first" },
      scope,
      [],
      undefined,
    );
    const second = parseLedgerPage(
      { ...page(2), totalEntries: 4, nextCursor: "second" },
      scope,
      [first],
      "first",
    );
    expect(() =>
      parseLedgerPage(
        { ...page(3), totalEntries: 4, nextCursor: "first" },
        scope,
        [first, second],
        "second",
      ),
    ).toThrow();
  });
});

describe("TC-AM03-09/12 real Router and Query consumers (mock HTTP)", () => {
  it("keeps overview health-only and navigates to last real period with an adjusted trial", async () => {
    const fetcher = installFetch();
    render(<App />);
    await screen.findByText(label("zh", "shell.connected"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", { name: label("zh", "reports.trial") }));
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    expect((screen.getByLabelText(label("zh", "reports.period")) as HTMLSelectElement).value).toBe(
      "2025-02",
    );
    expect((screen.getByLabelText(label("zh", "reports.stage")) as HTMLSelectElement).value).toBe(
      "adjusted",
    );
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/context"))).toHaveLength(1);
    expect(fetcher.mock.calls.find(([url]) => String(url).includes("/context"))?.[0]).toBe(
      "/api/v1/legacy/context",
    );
  });
  it("preserves source/month/stage through full-month drill, preferences, skip and return without refetch", async () => {
    reports();
    const ledger = vi
      .fn()
      .mockResolvedValue(response({ ...page(2), entries: [entry(1), entry(2)] }));
    const fetcher = installFetch(ledger);
    render(<App />);
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    fireEvent.change(screen.getByLabelText(label("zh", "reports.stage")), {
      target: { value: "postClosing" },
    });
    fireEvent.click(screen.getByRole("link", { name: "1100 原始 Cash" }));
    await screen.findByText("原始 memo 1");
    const ledgerUrl = new URL(String(ledger.mock.calls[0]?.[0]), "http://localhost");
    expect(ledgerUrl.searchParams.has("stage")).toBe(false);
    expect(ledgerUrl.searchParams.get("month")).toBe("2025-02");
    const count = fetcher.mock.calls.length;
    fireEvent.change(document.querySelector("#workspace-language")!, { target: { value: "en" } });
    fireEvent.change(document.querySelector("#workspace-theme")!, { target: { value: "green" } });
    expect(screen.queryByText(label("en", "reports.teaching"))).toBeNull();
    fireEvent.click(document.querySelector("#workspace-teaching")!);
    expect(screen.getByText(label("en", "reports.teaching"))).toBeTruthy();
    const hash = window.location.hash;
    fireEvent.click(screen.getByRole("link", { name: label("en", "shell.skip") }));
    expect(document.activeElement).toBe(document.querySelector("main"));
    expect(window.location.hash).toBe(hash);
    await cycleQueryManagers();
    expect(fetcher).toHaveBeenCalledTimes(count);
    fireEvent.click(screen.getByRole("link", { name: label("en", "reports.back") }));
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    expect((screen.getByLabelText(label("en", "reports.stage")) as HTMLSelectElement).value).toBe(
      "postClosing",
    );
    expect(fetcher).toHaveBeenCalledTimes(count);
    fireEvent.click(screen.getByRole("link", { name: label("en", "shell.overview") }));
    await screen.findByText(label("en", "shell.connected"));
    expect(
      screen
        .getByRole("link", { name: label("en", "shell.overview") })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
  it("preserves the non-last global period and trial stage in primary navigation from the ledger", async () => {
    reports();
    const ledger = vi.fn().mockResolvedValue(
      response({
        ...page(2),
        month: "2025-01",
        entries: [],
        totalEntries: 0,
      }),
    );
    const fetcher = installFetch(ledger);
    render(<App />);
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    fireEvent.change(screen.getByLabelText(label("zh", "reports.period")), {
      target: { value: "2025-01" },
    });
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    fireEvent.change(screen.getByLabelText(label("zh", "reports.stage")), {
      target: { value: "postClosing" },
    });
    fireEvent.click(screen.getByRole("link", { name: "1100 原始 Cash" }));
    await screen.findByText(label("zh", "reports.emptyLedger"));
    const count = fetcher.mock.calls.length;
    fireEvent.click(screen.getByRole("link", { name: label("zh", "reports.trial") }));
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    expect((screen.getByLabelText(label("zh", "reports.period")) as HTMLSelectElement).value).toBe(
      "2025-01",
    );
    expect((screen.getByLabelText(label("zh", "reports.stage")) as HTMLSelectElement).value).toBe(
      "postClosing",
    );
    const search = new URLSearchParams(window.location.hash.split("?")[1]);
    expect(search.get("source")).toBe(source.snapshotSha256);
    expect(search.get("month")).toBe("2025-01");
    expect(search.get("stage")).toBe("postClosing");
    expect(fetcher).toHaveBeenCalledTimes(count);
  });
  it.each(["source=bad", "month=2025-01&month=2025-02"])(
    "keeps malformed report parameters explicit when primary navigation is clicked: %s",
    async (query) => {
      reports(`/reports/ledger/1100?${query}`);
      const fetcher = installFetch();
      render(<App />);
      await screen.findByText(label("zh", "reports.invalidSelection"));
      fireEvent.click(screen.getByRole("link", { name: label("zh", "reports.trial") }));
      expect(screen.getByText(label("zh", "reports.invalidSelection"))).toBeTruthy();
      expect(window.location.hash).toContain(query);
      expect(
        (screen.getByLabelText(label("zh", "reports.period")) as HTMLSelectElement).value,
      ).toBe("");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["month", "route"])(
    "does not retry a no-data error after switching %s and returning until the user retries",
    async (transition) => {
      reports();
      let failed = false;
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname.endsWith("/context")) return response(context);
        if (url.pathname.endsWith("/health"))
          return response({
            service: "ai-native-erp",
            contractVersion: "1",
            profile: "local",
            data: "unconfigured",
          });
        if (!failed && url.searchParams.get("month") === "2025-02") {
          failed = true;
          return response({ invalid: true });
        }
        return response(trial(url.searchParams.get("month")!));
      });
      vi.stubGlobal("fetch", fetcher);
      render(<App />);
      await screen.findByText(label("zh", "reports.invalidResponse"));
      await cycleQueryManagers();
      expect(fetcher).toHaveBeenCalledTimes(2);
      if (transition === "month") {
        fireEvent.change(screen.getByLabelText(label("zh", "reports.period")), {
          target: { value: "2025-01" },
        });
        await screen.findByRole("link", { name: "1100 原始 Cash" });
      } else {
        fireEvent.click(screen.getByRole("link", { name: label("zh", "shell.overview") }));
        await screen.findByText(label("zh", "shell.connected"));
      }
      const count = fetcher.mock.calls.length;
      await act(async () => {
        if (transition === "month") {
          fireEvent.change(screen.getByLabelText(label("zh", "reports.period")), {
            target: { value: "2025-02" },
          });
        } else {
          fireEvent.click(screen.getByRole("link", { name: label("zh", "reports.trial") }));
        }
      });
      expect(fetcher).toHaveBeenCalledTimes(count);
      expect(screen.getByText(label("zh", "reports.invalidResponse"))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: label("zh", "reports.retry") }));
      await screen.findByRole("link", { name: "1100 原始 Cash" });
      expect(fetcher).toHaveBeenCalledTimes(count + 1);
    },
  );
  it.each(["source=bad", "month=2025-13", "month=", "month=2025-01&month=2025-02"])(
    "never masquerades an explicit invalid URL as a selected valid period: %s",
    async (query) => {
      reports(`/reports/trial?${query}`);
      const fetcher = installFetch();
      render(<App />);
      await screen.findByText(label("zh", "reports.invalidSelection"));
      expect(
        (screen.getByLabelText(label("zh", "reports.period")) as HTMLSelectElement).value,
      ).toBe("");
      expect(fetcher.mock.calls.some(([url]) => String(url).includes("/trial?"))).toBe(false);
    },
  );
  it("shows a real empty-period state without inventing a current month", async () => {
    reports();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...context, periods: [] })));
    render(<App />);
    await screen.findByText(label("zh", "reports.noPeriods"));
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("preserves explicit invalid selections through the report-index redirect", async () => {
    reports("/reports?source=bad&month=2025-02");
    const fetcher = installFetch();
    render(<App />);
    await screen.findByText(label("zh", "reports.invalidSelection"));
    expect(window.location.hash).toContain("source=bad");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels old month requests, removes displayed data immediately and ignores late responses", async () => {
    reports();
    const late = deferred<Response>();
    let oldSignal: AbortSignal | undefined;
    const fetcher = installFetch();
    fetcher.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/context")) return response(context);
      if (url.searchParams.get("month") === "2025-02") {
        oldSignal = init?.signal as AbortSignal;
        return late.promise;
      }
      return response({
        ...trial("2025-01"),
        trialBalances: {
          unadjusted: { ...balance, rows: [] },
          adjusted: { ...balance, rows: [] },
          postClosing: { ...balance, rows: [] },
        },
      });
    });
    render(<App />);
    await waitFor(() => expect(oldSignal).toBeTruthy());
    fireEvent.change(screen.getByLabelText(label("zh", "reports.period")), {
      target: { value: "2025-01" },
    });
    expect(screen.queryByText("原始 Cash")).toBeNull();
    await waitFor(() => expect(oldSignal?.aborted).toBe(true));
    await act(async () => {
      late.resolve(response(trial()));
      await late.promise;
    });
    expect(screen.queryByRole("link", { name: "1100 原始 Cash" })).toBeNull();
  });
  it("serializes load-more and labels failed page incomplete, retaining only validated same-context lines", async () => {
    reports("/reports/ledger/1100");
    const second = deferred<Response>();
    const ledger = vi
      .fn()
      .mockResolvedValueOnce(response(page()))
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce(response(page(2)));
    installFetch(ledger);
    render(<App />);
    await screen.findByText("原始 memo 1");
    const more = screen.getByRole("button", { name: label("zh", "reports.more") });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(ledger).toHaveBeenCalledTimes(2);
    await act(async () => {
      second.resolve(response({ ...page(2), entries: [entry(1)] }));
      await second.promise;
    });
    await screen.findByText(label("zh", "reports.incomplete"));
    expect(screen.getByText("原始 memo 1")).toBeTruthy();
    expect(screen.queryByText("原始 memo 2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: label("zh", "reports.retry") }));
    await screen.findByText("原始 memo 2");
    expect(screen.getAllByText(/原始 memo/)).toHaveLength(2);
    expect(screen.getByText(label("zh", "reports.complete"))).toBeTruthy();
  });
  it("removes old ledger rows and cursors immediately on period change and ignores a late page", async () => {
    reports("/reports/ledger/1100");
    const late = deferred<Response>();
    let oldSignal: AbortSignal | undefined;
    const ledger = vi.fn().mockImplementation(async (input, init: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.searchParams.get("month") === "2025-01") {
        expect(url.searchParams.has("cursor")).toBe(false);
        return response({ ...page(2), month: "2025-01", entries: [], totalEntries: 0 });
      }
      if (url.searchParams.has("cursor")) {
        oldSignal = init.signal as AbortSignal;
        return late.promise;
      }
      return response(page());
    });
    installFetch(ledger);
    render(<App />);
    await screen.findByText("原始 memo 1");
    fireEvent.click(screen.getByRole("button", { name: label("zh", "reports.more") }));
    await waitFor(() => expect(oldSignal).toBeTruthy());
    fireEvent.change(screen.getByLabelText(label("zh", "reports.period")), {
      target: { value: "2025-01" },
    });
    expect(screen.queryByText("原始 memo 1")).toBeNull();
    await screen.findByText(label("zh", "reports.emptyLedger"));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      late.resolve(response(page(2)));
      await late.promise;
    });
    expect(screen.queryByText("原始 memo 2")).toBeNull();
    expect(screen.queryByRole("button", { name: label("zh", "reports.more") })).toBeNull();
    expect(screen.getByText(label("zh", "reports.fullMonth"))).toBeTruthy();
  });
  it("removes trial data on explicit source change and does not request the foreign snapshot", async () => {
    reports();
    const fetcher = installFetch();
    render(<App />);
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    await act(async () => {
      window.location.hash = `/reports/trial?source=${"b".repeat(64)}&month=2025-02&stage=adjusted`;
    });
    await screen.findByText(label("zh", "reports.invalidSelection"));
    expect(screen.queryByRole("table")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps report selections and data across failed then recovered preference saves and remount", async () => {
    reports();
    const fetcher = installFetch();
    const mounted = render(<App />);
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    fireEvent.change(screen.getByLabelText(label("zh", "reports.stage")), {
      target: { value: "unadjusted" },
    });
    const hash = window.location.hash;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private-path");
    });
    fireEvent.change(document.querySelector("#workspace-language")!, { target: { value: "en" } });
    expect(screen.getByText(label("zh", "shell.storageWrite"))).toBeTruthy();
    expect((document.querySelector("#workspace-language") as HTMLSelectElement).value).toBe("zh");
    expect(window.location.hash).toBe(hash);
    write.mockRestore();
    fireEvent.change(document.querySelector("#workspace-language")!, { target: { value: "en" } });
    fireEvent.change(document.querySelector("#workspace-theme")!, { target: { value: "green" } });
    expect(screen.queryByText(label("en", "shell.storageWrite"))).toBeNull();
    expect(screen.queryByText(label("en", "reports.teaching"))).toBeNull();
    expect(screen.getByText(label("en", "reports.sign"))).toBeTruthy();
    expect(screen.getByText(label("en", "reports.snapshot"))).toBeTruthy();
    expect(screen.getByText(label("en", "reports.unbalanced"))).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.localStorage.getItem(preferenceStorageKey)!)).toEqual({
      language: "en",
      theme: "green",
      teaching: false,
    });
    mounted.unmount();
    render(<App />);
    await screen.findByRole("link", { name: "1100 原始 Cash" });
    expect((screen.getByLabelText(label("en", "reports.stage")) as HTMLSelectElement).value).toBe(
      "unadjusted",
    );
    expect((document.querySelector("#workspace-theme") as HTMLSelectElement).value).toBe("green");
    expect(document.body.textContent).not.toContain("private-path");
  });
  it.each([
    ["wrong echo", { ...trial(), month: "2025-01" }, 200, "reports.invalidResponse"],
    ["extra fields", { ...trial(), private: "private-path" }, 200, "reports.invalidResponse"],
    ["raw error", { message: "private-path" }, 503, "reports.invalidResponse"],
    [
      "unavailable",
      {
        code: "UNAVAILABLE",
        messageKey: "api.error.unavailable",
        params: { path: "private-path" },
        fieldErrors: [],
        requestId: "12345678-1234-4234-8234-123456789abc",
        retryable: true,
      },
      503,
      "reports.unavailable",
    ],
  ] as const)(
    "shows safe error text for %s and recovers only by user retry",
    async (_name, body, status, key) => {
      reports();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(context))
        .mockResolvedValueOnce(response(body, status))
        .mockResolvedValueOnce(response(trial()));
      vi.stubGlobal("fetch", fetcher);
      render(<App />);
      await screen.findByText(label("zh", key));
      expect(screen.queryByRole("table")).toBeNull();
      expect(document.body.textContent).not.toContain("private-path");
      expect(
        screen.getByRole("alert").querySelector('[aria-hidden="true"]')?.textContent,
      ).toContain("⚠");
      fireEvent.change(document.querySelector("#workspace-language")!, { target: { value: "en" } });
      await cycleQueryManagers();
      expect(fetcher).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("button", { name: label("en", "reports.retry") }));
      await screen.findByRole("link", { name: "1100 原始 Cash" });
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it("does not auto-switch a 409 and explicitly clears context and pages on reload snapshot", async () => {
    reports();
    let changed = false;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith("/context"))
        return response(
          changed
            ? {
                ...context,
                source: { ...source, snapshotSha256: "b".repeat(64) },
              }
            : context,
        );
      return response(
        {
          code: "CONFLICT",
          messageKey: "error.conflict",
          params: {},
          fieldErrors: [],
          requestId: "12345678-1234-4234-8234-123456789abc",
          retryable: false,
        },
        409,
      );
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await screen.findByRole("button", { name: label("zh", "reports.reload") });
    expect(fetcher).toHaveBeenCalledTimes(2);
    changed = true;
    fireEvent.click(screen.getByRole("button", { name: label("zh", "reports.reload") }));
    await waitFor(() => expect(window.location.hash).toContain("b".repeat(64)));
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/context"))).toHaveLength(2);
  });
});

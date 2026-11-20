import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "../src/App.tsx";
import { preferenceStorageKey } from "../src/ui/index.ts";

test.for(["red", "green"])(
  "migration is read-only and localized with keyboard-native disclosure (%s)",
  async (theme, t) => {
    t.onTestFinished(() => window.history.replaceState(null, "", "/"));
    window.location.hash = "#/migration";
    localStorage.setItem(
      preferenceStorageKey,
      JSON.stringify({ language: "zh", theme, teaching: false }),
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          run: {
            id: "fictional-run",
            status: "imported",
            createdAt: "2026-01-01",
            baseline: null,
            reportSha256: "a".repeat(64),
            confirmationSha256: null,
            report: {
              version: 1,
              runId: "fictional-run",
              snapshotSha256: {},
              verdict: "pending",
              blockers: [],
              knownDifferencesSha256: "b".repeat(64),
              differences: [],
              knownDifferences: [
                {
                  source: "teaching",
                  object: "journals",
                  disposition: "skipped",
                  reasons: [],
                  count: 1,
                  legacyRefs: ["3"],
                },
              ],
              checks: [],
            },
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByText("待确认")).toBeTruthy();
    expect(
      screen.getByText("只读报告；不提供确认、演练或切换操作。核对通过不代表已获准切换。"),
    ).toBeTruthy();
    const summary = screen.getByText("teaching · journals · skipped (1)");
    expect(summary.tagName).toBe("SUMMARY");
    summary.focus();
    expect(document.activeElement).toBe(summary);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("语言"), { target: { value: "en" } });
    expect(screen.getByText("Awaiting confirmation")).toBeTruthy();
    expect(document.querySelector(".workspace")?.getAttribute("data-theme")).toBe(theme);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/migration");
  },
);

test("migration details show key-value tables with non-color mismatch marks, raw JSON collapsed and teaching tip toggled", async (t) => {
  t.onTestFinished(() => window.history.replaceState(null, "", "/"));
  window.location.hash = "#/migration";
  localStorage.setItem(
    preferenceStorageKey,
    JSON.stringify({ language: "zh", theme: "red", teaching: true }),
  );
  const row = { source: "teaching", object: "journals", count: 12 };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        run: {
          id: "fictional-run",
          status: "imported",
          createdAt: "2026-01-01",
          baseline: null,
          reportSha256: "a".repeat(64),
          confirmationSha256: null,
          report: {
            version: 1,
            runId: "fictional-run",
            snapshotSha256: {},
            verdict: "difference",
            blockers: [],
            knownDifferencesSha256: "b".repeat(64),
            differences: [
              {
                section: "counts",
                key: "teaching:journals",
                expected: row,
                actual: { ...row, count: 11 },
              },
              {
                section: "trade-reconciliation",
                key: "DEMO:1122",
                expected: { tradeDifferenceMinor: "0" },
                actual: { tradeDifferenceMinor: "150" },
              },
              {
                section: "draft-lines",
                key: "teaching:DEMO-L-1",
                expected: { company: "DEMO", account: "1100", debit: "100" },
                actual: { company: "DEMO", account: "1200", debit: "150" },
              },
            ],
            knownDifferences: [],
            checks: [
              { section: "counts", expected: [row], actual: [row] },
              // Same length, different business keys: must not be paired by position.
              {
                section: "trial-balance",
                expected: [
                  { account: "1100", balanceMinor: "500" },
                  { account: "1200", balanceMinor: "700" },
                ],
                actual: [
                  { account: "1200", balanceMinor: "700" },
                  { account: "1300", balanceMinor: "900" },
                ],
              },
            ],
          },
        },
      }),
      { headers: { "content-type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  const tip = "核对通过 ≠ 批准切换；切换须用户另行授权。";
  expect(await screen.findByText("差异 · counts · teaching:journals")).toBeTruthy();
  expect(screen.getByText(tip)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("迁移核对");
  expect(screen.queryAllByRole("button")).toHaveLength(0);

  const [counts, trade, draft, check, balance] = [
    ...document.querySelectorAll<HTMLDetailsElement>("main details"),
  ].filter((details) => !details.parentElement?.closest("details"));
  const table = counts?.querySelector("table.kv");
  // S5-b: each key-value table sits in its own shared horizontal scroll region.
  expect(table?.parentElement?.matches(".grid-wrap.scroll-hint")).toBe(true);
  expect([...(table?.querySelectorAll("thead th") ?? [])].map((th) => th.textContent)).toEqual([
    "字段",
    "快照预期",
    "目标实际",
    "差额",
  ]);
  const cells = (details: Element | undefined) =>
    [...(details?.querySelectorAll("tbody tr") ?? [])].map((tr) => [
      ...[...tr.children].map((cell) => cell.textContent),
      tr.hasAttribute("data-mismatch"),
    ]);
  expect(cells(counts)).toEqual([
    ["source ", "teaching", "teaching", "—", false],
    ["object ", "journals", "journals", "—", false],
    ["count 不符", "12", "11", "-1", true],
  ]);
  expect(cells(trade)).toEqual([["tradeDifferenceMinor 不符", "0", "150", "+150", true]]);
  expect(counts?.querySelector("strong.mismatch")?.textContent).toBe("不符");
  // Identifiers never get a 差额, even when they are integer strings that differ.
  expect(cells(draft)).toEqual([
    ["company ", "DEMO", "DEMO", "—", false],
    ["account 不符", "1100", "1200", "—", true],
    ["debit 不符", "100", "150", "+50", true],
  ]);
  // Check rows carry no business key: each side is listed on its own, unmarked, without 差额.
  expect(cells(check)).toEqual([
    ["source ", "teaching", "—", "—", false],
    ["object ", "journals", "—", "—", false],
    ["count ", "12", "—", "—", false],
    ["source ", "—", "teaching", "—", false],
    ["object ", "—", "journals", "—", false],
    ["count ", "—", "12", "—", false],
  ]);
  expect(cells(balance)).toEqual([
    ["account ", "1100", "—", "—", false],
    ["balanceMinor ", "500", "—", "—", false],
    ["account ", "1200", "—", "—", false],
    ["balanceMinor ", "700", "—", "—", false],
    ["account ", "—", "1200", "—", false],
    ["balanceMinor ", "—", "700", "—", false],
    ["account ", "—", "1300", "—", false],
    ["balanceMinor ", "—", "900", "—", false],
  ]);
  expect(balance?.querySelectorAll("strong.mismatch")).toHaveLength(0);

  for (const details of [counts, trade, draft, check, balance]) {
    const raw = details?.querySelector("details");
    expect(raw?.querySelector(":scope > summary")?.textContent).toBe("原始 JSON");
    expect(raw?.open).toBe(false);
    expect(raw?.querySelector("pre")).toBeTruthy();
  }
  expect(JSON.parse(counts?.querySelector("details pre")?.textContent ?? "")).toEqual(row);

  fireEvent.click(screen.getByLabelText("显示教学说明"));
  expect(screen.queryByText(tip)).toBeNull();
  expect(
    screen.getByText("只读报告；不提供确认、演练或切换操作。核对通过不代表已获准切换。"),
  ).toBeTruthy();
  fireEvent.click(screen.getByLabelText("显示教学说明"));
  expect(screen.getByText(tip)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

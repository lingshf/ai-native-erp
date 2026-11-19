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

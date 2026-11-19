import { describe, expect, it } from "vitest";
import {
  selectPrTests,
  shouldRun,
  testSummary,
  vitestTimings,
  type TestTiming,
} from "../../../../scripts/ci.ts";

describe("CI selection and reporting", () => {
  it("keeps component-only and documentation changes incremental", () => {
    expect(selectPrTests(["packages/web/src/App.tsx", "README.md"])).toEqual({
      all: false,
    });
  });

  it("falls back on workspace/config changes", () => {
    for (const file of [
      "package.json",
      "package-lock.json",
      "packages/web/package.json",
      "vitest.config.ts",
      "tsconfig.base.json",
      "packages/web/tsconfig.json",
    ]) {
      expect(selectPrTests([file]), file).toEqual({ all: true });
    }
  });

  it("skips inactive nights but not a push/manual run", () => {
    const now = Date.UTC(2026, 10, 18);
    const cutoff = (now - 24 * 60 * 60 * 1000) / 1000;
    expect(shouldRun("schedule", cutoff - 1, now)).toBe(false);
    expect(shouldRun("schedule", cutoff, now)).toBe(true);
    expect(shouldRun("push", cutoff - 1, now)).toBe(true);
    expect(shouldRun("workflow_dispatch", cutoff - 1, now)).toBe(true);
  });

  it("sorts Vitest timings top ten and escapes table cells", () => {
    const timings: TestTiming[] = Array.from({ length: 11 }, (_, index) => ({
      name: `case ${index}`,
      file: "packages/core/test/example.test.ts",
      durationMs: index,
    }));
    timings.push({
      name: "slow|test\ncase",
      file: "packages/core/test/slow.test.ts",
      durationMs: 99,
    });
    const markdown = testSummary(timings);
    expect(markdown).toContain("Executed tests with timings: 12");
    expect(markdown).toContain("slow\\|test case");
    expect(markdown.indexOf("99.00")).toBeLessThan(markdown.indexOf("10.00"));
    expect(markdown).not.toContain("| case 0 |");
    expect(markdown).not.toContain("| case 1 |");
  });

  it("reports failed tests and rejects malformed reports instead of masking them", () => {
    expect(
      vitestTimings({
        testResults: [
          {
            name: "test.ts",
            assertionResults: [
              { fullName: "failure", duration: 12, status: "failed" },
              { fullName: "skipped", status: "pending" },
            ],
          },
        ],
      }),
    ).toEqual([{ name: "failure", file: "test.ts", durationMs: 12 }]);
    expect(() => vitestTimings({})).toThrow("Invalid Vitest JSON report");
  });
});

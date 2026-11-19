import { describe, expect, it } from "vitest";
import {
  balanceShards,
  fileWeights,
  guiStartupSummary,
  selectPrTests,
  selectShardFiles,
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
      "scripts/ci.ts",
      "scripts/test-shard-weights.json",
      ".github/workflows/full.yml",
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

  it("splits shards by recorded weight, assigning every file exactly once", () => {
    const weights = {
      "a.test.ts": 9,
      "b.test.ts": 5,
      "c.test.ts": 4,
      "d.test.ts": 3,
      "e.test.ts": 3,
    };
    const files = ["e.test.ts", "d.test.ts", "c.test.ts", "b.test.ts", "a.test.ts", "new.test.ts"];
    const shards = balanceShards(files, weights, 2);
    expect(shards).toEqual([
      ["a.test.ts", "new.test.ts"],
      ["b.test.ts", "c.test.ts", "d.test.ts", "e.test.ts"],
    ]);
    expect(shards.flat().sort()).toEqual([...files].sort());
    expect(balanceShards([...files].reverse(), weights, 2)).toEqual(shards);
    expect(() => balanceShards(files, weights, 0)).toThrow("Invalid shard count");
  });

  it("averages per-file run time across shard reports", () => {
    const suite = (name: string, ms: number) => ({ name, startTime: 100, endTime: 100 + ms });
    expect(
      fileWeights(
        [
          { testResults: [suite("/repo/b.test.ts", 30), suite("/repo/a.test.ts", 10)] },
          { testResults: [suite("/repo/a.test.ts", 20)] },
        ],
        "/repo",
      ),
    ).toEqual({ "a.test.ts": 15, "b.test.ts": 30 });
    expect(() => fileWeights([{ testResults: [{ name: "x" }] }])).toThrow("Invalid Vitest suite");
  });

  it("balances project worker time instead of adding a serial project tail", () => {
    const weights = { heavy: 18, medium: 12, web: 8, small: 6, core: 4 };
    const projects = {
      heavy: "infra",
      medium: "infra",
      small: "infra",
      web: "web",
      core: "core",
    };
    const files = Object.keys(weights);
    const options = { workers: 2, projects };
    expect(balanceShards(files, weights, 2, options)).toEqual([
      ["heavy", "small", "core"],
      ["medium", "web"],
    ]);
    expect(balanceShards([...files].reverse(), weights, 2, options)).toEqual(
      balanceShards(files, weights, 2, options),
    );
    expect(() => balanceShards(files, weights, 2, { workers: 0 })).toThrow("Invalid worker count");
  });

  it("partitions every file exactly once when jobs execute with different worker counts", () => {
    const weights = { a: 9, b: 8, c: 7, d: 6, e: 5, f: 4, g: 3 };
    const files = Object.keys(weights);
    const projects = Object.fromEntries(files.map((file) => [file, "infra"]));
    for (const workerCounts of [
      [1, 1],
      [2, 2],
      [3, 3],
      [2, 3],
      [3, 2],
      [1, 8],
      [2, 3, 2, 2, 2, 2],
      [1, 2, 3, 4, 5, 8],
    ]) {
      const shards = workerCounts.map((maxWorkers, index) => {
        const config = { maxWorkers, shard: { index: index + 1, count: workerCounts.length } };
        return selectShardFiles(files, weights, config, projects);
      });
      expect(shards.flat().sort(), `workers=${workerCounts}`).toEqual(files);
      for (const [index, shard] of shards.entries()) {
        for (const other of shards.slice(index + 1)) {
          expect(shard.filter((file) => other.includes(file))).toEqual([]);
        }
      }
    }
  });

  it("isolates the storage CLI without losing files under mixed execution workers", () => {
    const isolated = "packages/infra/test/storage-admin-cli.test.ts";
    const files = [isolated, "a", "b", "c", "d", "e"];
    const weights = Object.fromEntries(files.map((file, index) => [file, index + 1]));
    const projects = Object.fromEntries(files.map((file) => [file, "infra"]));
    for (const workers of [
      [1, 1, 1, 1, 1, 1],
      [2, 3, 1, 8, 3, 2],
    ]) {
      const shards = workers.map((maxWorkers, index) => {
        const config = { maxWorkers, shard: { index: index + 1, count: workers.length } };
        return selectShardFiles([...files].reverse(), weights, config, projects);
      });
      expect(shards[5]).toEqual([isolated]);
      expect(shards.flat().sort()).toEqual([...files].sort());
      expect(new Set(shards.flat()).size).toBe(files.length);
    }
    expect(
      selectShardFiles(files, weights, { shard: { index: 1, count: 1 } }, projects).sort(),
    ).toEqual([...files].sort());
    const browserFiles = ["gui-a", "gui-b"];
    expect(
      [1, 2]
        .flatMap((index) => selectShardFiles(browserFiles, {}, { shard: { index, count: 2 } }, {}))
        .sort(),
    ).toEqual(browserFiles);
  });

  it("preserves GUI phases and only warns above ten seconds of startup", () => {
    const phase = (name: string, ms: number) =>
      JSON.stringify({ event: "trade-gui-phase", scenario: "migration", phase: name, ms });
    const phases = [phase("browser", 8000), phase("page", 1000), phase("page", 1000)];
    expect(guiStartupSummary(phases.join("\n")).markdown).not.toContain("Warning");
    phases.push(phase("interaction", 20_000));
    expect(guiStartupSummary(phases.join("\n")).markdown).not.toContain("Warning");
    phases.push(phase("page", 1));
    const report = guiStartupSummary(["Vitest unrelated output", ...phases].join("\n"));
    expect(report.phases).toHaveLength(5);
    expect(report.markdown).toContain("total: 10001ms");
    expect(report.markdown).toContain("Warning");
    expect(report.markdown).toContain("diagnostic only");
    expect(() => guiStartupSummary(phase("page", -1))).toThrow("Invalid GUI phase timing");
    expect(guiStartupSummary("No browser in this ordinary shard").phases).toEqual([]);
  });
});

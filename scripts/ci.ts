import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface TestTiming {
  name: string;
  file: string;
  durationMs: number;
}

export function selectPrTests(files: string[]) {
  return {
    all: files.some((file) => {
      const name = basename(file);
      return (
        ["package.json", "package-lock.json", "vitest.config.ts"].includes(name) ||
        name.startsWith("tsconfig")
      );
    }),
  };
}

export function shouldRun(event: string, commitSeconds: number, now = Date.now()) {
  if (!Number.isFinite(commitSeconds)) throw new Error("Invalid main commit timestamp");
  return event !== "schedule" || commitSeconds * 1000 >= now - 24 * 60 * 60 * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function vitestTimings(report: unknown): TestTiming[] {
  if (!isRecord(report) || !Array.isArray(report.testResults)) {
    throw new Error("Invalid Vitest JSON report");
  }
  const timings: TestTiming[] = [];
  for (const suite of report.testResults) {
    if (
      !isRecord(suite) ||
      typeof suite.name !== "string" ||
      !Array.isArray(suite.assertionResults)
    ) {
      throw new Error("Invalid Vitest suite");
    }
    for (const test of suite.assertionResults) {
      if (!isRecord(test)) throw new Error("Invalid Vitest assertion");
      if (test.status !== "passed" && test.status !== "failed") continue;
      if (
        typeof test.fullName !== "string" ||
        typeof test.duration !== "number" ||
        !Number.isFinite(test.duration)
      ) {
        throw new Error("Missing Vitest test name/duration");
      }
      timings.push({
        name: test.fullName,
        file: suite.name,
        durationMs: test.duration,
      });
    }
  }
  return timings;
}

function repoPath(file: string, root: string) {
  return relative(root, file).replaceAll("\\", "/");
}

/** Mean per-file run time (ms) across Vitest JSON reports, keyed by repo-relative path. */
export function fileWeights(reports: unknown[], root = process.cwd()) {
  const samples = new Map<string, number[]>();
  for (const report of reports) {
    if (!isRecord(report) || !Array.isArray(report.testResults)) {
      throw new Error("Invalid Vitest JSON report");
    }
    for (const suite of report.testResults) {
      if (
        !isRecord(suite) ||
        typeof suite.name !== "string" ||
        typeof suite.startTime !== "number" ||
        typeof suite.endTime !== "number"
      ) {
        throw new Error("Invalid Vitest suite");
      }
      const path = repoPath(suite.name, root);
      samples.set(path, [...(samples.get(path) ?? []), suite.endTime - suite.startTime]);
    }
  }
  return Object.fromEntries(
    [...samples]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, values]) => [
        path,
        Math.max(1, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)),
      ]),
  );
}

/**
 * Deterministic longest-first greedy split, minimizing estimated project/worker wall time.
 * Files without a recorded weight use the median weight; every file lands in exactly one shard.
 */
export function balanceShards(
  files: string[],
  weights: Record<string, number>,
  count: number,
  options: { workers?: number; projects?: Record<string, string> } = {},
) {
  if (!Number.isInteger(count) || count < 1) throw new Error("Invalid shard count");
  const workers = options.workers ?? 1;
  if (!Number.isInteger(workers) || workers < 1) throw new Error("Invalid worker count");
  const known = Object.values(weights).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const weightOf = (file: string) => weights[file] ?? fallback;
  const shards = Array.from({ length: count }, () => ({
    files: [] as string[],
    total: 0,
    duration: 0,
    projects: new Map<string, number[]>(),
  }));
  const ordered = [...new Set(files)].sort(
    (a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0),
  );
  for (const file of ordered) {
    const project = options.projects?.[file] ?? "";
    let target = shards[0];
    let targetDuration = Number.POSITIVE_INFINITY;
    let targetLanes: number[] = [];
    for (const shard of shards) {
      const lanes = [...(shard.projects.get(project) ?? Array<number>(workers).fill(0))];
      const previous = Math.max(...lanes);
      const lane = lanes.indexOf(Math.min(...lanes));
      lanes[lane] += weightOf(file);
      const duration = shard.duration - previous + Math.max(...lanes);
      if (
        duration < targetDuration ||
        (duration === targetDuration && shard.total < target.total)
      ) {
        target = shard;
        targetDuration = duration;
        targetLanes = lanes;
      }
    }
    target.files.push(file);
    target.total += weightOf(file);
    target.duration = targetDuration;
    target.projects.set(project, targetLanes);
  }
  return shards.map((shard) => shard.files);
}

export function selectShardFiles(
  files: string[],
  weights: Record<string, number>,
  config: { shard?: { index: number; count: number } },
  projects: Record<string, string>,
) {
  const { shard } = config;
  if (!shard) return files;
  // Every job must plan with the same model, regardless of its execution worker count.
  return balanceShards(files, weights, shard.count, { workers: 2, projects })[shard.index - 1];
}

function cell(value: string) {
  return value.replaceAll("|", "\\|").replace(/[\r\n]/g, " ");
}

export function testSummary(timings: TestTiming[]) {
  const slowest = [...timings].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
  return [
    "## Slowest 10 executed tests",
    "",
    `Executed tests with timings: ${timings.length}`,
    "",
    "| Test | File | Duration (ms) |",
    "| --- | --- | ---: |",
    ...slowest.map(
      (test) =>
        `| ${cell(test.name)} | ${cell(relative(process.cwd(), test.file))} | ${test.durationMs.toFixed(2)} |`,
    ),
    ...(slowest.length ? [] : ["| No affected tests | - | - |"]),
    "",
  ].join("\n");
}

function output(name: string, value: boolean) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(path, `${name}=${value}\n`);
}

function summary(text: string) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) throw new Error("GITHUB_STEP_SUMMARY is required");
  appendFileSync(path, `${text}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === "plan") {
    const base = process.env.BASE_REF;
    if (!base) throw new Error("BASE_REF is required");
    const files = execFileSync(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", `origin/${base}...HEAD`],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    const scope = selectPrTests(files);
    mkdirSync("artifacts/ci", { recursive: true });
    output("all", scope.all);
    summary(`## PR scope\n\nBase: ${cell(base)}; all tests: ${scope.all}`);
    console.log(JSON.stringify({ base, ...scope, files }));
  } else if (command === "gate") {
    const event = process.env.GITHUB_EVENT_NAME;
    if (!event) throw new Error("GITHUB_EVENT_NAME is required");
    const timestamp = execFileSync("git", ["log", "-1", "--format=%ct"], {
      encoding: "utf8",
    }).trim();
    if (!/^\d+$/.test(timestamp)) throw new Error("Invalid git commit timestamp");
    const run = shouldRun(event, Number(timestamp));
    mkdirSync("artifacts/ci", { recursive: true });
    output("run", run);
    summary(
      `## 24-hour gate\n\nEvent: ${event}; latest main commit: ${new Date(Number(timestamp) * 1000).toISOString()}.\n\n${run ? "Run requested." : "Skipped: no new main commit in the past 24 hours; no install, tests, build or benchmark."}`,
    );
  } else if (command === "summary") {
    const path = "artifacts/ci/vitest.json";
    if (
      !existsSync(path) &&
      (process.env.TEST_OUTCOME === "success" || process.env.TEST_OUTCOME === "failure")
    ) {
      summary(
        "Missing vitest.json; the test step did not produce its report. See the failed step.",
      );
      throw new Error("Missing vitest.json");
    }
    const timings = existsSync(path) ? vitestTimings(JSON.parse(readFileSync(path, "utf8"))) : [];
    summary(testSummary(timings));
  } else if (command === "weights") {
    const args = process.argv.slice(3);
    const rootArg = args.find((arg) => arg.startsWith("--root="));
    const reports = args.filter((arg) => arg !== rootArg);
    if (!reports.length) {
      throw new Error("Usage: node scripts/ci.ts weights [--root=REPORT_ROOT] REPORT.json...");
    }
    const weights = fileWeights(
      reports.map((path) => JSON.parse(readFileSync(path, "utf8"))),
      rootArg?.slice("--root=".length),
    );
    writeFileSync("scripts/test-shard-weights.json", `${JSON.stringify(weights, null, 2)}\n`);
  } else {
    throw new Error(`Unknown CI command: ${command}`);
  }
}

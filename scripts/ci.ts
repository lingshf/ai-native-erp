import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface TestTiming {
  name: string;
  file: string;
  durationMs: number;
  source: "vitest" | "legacy";
}

interface LegacyEvent {
  type: string;
  data: {
    name?: string;
    file?: string;
    details?: { type?: string; duration_ms?: number };
  };
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
    legacy: files.some((file) => /^(src|public|tests)\//.test(file)),
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
        source: "vitest",
      });
    }
  }
  return timings;
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
    "| Layer | Test | File | Duration (ms) |",
    "| --- | --- | --- | ---: |",
    ...slowest.map(
      (test) =>
        `| ${test.source} | ${cell(test.name)} | ${cell(relative(process.cwd(), test.file))} | ${test.durationMs.toFixed(2)} |`,
    ),
    ...(slowest.length ? [] : ["| - | No affected tests | - | - |"]),
    "",
  ].join("\n");
}

export default async function* legacyReporter(source: AsyncIterable<LegacyEvent>) {
  const timings: TestTiming[] = [];
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const { name, file, details } = event.data;
    if (details?.type === "suite") continue;
    if (
      typeof name !== "string" ||
      typeof file !== "string" ||
      !Number.isFinite(details?.duration_ms)
    ) {
      throw new Error("Missing legacy test timing");
    }
    if (typeof details?.duration_ms !== "number") throw new Error("Invalid legacy duration");
    timings.push({ name, file, durationMs: details.duration_ms, source: "legacy" });
  }
  yield `${JSON.stringify(timings)}\n`;
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

function readLegacyTimings(value: unknown): TestTiming[] {
  if (!Array.isArray(value)) throw new Error("Invalid legacy JSON report");
  return value.map((test: unknown) => {
    if (
      !isRecord(test) ||
      typeof test.name !== "string" ||
      typeof test.file !== "string" ||
      typeof test.durationMs !== "number" ||
      !Number.isFinite(test.durationMs) ||
      test.source !== "legacy"
    ) {
      throw new Error("Invalid legacy timing");
    }
    return { name: test.name, file: test.file, durationMs: test.durationMs, source: "legacy" };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === "plan") {
    const base = process.env.BASE_REF;
    if (!base) throw new Error("BASE_REF is required");
    const files = execFileSync("git", ["diff", "--name-only", "-z", `origin/${base}...HEAD`], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
    const scope = selectPrTests(files);
    mkdirSync("artifacts/ci", { recursive: true });
    output("all", scope.all);
    output("legacy", scope.legacy);
    summary(`## PR scope\n\nBase: ${cell(base)}; all tests: ${scope.all}; legacy: ${scope.legacy}`);
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
    const timings: TestTiming[] = [];
    for (const [file, outcome, parse] of [
      ["vitest.json", process.env.TEST_OUTCOME, vitestTimings],
      ["legacy.json", process.env.LEGACY_OUTCOME, readLegacyTimings],
    ] as const) {
      const path = `artifacts/ci/${file}`;
      if (existsSync(path)) timings.push(...parse(JSON.parse(readFileSync(path, "utf8"))));
      else if (outcome === "success" || outcome === "failure") {
        summary(`Missing ${file}; the test step did not produce its report. See the failed step.`);
        throw new Error(`Missing ${file}`);
      }
    }
    summary(testSummary(timings));
  } else {
    throw new Error(`Unknown CI command: ${command}`);
  }
}

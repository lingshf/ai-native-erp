import Database from "better-sqlite3";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { compileDimensionRules, dimensionBalance, type DimensionConfig } from "@erp/core/domain";
import { journalBenchmark } from "./journals.ts";
import { businessEventBenchmark } from "./business-events.ts";
import { reportsBenchmark, reportsMarkdown } from "./reports.ts";

function dimensionBenchmark() {
  const base = { revision: 1, active: true, from: "2026-01-01", to: "2026-12-31" };
  const catalog: DimensionConfig[] = ["DEPT", "COST", "SITE"].flatMap((code) => [
    { ...base, kind: "dimension" as const, code, name: code },
    ...["A", "B"].map((value) => ({
      ...base,
      kind: "value" as const,
      dimension: code,
      code: value,
      name: value,
    })),
  ]);
  catalog.push(
    { ...base, kind: "defaults", code: "LEDGER", values: { COST: "A", SITE: "A" } },
    {
      ...base,
      kind: "derivation",
      code: "COST_A",
      when: { DEPT: "A" },
      values: { COST: "A" },
      mode: "fill",
    },
    {
      ...base,
      kind: "derivation",
      code: "COST_B",
      when: { DEPT: "B" },
      values: { COST: "B" },
      mode: "replace",
    },
    {
      ...base,
      kind: "structure",
      code: "1000",
      required: ["DEPT", "COST", "SITE"],
      optional: [],
      forbidden: [],
      allowed: [{ DEPT: "A" }, { DEPT: "B" }],
      fixed: {},
      conditionals: [{ when: { SITE: "B" }, required: ["COST"], fixed: { COST: "B" } }],
    },
  );
  const compiled = compileDimensionRules(catalog);
  const inputs = Array.from({ length: 100 }, (_, index) => ({
    account: "1000",
    day: "2026-01-15",
    explicit: { DEPT: index % 2 ? "A" : "B", SITE: index % 3 ? "A" : "B" },
  }));
  const balance = {
    ...base,
    kind: "balance" as const,
    code: "LEDGER",
    dimension: "DEPT",
    account: "2800",
  };
  const account = { code: "2800", active: true, purpose: "clearing" as const };
  const run = () => {
    const lines = inputs.map((input, index) => ({
      debit: index % 2 ? 0 : 100,
      credit: index % 2 ? 100 : 0,
      dimensions: compiled.resolve(input).dimensions,
    }));
    if (
      lines.some((line) => Object.keys(line.dimensions).length !== 3) ||
      dimensionBalance(balance, "2026-01-15", lines, account).length !== 2
    )
      throw new Error("Invalid dimension benchmark result");
  };
  for (let index = 0; index < 10; index++) run();
  const samples = Array.from({ length: 100 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return {
    lines: 100,
    dimensionsPerLine: 3,
    warmup: 10,
    samples: 100,
    p50Ms: samples[49],
    p95Ms: samples[94],
    budgetMs: 10,
  };
}

mkdirSync("artifacts/ci", { recursive: true });
const directory = mkdtempSync(join("artifacts", "ci", "micro-run-"));
try {
  const database = new Database(join(directory, "bench.sqlite"), { timeout: 5000 });
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = NORMAL");
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE bench_rows (id INTEGER PRIMARY KEY, account INTEGER, amount_minor INTEGER);
      CREATE INDEX bench_account ON bench_rows(account, id);
    `);
    const insert = database.prepare<[number, number, number]>(
      "INSERT INTO bench_rows VALUES (?, ?, ?)",
    );
    const insertStart = performance.now();
    database.transaction(() => {
      for (let id = 0; id < 10_000; id++) insert.run(id, id % 100, id * 7);
    })();
    const insertMs = performance.now() - insertStart;
    const count = database
      .prepare<[], { rows: number }>("SELECT COUNT(*) AS rows FROM bench_rows")
      .get();
    if (count?.rows !== 10_000) throw new Error("Benchmark did not insert 10000 rows");
    const query = database.prepare<[number], { id: number; amount_minor: number }>(
      "SELECT id, amount_minor FROM bench_rows WHERE account = ? ORDER BY id LIMIT 100",
    );
    for (let index = 0; index < 5; index++) query.all(42);
    const durations: number[] = [];
    for (let index = 0; index < 100; index++) {
      const start = performance.now();
      const rows = query.all(42);
      durations.push(performance.now() - start);
      if (rows.length !== 100) throw new Error("Benchmark query did not return 100 rows");
    }
    durations.sort((a, b) => a - b);
    const p50 = durations[49];
    const p95 = durations[94];
    if (p50 === undefined || p95 === undefined) throw new Error("Missing benchmark samples");
    const dimensions = dimensionBenchmark();
    const journals = await journalBenchmark();
    const businessEvents = await businessEventBenchmark();
    const reports = await reportsBenchmark();
    const report = {
      kind: "sqlite-ledger-capacity",
      node: process.version,
      rows: count.rows,
      insertMs,
      query: { rows: 100, samples: durations.length, p50Ms: p50, p95Ms: p95 },
      dimensions,
      journals,
      businessEvents,
      reports,
    };
    const markdown = [
      "## SQLite micro benchmark",
      "",
      "Synthetic 10,000-row micro fixture, temporary file, WAL/NORMAL. The actual million-GL capacity results are reported separately below.",
      "",
      "| Operation | Rows | Samples | Duration / p50 (ms) | p95 (ms) |",
      "| --- | ---: | ---: | ---: | ---: |",
      `| Transaction insert | 10000 | 1 | ${insertMs.toFixed(3)} | n/a |`,
      `| Hot indexed select | 100 | 100 | ${p50.toFixed(3)} | ${p95.toFixed(3)} |`,
      "",
      "## Dimension rule benchmark",
      "",
      "Compiled in-memory rules; 100 lines × 3 dimensions per sample, defaults → derivation → conditional fixed/required/subset checks → exact integer balancing. 10 warmups; no HTTP/DB latency claimed.",
      "",
      `100 samples: p50 ${dimensions.p50Ms.toFixed(3)} ms; p95 ${dimensions.p95Ms.toFixed(3)} ms; p95 budget < ${dimensions.budgetMs} ms.`,
      "",
      "No product tests run in this job; slowest-10 test timings are in CI/Full summaries.",
      "",
      "## Journal loopback HTTP benchmark",
      "",
      `100 business lines × 3 dimensions; 10 warmups and 100 samples. Timed from fetch through response.json and the shared client contract parse; confirm includes validation, transaction and commit. Initial GL rows: ${journals.initialGlRows}. This independent posting micro fixture is not the million-GL report fixture.`,
      "",
      `Preview p95 ${journals.preview.p95Ms.toFixed(3)} ms; confirm p95 ${journals.confirm.p95Ms.toFixed(3)} ms; each budget ≤ ${journals.budgetMs} ms. Event-loop max ${journals.eventLoopMaxMs.toFixed(3)} ms.`,
      "",
      `Hot paged read (${journals.listRows} summaries; HTTP + client parse) p95 ${journals.list.p95Ms.toFixed(3)} ms; budget ≤ ${journals.readBudgetMs} ms.`,
      "",
      "## Business event loopback HTTP benchmark",
      "",
      `${businessEvents.rules} rules; ${businessEvents.warmup} warmups and ${businessEvents.samples} samples, including index compilation and client contract decoding. Initial/final GL rows: ${businessEvents.initialGlRows}/${businessEvents.finalGlRows}; not million-GL capacity acceptance.`,
      "",
      `Preview p95 ${businessEvents.preview.p95Ms.toFixed(3)} ms; confirm p95 ${businessEvents.confirm.p95Ms.toFixed(3)} ms; budget ≤ ${businessEvents.budgetMs} ms. Event-loop max ${businessEvents.eventLoopMaxMs.toFixed(3)} ms.`,
      "",
      `Hot ${businessEvents.listRows}-item event list p95 ${businessEvents.list.p95Ms.toFixed(3)} ms; budget ≤ ${businessEvents.readBudgetMs} ms. JSON artifact includes all measured raw samples and p50/p95/p99.`,
      "",
      reportsMarkdown(reports),
      "",
    ].join("\n");
    mkdirSync("artifacts/ci", { recursive: true });
    writeFileSync("artifacts/ci/bench.json", `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync("artifacts/ci/bench.md", markdown);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    }
    console.log(markdown);
    if (!reports.allPass) throw new Error("Report capacity benchmark gates failed");
    if (dimensions.p95Ms >= dimensions.budgetMs)
      throw new Error("Dimension validation exceeds 10ms p95 budget");
  } finally {
    database.close();
  }
} finally {
  rmSync(directory, { recursive: true });
}

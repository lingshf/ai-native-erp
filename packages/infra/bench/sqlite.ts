import Database from "better-sqlite3";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const directory = mkdtempSync(join(tmpdir(), "erp-ci-bench-"));
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
    const report = {
      kind: "placeholder-not-million-GL",
      node: process.version,
      rows: count.rows,
      insertMs,
      query: { rows: 100, samples: durations.length, p50Ms: p50, p95Ms: p95 },
    };
    const markdown = [
      "## SQLite placeholder benchmark",
      "",
      "Synthetic 10,000 rows, temporary file, WAL/NORMAL. Not the M0-12 million-GL-row baseline.",
      "",
      "| Operation | Rows | Samples | Duration / p50 (ms) | p95 (ms) |",
      "| --- | ---: | ---: | ---: | ---: |",
      `| Transaction insert | 10000 | 1 | ${insertMs.toFixed(3)} | n/a |`,
      `| Hot indexed select | 100 | 100 | ${p50.toFixed(3)} | ${p95.toFixed(3)} |`,
      "",
      "No product tests run in this job; slowest-10 test timings are in CI/Full summaries.",
      "",
    ].join("\n");
    mkdirSync("artifacts/ci", { recursive: true });
    writeFileSync("artifacts/ci/bench.json", `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync("artifacts/ci/bench.md", markdown);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    }
    console.log(markdown);
  } finally {
    database.close();
  }
} finally {
  rmSync(directory, { recursive: true });
}

import { fork, execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import {
  reportSchema,
  ledgerSchema,
  ledgerCursorSchema,
  closePreviewSchema,
  accountsPageSchema,
  healthSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { generateLedgerFixture } from "./generate-ledger.ts";
import type { SchedulerEvent, ServerWindow, TraceEvent } from "./report-child.ts";

const OLD_MAIN = "5b23d8c3ffbfbd61ce57dabc747920ac454432aa";
const WARMUP = 5;
const SAMPLES = 50;
const SCOPE = "company=DEFAULT&month=2026-12";
const ORIGINAL = ["trial", "income", "balance-sheet", "ledger", "close-preview"] as const;
const CPU_COUNT = availableParallelism();
const DEFAULT_READERS = Math.max(2, Math.min(3, CPU_COUNT - 1));
type Fixture = Awaited<ReturnType<typeof generateLedgerFixture>>;
type Mode = "baseline" | "candidate";
interface Metric {
  rawMs: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  budgetMs: number;
  pass: boolean;
}
interface Window extends ServerWindow {
  pass: boolean;
}
interface QueueRound {
  heavyPath: string;
  saturation: SchedulerEvent & { sequence: number };
  accountsMs: number;
  healthMs: number;
  pass: boolean;
  trace: TraceEvent[];
  readerWorkerIds: number[];
}
interface PoolResult {
  readers: number;
  concurrent: Record<string, Metric & { serialP95Ms: number; deltaP95Ms: number }>;
  light: Metric;
  health: Omit<Metric, "budgetMs" | "pass">;
  rounds: QueueRound[];
  reservationPass: boolean;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing capacity benchmark evidence");
  return value;
}
function distribution(rawMs: number[]): Omit<Metric, "budgetMs" | "pass"> {
  if (!rawMs.length || rawMs.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Missing or invalid benchmark samples");
  const sorted = [...rawMs].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    required(sorted[Math.ceil(sorted.length * fraction) - 1]);
  return {
    rawMs,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: percentile(1),
  };
}
export function summarize(rawMs: number[], budgetMs: number): Metric {
  const result = distribution(rawMs);
  return { ...result, budgetMs, pass: result.p95Ms <= budgetMs };
}

export class ProductionChild {
  readonly child: ChildProcess;
  readonly base: string;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private output = "";
  private exited = false;
  private constructor(port: number, filename: string, root: string, mode: Mode, readers: number) {
    this.base = `http://127.0.0.1:${port}`;
    this.child = fork(fileURLToPath(new URL("./report-child.ts", import.meta.url)), [], {
      cwd: root,
      env: {
        ...process.env,
        ERP_BENCH_CHILD: "1",
        ERP_BENCH_MODE: mode,
        ERP_BENCH_MAIN: join(root, "packages", "infra", "src", "main.ts"),
        ERP_BENCH: "1",
        ERP_PROFILE: "local",
        ERP_HOST: "127.0.0.1",
        ERP_PORT: String(port),
        ERP_SQLITE_FILE: filename,
        ERP_SQLITE_READERS: String(readers),
        AI_MODEL: "",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      execArgv: [],
    });
    for (const stream of [this.child.stdout, this.child.stderr])
      stream?.on("data", (chunk: Buffer) => {
        this.output = (this.output + chunk.toString()).slice(-8000);
      });
    this.child.on("message", (message: { requestId?: number; result?: unknown }) => {
      if (message.requestId === undefined) return;
      const request = this.pending.get(message.requestId);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(message.requestId);
      request.resolve(message.result);
    });
    this.child.on("exit", () => {
      this.exited = true;
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(`Production child exited: ${this.output}`));
      }
      this.pending.clear();
    });
  }
  static async start(filename: string, root: string, mode: Mode, readers: number) {
    const reservation = createServer();
    await new Promise<void>((done, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", done);
    });
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("No loopback port");
    const port = address.port;
    await new Promise<void>((done) => reservation.close(() => done()));
    const server = new ProductionChild(port, filename, root, mode, readers);
    try {
      const deadline = performance.now() + 60_000;
      while (performance.now() < deadline) {
        if (server.exited) throw new Error(`Production startup failed: ${server.output}`);
        try {
          const response = await fetch(`${server.base}/api/v1/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (response.ok && healthSchema.safeParse(await response.json()).success) return server;
        } catch {
          // Startup can include schema verification and worker initialization.
        }
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error(`Production startup timed out: ${server.output}`);
    } catch (error) {
      await server.close();
      throw error;
    }
  }
  control<T>(action: string): Promise<T> {
    const requestId = ++this.nextId;
    return new Promise<T>((done, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Production Bench IPC timed out: ${action}; ${this.output}`));
      }, 30_000);
      this.pending.set(requestId, {
        resolve: (value) => done(value as T),
        reject,
        timer,
      });
      this.child.send({ action, requestId }, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }
  async read<T>(path: string, schema: ContractSchema<T>, body?: unknown) {
    const start = performance.now();
    const response = await fetch(`${this.base}/api/v1/${path}`, {
      signal: AbortSignal.timeout(30_000),
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (!response.ok) throw new Error(`Capacity ${path}: HTTP ${response.status}`);
    const result = schema.safeParse(await response.json());
    if (!result.success) throw new Error(`Invalid capacity client contract: ${path}`);
    return { data: result.data, ms: performance.now() - start };
  }
  async close() {
    if (this.exited) return;
    const exit = new Promise<void>((done) => this.child.once("exit", () => done()));
    this.child.kill("SIGTERM");
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 10_000);
    await exit;
    clearTimeout(timer);
  }
}

async function prepareQueries(filename: string, root: string) {
  const { REPORT_BALANCES_SQL, LEDGER_ROWS_SQL } = await import(
    pathToFileURL(join(root, "packages", "infra", "src", "storage", "reports.ts")).href
  );
  const db = new Database(filename, { readonly: true });
  try {
    const snapshot = db
      .prepare(
        `SELECT (SELECT max(sequence) FROM journal_entries) AS watermark,
        (SELECT sum(revision) FROM accounts WHERE company_id='DEFAULT') AS accountRevision`,
      )
      .get() as { watermark: number; accountRevision: number };
    const pages: Record<string, string> = {
      "ledger-page-1": `ledger?${SCOPE}&account=1000&limit=500`,
    };
    for (const page of [100, 200]) {
      const row = db
        .prepare(
          `SELECT e.accounting_date AS date,e.id AS entryId,l.line_no AS lineNo
          FROM journal_entries e JOIN journal_lines l
          ON l.company_id=e.company_id AND l.entry_id=e.id
          WHERE e.company_id='DEFAULT' AND e.period='2026-12' AND l.account_code='1000'
          ORDER BY e.accounting_date,e.id,l.line_no LIMIT 1 OFFSET ?`,
        )
        .get((page - 1) * 500 - 1) as { date: string; entryId: string; lineNo: number };
      const cursor = Buffer.from(
        JSON.stringify(
          ledgerCursorSchema.parse({
            company: "DEFAULT",
            month: "2026-12",
            stage: "adjusted",
            account: "1000",
            dimension: null,
            value: null,
            ...snapshot,
            ...row,
          }),
        ),
      ).toString("base64url");
      pages[`ledger-page-${page}`] = `${pages["ledger-page-1"]}&cursor=${cursor}`;
    }
    return {
      pages,
      queryPlans: {
        trial: db
          .prepare(`EXPLAIN QUERY PLAN ${REPORT_BALANCES_SQL}`)
          .all("2026-12", "2026-12", "2026-12", "2026-01", "DEFAULT", "2026-12", "DEFAULT"),
        ledger: db
          .prepare(
            `EXPLAIN QUERY PLAN ${LEDGER_ROWS_SQL} ORDER BY e.accounting_date,e.id,l.line_no LIMIT ?`,
          )
          .all("DEFAULT", "2026-12", snapshot.watermark, "1000", 501),
      },
    };
  } finally {
    db.close();
  }
}

export function reservationVerified(round: QueueRound) {
  const before = round.trace.filter((event) => event.sequence <= round.saturation.sequence);
  const activeHeavy = new Map<number, number>();
  const queued = new Set<number>();
  for (const event of before) {
    if (event.lane !== "heavy") continue;
    if (event.event === "queued") queued.add(event.id);
    if (event.event === "start") {
      queued.delete(event.id);
      activeHeavy.set(event.id, event.workerId);
    }
    if (event.event === "finish") activeHeavy.delete(event.id);
  }
  const lightStart = round.trace.find((event) => event.event === "start" && event.lane === "light");
  const lightFinish = round.trace.find(
    (event) => event.event === "finish" && event.id === lightStart?.id,
  );
  return Boolean(
    round.saturation.runningHeavy === round.saturation.readers - 1 &&
      round.saturation.queuedHeavy >= 1 &&
      activeHeavy.size === round.saturation.readers - 1 &&
      queued.size >= 1 &&
      lightStart &&
      lightStart.sequence > round.saturation.sequence &&
      lightFinish &&
      lightFinish.workerId === lightStart.workerId &&
      round.readerWorkerIds.length === round.saturation.readers &&
      round.readerWorkerIds.includes(lightStart.workerId) &&
      ![...activeHeavy.values()].includes(lightStart.workerId) &&
      [...queued].every((id) => {
        const start = round.trace.find((event) => event.event === "start" && event.id === id);
        return start && start.sequence > lightFinish.sequence;
      }),
  );
}

export async function reportsBenchmark() {
  const startedAt = new Date().toISOString();
  const mode: Mode = process.env.ERP_BENCH_MODE === "baseline" ? "baseline" : "candidate";
  const root = resolve(process.env.ERP_BENCH_SOURCE_ROOT ?? ".");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (mode === "baseline" && revision !== OLD_MAIN)
    throw new Error(`Baseline must be OLD MAIN ${OLD_MAIN}, not ${revision}`);
  await mkdir("artifacts/ci", { recursive: true });
  const directory = await mkdtemp(resolve("artifacts/ci/report-run-"));
  const filename = join(directory, "synthetic.sqlite");
  let server: ProductionChild | undefined;
  try {
    let fixture: Fixture;
    if (process.env.ERP_BENCH_FIXTURE) {
      const source = resolve(process.env.ERP_BENCH_FIXTURE);
      fixture = JSON.parse(await readFile(`${source}.json`, "utf8")) as Fixture;
      await copyFile(source, filename);
    } else {
      fixture = await generateLedgerFixture(filename);
    }
    const { pages, queryPlans } = await prepareQueries(filename, root);
    const metrics: Record<string, Metric> = {};
    const windows: Record<string, Window> = {};
    const pools: PoolResult[] = [];
    const paths: Record<string, string> = {
      trial: `reports/trial?${SCOPE}`,
      income: `reports/income?${SCOPE}`,
      "balance-sheet": `reports/balance-sheet?${SCOPE}`,
      ledger: `ledger?${SCOPE}&account=1000&limit=100`,
      ...Object.fromEntries(
        ["trial", "income", "balance-sheet"].map((kind) => [
          `unadjusted-${kind}`,
          `reports/${kind}?${SCOPE}&stage=unadjusted`,
        ]),
      ),
      reconciliation: `reports/reconciliation?${SCOPE}`,
      "unadjusted-reconciliation": `reports/reconciliation?${SCOPE}&stage=unadjusted`,
      ...pages,
    };
    const closeCommand = {
      company: "DEFAULT",
      revision: 1,
      commandId: randomUUID(),
    };
    async function read(name: string) {
      if (!server) throw new Error("Production child not started");
      if (name === "close-preview") {
        const result = await server.read(
          "periods/2026-12/close-preview",
          closePreviewSchema,
          closeCommand,
        );
        if (
          result.data.action !== "close" ||
          !result.data.lines.length ||
          result.data.snapshot.watermark !== 1000
        )
          throw new Error("Invalid capacity close preview");
        return result.ms;
      }
      const path = paths[name];
      if (!path) throw new Error(`Unknown capacity path: ${name}`);
      if (name.startsWith("ledger")) {
        const result = await server.read(path, ledgerSchema);
        const expected = name === "ledger" ? 100 : 500;
        if (
          result.data.total !== 100_000 ||
          result.data.items.length !== expected ||
          (name === "ledger-page-200" ? result.data.nextCursor !== null : !result.data.nextCursor)
        )
          throw new Error(`Invalid capacity ledger page: ${name}`);
        return result.ms;
      }
      const result = await server.read(path, reportSchema);
      if (
        result.data.trial.rows.length !== 200 ||
        !result.data.reconciliation.allPass ||
        (name.includes("reconciliation") && result.data.reconciliation.checks.length !== 6) ||
        result.data.stage !== (name.startsWith("unadjusted") ? "unadjusted" : "adjusted")
      )
        throw new Error(`Capacity report does not reconcile: ${name}`);
      return result.ms;
    }
    async function window<T>(name: string, run: () => Promise<T>) {
      if (!server) throw new Error("Production child not started");
      const guard = await server.control<{ guarded: boolean; nativeLoads: number }>("start");
      if (mode === "candidate" && (!guard.guarded || guard.nativeLoads !== 0))
        throw new Error("HTTP main thread SQLite guard failed");
      try {
        return await run();
      } finally {
        const result = await server.control<ServerWindow>("stop");
        windows[name] = {
          ...result,
          pass: result.count > 0 && result.maxMs <= 100 && result.p99Ms <= 50,
        };
      }
    }
    server = await ProductionChild.start(filename, root, mode, DEFAULT_READERS);
    for (const name of mode === "baseline"
      ? ORIGINAL
      : [
          ...ORIGINAL,
          ...Object.keys(paths).filter(
            (key) => !ORIGINAL.includes(key as (typeof ORIGINAL)[number]),
          ),
        ]) {
      for (let index = 0; index < WARMUP; index++) await read(name);
      metrics[name] = summarize(
        await window(`serial/${name}`, async () => {
          const raw: number[] = [];
          for (let index = 0; index < SAMPLES; index++) raw.push(await read(name));
          return raw;
        }),
        name === "close-preview" ? 2000 : 1000,
      );
    }
    await server.close();
    server = undefined;
    if (mode === "candidate") {
      for (const readers of [2, 3, 4]) {
        server = await ProductionChild.start(filename, root, mode, readers);
        const concurrentPaths = ["trial", "balance-sheet", "ledger"];
        const concurrentRound = () => Promise.all(concurrentPaths.map((name) => read(name)));
        for (let index = 0; index < WARMUP; index++) await concurrentRound();
        const concurrentRaw = await window(`R${readers}/concurrent3`, async () => {
          const raw: number[][] = [];
          for (let index = 0; index < SAMPLES; index++) raw.push(await concurrentRound());
          return raw;
        });
        const concurrent = Object.fromEntries(
          concurrentPaths.map((name, offset) => {
            const metric = summarize(
              concurrentRaw.map((round) => required(round[offset])),
              1500,
            );
            return [
              name,
              {
                ...metric,
                serialP95Ms: required(metrics[name]).p95Ms,
                deltaP95Ms: metric.p95Ms - required(metrics[name]).p95Ms,
              },
            ];
          }),
        );
        async function queueRound(index: number): Promise<QueueRound> {
          if (!server) throw new Error("Production child not started");
          await server.control("round");
          const heavyPath = required(["trial", "balance-sheet", "reconciliation"][index % 3]);
          const saturated = server.control<QueueRound["saturation"]>("wait-saturated");
          const heavy = Promise.all(Array.from({ length: readers }, () => read(heavyPath)));
          // Observe failures immediately even while waiting for the explicit scheduler handshake.
          const saturation = await Promise.race([
            saturated,
            heavy.then(() => {
              throw new Error("Heavy reads completed before the required saturation signal");
            }),
          ]);
          if (saturation.readers !== readers)
            throw new Error(`Requested R=${readers}; executor reported R=${saturation.readers}`);
          const [accounts, health] = await Promise.all([
            server.read("accounts?company=DEFAULT&limit=500", accountsPageSchema),
            server.read("health", healthSchema),
          ]);
          if (accounts.data.items.length !== 200) throw new Error("Invalid accounts fixture");
          await heavy;
          const { events, guarded, nativeLoads, readerWorkerIds } = await server.control<{
            events: TraceEvent[];
            guarded: boolean;
            nativeLoads: number;
            readerWorkerIds: number[];
          }>("trace");
          if (!guarded || nativeLoads !== 0) throw new Error("Main thread SQLite guard failed");
          const round: QueueRound = {
            heavyPath,
            saturation,
            accountsMs: accounts.ms,
            healthMs: health.ms,
            pass: false,
            trace: events,
            readerWorkerIds,
          };
          round.pass = reservationVerified(round);
          return round;
        }
        for (let index = 0; index < WARMUP; index++) await queueRound(index);
        const rounds = await window(`R${readers}/light-queue`, async () => {
          const result: QueueRound[] = [];
          for (let index = 0; index < SAMPLES; index++) result.push(await queueRound(index));
          return result;
        });
        pools.push({
          readers,
          concurrent,
          light: summarize(
            rounds.map((round) => round.accountsMs),
            100,
          ),
          health: distribution(rounds.map((round) => round.healthMs)),
          rounds,
          reservationPass: rounds.every((round) => round.pass),
        });
        await server.close();
        server = undefined;
      }
    }
    const baseline = process.env.ERP_BENCH_BASELINE_JSON
      ? (JSON.parse(await readFile(resolve(process.env.ERP_BENCH_BASELINE_JSON), "utf8")) as {
          revision: string;
          fixture: Fixture;
          warmup: number;
          samples: number;
          metrics: Record<string, Metric>;
          parameters: { originalLedgerPageSize: number; fixtureSeed: string };
          runner: string | null;
          workflowRun: string | null;
          workflowAttempt: string | null;
          node: string;
          completedAt: string;
        })
      : undefined;
    const matchedBaseline = Boolean(
      baseline &&
        process.env.RUNNER_NAME &&
        process.env.GITHUB_RUN_ID &&
        baseline.revision === OLD_MAIN &&
        baseline.fixture.logicalSha256 === fixture.logicalSha256 &&
        baseline.fixture.seed === fixture.seed &&
        baseline.warmup === WARMUP &&
        baseline.samples === SAMPLES &&
        baseline.parameters.originalLedgerPageSize === 100 &&
        baseline.runner === (process.env.RUNNER_NAME ?? null) &&
        baseline.workflowRun === (process.env.GITHUB_RUN_ID ?? null) &&
        baseline.workflowAttempt === (process.env.GITHUB_RUN_ATTEMPT ?? null) &&
        baseline.node === process.version &&
        baseline.completedAt <= startedAt,
    );
    const regression = Object.fromEntries(
      ORIGINAL.map((name) => {
        const baselineP95Ms = baseline?.metrics[name]?.p95Ms ?? null;
        const candidateP95Ms = required(metrics[name]).p95Ms;
        return [
          name,
          {
            baselineP95Ms,
            candidateP95Ms,
            changePercent: baselineP95Ms ? (candidateP95Ms / baselineP95Ms - 1) * 100 : null,
            pass:
              matchedBaseline && baselineP95Ms !== null && candidateP95Ms <= baselineP95Ms * 1.1,
          },
        ];
      }),
    );
    const latePageRatio =
      mode === "candidate"
        ? required(metrics["ledger-page-200"]).p95Ms / required(metrics["ledger-page-1"]).p95Ms
        : null;
    return {
      kind: "million-GL-production-main-child-http-with-client-contract-parse",
      mode,
      revision,
      node: process.version,
      startedAt,
      completedAt: new Date().toISOString(),
      baselineRevision: OLD_MAIN,
      runner: process.env.RUNNER_NAME ?? null,
      workflowRun: process.env.GITHUB_RUN_ID ?? null,
      workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      fixture,
      warmup: WARMUP,
      samples: SAMPLES,
      budgetMs: 1000,
      parameters: {
        originalLedgerPageSize: 100,
        lateLedgerPageSize: 500,
        fixtureSeed: fixture.seed,
      },
      metrics,
      rawMs: Object.fromEntries(
        Object.entries(metrics).map(([name, metric]) => [name, metric.rawMs]),
      ),
      windows,
      eventLoopMaxMs: Math.max(...Object.values(windows).map((value) => value.maxMs)),
      eventLoopP99Ms: Math.max(...Object.values(windows).map((value) => value.p99Ms)),
      pools,
      cpuCount: CPU_COUNT,
      defaultReaders: DEFAULT_READERS,
      matchedBaseline,
      regression,
      latePages: {
        pages: [1, 100, 200],
        pageSize: 500,
        rows: 100_000,
        p95Ratio: latePageRatio,
        pass: latePageRatio !== null && latePageRatio <= 3,
      },
      queryPlans,
      mainThreadGuard:
        mode === "candidate"
          ? "Module._load rejects better-sqlite3 and better_sqlite3.node in server main isolate; workers are separate isolates"
          : "not applicable: unchanged OLD MAIN loads SQLite",
      allPass:
        Object.values(metrics).every((metric) => metric.pass) &&
        Object.values(windows).every((metric) => metric.pass) &&
        (mode === "baseline" ||
          (Object.values(regression).every((metric) => metric.pass) &&
            latePageRatio !== null &&
            latePageRatio <= 3 &&
            pools.every(
              (pool) =>
                pool.reservationPass &&
                pool.light.pass &&
                Object.values(pool.concurrent).every((metric) => metric.pass),
            ))),
      note: "Actual production main.ts is imported in a separate process. Fixture generation, cursor-key preparation and EXPLAIN complete before server startup. Each scenario has five warmup rounds before a server-only 10ms monitorEventLoopDelay window; client fetch, queue wait, JSON and contract parsing are included in HTTP timings, not in server sampler CPU. Accounts, not health, proves the reserved SQLite slot. All raw rounds and scheduler order evidence are retained. Thresholds are never relaxed on misses.",
    };
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export function reportsMarkdown(reports: Awaited<ReturnType<typeof reportsBenchmark>>) {
  const status = (pass: boolean) => (pass ? "PASS" : "MISS");
  const common = [
    "## Million-GL production capacity",
    "",
    `${reports.mode}: \`${reports.revision}\`; runner \`${reports.runner}\`; workflow run \`${reports.workflowRun}\`.`,
    `CPU parallelism ${reports.cpuCount}; production default R=${reports.defaultReaders} (max(2,min(3,CPU-1))). Serial samples use that default; the comparison below also measures R=2/3/4 explicitly.`,
    `Fixture ${reports.fixture.seed}: ${reports.fixture.lines} GL rows; 100000 cash rows in 2026-12; digest \`${reports.fixture.logicalSha256}\`. Five warmups + 50 samples/rounds per scenario. All HTTP timings include queue wait, response JSON and shared client contract parsing. Original ledger limit=100; late pages 1/100/200 limit=500.`,
    "",
    "| Serial path | p50 ms | p95 ms | p99 ms | Budget ms | Result |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...Object.entries(reports.metrics).map(
      ([name, metric]) =>
        `| ${name} | ${metric.p50Ms.toFixed(3)} | ${metric.p95Ms.toFixed(3)} | ${metric.p99Ms.toFixed(3)} | ${metric.budgetMs} | ${status(metric.pass)} |`,
    ),
    "",
    "| Server-only load window (10ms resolution) | max ms ≤100 | p99 ms ≤50 | Samples | Result |",
    "| --- | ---: | ---: | ---: | --- |",
    ...Object.entries(reports.windows).map(
      ([name, window]) =>
        `| ${name} | ${window.maxMs.toFixed(3)} | ${window.p99Ms.toFixed(3)} | ${window.count} | ${status(window.pass)} |`,
    ),
    "",
  ];
  if (reports.mode === "baseline") {
    return [
      ...common,
      `OLD MAIN original-five baseline: **${status(reports.allPass)}** against the unchanged latency and main-loop budgets. This is measurement, not candidate acceptance; new scenarios and regression comparison are not applicable until the candidate run.`,
      "",
    ].join("\n");
  }
  return [
    ...common,
    "### Read-worker count comparison",
    "",
    "| R | Concurrent path | p50 ms | p95 ms ≤1500 | p99 ms | Serial p95 ms | Delta p95 ms | Result |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...reports.pools.flatMap((pool) =>
      Object.entries(pool.concurrent).map(
        ([name, metric]) =>
          `| ${pool.readers} | ${name} | ${metric.p50Ms.toFixed(3)} | ${metric.p95Ms.toFixed(3)} | ${metric.p99Ms.toFixed(3)} | ${metric.serialP95Ms.toFixed(3)} | ${metric.deltaP95Ms.toFixed(3)} | ${status(metric.pass)} |`,
      ),
    ),
    "",
    "| R | Saturated accounts p50 ms | p95 ms ≤100 | p99 ms | Reservation order 50/50 | Accounts result | Health p95 ms (supplement only) |",
    "| ---: | ---: | ---: | ---: | --- | --- | ---: |",
    ...reports.pools.map(
      (pool) =>
        `| ${pool.readers} | ${pool.light.p50Ms.toFixed(3)} | ${pool.light.p95Ms.toFixed(3)} | ${pool.light.p99Ms.toFixed(3)} | ${status(pool.reservationPass)} (${pool.rounds.filter((round) => round.pass).length}/50) | ${status(pool.light.pass && pool.reservationPass)} | ${pool.health.p95Ms.toFixed(3)} |`,
    ),
    "",
    `Late-page p95 / first-page p95 ≤3: ${reports.latePages.p95Ratio?.toFixed(3) ?? "not measured in baseline"} — ${status(reports.latePages.pass)}.`,
    "",
    "### Matched OLD MAIN regression (≤10%)",
    "",
    `Baseline must be \`${OLD_MAIN}\`, earlier in this same workflow on the same runner, using the same fixture digest, page size, warmups and sample count. Matched: **${status(reports.matchedBaseline)}**.`,
    "",
    "| Original path | Baseline p95 ms | Candidate p95 ms | Change % | Result |",
    "| --- | ---: | ---: | ---: | --- |",
    ...Object.entries(reports.regression).map(
      ([name, metric]) =>
        `| ${name} | ${metric.baselineP95Ms?.toFixed(3) ?? "missing"} | ${metric.candidateP95Ms.toFixed(3)} | ${metric.changePercent?.toFixed(2) ?? "missing"} | ${status(metric.pass)} |`,
    ),
    "",
    `Main-thread guard: ${reports.mainThreadGuard}.`,
    "",
    `Overall: **${status(reports.allPass)}**. Every budget miss remains visible and requires design review; no smaller fixture or relaxed threshold substitutes for acceptance. JSON contains raw samples, every queue-round scheduler trace and EXPLAIN plans. Baseline does not validate new saturation budgets.`,
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "prepare") {
    const filename = resolve(process.env.ERP_BENCH_FIXTURE ?? "artifacts/ci/million.sqlite");
    await mkdir(dirname(filename), { recursive: true });
    const fixture = await generateLedgerFixture(filename);
    await writeFile(`${filename}.json`, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`Prepared ${fixture.lines} lines: ${fixture.logicalSha256}`);
  } else {
    const reports = await reportsBenchmark();
    const output = resolve(process.env.ERP_BENCH_OUTPUT ?? "artifacts/ci/baseline");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(`${output}.json`, `${JSON.stringify(reports, null, 2)}\n`);
    await writeFile(`${output}.md`, reportsMarkdown(reports));
    console.log(reportsMarkdown(reports));
  }
}

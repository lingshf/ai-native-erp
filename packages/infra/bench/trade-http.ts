import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { Agent, request } from "node:http";
import { createServer } from "node:net";
import { availableParallelism, cpus, freemem, hostname, loadavg, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  openItemPageSchema,
  tradeInvoicePreviewSchema,
  tradeInvoiceReceiptSchema,
  tradeReportSchema,
} from "@erp/core/contracts";
import type { TradeInvoiceCommand, TradeOrderCommand } from "@erp/core/domain";
import {
  assertTradeFixture,
  generateTradeFixture,
  partyCode,
  siteCode,
  tradeLoad,
} from "./trade-fixture.ts";

const warmups = 4;
const samples = 24;
const repeats = 3;
const output = resolve("artifacts", "ci", "trade");
const root = fileURLToPath(new URL("../../..", import.meta.url));

export function summarizeTradeSamples(rawMs: readonly number[], budgetMs: number) {
  assert.ok(rawMs.length >= samples, "At least 24 samples are required");
  assert.ok(rawMs.every((value) => Number.isFinite(value) && value >= 0));
  assert.ok(Number.isFinite(budgetMs) && budgetMs > 0);
  const sorted = [...rawMs].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1];
  const p95Ms = percentile(0.95);
  return {
    rawMs: [...rawMs],
    samples: rawMs.length,
    warmups,
    p50Ms: percentile(0.5),
    p95Ms,
    p99Ms: percentile(0.99),
    budgetMs,
    pass: p95Ms <= budgetMs,
    d18: p95Ms > budgetMs * 0.8,
  };
}

function machine() {
  return {
    hostname: hostname(),
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    release: release(),
    arch: process.arch,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    parallelism: availableParallelism(),
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    loadAverage: loadavg(),
    loadAverageSupported: process.platform !== "win32",
  };
}

async function unusedPort() {
  const socket = createServer();
  await new Promise<void>((done, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", done);
  });
  const address = socket.address();
  assert.ok(address && typeof address !== "string" && address.port !== 4173);
  const port = address.port;
  await new Promise<void>((done, reject) =>
    socket.close((error) => (error ? reject(error) : done())),
  );
  return port;
}

async function stopChild(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill("SIGTERM");
  const deadline = sleep(10_000, "timeout", { ref: false });
  if ((await Promise.race([exited, deadline])) === "timeout") {
    child.kill("SIGKILL");
    await exited;
  }
}

async function startProduction(filename: string) {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "packages", "infra", "src", "main.ts")], {
    cwd: root,
    env: {
      ...process.env,
      ERP_PROFILE: "local",
      ERP_HOST: "127.0.0.1",
      ERP_PORT: String(port),
      ERP_SQLITE_FILE: filename,
      // Pin the production default explicitly across all three repetitions.
      ERP_SQLITE_READERS: String(Math.max(2, Math.min(3, availableParallelism() - 1))),
      AI_MODEL: "",
      AI_PROVIDER: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.stdout?.on("data", (chunk) => {
    log = `${log}${String(chunk)}`.slice(-16_384);
  });
  child.stderr?.on("data", (chunk) => {
    log = `${log}${String(chunk)}`.slice(-16_384);
  });
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  async function http(path: string, body?: unknown) {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const started = performance.now();
    const data = await new Promise<string>((done, reject) => {
      const req = request(
        `${origin}${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          agent,
          headers: {
            origin,
            ...(text === undefined
              ? {}
              : {
                  "content-type": "application/json",
                  "content-length": Buffer.byteLength(text),
                }),
          },
        },
        (response) => {
          let value = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            value += chunk;
          });
          response.once("error", reject);
          response.once("end", () => {
            if (
              response.statusCode !== (body === undefined ? 200 : 201) &&
              !(path.endsWith("/preview") && response.statusCode === 200)
            ) {
              reject(new Error(`HTTP ${response.statusCode} ${path}: ${value}`));
            } else done(value);
          });
        },
      );
      req.setTimeout(60_000, () => req.destroy(new Error(`HTTP timeout: ${path}`)));
      req.once("error", reject);
      req.end(text);
    });
    const value: unknown = JSON.parse(data);
    return { value, ms: performance.now() - started, bytes: Buffer.byteLength(data) };
  }
  try {
    const deadline = performance.now() + 60_000;
    while (true) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Production main.ts exited before readiness: ${log}`);
      try {
        await http("/api/v1/health");
        break;
      } catch {
        if (performance.now() > deadline) throw new Error(`Production startup timeout: ${log}`);
        await sleep(100);
      }
    }
    return {
      http,
      port,
      pid: child.pid,
      close: async () => {
        agent.destroy();
        await stopChild(child);
      },
    };
  } catch (error) {
    agent.destroy();
    await stopChild(child);
    throw error;
  }
}

function invoice(side: "AP" | "AR", orderId: string): TradeInvoiceCommand {
  return {
    company: "DEFAULT",
    documentId: randomUUID(),
    side,
    party: partyCode(side === "AP" ? 0 : 1),
    externalInvoice: `BENCH-${randomUUID()}`,
    currency: "CNY",
    accountingDate: "2026-06-20",
    documentDate: "2026-06-20",
    taxDate: "2026-06-20",
    orderId: side === "AP" ? orderId : null,
    priceIncludesTax: false,
    rounding: "document",
    headerDimensions: {},
    matchingException: null,
    lines: Array.from({ length: tradeLoad.invoiceLines }, (_, index) => ({
      lineId: `L${index}`,
      product: side,
      taxCode: "VAT",
      quantity: "1",
      unitPrice: "10.99",
      discountPercent: "2",
      taxableCharge: "0.03",
      orderLineId: side === "AP" ? `L${index}` : null,
      dimensions: { DEPT: index % 2 ? "A" : "B", COST: "A", SITE: siteCode(index) },
    })),
  };
}

async function runOnce(filename: string, run: number) {
  const before = machine();
  const initialShape = assertTradeFixture(filename);
  const server = await startProduction(filename);
  const scenarios: Array<
    ReturnType<typeof summarizeTradeSamples> & {
      name: string;
      path: string;
      responseBytes: number[];
    }
  > = [];
  let postedGlLines = 0;
  try {
    const orderId = `BENCH-PO-${run}`;
    const example = invoice("AP", orderId);
    const order: TradeOrderCommand = {
      company: "DEFAULT",
      orderId,
      side: "AP",
      party: example.party,
      currency: "CNY",
      orderDate: "2026-01-01",
      priceIncludesTax: false,
      rounding: "document",
      lines: example.lines.map(
        ({ lineId, product, taxCode, unitPrice, discountPercent, taxableCharge }) => ({
          lineId,
          product,
          taxCode: taxCode ?? "VAT",
          quantity: "100000",
          unitPrice,
          discountPercent,
          taxableCharge,
        }),
      ),
    };
    await server.http("/api/v1/trade/orders", order);
    const reads = [
      {
        name: "open-items-first-100",
        path: "/api/v1/trade/open-items?company=DEFAULT&limit=100&status=open",
      },
      {
        name: "aging-current-100",
        path: "/api/v1/trade/reports/open-items?company=DEFAULT&limit=100",
      },
      {
        name: "historical-balances-2026-06",
        path: "/api/v1/trade/reports/open-items?company=DEFAULT&month=2026-06&limit=100",
      },
    ];
    for (const scenario of reads) {
      const raw: number[] = [],
        responseBytes: number[] = [];
      for (let index = 0; index < warmups + samples; index++) {
        const result = await server.http(scenario.path);
        if (scenario.name === "open-items-first-100") {
          const page = openItemPageSchema.parse(result.value);
          assert.equal(page.items.length, 100);
          assert.ok(page.nextCursor);
        } else {
          const report = tradeReportSchema.parse(result.value);
          assert.equal(report.items.length, 100);
          assert.equal(report.basis, scenario.name.startsWith("aging") ? "current" : "monthEnd");
          assert.equal(
            report.totals.invoiceGrossMinor,
            scenario.name.startsWith("aging")
              ? tradeLoad.openItems * 11_300
              : initialShape.historicalGross,
          );
          const aged = report.totals;
          assert.equal(
            aged.notDue +
              aged.overdue1_30 +
              aged.overdue31_60 +
              aged.overdue61_90 +
              aged.overdue91Plus,
            aged.invoiceGrossMinor,
          );
        }
        if (index >= warmups) {
          raw.push(result.ms);
          responseBytes.push(result.bytes);
        }
      }
      scenarios.push({ ...scenario, ...summarizeTradeSamples(raw, 1_000), responseBytes });
      console.info(
        JSON.stringify({ run, name: scenario.name, ...summarizeTradeSamples(raw, 1_000) }),
      );
    }
    for (const side of ["AP", "AR"] as const) {
      for (const operation of ["preview", "confirm"] as const) {
        const raw: number[] = [],
          responseBytes: number[] = [];
        const path = `/api/v1/trade/invoices${operation === "preview" ? "/preview" : ""}`;
        for (let index = 0; index < warmups + samples; index++) {
          const command = invoice(side, orderId);
          const previewResult = await server.http("/api/v1/trade/invoices/preview", command);
          const preview = tradeInvoicePreviewSchema.parse(previewResult.value);
          assert.equal(preview.calculation.lines.length, 100);
          assert.equal(preview.poMatch, side === "AP" ? "matched" : "notApplicable");
          assert.equal(preview.matches.length, side === "AP" ? 100 : 0);
          const journalLines = preview.journal.journals.flatMap((journal) => journal.lines).length;
          assert.ok(journalLines >= 200, "100 distinct dimension segments");
          const result =
            operation === "preview"
              ? previewResult
              : await server.http(path, {
                  command,
                  fingerprint: preview.fingerprint,
                  idempotencyKey: randomUUID(),
                  confirmation: "POST",
                });
          if (operation === "confirm") {
            const receipt = tradeInvoiceReceiptSchema.parse(result.value);
            assert.equal(receipt.documentId, command.documentId);
            assert.equal(receipt.gross, preview.calculation.gross);
            assert.equal(receipt.journalIds.length, 1);
            postedGlLines += journalLines;
          }
          if (index >= warmups) {
            raw.push(result.ms);
            responseBytes.push(result.bytes);
          }
        }
        scenarios.push({
          name: `${side.toLowerCase()}-invoice-${operation}-100`,
          path,
          ...summarizeTradeSamples(raw, 2_000),
          responseBytes,
        });
        console.info(
          JSON.stringify({
            run,
            name: scenarios.at(-1)?.name,
            ...summarizeTradeSamples(raw, 2_000),
          }),
        );
      }
    }
  } finally {
    await server.close();
  }
  const finalShape = assertTradeFixture(filename, 2 * (warmups + samples), postedGlLines);
  return {
    run,
    startedEnvironment: before,
    endedEnvironment: machine(),
    transport: {
      entrypoint: "packages/infra/src/main.ts",
      protocol: "HTTP/1.1 loopback, keep-alive",
      host: "127.0.0.1",
      port: server.port,
      pid: server.pid,
      readWorkers: Math.max(2, Math.min(3, availableParallelism() - 1)),
      writerWorkers: 1,
      concurrency: 1,
      elapsedIncludes:
        "loopback request, production worker dispatch, SQL, response serialization/transfer and client JSON parsing",
      confirmationExcludes:
        "The separately requested prerequisite preview; confirmation still recomputes/validates and commits through production code.",
    },
    initialShape,
    finalShape,
    scenarios,
    pass: scenarios.every((scenario) => scenario.pass),
    d18: scenarios.filter((scenario) => scenario.d18).map((scenario) => scenario.name),
  };
}

export async function runTradeBenchmark() {
  await mkdir(dirname(output), { recursive: true });
  // Repo-local, uniquely owned new fixtures only. No path/env override can target a user ledger.
  const directory = await mkdtemp(join(dirname(output), "trade-fixtures-"));
  const template = join(directory, "synthetic.sqlite");
  const runs: Awaited<ReturnType<typeof runOnce>>[] = [];
  const startedAt = new Date().toISOString();
  let fixture: Awaited<ReturnType<typeof generateTradeFixture>> | undefined;
  try {
    fixture = await generateTradeFixture(template);
    console.info("M1-07: verified exact fixture shape; starting three production HTTP repetitions");
    await writeFile(
      `${output}-fixture.json`,
      JSON.stringify(
        {
          ...fixture,
          bytes: (await stat(template)).size,
        },
        null,
        2,
      ),
    );
    for (let run = 1; run <= repeats; run++) {
      const filename = join(directory, `run-${run}.sqlite`);
      await copyFile(template, filename);
      const result = await runOnce(filename, run);
      runs.push(result);
      await writeFile(`${output}-run-${run}.json`, JSON.stringify(result, null, 2));
      await rm(filename);
    }
  } finally {
    await writeFile(
      `${output}.json`,
      JSON.stringify(
        {
          benchmark: "M1-07 production HTTP trade",
          startedAt,
          endedAt: new Date().toISOString(),
          environment: machine(),
          load: tradeLoad,
          repeats,
          warmups,
          samples,
          fixture,
          runs,
          pass: runs.length === repeats && runs.every((run) => run.pass),
          d18: runs.flatMap((run) => run.d18.map((name) => ({ run: run.run, name }))),
          scope:
            "Hot serial reads before measured writes; reports include all-party aggregation, not only page SQL. AP PO-matched/AR invoices each have 100 VAT lines and 100 distinct dimension segments. Fresh copy of identical synthetic fixture and a new production child per repeat.",
        },
        null,
        2,
      ),
    );
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  if (runs.some((run) => !run.pass)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await runTradeBenchmark();

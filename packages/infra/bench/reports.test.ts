import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { accountsPageSchema, healthSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../src/storage/index.ts";
import {
  ProductionChild,
  reservationVerified,
  summarize,
  serialMetric,
  compareRegression,
  evaluateBudgets,
  matchBaseline,
  requestedBaseline,
} from "./reports.ts";
import type { ServerWindow, TraceEvent } from "./report-child.ts";

function event(
  sequence: number,
  kind: TraceEvent["event"],
  id: number,
  lane: TraceEvent["lane"],
  workerId: number,
): TraceEvent {
  return {
    sequence,
    event: kind,
    id,
    lane,
    workerId,
    readers: 2,
    runningHeavy: 1,
    queuedHeavy: 1,
  };
}
describe("production capacity evidence", () => {
  const revision = "a".repeat(40);
  const identity = {
    revision,
    fixture: { logicalSha256: "fixture-digest", seed: "seed" },
    warmup: 5,
    samples: 50,
    parameters: { originalLedgerPageSize: 100 },
    runner: "same-runner",
    workflowRun: "123",
    workflowAttempt: "1",
    node: process.version,
    startedAt: "2026-11-18T00:01:00Z",
    completedAt: "2026-11-18T00:02:00Z",
  };
  const baselineIdentity = { ...identity, completedAt: "2026-11-18T00:00:00Z" };
  function candidateEvidence() {
    const metric = serialMetric("trial", Array(50).fill(100));
    const metrics = Object.fromEntries(
      [
        "trial",
        "income",
        "balance-sheet",
        "ledger",
        "close-preview",
        "unadjusted-trial",
        "unadjusted-income",
        "unadjusted-balance-sheet",
        "reconciliation",
        "unadjusted-reconciliation",
        "ledger-page-1",
        "ledger-page-100",
        "ledger-page-200",
      ].map((name) => [name, metric]),
    );
    const windows = {
      serial: { maxMs: 20, p99Ms: 15, count: 100, resolutionMs: 10, pass: true },
    };
    const pools = [
      {
        readers: 2,
        concurrent: Object.fromEntries(
          ["trial", "balance-sheet", "ledger"].map((name) => [
            name,
            { ...metric, serialP95Ms: 100, deltaP95Ms: 0 },
          ]),
        ),
        light: summarize(Array(50).fill(5), 100),
        health: metric,
        rounds: [],
        reservationPass: true,
      },
    ];
    return { metrics, windows, pools };
  }
  it("marks absent baseline N/A while retaining every candidate gate", () => {
    const { metrics, windows, pools } = candidateEvidence();
    const evaluate = () => evaluateBudgets(metrics, windows, pools, 1, "candidate", null);
    expect(matchBaseline(identity, undefined, null)).toBeNull();
    expect(evaluate().allPass).toBe(true);
    expect(Object.values(evaluate().regression).every((metric) => metric.pass === null)).toBe(true);
    for (const [name, original] of Object.entries(metrics)) {
      metrics[name] = serialMetric(name, Array(50).fill(2001));
      expect(evaluate().allPass, name).toBe(false);
      metrics[name] = original;
    }
    windows.serial.pass = false;
    expect(evaluate().allPass).toBe(false);
    windows.serial.pass = true;
    const [pool] = pools;
    if (!pool) throw new Error("Missing test pool");
    pool.reservationPass = false;
    expect(evaluate().allPass).toBe(false);
    pool.reservationPass = true;
    pool.light.pass = false;
    expect(evaluate().allPass).toBe(false);
    pool.light.pass = true;
    for (const metric of Object.values(pool.concurrent)) {
      metric.pass = false;
      expect(evaluate().allPass).toBe(false);
      metric.pass = true;
    }
    expect(evaluateBudgets(metrics, windows, pools, 3.01, "candidate", null).allPass).toBe(false);
    expect(evaluateBudgets(metrics, windows, [], 1, "candidate", null).allPass).toBe(false);
  });
  it("fails requested but missing, mismatched or unpaired baselines; accepts any matching SHA", () => {
    expect(requestedBaseline("")).toBeNull();
    expect(requestedBaseline(revision.toUpperCase())).toBe(revision);
    expect(() => requestedBaseline("main")).toThrow("full 40-character");
    const { metrics, windows, pools } = candidateEvidence();
    for (const baseline of [
      undefined,
      { ...baselineIdentity, revision: "b".repeat(40) },
      { ...baselineIdentity, workflowRun: "other-run" },
      { ...baselineIdentity, completedAt: identity.completedAt },
    ]) {
      const matched = matchBaseline(identity, baseline, revision);
      expect(matched).toBe(false);
      expect(
        evaluateBudgets(metrics, windows, pools, 1, "candidate", matched, metrics).allPass,
      ).toBe(false);
    }
    expect(matchBaseline(identity, baselineIdentity, null)).toBe(false);
    const matched = matchBaseline(identity, baselineIdentity, revision);
    expect(matched).toBe(true);
    const baselineMetrics = { ...metrics };
    metrics.trial = serialMetric("trial", [...Array(45).fill(110), ...Array(5).fill(999)]);
    expect(
      evaluateBudgets(metrics, windows, pools, 1, "candidate", matched, baselineMetrics).allPass,
    ).toBe(true);
    metrics.trial = serialMetric("trial", Array(50).fill(111));
    expect(
      evaluateBudgets(metrics, windows, pools, 1, "candidate", matched, baselineMetrics).allPass,
    ).toBe(false);
  });
  it("keeps raw order and uses nearest-rank p95/p99 without relaxing the threshold", () => {
    const raw = Array.from({ length: 50 }, (_, index) => 50 - index);
    const result = summarize(raw, 47);
    expect(result).toMatchObject({ p50Ms: 25, p95Ms: 48, p99Ms: 50, maxMs: 50, pass: false });
    expect(result.rawMs).toEqual(raw);
    expect(raw[0]).toBe(50);
    expect(() => summarize([], 100)).toThrow();
    expect(() => summarize([Number.NaN], 100)).toThrow();
    const baseline = serialMetric("trial", Array(50).fill(100));
    const candidate = serialMetric("trial", [...Array(45).fill(100), ...Array(4).fill(150), 190]);
    expect(compareRegression(candidate, baseline, true)).toMatchObject({
      relativeStatistic: "p50",
      p50ChangePercent: 0,
      p95DeltaMs: 50,
      p99DeltaMs: 90,
      pass: true,
    });
    expect(compareRegression(serialMetric("trial", Array(50).fill(111)), baseline, true).pass).toBe(
      false,
    );
    expect(compareRegression(candidate, baseline, false).pass).toBe(false);
    const tailMiss = [...Array(49).fill(100), 1001];
    expect(serialMetric("trial", tailMiss).pass).toBe(false);
    expect(serialMetric("close-preview", [...Array(49).fill(100), 2001]).pass).toBe(false);
    expect(serialMetric("unadjusted-trial", tailMiss).pass).toBe(true);
  });
  it("requires light completion on the reserved worker before an already queued heavy starts", () => {
    const trace = [
      event(1, "queued", 10, "heavy", -1),
      event(2, "start", 10, "heavy", 1),
      event(3, "queued", 11, "heavy", -1),
      event(4, "queued", 12, "light", -1),
      event(5, "start", 12, "light", 2),
      event(6, "finish", 12, "light", 2),
      event(7, "finish", 10, "heavy", 1),
      event(8, "start", 11, "heavy", 1),
      event(9, "finish", 11, "heavy", 1),
    ];
    const round = {
      heavyPath: "trial",
      saturation: trace[2] as TraceEvent,
      accountsMs: 2,
      healthMs: 1,
      pass: false,
      trace,
      readerWorkerIds: [1, 2],
    };
    expect(reservationVerified(round)).toBe(true);
    expect(
      reservationVerified({
        ...round,
        trace: trace.map((item) =>
          item.id === 11 && item.event === "start" ? { ...item, sequence: 5.5 } : item,
        ),
      }),
    ).toBe(false);
    expect(
      reservationVerified({
        ...round,
        trace: trace.map((item) => (item.lane === "light" ? { ...item, workerId: 1 } : item)),
      }),
    ).toBe(false);
    expect(
      reservationVerified({
        ...round,
        trace: trace.map((item) => (item.lane === "light" ? { ...item, workerId: 0 } : item)),
      }),
    ).toBe(false);
    expect(
      reservationVerified({
        ...round,
        trace: trace.filter((item) => !(item.lane === "light" && item.event === "finish")),
      }),
    ).toBe(false);
  });
  it("boots the actual production main in another process and samples only an IPC load window", async () => {
    await mkdir("artifacts/ci", { recursive: true });
    const directory = await mkdtemp(resolve("artifacts/ci/bench-probe-"));
    let child: ProductionChild | undefined;
    try {
      const filename = join(directory, "small.sqlite");
      const storage = createSqliteStorage({ filename });
      try {
        await storage.migrate();
      } finally {
        await storage.close();
      }
      child = await ProductionChild.start(filename, resolve("."), "candidate", 2);
      const health = await child.read("health", healthSchema);
      expect(health.data.data).toBe("configured");
      expect(await child.control("start")).toEqual({ guarded: true, nativeLoads: 0 });
      const accounts = await child.read("accounts?company=DEFAULT&limit=500", accountsPageSchema);
      expect(accounts.data.items.length).toBeGreaterThan(0);
      await new Promise((done) => setTimeout(done, 25));
      const window = await child.control<ServerWindow>("stop");
      expect(window.resolutionMs).toBe(10);
      expect(window.count).toBeGreaterThan(0);
      const trace = await child.control<{
        guarded: boolean;
        nativeLoads: number;
        events: TraceEvent[];
      }>("trace");
      expect(trace).toMatchObject({ guarded: true, nativeLoads: 0 });
      expect(trace.events.some((event) => event.event === "finish" && event.lane === "light")).toBe(
        true,
      );
    } finally {
      await child?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

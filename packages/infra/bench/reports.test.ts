import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { accountsPageSchema, healthSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { ProductionChild, reservationVerified, summarize } from "./reports.ts";
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
  it("keeps raw order and uses nearest-rank p95/p99 without relaxing the threshold", () => {
    const raw = Array.from({ length: 50 }, (_, index) => 50 - index);
    const result = summarize(raw, 47);
    expect(result).toMatchObject({ p50Ms: 25, p95Ms: 48, p99Ms: 50, maxMs: 50, pass: false });
    expect(result.rawMs).toEqual(raw);
    expect(raw[0]).toBe(50);
    expect(() => summarize([], 100)).toThrow();
    expect(() => summarize([Number.NaN], 100)).toThrow();
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

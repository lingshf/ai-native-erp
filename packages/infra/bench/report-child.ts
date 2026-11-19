import { channel } from "node:diagnostics_channel";
import { createRequire } from "node:module";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

export interface SchedulerEvent {
  event: "start" | "finish" | "queued" | "ready";
  id: number;
  lane: "heavy" | "light" | "write";
  workerId: number;
  readers: number;
  runningHeavy: number;
  queuedHeavy: number;
}
export interface TraceEvent extends SchedulerEvent {
  sequence: number;
}
export interface ServerWindow {
  maxMs: number;
  p99Ms: number;
  resolutionMs: number;
  count: number;
}

if (process.env.ERP_BENCH_CHILD === "1") {
  if (!process.send || !process.env.ERP_BENCH_MAIN)
    throw new Error("Bench bootstrap requires IPC and an actual production main.ts");
  const send = (message: object) => {
    if (process.connected) process.send?.(message);
  };
  const lag = monitorEventLoopDelay({ resolution: 10 });
  let sequence = 0;
  let trace: TraceEvent[] = [];
  let latest: TraceEvent | undefined;
  let waiting: number | undefined;
  let nativeLoads = 0;
  const readerWorkerIds = new Set<number>();
  const guarded = process.env.ERP_BENCH_MODE !== "baseline";
  if (guarded) {
    const require = createRequire(import.meta.url);
    const module = require("node:module") as {
      _load: (id: string, ...args: unknown[]) => unknown;
    };
    const load = module._load;
    module._load = function (id, ...args) {
      if (
        id === "better-sqlite3" ||
        /(?:^|[/\\])better-sqlite3(?:[/\\]|$)/u.test(id) ||
        /better_sqlite3\.node$/u.test(id)
      ) {
        nativeLoads++;
        throw new Error("Bench guard: SQLite loaded in HTTP main thread");
      }
      return Reflect.apply(load, this, [id, ...args]);
    };
  }
  const saturated = () =>
    latest && latest.runningHeavy === latest.readers - 1 && latest.queuedHeavy >= 1;
  const replySaturation = () => {
    if (waiting !== undefined && saturated()) {
      send({ requestId: waiting, result: { ...latest } });
      waiting = undefined;
    }
  };
  channel("erp.sqlite.scheduler").subscribe((message) => {
    const event = { ...(message as SchedulerEvent), sequence: ++sequence };
    if (event.event === "ready" && event.lane === "light") readerWorkerIds.add(event.workerId);
    latest = event;
    trace.push(event);
    replySaturation();
  });
  process.on("message", async (message: { action: string; requestId: number }) => {
    const { action, requestId } = message;
    if (action === "start") {
      lag.enable();
      await new Promise((resolve) => setTimeout(resolve, 20));
      lag.reset();
      send({ requestId, result: { guarded, nativeLoads } });
    } else if (action === "stop") {
      lag.disable();
      send({
        requestId,
        result: {
          maxMs: lag.max / 1e6,
          p99Ms: lag.percentile(99) / 1e6,
          resolutionMs: 10,
          count: lag.count,
        } satisfies ServerWindow,
      });
    } else if (action === "memory") {
      // RSS includes workers; the V8/external fields describe only this main-thread isolate.
      send({
        requestId,
        result: {
          ...process.memoryUsage(),
          peakRssMiB: process.resourceUsage().maxRSS / 1024,
        },
      });
    } else if (action === "round") {
      trace = [];
      latest = undefined;
      waiting = undefined;
      send({ requestId, result: { sequence } });
    } else if (action === "wait-saturated") {
      waiting = requestId;
      replySaturation();
    } else if (action === "trace") {
      send({
        requestId,
        result: { events: trace, guarded, nativeLoads, readerWorkerIds: [...readerWorkerIds] },
      });
    }
  });
  process.once("SIGTERM", () => process.disconnect?.());
  await import(pathToFileURL(process.env.ERP_BENCH_MAIN).href);
  send({ bootstrapped: !process.exitCode, guarded, nativeLoads });
  if (process.exitCode) process.disconnect?.();
}

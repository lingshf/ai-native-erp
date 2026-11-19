import { availableParallelism } from "node:os";
import { channel } from "node:diagnostics_channel";
import { Worker } from "node:worker_threads";
import {
  applicationLanes,
  StorageError,
  type ApplicationExecutor,
  type ApplicationServices,
  type ExecutionLane,
  type ServiceName,
  type MethodName,
  type ServiceMethod,
} from "@erp/core/application";
import {
  restoreWorkerError,
  type WorkerReply,
  type WorkRequest,
  type SchedulerEvent,
} from "./protocol.ts";

interface Job {
  readonly request: WorkRequest;
  readonly lane: ExecutionLane;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}
interface Slot {
  readonly index: number;
  readonly writer: boolean;
  worker: Worker | undefined;
  state: "starting" | "idle" | "busy" | "failed" | "closing";
  job: Job | undefined;
  ready: Promise<void>;
  acknowledgeFailure: boolean;
}
export interface ExecutorOptions {
  readonly filename: string;
  readonly readers?: number;
  /** Shared test-only SQLite gate, never accepted from HTTP or environment. */
  readonly testGate?: SharedArrayBuffer;
}
const telemetry = channel("erp.sqlite.scheduler");
export function defaultReadWorkers(): number {
  return Math.max(2, Math.min(3, availableParallelism() - 1));
}
export class SqliteExecutor implements ApplicationExecutor {
  private readonly options: ExecutorOptions;
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  readonly readers: number;
  private sequence = 0;
  private closing = false;
  private drained: (() => void) | undefined;
  private closingPromise: Promise<void> | undefined;
  private constructor(options: ExecutorOptions) {
    this.options = options;
    this.readers = options.readers ?? defaultReadWorkers();
    if (!Number.isInteger(this.readers) || this.readers < 2 || this.readers > 32)
      throw new StorageError("INVALID_INPUT");
  }
  static async create(options: ExecutorOptions): Promise<SqliteExecutor> {
    const executor = new SqliteExecutor(options);
    try {
      await executor.addSlot(true);
      await Promise.all(Array.from({ length: executor.readers }, () => executor.addSlot(false)));
      return executor;
    } catch (error) {
      await executor.close();
      throw error;
    }
  }
  private emit(event: SchedulerEvent["event"], job: Job | undefined, slot: Slot) {
    telemetry.publish({
      event,
      id: job?.request.id ?? 0,
      lane: job?.lane ?? (slot.writer ? "write" : "light"),
      workerId: slot.index,
      readers: this.readers,
      runningHeavy: this.slots.filter((item) => item.job?.lane === "heavy").length,
      queuedHeavy: this.queue.filter((item) => item.lane === "heavy").length,
    } satisfies SchedulerEvent);
  }
  private addSlot(writer: boolean): Promise<void> {
    const slot: Slot = {
      index: this.slots.length,
      writer,
      worker: undefined,
      state: "starting",
      job: undefined,
      ready: Promise.resolve(),
      acknowledgeFailure: false,
    };
    this.slots.push(slot);
    return this.start(slot);
  }
  private start(slot: Slot): Promise<void> {
    slot.state = "starting";
    const worker = new Worker(new URL("./entry.ts", import.meta.url), {
      workerData: {
        filename: this.options.filename,
        writer: slot.writer,
        ...(this.options.testGate ? { testGate: this.options.testGate } : {}),
      },
      // Node executes erasable TS directly; do not inherit main-thread preload/loader hooks.
      execArgv: [],
    });
    slot.worker = worker;
    slot.ready = new Promise<void>((resolve, reject) => {
      let initialized = false;
      const failed = () => {
        if (slot.worker !== worker || slot.state === "failed" || slot.state === "closing") return;
        const job = slot.job;
        slot.state = "failed";
        slot.job = undefined;
        slot.acknowledgeFailure = !job;
        job?.reject(new StorageError("STORAGE_FAILURE"));
        reject(new StorageError("STORAGE_FAILURE"));
        void worker.terminate();
        if (initialized) console.error(JSON.stringify({ errorType: "SqliteWorkerFailure" }));
        this.failQueued(slot.writer);
      };
      worker.on("error", failed);
      worker.on("exit", failed);
      worker.on("message", (reply: WorkerReply) => {
        if (slot.worker !== worker) return;
        if (reply.type === "ready") {
          initialized = true;
          slot.state = "idle";
          this.emit("ready", undefined, slot);
          resolve();
          this.schedule();
        } else if (reply.type === "startup-error") failed();
        else if (reply.type === "result" || reply.type === "error") {
          const job = slot.job;
          if (!job || job.request.id !== reply.id) {
            failed();
            return;
          }
          slot.job = undefined;
          slot.state = "idle";
          this.emit("finish", job, slot);
          if (reply.type === "result") job.resolve(reply.value);
          else job.reject(restoreWorkerError(reply.error));
          this.schedule();
        }
      });
    });
    return slot.ready;
  }
  execute<S extends ServiceName, M extends MethodName<S>>(
    service: S,
    method: M,
    args: ServiceMethod<S, M>["args"],
  ): Promise<ServiceMethod<S, M>["result"]> {
    return this.enqueue(service, method, args) as Promise<ServiceMethod<S, M>["result"]>;
  }
  private enqueue(
    service: ServiceName,
    method: string,
    args: readonly unknown[],
  ): Promise<unknown> {
    if (this.closing) return Promise.reject(new StorageError("CLOSED"));
    const lanes = applicationLanes[service];
    if (!Object.hasOwn(lanes, method)) return Promise.reject(new StorageError("INVALID_INPUT"));
    const lane: ExecutionLane = Reflect.get(lanes, method);
    const failed = this.slots.filter(
      (slot) => slot.state === "failed" && slot.writer === (lane === "write"),
    );
    let acknowledge = false;
    for (const slot of failed) {
      acknowledge ||= slot.acknowledgeFailure;
      slot.acknowledgeFailure = false;
      void this.start(slot).catch(() => this.failQueued(slot.writer));
    }
    if (acknowledge) return Promise.reject(new StorageError("STORAGE_FAILURE"));
    return new Promise((resolve, reject) => {
      const job: Job = {
        request: { type: "execute", id: ++this.sequence, service, method, args },
        lane,
        resolve,
        reject,
      };
      this.queue.push(job);
      const slot = this.slots.find((item) => item.writer === (lane === "write"));
      if (slot) this.emit("queued", job, slot);
      this.schedule();
    });
  }
  private failQueued(writer: boolean) {
    for (let index = this.queue.length - 1; index >= 0; index--) {
      if ((this.queue[index]?.lane === "write") === writer) {
        this.queue.splice(index, 1)[0]?.reject(new StorageError("STORAGE_FAILURE"));
      }
    }
    this.schedule();
  }
  private schedule() {
    for (const slot of this.slots) {
      if (slot.state !== "idle") continue;
      const heavy = this.slots.filter((item) => item.job?.lane === "heavy").length;
      const index = this.queue.findIndex((job) =>
        slot.writer
          ? job.lane === "write"
          : job.lane === "light" || (job.lane === "heavy" && heavy < this.readers - 1),
      );
      if (index < 0) continue;
      const job = this.queue.splice(index, 1)[0];
      if (!job) continue;
      slot.job = job;
      slot.state = "busy";
      this.emit("start", job, slot);
      try {
        if (!slot.worker) throw new StorageError("STORAGE_FAILURE");
        slot.worker.postMessage(job.request);
      } catch {
        slot.job = undefined;
        slot.state = "failed";
        job.reject(new StorageError("STORAGE_FAILURE"));
        void slot.worker?.terminate();
        this.failQueued(slot.writer);
      }
    }
    if (!this.queue.length && this.slots.every((slot) => !slot.job)) this.drained?.();
  }
  services(): ApplicationServices {
    const bind =
      <S extends ServiceName, M extends MethodName<S>>(service: S, method: M) =>
      (...args: ServiceMethod<S, M>["args"]) =>
        this.execute(service, method, args);
    return {
      trade: {
        list: bind("trade", "list"),
        get: bind("trade", "get"),
        save: bind("trade", "save"),
      },
      tradeDocs: {
        previewAction: bind("tradeDocs", "previewAction"),
        confirmAction: bind("tradeDocs", "confirmAction"),
        actions: bind("tradeDocs", "actions"),
        previewSettlement: bind("tradeDocs", "previewSettlement"),
        confirmSettlement: bind("tradeDocs", "confirmSettlement"),
        createOrder: bind("tradeDocs", "createOrder"),
        order: bind("tradeDocs", "order"),
        preview: bind("tradeDocs", "preview"),
        confirm: bind("tradeDocs", "confirm"),
        list: bind("tradeDocs", "list"),
        detail: bind("tradeDocs", "detail"),
        openItems: bind("tradeDocs", "openItems"),
      },
      masterData: {
        initialize: bind("masterData", "initialize"),
        createCompany: bind("masterData", "createCompany"),
        companies: bind("masterData", "companies"),
        accounts: bind("masterData", "accounts"),
        account: bind("masterData", "account"),
        saveAccount: bind("masterData", "saveAccount"),
        periods: bind("masterData", "periods"),
        setPeriod: bind("masterData", "setPeriod"),
      },
      dimensions: {
        list: bind("dimensions", "list"),
        catalog: bind("dimensions", "catalog"),
        save: bind("dimensions", "save"),
      },
      journals: {
        list: bind("journals", "list"),
        draft: bind("journals", "draft"),
        entry: bind("journals", "entry"),
        save: bind("journals", "save"),
        remove: bind("journals", "remove"),
        preview: bind("journals", "preview"),
        confirm: bind("journals", "confirm"),
      },
      events: {
        masters: bind("events", "masters"),
        saveMaster: bind("events", "saveMaster"),
        rules: bind("events", "rules"),
        saveRule: bind("events", "saveRule"),
        preview: bind("events", "preview"),
        detail: bind("events", "detail"),
        list: bind("events", "list"),
        confirm: bind("events", "confirm"),
        enqueue: bind("events", "enqueue"),
        queue: bind("events", "queue"),
        transferPreview: bind("events", "transferPreview"),
        transfer: bind("events", "transfer"),
        withdraw: bind("events", "withdraw"),
        openItems: bind("events", "openItems"),
      },
      reports: {
        report: bind("reports", "report"),
        reconciliation: bind("reports", "reconciliation"),
        ledger: bind("reports", "ledger"),
      },
      closing: {
        preview: bind("closing", "preview"),
        confirm: bind("closing", "confirm"),
        openNext: bind("closing", "openNext"),
      },
      aiContext: { draft: bind("aiContext", "draft"), explain: bind("aiContext", "explain") },
    };
  }
  /** Lifecycle fault injection without a production route or command. */
  async terminateWriterForTest(): Promise<void> {
    const writer = this.slots.find((slot) => slot.writer)?.worker;
    if (!writer) throw new StorageError("STORAGE_FAILURE");
    await writer.terminate();
  }
  close(): Promise<void> {
    this.closingPromise ??= this.shutdown();
    return this.closingPromise;
  }
  private async shutdown(): Promise<void> {
    this.closing = true;
    if (this.queue.length || this.slots.some((slot) => slot.job))
      await new Promise<void>((resolve) => {
        this.drained = resolve;
      });
    await Promise.all(
      this.slots.map(async (slot) => {
        if (!slot.worker) return;
        if (slot.state === "failed") {
          await slot.worker?.terminate();
          return;
        }
        await slot.ready.catch(() => {});
        const worker = slot.worker;
        if (worker.threadId === -1) return;
        slot.state = "closing";
        await new Promise<void>((resolve, reject) => {
          worker.once("exit", (code) =>
            code === 0 ? resolve() : reject(new StorageError("STORAGE_FAILURE")),
          );
          worker.postMessage({ type: "close" });
        });
      }),
    );
  }
}

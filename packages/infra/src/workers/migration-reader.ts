import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { StorageError } from "@erp/core/application";
import { migrationStatusSchema, type MigrationStatus } from "@erp/core/contracts";
import { acquireDatabaseLease } from "../storage/maintenance.ts";

if (!isMainThread) {
  const { readMigrationStatus } = await import("../storage/reconciliation.ts");
  parentPort?.on("message", async (id: number) => {
    try {
      const release = await acquireDatabaseLease(workerData.filename);
      try {
        parentPort?.postMessage({ id, value: readMigrationStatus(workerData.filename) });
      } finally {
        release();
      }
    } catch {
      parentPort?.postMessage({ id, error: true });
    }
  });
}

/** Separate read-only admission: unreconciled targets never enter the business executor. */
export class MigrationReader {
  private readonly worker: Worker;
  private next = 0;
  private failed = false;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: MigrationStatus) => void;
      reject: (error: Error) => void;
    }
  >();
  constructor(filename: string) {
    this.worker = new Worker(new URL("./migration-reader.ts", import.meta.url), {
      workerData: { filename },
      execArgv: [],
    });
    const fail = () => {
      this.failed = true;
      for (const request of this.pending.values())
        request.reject(new StorageError("STORAGE_FAILURE"));
      this.pending.clear();
    };
    this.worker.on("error", fail);
    this.worker.on("exit", fail);
    this.worker.on("message", (reply: { id: number; value?: unknown; error?: boolean }) => {
      const request = this.pending.get(reply.id);
      if (!request) return;
      this.pending.delete(reply.id);
      const result = migrationStatusSchema.safeParse(reply.value);
      if (reply.error || !result.success) request.reject(new StorageError("STORAGE_FAILURE"));
      else request.resolve(result.data);
    });
  }
  latest(): Promise<MigrationStatus> {
    if (this.failed) return Promise.reject(new StorageError("STORAGE_FAILURE"));
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(id);
    });
  }
  async close(): Promise<void> {
    await this.worker.terminate();
  }
}

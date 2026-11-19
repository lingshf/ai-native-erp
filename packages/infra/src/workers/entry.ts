import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";
import {
  MasterDataService,
  TradeMasterService,
  DimensionService,
  JournalService,
  BusinessEventService,
  ReportService,
  PeriodCloseService,
  AiContextService,
  applicationLanes,
  StorageError,
  type ApplicationServices,
} from "@erp/core/application";
import { createSqliteStorage } from "../storage/index.ts";
import { createMasterDataStore } from "../storage/master-data.ts";
import { journalTools } from "../storage/journals.ts";
import { safeWorkerError, type WorkerConfiguration, type WorkRequest } from "./protocol.ts";

const port = parentPort;
if (!port) throw new Error("SQLite worker requires a parent");
const config: WorkerConfiguration = workerData;
let store: ReturnType<typeof createMasterDataStore> | undefined;
let testDatabase: Database.Database | undefined;
try {
  if (config.writer) {
    const storage = createSqliteStorage({ filename: config.filename });
    try {
      await storage.verifySchema();
    } finally {
      await storage.close();
    }
  }
  store = createMasterDataStore({ filename: config.filename, readonly: !config.writer });
  const services: ApplicationServices = {
    trade: new TradeMasterService(store),
    masterData: new MasterDataService(store),
    dimensions: new DimensionService(store),
    journals: new JournalService(store, journalTools),
    events: new BusinessEventService(store, journalTools),
    reports: new ReportService(store),
    closing: new PeriodCloseService(store, journalTools),
    aiContext: new AiContextService(store),
  };
  if (config.testGate && !config.writer) {
    const gate = new Int32Array(config.testGate);
    testDatabase = new Database(config.filename, { readonly: true, fileMustExist: true });
    testDatabase.pragma("query_only = ON");
    testDatabase.function("erp_test_wait", () => {
      Atomics.store(gate, 0, 1);
      Atomics.notify(gate, 0);
      if (Atomics.wait(gate, 1, 0, 30_000) === "timed-out" || Atomics.load(gate, 1) !== 1)
        throw new StorageError("STORAGE_FAILURE");
      Atomics.store(gate, 0, 2);
      return 1;
    });
  }
  port.on("message", async (message: WorkRequest | { type: "close" }) => {
    if (message.type === "close") {
      await store?.close();
      testDatabase?.close();
      port.postMessage({ type: "closed" });
      port.close();
      return;
    }
    try {
      const { service, method, args, id } = message;
      const lanes = applicationLanes[service];
      if (!lanes || !Object.hasOwn(lanes, method)) throw new StorageError("STORAGE_FAILURE");
      const lane = Reflect.get(lanes, method);
      if ((lane === "write") !== config.writer) throw new StorageError("STORAGE_FAILURE");
      if (testDatabase && lane === "heavy") testDatabase.prepare("SELECT erp_test_wait()").get();
      const target = services[service];
      const callable: unknown = Reflect.get(target, method);
      if (typeof callable !== "function") throw new StorageError("STORAGE_FAILURE");
      const value: unknown = await Reflect.apply(callable, target, args);
      port.postMessage({ type: "result", id, value });
    } catch (error) {
      port.postMessage({ type: "error", id: message.id, error: safeWorkerError(error) });
    }
  });
  port.postMessage({ type: "ready" });
} catch {
  await store?.close();
  testDatabase?.close();
  port.postMessage({ type: "startup-error" });
  port.close();
}

import { randomUUID } from "node:crypto";
import type { MasterDataService } from "@erp/core/application";
import { parseRuntimeConfiguration } from "./index.ts";
import type { createMasterDataStore } from "./storage/master-data.ts";

let store: ReturnType<typeof createMasterDataStore> | undefined;
try {
  const environment = {
    ...(process.env.ERP_PROFILE !== undefined ? { ERP_PROFILE: process.env.ERP_PROFILE } : {}),
    ...(process.env.ERP_HOST !== undefined ? { ERP_HOST: process.env.ERP_HOST } : {}),
    ...(process.env.ERP_PORT !== undefined ? { ERP_PORT: process.env.ERP_PORT } : {}),
  };
  parseRuntimeConfiguration(environment);
  const [
    { createApi },
    { defaultErrorLogger },
    { MasterDataService, DimensionService, JournalService },
    { createSqliteStorage },
    { createMasterDataStore },
    { journalTools },
  ] = await Promise.all([
    import("./http/index.ts"),
    import("./http/errors.ts"),
    import("@erp/core/application"),
    import("./storage/index.ts"),
    import("./storage/master-data.ts"),
    import("./storage/journals.ts"),
  ]);
  let masterData: MasterDataService | undefined;
  if (process.env.ERP_SQLITE_FILE !== undefined) {
    const config = { filename: process.env.ERP_SQLITE_FILE };
    const storage = createSqliteStorage(config);
    try {
      await storage.verifySchema();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore(config);
    masterData = new MasterDataService(store);
    await masterData.initialize(new Date().getFullYear());
  }
  const api = await createApi({
    environment,
    ...(masterData && store
      ? {
          masterData,
          dimensions: new DimensionService(store),
          journals: new JournalService(store, journalTools),
        }
      : {}),
  });
  await api.listen();
  const close = () => {
    api
      .close()
      .finally(() => store?.close())
      .catch(() => {
        defaultErrorLogger({ requestId: randomUUID(), errorType: "InternalError" });
        process.exitCode = 1;
      });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  await store?.close().catch(() => {
    console.error(JSON.stringify({ requestId: randomUUID(), errorType: "InternalError" }));
  });
  const kind =
    error !== null && typeof error === "object" && "code" in error && error.code === "EADDRINUSE"
      ? "AddressInUse"
      : error instanceof Error && error.name === "RuntimeConfigurationError"
        ? "RuntimeConfigurationError"
        : "StartupError";
  console.error(JSON.stringify({ requestId: randomUUID(), errorType: kind }));
  process.exitCode = 1;
}

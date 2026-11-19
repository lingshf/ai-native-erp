import { randomUUID } from "node:crypto";
import { parseRuntimeConfiguration, RuntimeConfigurationError } from "./index.ts";
import type { SqliteExecutor } from "./workers/executor.ts";

let executor: SqliteExecutor | undefined;
try {
  const environment = {
    ...(process.env.ERP_PROFILE !== undefined ? { ERP_PROFILE: process.env.ERP_PROFILE } : {}),
    ...(process.env.ERP_HOST !== undefined ? { ERP_HOST: process.env.ERP_HOST } : {}),
    ...(process.env.ERP_PORT !== undefined ? { ERP_PORT: process.env.ERP_PORT } : {}),
  };
  parseRuntimeConfiguration(environment);
  await import("./workers/main-thread-guard.ts");
  const [{ createApi }, { defaultErrorLogger }, { AiAssistantService }, { SqliteExecutor }] =
    await Promise.all([
      import("./http/index.ts"),
      import("./http/errors.ts"),
      import("@erp/core/application"),
      import("./workers/executor.ts"),
    ]);
  if (process.env.ERP_SQLITE_FILE !== undefined) {
    const readers = process.env.ERP_SQLITE_READERS;
    if (readers !== undefined && !/^(?:[2-9]|[12][0-9]|3[0-2])$/u.test(readers))
      throw new RuntimeConfigurationError();
    executor = await SqliteExecutor.create({
      filename: process.env.ERP_SQLITE_FILE,
      ...(readers !== undefined ? { readers: Number(readers) } : {}),
    });
    await executor.execute("masterData", "initialize", [new Date().getFullYear()]);
  }
  const services = executor?.services();
  const aiModel = process.env.AI_MODEL?.trim();
  const aiTimeout = Number(process.env.AI_TIMEOUT_MS ?? "30000");
  const aiConfigured = Boolean(
    aiModel &&
      aiModel !== "auto" &&
      (!process.env.AI_PROVIDER || process.env.AI_PROVIDER === "copilot") &&
      Number.isInteger(aiTimeout) &&
      aiTimeout >= 1 &&
      aiTimeout <= 300000,
  );
  const api = await createApi({
    environment,
    ...(services
      ? {
          ...services,
          ...(aiConfigured
            ? {
                assistant: new AiAssistantService(
                  {
                    context: (mode, input) => services.aiContext[mode](input),
                    preview: services.journals.preview,
                  },
                  new (await import("./copilot-ai.ts")).CopilotAiAdapter({
                    ...(process.env.AI_MODEL !== undefined ? { model: process.env.AI_MODEL } : {}),
                    ...(process.env.AI_PROVIDER !== undefined
                      ? { provider: process.env.AI_PROVIDER }
                      : {}),
                  }),
                  { id: randomUUID },
                  aiTimeout,
                ),
              }
            : {}),
        }
      : {}),
  });
  await api.listen();
  const close = () => {
    api
      .close()
      .finally(() => executor?.close())
      .catch(() => {
        defaultErrorLogger({ requestId: randomUUID(), errorType: "InternalError" });
        process.exitCode = 1;
      });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  await executor?.close().catch(() => {
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

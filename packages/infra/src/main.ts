import { randomUUID } from "node:crypto";
import { createApi } from "./http/index.ts";
import { defaultErrorLogger } from "./http/errors.ts";

try {
  const api = await createApi({
    environment: {
      ...(process.env.ERP_PROFILE !== undefined ? { ERP_PROFILE: process.env.ERP_PROFILE } : {}),
      ...(process.env.ERP_HOST !== undefined ? { ERP_HOST: process.env.ERP_HOST } : {}),
      ...(process.env.ERP_PORT !== undefined ? { ERP_PORT: process.env.ERP_PORT } : {}),
    },
  });
  await api.listen();
  const close = () => {
    api.close().catch(() => {
      defaultErrorLogger({ requestId: randomUUID(), errorType: "InternalError" });
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  const kind =
    error !== null && typeof error === "object" && "code" in error && error.code === "EADDRINUSE"
      ? "AddressInUse"
      : error instanceof Error && error.name === "RuntimeConfigurationError"
        ? "RuntimeConfigurationError"
        : "StartupError";
  console.error(JSON.stringify({ requestId: randomUUID(), errorType: kind }));
  process.exitCode = 1;
}

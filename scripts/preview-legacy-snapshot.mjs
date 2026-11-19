import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseRuntimeConfiguration } from "@erp/infra";
import { validateDevOrigin } from "../packages/infra/src/http/dev-origin.ts";

function argumentsError() {
  const error = new Error("Invalid preview arguments");
  error.name = "PreviewArgumentsError";
  return error;
}

export function parsePreviewArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !["--snapshot-dir", "--dev-origin"].includes(key) ||
      values.has(key) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      throw argumentsError();
    }
    values.set(key, value);
  }
  if (!values.has("--snapshot-dir")) throw argumentsError();
  const devOrigin = values.get("--dev-origin");
  try {
    validateDevOrigin(devOrigin);
  } catch {
    throw argumentsError();
  }
  return { snapshotDirectory: values.get("--snapshot-dir"), devOrigin };
}

/** Owns the reader. API and opener injection are composition seams, never HTTP inputs. */
export async function startLegacyPreview({
  snapshotDirectory,
  devOrigin,
  environment = {},
  allowPortZero = false,
  openReader,
  createApi: makeApi,
}) {
  parseRuntimeConfiguration(environment, { allowPortZero });
  validateDevOrigin(devOrigin);
  if (typeof snapshotDirectory !== "string" || snapshotDirectory.length === 0)
    throw argumentsError();
  const readSnapshot =
    openReader ?? (await import("./legacy-snapshot-reader.mjs")).openVerifiedTeachingReader;
  const createPreviewApi = makeApi ?? (await import("@erp/infra/http")).createApi;
  const reader = readSnapshot(resolve(snapshotDirectory));
  let api;
  let closing;
  const close = () =>
    (closing ??= (async () => {
      const errors = [];
      try {
        await api?.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        await reader.close();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "Preview close failed");
    })());
  try {
    api = await createPreviewApi({ environment, allowPortZero, devOrigin, legacyReader: reader });
    const address = await api.listen();
    return { address, close };
  } catch (error) {
    await close();
    throw error;
  }
}

function safeFatal(error, closing, runtime) {
  const errorType = closing
    ? "CloseError"
    : error?.code === "EADDRINUSE"
      ? "AddressInUse"
      : ["RuntimeConfigurationError", "PreviewArgumentsError"].includes(error?.name)
        ? error.name
        : "StartupError";
  runtime.stderr.write(JSON.stringify({ requestId: randomUUID(), errorType }) + "\n");
  runtime.exitCode = 1;
}

export async function runPreview(
  args = process.argv.slice(2),
  environment = process.env,
  { runtime = process, startPreview = startLegacyPreview } = {},
) {
  try {
    const options = parsePreviewArguments(args);
    const runtimeEnvironment = Object.fromEntries(
      ["ERP_PROFILE", "ERP_HOST", "ERP_PORT"]
        .filter((key) => environment[key] !== undefined)
        .map((key) => [key, environment[key]]),
    );
    const preview = await startPreview({ ...options, environment: runtimeEnvironment });
    let stopping;
    const stop = () =>
      (stopping ??= preview.close().catch((error) => safeFatal(error, true, runtime)));
    runtime.on("SIGINT", stop);
    runtime.on("SIGTERM", stop);
    return preview;
  } catch (error) {
    safeFatal(error, false, runtime);
    return undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runPreview();
}

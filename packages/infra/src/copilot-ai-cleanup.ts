import { rm } from "node:fs/promises";
import { AiFailure } from "@erp/core/application";
import type { CopilotTextRuntime } from "./copilot-ai.ts";

type CleanupSettings = { cleanupTimeoutMs?: number };
type CleanupScope = {
  client: CopilotTextRuntime | undefined;
  directory: string | undefined;
  interrupted: boolean;
};
type Steps<T> = Generator<Promise<unknown>, T, unknown>;

function boundedBy(settings: CleanupSettings) {
  return async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AiFailure("cleanup")),
            settings.cleanupTimeoutMs ?? 5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

function* terminateRuntime(
  client: CopilotTextRuntime,
  interrupted: boolean,
  settings: CleanupSettings,
  onUnconfirmed: () => void,
): Steps<{ cleanupFailed: boolean; terminated: boolean }> {
  const bounded = boundedBy(settings);
  let cleanupFailed = false,
    terminated = false;
  try {
    if (interrupted) yield bounded(client.forceStop());
    else {
      const errors = (yield bounded(client.stop())) as Error[];
      if (errors.length) {
        cleanupFailed = true;
        yield bounded(client.forceStop());
      }
    }
    terminated = true;
  } catch {
    cleanupFailed = true;
    try {
      yield bounded(client.forceStop());
      terminated = true;
    } catch {
      // Unconfirmed termination keeps the directory and disables AI until restart.
      onUnconfirmed();
    }
  }
  return { cleanupFailed, terminated };
}

function* removeWorkspace(directory: string): Steps<boolean> {
  try {
    yield rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return true;
  } catch {
    console.error("AI temporary state cleanup failed.");
    return false;
  }
}

export function* cleanupSteps(
  { client, directory, interrupted }: CleanupScope,
  settings: CleanupSettings,
  onUnconfirmed: () => void,
): Steps<boolean> {
  let cleanupFailed = false,
    terminated = !client;
  if (client)
    ({ cleanupFailed, terminated } = yield* terminateRuntime(
      client,
      interrupted,
      settings,
      onUnconfirmed,
    ));
  if (directory && terminated && !(yield* removeWorkspace(directory))) cleanupFailed = true;
  return cleanupFailed;
}

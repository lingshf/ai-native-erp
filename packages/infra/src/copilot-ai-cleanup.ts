import { rm } from "node:fs/promises";
import { AiFailure } from "@erp/core/application";
import type { CopilotTextRuntime } from "./copilot-ai.ts";

type CleanupSettings = { cleanupTimeoutMs?: number };

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

export async function terminateRuntime(
  client: CopilotTextRuntime,
  interrupted: boolean,
  settings: CleanupSettings,
  onUnconfirmed: () => void,
): Promise<{ cleanupFailed: boolean; terminated: boolean }> {
  const bounded = boundedBy(settings);
  let cleanupFailed = false,
    terminated = false;
  try {
    if (interrupted) await bounded(client.forceStop());
    else {
      const errors = await bounded(client.stop());
      if (errors.length) {
        cleanupFailed = true;
        await bounded(client.forceStop());
      }
    }
    terminated = true;
  } catch {
    cleanupFailed = true;
    try {
      await bounded(client.forceStop());
      terminated = true;
    } catch {
      // Unconfirmed termination keeps the directory and disables AI until restart.
      onUnconfirmed();
    }
  }
  return { cleanupFailed, terminated };
}

export async function removeWorkspace(directory: string): Promise<boolean> {
  try {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    return true;
  } catch {
    console.error("AI temporary state cleanup failed.");
    return false;
  }
}

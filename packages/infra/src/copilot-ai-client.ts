import { CopilotClient, RuntimeConnection, type CopilotClientOptions } from "@github/copilot-sdk";
import type { CopilotTextRuntime } from "./copilot-ai.ts";

const TOKEN_KEY = "COPILOT_GITHUB_TOKEN";

// SEC-02 (D568): the SDK factory receives an explicit allowlist, never the inherited environment.
// Only a non-empty COPILOT_GITHUB_TOKEN is forwarded. Windows environment names are
// case-insensitive, so any casing is accepted there (exact name first); elsewhere only the exact
// name counts. Aliases (GH_TOKEN, GITHUB_TOKEN), platform keys and ERP settings are never forwarded.
export function copilotRuntimeEnv(
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const token =
    platform === "win32"
      ? (source[TOKEN_KEY] ??
        Object.entries(source).find(([key]) => key.toUpperCase() === TOKEN_KEY)?.[1])
      : source[TOKEN_KEY];
  return token ? { [TOKEN_KEY]: token } : {};
}

export function isolatedClient(
  directory: string,
  settings: {
    clientFactory?: (options: CopilotClientOptions) => CopilotTextRuntime;
  },
): CopilotTextRuntime {
  return (settings.clientFactory ?? ((options) => new CopilotClient(options)))({
    mode: "empty",
    baseDirectory: directory,
    workingDirectory: directory,
    logLevel: "none",
    // Pinned so the host's COPILOT_SDK_DEFAULT_CONNECTION cannot switch the transport.
    connection: RuntimeConnection.forStdio(),
    env: copilotRuntimeEnv(),
  });
}

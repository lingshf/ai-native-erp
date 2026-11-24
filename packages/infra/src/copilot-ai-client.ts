import { CopilotClient, type CopilotClientOptions } from "@github/copilot-sdk";
import type { CopilotTextRuntime } from "./copilot-ai.ts";

export function isolatedClient(
  directory: string,
  settings: {
    clientFactory?: (options: CopilotClientOptions) => CopilotTextRuntime;
  },
): CopilotTextRuntime {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !["AI_API_KEY", "AI_BASE_URL", "COPILOT_CLI_PATH"].includes(key.toUpperCase()),
    ),
  );
  return (settings.clientFactory ?? ((options) => new CopilotClient(options)))({
    mode: "empty",
    baseDirectory: directory,
    workingDirectory: directory,
    logLevel: "none",
    env,
  });
}

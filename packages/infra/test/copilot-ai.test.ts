import { access } from "node:fs/promises";
import { it, expect, vi } from "vitest";
import type { CopilotClientOptions, SessionConfig } from "@github/copilot-sdk";
import { CopilotAiAdapter, type CopilotTextRuntime } from "../src/copilot-ai.ts";
it("maps candidate context to an isolated explicit-model text-only SDK session without credential/config/tool discovery", async () => {
  let options: CopilotClientOptions | undefined,
    config: SessionConfig | undefined,
    sent: string | undefined;
  const stop = vi.fn(async () => []),
    forceStop = vi.fn(async () => {});
  const runtime: CopilotTextRuntime = {
    start: async () => {},
    getAuthStatus: async () => ({ isAuthenticated: true }),
    listModels: async () => [{ id: "explicit-model" }],
    createSession: async (value) => {
      config = value;
      return {
        rpc: {
          tools: {
            initializeAndValidate: async () => {},
            getCurrentMetadata: async () => ({ tools: [] }),
          },
          model: { getCurrent: async () => ({ modelId: "explicit-model" }) },
        },
        sendAndWait: async (request) => {
          sent = request.prompt;
          value.onEvent?.({
            type: "assistant.message",
            id: "event",
            timestamp: new Date().toISOString(),
            parentId: null,
            data: { messageId: "message", content: "Synthetic explanation" },
          });
          return { data: { content: "Synthetic explanation" } };
        },
      };
    },
    stop,
    forceStop,
  };
  vi.stubEnv("Ai_Api_Key", "not-forwarded");
  vi.stubEnv("Ai_Base_Url", "not-forwarded");
  vi.stubEnv("Copilot_Cli_Path", "not-forwarded");
  try {
    const adapter = new CopilotAiAdapter({
      model: "explicit-model",
      clientFactory: (value) => {
        options = value;
        return runtime;
      },
    });
    const input = {
      mode: "explain" as const,
      prompt: "Synthetic question",
      context: {
        company: { code: "DEMO", currency: "JPY", scale: 0, closeMode: "annual" as const },
        period: { month: "2026-01", status: "open" as const, revision: 1 },
        snapshot: { watermark: 7, accountRevision: 11 },
        accounts: [],
        dimensions: [],
      },
    };
    expect(await adapter.complete(input, new AbortController().signal)).toBe(
      "Synthetic explanation",
    );
    expect(options).toMatchObject({ mode: "empty", logLevel: "none" });
    expect(options?.workingDirectory).toBe(options?.baseDirectory);
    expect(
      Object.keys(options?.env ?? {}).some((key) =>
        ["AI_API_KEY", "AI_BASE_URL", "COPILOT_CLI_PATH"].includes(key.toUpperCase()),
      ),
    ).toBe(false);
    expect(config).toMatchObject({
      model: "explicit-model",
      allowedModels: ["explicit-model"],
      tools: [],
      availableTools: [],
      excludedTools: ["builtin:*", "mcp:*", "custom:*"],
      mcpServers: {},
      customAgents: [],
      includedBuiltinSkills: [],
      enableConfigDiscovery: false,
      skipCustomInstructions: true,
      enableSkills: false,
      enableFileHooks: false,
      enableHostGitOperations: false,
      enableSessionStore: false,
      enableSessionTelemetry: false,
      requestExtensions: false,
      enableOnDemandInstructionDiscovery: false,
      requestCanvasRenderer: false,
      enableMcpApps: false,
      memory: { enabled: false },
      infiniteSessions: { enabled: false },
      systemMessage: { mode: "replace" },
    });
    expect(JSON.parse(sent ?? "")).toEqual(input);
    expect(stop).toHaveBeenCalledOnce();
    expect(forceStop).not.toHaveBeenCalled();
    await expect(access(options?.baseDirectory ?? "")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      new CopilotAiAdapter({ model: "auto", clientFactory: () => runtime }).complete(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: "unavailable" });
  } finally {
    vi.unstubAllEnvs();
  }
});

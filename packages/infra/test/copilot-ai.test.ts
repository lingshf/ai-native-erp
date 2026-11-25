import { access } from "node:fs/promises";
import { afterEach, it, expect, vi } from "vitest";
import type { CopilotClientOptions, SessionConfig } from "@github/copilot-sdk";
import { CopilotAiAdapter, type CopilotTextRuntime } from "../src/copilot-ai.ts";

const model = "explicit-model";
const answer = "Synthetic explanation";
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

type Reply = { data: { content?: unknown } } | undefined;

function fakeRuntime(
  overrides: Partial<Pick<CopilotTextRuntime, "stop" | "forceStop">> & { reply?: Reply } = {},
) {
  const seen: { config?: SessionConfig; sent?: string } = {};
  const stop = vi.fn(overrides.stop ?? (async () => []));
  const forceStop = vi.fn(overrides.forceStop ?? (async () => {}));
  const runtime: CopilotTextRuntime = {
    start: async () => {},
    getAuthStatus: async () => ({ isAuthenticated: true }),
    listModels: async () => [{ id: model }],
    createSession: async (config) => {
      seen.config = config;
      return {
        rpc: {
          tools: {
            initializeAndValidate: async () => {},
            getCurrentMetadata: async () => ({ tools: [] }),
          },
          model: { getCurrent: async () => ({ modelId: model }) },
        },
        sendAndWait: async (request) => {
          seen.sent = request.prompt;
          config.onEvent?.({
            type: "assistant.message",
            id: "event",
            timestamp: new Date().toISOString(),
            parentId: null,
            data: { messageId: "message", content: answer },
          });
          return (
            "reply" in overrides ? overrides.reply : { data: { content: answer } }
          ) as Awaited<
            ReturnType<Awaited<ReturnType<CopilotTextRuntime["createSession"]>>["sendAndWait"]>
          >;
        },
      };
    },
    stop,
    forceStop,
  };
  return { runtime, seen, stop, forceStop };
}

function adapterFor(runtime: CopilotTextRuntime, cleanupTimeoutMs?: number) {
  return new CopilotAiAdapter({ model, cleanupTimeoutMs, clientFactory: () => runtime });
}

const live = () => new AbortController().signal;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("maps candidate context to an isolated explicit-model text-only SDK session without credential/config/tool discovery", async () => {
  let options: CopilotClientOptions | undefined;
  const { runtime, seen, stop, forceStop } = fakeRuntime();
  vi.stubEnv("Ai_Api_Key", "not-forwarded");
  vi.stubEnv("Ai_Base_Url", "not-forwarded");
  vi.stubEnv("Copilot_Cli_Path", "not-forwarded");
  const adapter = new CopilotAiAdapter({
    model,
    clientFactory: (value) => {
      options = value;
      return runtime;
    },
  });
  expect(await adapter.complete(input, live())).toBe(answer);
  expect(options).toMatchObject({ mode: "empty", logLevel: "none" });
  expect(options?.workingDirectory).toBe(options?.baseDirectory);
  expect(
    Object.keys(options?.env ?? {}).some((key) =>
      ["AI_API_KEY", "AI_BASE_URL", "COPILOT_CLI_PATH"].includes(key.toUpperCase()),
    ),
  ).toBe(false);
  expect(seen.config).toMatchObject({
    model,
    allowedModels: [model],
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
  expect(JSON.parse(seen.sent ?? "")).toEqual(input);
  expect(stop).toHaveBeenCalledOnce();
  expect(forceStop).not.toHaveBeenCalled();
  await expect(access(options?.baseDirectory ?? "")).rejects.toMatchObject({ code: "ENOENT" });
  await expect(
    new CopilotAiAdapter({ model: "auto", clientFactory: () => runtime }).complete(input, live()),
  ).rejects.toMatchObject({ reason: "unavailable" });
});

it("BUG-02a: reports cancelled when the request is aborted while the client factory is still running and it then throws", async () => {
  const controller = new AbortController();
  const adapter = new CopilotAiAdapter({
    model,
    clientFactory: () => {
      controller.abort();
      throw new Error("factory failed after abort");
    },
  });
  await expect(adapter.complete(input, controller.signal)).rejects.toMatchObject({
    reason: "cancelled",
  });
  const failing = new CopilotAiAdapter({
    model,
    clientFactory: () => {
      throw new Error("factory failed without abort");
    },
  });
  await expect(failing.complete(input, live())).rejects.toMatchObject({ reason: "unavailable" });
});

it.each([
  ["no reply", undefined],
  ["no content", { data: {} }],
  ["non-string content", { data: { content: 42 } }],
  ["blank content", { data: { content: "  " } }],
])("BUG-02b: rejects a missing or invalid reply (%s) as response", async (_, reply) => {
  const { runtime, stop } = fakeRuntime({ reply });
  await expect(adapterFor(runtime).complete(input, live())).rejects.toMatchObject({
    reason: "response",
  });
  expect(stop).toHaveBeenCalledOnce();
});

it.each([
  ["stop reports errors", { stop: async () => [new Error("stop failed")] }, 5000],
  [
    "stop throws",
    {
      stop: async (): Promise<Error[]> => {
        throw new Error("stop threw");
      },
    },
    5000,
  ],
  ["stop times out", { stop: () => new Promise<Error[]>(() => {}) }, 10],
])("BUG-02c: keeps the answer and only logs when %s", async (_, overrides, timeout) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { runtime, forceStop } = fakeRuntime(overrides);
  const adapter = adapterFor(runtime, timeout);
  expect(await adapter.complete(input, live())).toBe(answer);
  expect(forceStop).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalled();
  expect(await adapter.complete(input, live())).toBe(answer);
});

it("BUG-02c: keeps the answer but disables AI until restart when termination is unconfirmed", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { runtime } = fakeRuntime({
    stop: async () => [new Error("stop failed")],
    forceStop: async () => {
      throw new Error("force stop failed");
    },
  });
  const adapter = adapterFor(runtime);
  expect(await adapter.complete(input, live())).toBe(answer);
  expect(log).toHaveBeenCalledWith(
    "AI runtime termination unconfirmed; AI disabled until restart.",
  );
  await expect(adapter.complete(input, live())).rejects.toMatchObject({ reason: "cleanup" });
});

type Late = "event" | "abort";
type Moment = "as the race settles" | "one microtask later";

// The adapter's first Promise.race accepts the answer; interfere once it settles, either in the
// race's own settlement callback (before the adapter resumes) or one microtask after that.
function interfereAfterAnswer(
  kind: Late,
  moment: Moment,
  controller: AbortController,
  seen: { config?: SessionConfig },
) {
  const interfere = () => {
    if (kind === "abort") controller.abort();
    else
      seen.config?.onEvent?.({
        type: "tool.execution_start",
        id: "late",
        timestamp: new Date().toISOString(),
        parentId: null,
        data: { toolCallId: "call", toolName: "shell", arguments: {} },
      } as Parameters<NonNullable<SessionConfig["onEvent"]>>[0]);
  };
  const race = Promise.race.bind(Promise);
  vi.spyOn(Promise, "race").mockImplementationOnce((values) => {
    const settled = race(values as Promise<unknown>[]);
    void settled.then(() =>
      moment === "as the race settles" ? interfere() : queueMicrotask(interfere),
    );
    return settled;
  });
}

it.each([
  ["a tool event", "event", "as the race settles", "forceStop"],
  ["an abort", "abort", "as the race settles", "forceStop"],
  ["a tool event", "event", "one microtask later", "stop"],
  ["an abort", "abort", "one microtask later", "stop"],
] as const)(
  "BUG-02d: %s (%s) arriving after the answer %s keeps the answer and uses %s",
  async (_, kind, moment, expected) => {
    const controller = new AbortController();
    const { runtime, seen, stop, forceStop } = fakeRuntime();
    interfereAfterAnswer(kind, moment, controller, seen);
    expect(await adapterFor(runtime).complete(input, controller.signal)).toBe(answer);
    expect(forceStop).toHaveBeenCalledTimes(expected === "forceStop" ? 1 : 0);
    expect(stop).toHaveBeenCalledTimes(expected === "stop" ? 1 : 0);
  },
);

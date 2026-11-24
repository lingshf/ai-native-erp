import type { CopilotClientOptions, SessionConfig } from "@github/copilot-sdk";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiFailure, type AiPort } from "@erp/core/application";
import { removeWorkspace, terminateRuntime } from "./copilot-ai-cleanup.ts";
import { isolatedClient } from "./copilot-ai-client.ts";
import { createCallState, interruptionOf } from "./copilot-ai-interruption.ts";
import { runTextSession } from "./copilot-ai-session.ts";

export interface CopilotTextSession {
  rpc: {
    tools: {
      initializeAndValidate(): Promise<unknown>;
      getCurrentMetadata(): Promise<{ tools: unknown }>;
    };
    model: { getCurrent(): Promise<{ modelId?: string }> };
  };
  sendAndWait(
    input: { prompt: string },
    timeout: number,
  ): Promise<{ data: { content?: string } } | undefined>;
}
export interface CopilotTextRuntime {
  start(): Promise<void>;
  getAuthStatus(): Promise<{ isAuthenticated: boolean }>;
  listModels(): Promise<readonly { id: string }[]>;
  createSession(config: SessionConfig): Promise<CopilotTextSession>;
  stop(): Promise<Error[]>;
  forceStop(): Promise<void>;
}

export class CopilotAiAdapter implements AiPort {
  private busy = false;
  private blocked = false;
  private readonly options: {
    model?: string;
    provider?: string;
    cleanupTimeoutMs?: number;
    clientFactory?: (options: CopilotClientOptions) => CopilotTextRuntime;
  };
  constructor(options: CopilotAiAdapter["options"] = {}) {
    this.options = options;
  }
  async complete(input: Parameters<AiPort["complete"]>[0], signal: AbortSignal): Promise<string> {
    const model = this.options.model?.trim();
    if (
      !model ||
      model === "auto" ||
      (this.options.provider && this.options.provider !== "copilot")
    )
      throw new AiFailure("unavailable");
    if (signal.aborted) throw new AiFailure("cancelled");
    if (this.blocked) throw new AiFailure("cleanup");
    if (this.busy) throw new AiFailure("busy");
    this.busy = true;
    let directory: string | undefined, client: CopilotTextRuntime | undefined;
    let answer: string | undefined, failure: AiFailure | undefined;
    const state = createCallState();
    const cancel = () => state.rejectRun("cancelled");
    signal.addEventListener("abort", cancel, { once: true });
    try {
      directory = await mkdtemp(join(tmpdir(), "erp-ai-"));
      if (signal.aborted) throw new AiFailure("cancelled");
      client = isolatedClient(directory, this.options);
      const interruption = interruptionOf(state);
      answer = await Promise.race([
        runTextSession(client, model, input, state, signal),
        interruption,
      ]);
    } catch (error) {
      failure = error instanceof AiFailure ? error : new AiFailure("unavailable");
    } finally {
      signal.removeEventListener("abort", cancel);
      let cleanupFailed = false,
        terminated = !client;
      if (client)
        ({ cleanupFailed, terminated } = await terminateRuntime(
          client,
          state.interrupted || signal.aborted,
          this.options,
          () => {
            this.blocked = true;
            console.error("AI runtime termination unconfirmed; AI disabled until restart.");
          },
        ));
      if (directory && terminated && !(await removeWorkspace(directory))) cleanupFailed = true;
      this.busy = false;
      if (cleanupFailed) failure = new AiFailure("cleanup");
    }
    if (failure) throw failure;
    if (answer === undefined) throw new AiFailure("response");
    return answer;
  }
}

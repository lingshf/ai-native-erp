import type { CopilotClientOptions, SessionConfig } from "@github/copilot-sdk";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiFailure, type AiPort } from "@erp/core/application";
import { cleanupSteps } from "./copilot-ai-cleanup.ts";
import { isolatedClient } from "./copilot-ai-client.ts";
import { type CallState, createCallState, interruptionOf } from "./copilot-ai-interruption.ts";
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

type CompletionInput = Parameters<AiPort["complete"]>[0];
type Outcome = { answer: string } | { failure: AiFailure };
type Resources = { client: CopilotTextRuntime | undefined; directory: string | undefined };
type CleanupScope = Resources & { interrupted: boolean };

// BUG-02c: a cleanup failure overrides a failed outcome but never a received answer; it is only logged.
function settle(outcome: Outcome, cleanupFailed: boolean): string {
  if ("failure" in outcome) throw cleanupFailed ? new AiFailure("cleanup") : outcome.failure;
  if (cleanupFailed) console.error("AI runtime cleanup failed after the answer; answer kept.");
  return outcome.answer;
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
  async complete(input: CompletionInput, signal: AbortSignal): Promise<string> {
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
    const state = createCallState();
    const cancel = () => state.rejectRun("cancelled");
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const resources: Resources = { client: undefined, directory: undefined };
      const outcome = await this.attempt(model, input, state, signal, resources);
      // BUG-02d (accepted): a tool/subagent event or abort arriving after the answer still marks
      // the call interrupted, so cleanup force-stops instead of stopping. The session disables
      // every tool, so such late events are abnormal and force-stopping is the safer choice.
      const interrupted = state.interrupted || signal.aborted;
      return settle(outcome, await this.cleanUp({ ...resources, interrupted }));
    } finally {
      signal.removeEventListener("abort", cancel);
      this.busy = false;
    }
  }

  private async attempt(
    model: string,
    input: CompletionInput,
    state: CallState,
    signal: AbortSignal,
    resources: Resources,
  ): Promise<Outcome> {
    try {
      resources.directory = await mkdtemp(join(tmpdir(), "erp-ai-"));
      if (signal.aborted) throw new AiFailure("cancelled");
      resources.client = this.createClient(resources.directory, signal);
      const interruption = interruptionOf(state);
      const answer = await Promise.race([
        runTextSession(resources.client, model, input, state, signal),
        interruption,
      ]);
      return { answer };
    } catch (error) {
      return { failure: error instanceof AiFailure ? error : new AiFailure("unavailable") };
    }
  }

  private createClient(directory: string, signal: AbortSignal): CopilotTextRuntime {
    try {
      return isolatedClient(directory, this.options);
    } catch (error) {
      // BUG-02a: an abort during the factory call wins over the factory's own plain error.
      if (signal.aborted && !(error instanceof AiFailure)) throw new AiFailure("cancelled");
      throw error;
    }
  }

  private async cleanUp(scope: CleanupScope): Promise<boolean> {
    const steps = cleanupSteps(scope, this.options, () => {
      this.blocked = true;
      console.error("AI runtime termination unconfirmed; AI disabled until restart.");
    });
    let step = steps.next();
    while (!step.done)
      try {
        step = steps.next(await step.value);
      } catch (error) {
        step = steps.throw(error);
      }
    return step.value;
  }
}

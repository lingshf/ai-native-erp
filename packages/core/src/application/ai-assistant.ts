import {
  DomainError,
  checkedCode,
  checkedTeachingMonth,
  parseAiCandidate,
  buildReports,
  journalError,
  type Company,
  type Period,
  type DimensionConfig,
  type ReportSnapshot,
  type Account,
} from "@erp/core/domain";
import type { MasterDataStore } from "./master-data.ts";
import { JournalService, type JournalTools } from "./journals.ts";

export type AiFailureReason =
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "busy"
  | "response"
  | "cleanup";
export class AiFailure extends Error {
  readonly reason: AiFailureReason;
  constructor(reason: AiFailureReason) {
    super(`AI ${reason}`);
    this.name = "AiFailure";
    this.reason = reason;
  }
}
export interface AiContext {
  readonly company: Pick<Company, "code" | "currency" | "scale" | "closeMode">;
  readonly period: Period;
  readonly snapshot: ReportSnapshot;
  readonly accounts: readonly Pick<
    Account,
    | "code"
    | "name"
    | "category"
    | "reportGroup"
    | "normalSide"
    | "purpose"
    | "manualAllowed"
    | "active"
    | "contraOf"
  >[];
  readonly dimensions: readonly DimensionConfig[];
  readonly report?: ReturnType<typeof buildReports>;
  readonly closing?: {
    readonly drafts: number;
    readonly queue: number;
    readonly priorPeriods: number;
  };
}
export interface AiPort {
  complete(
    input: {
      readonly mode: "draft" | "explain";
      readonly prompt: string;
      readonly context: AiContext;
    },
    signal: AbortSignal,
  ): Promise<string>;
}
export interface AiRequest {
  readonly company: string;
  readonly month: string;
  readonly prompt: string;
}
export class AiAssistantService {
  private readonly store: MasterDataStore;
  private readonly port: AiPort;
  private readonly tools: JournalTools;
  private readonly timeoutMs: number;
  constructor(store: MasterDataStore, port: AiPort, tools: JournalTools, timeoutMs = 30000) {
    this.store = store;
    this.port = port;
    this.tools = tools;
    this.timeoutMs = timeoutMs;
  }
  private async ask(mode: "draft" | "explain", input: AiRequest, signal?: AbortSignal) {
    checkedCode(input.company);
    checkedTeachingMonth(input.month);
    if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 4000)
      throw new DomainError("INVALID_INPUT");
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300000)
      throw new AiFailure("unavailable");
    if (signal?.aborted) throw new AiFailure("cancelled");
    const context: AiContext = await this.store.read(async (repo) => {
      const owner = await repo.company(input.company),
        period = await repo.period(input.company, input.month);
      if (!owner || !period) throw new DomainError("NOT_FOUND");
      if (mode === "draft" && period.status !== "open") journalError("date", "period");
      const rows =
        mode === "explain"
          ? await repo.reportBalances(input.company, input.month, "adjusted")
          : undefined;
      const accounts: Account[] = [];
      if (rows) accounts.push(...rows);
      else {
        let cursor: string | undefined;
        do {
          const page = await repo.accounts(input.company, {
            limit: 500,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          accounts.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
      }
      return {
        company: {
          code: owner.code,
          currency: owner.currency,
          scale: owner.scale,
          closeMode: owner.closeMode,
        },
        period,
        snapshot: await repo.reportSnapshot(input.company),
        accounts: accounts
          .filter((row) => mode === "explain" || (row.active && row.manualAllowed))
          .map((row) => ({
            code: row.code,
            name: row.name,
            category: row.category,
            reportGroup: row.reportGroup,
            normalSide: row.normalSide,
            purpose: row.purpose,
            manualAllowed: row.manualAllowed,
            active: row.active,
            contraOf: row.contraOf,
          })),
        dimensions: await repo.dimensionCatalog(input.company),
        ...(rows
          ? {
              report: buildReports(owner, input.month, "adjusted", rows),
              closing: await repo.closeState(
                input.company,
                input.month,
                owner.closeMode === "annual",
              ),
            }
          : {}),
      };
    });
    if (signal?.aborted) throw new AiFailure("cancelled");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interrupt: (reason: AiFailureReason) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      interrupt = (reason) => {
        reject(new AiFailure(reason));
        controller.abort();
      };
      timer = setTimeout(() => interrupt("timeout"), this.timeoutMs);
    });
    const cancelled = () => interrupt("cancelled");
    signal?.addEventListener("abort", cancelled, { once: true });
    try {
      if (signal?.aborted) cancelled();
      const text = await Promise.race([
        this.port.complete({ mode, prompt: input.prompt, context }, controller.signal),
        interrupted,
      ]);
      if (controller.signal.aborted) throw new AiFailure("cancelled");
      if (typeof text !== "string" || !text.trim() || text.length > 262144)
        throw new AiFailure("response");
      return text;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
    }
  }
  async draft(input: AiRequest, signal?: AbortSignal) {
    const text = await this.ask("draft", input, signal);
    const candidate = parseAiCandidate(text, this.tools.id());
    const issue = (path: string, messageKey: string) => ({
      status: "invalid" as const,
      draft: candidate?.draft ?? null,
      rationale: candidate?.rationale ?? null,
      issues: [{ path, messageKey }],
    });
    if (!candidate) return issue("candidate", "api.error.ai.candidate");
    try {
      if (candidate.draft.date.slice(0, 7) !== input.month) journalError("date", "period");
      const pairs = new Set(
        [
          ...input.prompt.matchAll(
            /\b([A-Z][A-Z0-9_]{0,31})=([A-Z0-9][A-Z0-9_-]{0,39})(?![A-Z0-9_-])/gu,
          ),
        ].map((match) => `${match[1]}=${match[2]}`),
      );
      if (
        candidate.draft.lines.some((line) =>
          Object.entries(line.dimensions).some(([code, value]) => !pairs.has(`${code}=${value}`)),
        )
      )
        return issue("lines.dimensions", "api.error.ai.explicitDimensions");
      await new JournalService(this.store, this.tools).preview(input.company, candidate.draft);
    } catch (error) {
      if (!(error instanceof DomainError) || !["INVALID_INPUT", "CONFLICT"].includes(error.code))
        throw error;
      return issue(
        error.issue?.path ?? "candidate",
        error.issue
          ? `api.error.${"scope" in error.issue ? error.issue.scope : "account"}.${error.issue.rule}`
          : "api.error.ai.candidate",
      );
    }
    return { status: "candidate" as const, ...candidate };
  }
  async explain(input: AiRequest, signal?: AbortSignal) {
    return { text: await this.ask("explain", input, signal) };
  }
}

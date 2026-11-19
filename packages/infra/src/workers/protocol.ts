import { DomainError, StorageError } from "@erp/core/application";
import type { ExecutionLane, ServiceName } from "@erp/core/application";

export interface WorkerConfiguration {
  readonly filename: string;
  readonly writer: boolean;
  readonly testGate?: SharedArrayBuffer;
}
export interface WorkRequest {
  readonly type: "execute";
  readonly id: number;
  readonly service: ServiceName;
  readonly method: string;
  readonly args: readonly unknown[];
}
export type SafeWorkerError =
  | {
      readonly kind: "domain";
      readonly code: DomainError["code"];
      readonly issue: DomainError["issue"];
    }
  | { readonly kind: "storage"; readonly code: StorageError["code"] };
export type WorkerReply =
  | { readonly type: "ready" }
  | { readonly type: "closed" }
  | { readonly type: "startup-error" }
  | { readonly type: "result"; readonly id: number; readonly value: unknown }
  | { readonly type: "error"; readonly id: number; readonly error: SafeWorkerError };
export interface SchedulerEvent {
  readonly event: "start" | "finish" | "queued" | "ready";
  readonly id: number;
  readonly lane: ExecutionLane;
  readonly workerId: number;
  readonly readers: number;
  readonly runningHeavy: number;
  readonly queuedHeavy: number;
}
export function safeWorkerError(error: unknown): SafeWorkerError {
  if (error instanceof DomainError) return { kind: "domain", code: error.code, issue: error.issue };
  return { kind: "storage", code: error instanceof StorageError ? error.code : "STORAGE_FAILURE" };
}
export function restoreWorkerError(error: SafeWorkerError): Error {
  return error.kind === "domain"
    ? new DomainError(error.code, error.issue)
    : new StorageError(error.code);
}

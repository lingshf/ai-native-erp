import { randomUUID } from "node:crypto";
import { errorSchema } from "@erp/core/contracts";
import type { ErrorResponse } from "@erp/core/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AiFailure, DomainError, StorageError } from "@erp/core/application";

export interface SafeErrorEvent {
  readonly requestId: string;
  readonly errorType: "HttpError" | "ParseError" | "DomainRejection" | "InternalError";
}

export type SafeErrorLogger = (event: SafeErrorEvent) => void;

export const defaultErrorLogger: SafeErrorLogger = (event) => {
  console.error(JSON.stringify(event));
};

export function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error("HTTP request rejected"), { statusCode });
}

const errors: Record<number, { code: ErrorResponse["code"]; messageKey: string }> = {
  400: { code: "INVALID_REQUEST", messageKey: "api.error.invalidRequest" },
  403: { code: "FORBIDDEN", messageKey: "api.error.forbidden" },
  404: { code: "NOT_FOUND", messageKey: "api.error.notFound" },
  405: { code: "METHOD_NOT_ALLOWED", messageKey: "api.error.methodNotAllowed" },
  409: { code: "CONFLICT", messageKey: "api.error.conflict" },
  415: { code: "UNSUPPORTED_MEDIA_TYPE", messageKey: "api.error.unsupportedMediaType" },
  503: { code: "UNAVAILABLE", messageKey: "api.error.unavailable" },
  502: { code: "AI_RESPONSE", messageKey: "api.error.ai.response" },
  504: { code: "AI_TIMEOUT", messageKey: "api.error.ai.timeout" },
  500: { code: "INTERNAL_ERROR", messageKey: "api.error.internal" },
};

export function sendHttpError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  log: SafeErrorLogger,
): void {
  if (reply.sent) return;
  let status = 500;
  if (error instanceof AiFailure) {
    status =
      error.reason === "timeout"
        ? 504
        : error.reason === "cancelled"
          ? 400
          : error.reason === "busy"
            ? 409
            : error.reason === "response"
              ? 502
              : 503;
  } else if (error instanceof StorageError) {
    if (error.code === "INVALID_INPUT" || error.code === "INVALID_CURSOR") status = 400;
    else if (error.code === "NOT_FOUND") status = 404;
    else if (error.code === "CONFLICT") status = 409;
    else if (
      [
        "INVALID_SNAPSHOT",
        "SCHEMA_MISMATCH",
        "OVERFLOW",
        "BUSY",
        "CLOSED",
        "STORAGE_FAILURE",
      ].includes(error.code)
    )
      status = 503;
  } else if (error instanceof DomainError) {
    status =
      error.code === "INVALID_INPUT"
        ? 400
        : error.code === "CONFLICT"
          ? 409
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "OVERFLOW"
              ? 503
              : 500;
  } else if (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    status = error.statusCode;
  }
  // Unsupported framework statuses still use a documented, strict error DTO.
  if (status >= 400 && status < 500 && !(status in errors)) status = 400;
  const definition = errors[status] ?? errors[500]!;
  if (!(status in errors)) status = 500;
  const requestId = request.id || randomUUID();
  // Requests that parsed but were refused by domain or storage rules are not parse errors.
  log({
    requestId,
    errorType:
      status >= 500
        ? "InternalError"
        : error instanceof DomainError || error instanceof StorageError
          ? "DomainRejection"
          : (status === 400 && !(error instanceof AiFailure)) || status === 415
            ? "ParseError"
            : "HttpError",
  });
  const body: ErrorResponse = errorSchema.parse({
    ...definition,
    ...(error instanceof AiFailure
      ? {
          code: `AI_${error.reason.toUpperCase()}`,
          messageKey: `api.error.ai.${error.reason}`,
        }
      : {}),
    params: {},
    fieldErrors:
      error instanceof DomainError && error.issue
        ? [
            {
              path: error.issue.path,
              messageKey: `api.error.${"scope" in error.issue ? error.issue.scope : "account"}.${error.issue.rule}`,
            },
          ]
        : [],
    requestId,
    retryable:
      status === 503 || status === 504 || (error instanceof AiFailure && error.reason === "busy"),
  });
  if (status === 405 && !reply.hasHeader("Allow")) reply.header("Allow", "GET");
  reply.code(status).send(body);
}

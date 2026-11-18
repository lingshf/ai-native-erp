import { randomUUID } from 'node:crypto';
import { errorSchema } from '@erp/contracts';
import type { ErrorResponse } from '@erp/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError, StorageError } from '@erp/application';

export interface SafeErrorEvent {
  readonly requestId: string;
  readonly errorType: 'HttpError' | 'ParseError' | 'InternalError';
}

export type SafeErrorLogger = (event: SafeErrorEvent) => void;

export const defaultErrorLogger: SafeErrorLogger = event => {
  console.error(JSON.stringify(event));
};

export function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error('HTTP request rejected'), { statusCode });
}

const errors: Record<number, { code: ErrorResponse['code']; messageKey: string }> = {
  400: { code: 'INVALID_REQUEST', messageKey: 'api.error.invalidRequest' },
  403: { code: 'FORBIDDEN', messageKey: 'api.error.forbidden' },
  404: { code: 'NOT_FOUND', messageKey: 'api.error.notFound' },
  405: { code: 'METHOD_NOT_ALLOWED', messageKey: 'api.error.methodNotAllowed' },
  409: { code: 'CONFLICT', messageKey: 'api.error.conflict' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', messageKey: 'api.error.unsupportedMediaType' },
  503: { code: 'UNAVAILABLE', messageKey: 'api.error.unavailable' },
  500: { code: 'INTERNAL_ERROR', messageKey: 'api.error.internal' },
};

export function sendHttpError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  log: SafeErrorLogger,
): void {
  if (reply.sent) return;
  let status = 500;
  if (error instanceof StorageError) {
    if (error.code === 'INVALID_INPUT' || error.code === 'INVALID_CURSOR') status = 400;
    else if (error.code === 'NOT_FOUND') status = 404;
    else if (error.code === 'CONFLICT') status = 409;
    else if (['INVALID_SNAPSHOT', 'SCHEMA_MISMATCH', 'OVERFLOW', 'BUSY', 'CLOSED', 'STORAGE_FAILURE']
      .includes(error.code)) status = 503;
  } else if (error instanceof DomainError) {
    status = error.code === 'INVALID_INPUT' ? 400 : error.code === 'NOT_FOUND' ? 404
      : error.code === 'OVERFLOW' ? 503 : 500;
  } else if (error !== null && typeof error === 'object' && 'statusCode' in error
    && typeof error.statusCode === 'number') {
    status = error.statusCode;
  }
  // Unsupported framework statuses still use a documented, strict error DTO.
  if (status >= 400 && status < 500 && !(status in errors)) status = 400;
  const definition = errors[status] ?? errors[500]!;
  if (!(status in errors)) status = 500;
  const requestId = request.id || randomUUID();
  log({
    requestId,
    errorType: status >= 500 ? 'InternalError'
      : status === 400 || status === 415 ? 'ParseError' : 'HttpError',
  });
  const body: ErrorResponse = errorSchema.parse({
    ...definition,
    params: {},
    fieldErrors: [],
    requestId,
    retryable: status === 503,
  });
  if (status === 405) reply.header('Allow', 'GET');
  reply.code(status).send(body);
}

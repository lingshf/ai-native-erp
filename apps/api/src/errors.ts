import { randomUUID } from 'node:crypto';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { errorSchema } from '@erp/contracts';
import type { ErrorResponse } from '@erp/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface SafeErrorEvent {
  readonly requestId: string;
  readonly errorType: 'HttpError' | 'ParseError' | 'InternalError';
}

export type SafeErrorLogger = (event: SafeErrorEvent) => void;

export const defaultErrorLogger: SafeErrorLogger = event => {
  console.error(JSON.stringify(event));
};

const errors: Record<number, { code: ErrorResponse['code']; messageKey: string }> = {
  400: { code: 'INVALID_REQUEST', messageKey: 'api.error.invalidRequest' },
  404: { code: 'NOT_FOUND', messageKey: 'api.error.notFound' },
  405: { code: 'METHOD_NOT_ALLOWED', messageKey: 'api.error.methodNotAllowed' },
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
  let status = error instanceof HttpException ? error.getStatus() : 500;
  if (error !== null && typeof error === 'object' && 'statusCode' in error
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

@Catch()
export class UnifiedHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly log: SafeErrorLogger) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendHttpError(error, http.getRequest<FastifyRequest>(), http.getResponse<FastifyReply>(), this.log);
  }
}

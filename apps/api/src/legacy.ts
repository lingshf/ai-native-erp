import { All, Controller, HttpException, Inject, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LegacyTeachingQueryService } from '@erp/application';
import {
  legacyContextSchema, legacyTrialSchema, legacyLedgerSchema,
  legacyTrialQuerySchema, legacyLedgerQuerySchema,
} from '@erp/contracts';

export const LEGACY_SERVICE = Symbol('LegacyTeachingQueryService');
export const LEGACY_BOUNDARY = Symbol('LocalFinanceBoundary');
export const LEGACY_PATHS = new Set([
  '/api/v1/legacy/context', '/api/v1/legacy/trial', '/api/v1/legacy/ledger',
]);

export function validateDevOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/u.exec(value);
  if (!match || Number(match[1]) > 65535 || Number(match[1]) === 4173
    || new URL(value).origin !== value) {
    throw new TypeError('Invalid Local development origin');
  }
  return value;
}

export function financeHeaders(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
}

export class LocalFinanceBoundary {
  origin: string | undefined;

  constructor(private readonly devOrigin: string | undefined) {}

  assert(request: FastifyRequest, reply: FastifyReply): void {
    financeHeaders(reply);
    const origin = this.origin;
    const site = request.headers['sec-fetch-site'];
    if (!origin || request.headers.host !== new URL(origin).host
      || (request.headers.origin !== undefined && request.headers.origin !== origin
        && request.headers.origin !== this.devOrigin)
      || (site !== undefined && !['same-origin', 'same-site', 'none'].includes(String(site)))) {
      throw new HttpException('Forbidden', 403);
    }
    if (request.method !== 'GET') throw new HttpException('Method not allowed', 405);
  }
}

function queryValues(request: FastifyRequest): Record<string, string> {
  const query = new URLSearchParams(request.url.split('?').slice(1).join('?'));
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of query) {
    if (Object.hasOwn(values, key)) throw new HttpException('Invalid query', 400);
    values[key] = value;
  }
  return values;
}

@Controller('api/v1/legacy')
export class LegacyController {
  constructor(
    @Inject(LEGACY_SERVICE) private readonly service: LegacyTeachingQueryService | undefined,
    @Inject(LEGACY_BOUNDARY) private readonly boundary: LocalFinanceBoundary,
  ) {}

  private prepare(request: FastifyRequest, reply: FastifyReply): Record<string, string> {
    // Protect the matched handler itself, including any router-normalized path.
    this.boundary.assert(request, reply);
    return queryValues(request);
  }

  private reader(): LegacyTeachingQueryService {
    if (!this.service) throw new HttpException('Snapshot unavailable', 503);
    return this.service;
  }

  @All('context')
  context(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const query = this.prepare(request, reply);
    if (Object.keys(query).length) throw new HttpException('Invalid query', 400);
    const parsed = legacyContextSchema.safeParse({ contractVersion: '1', ...this.reader().context() });
    if (!parsed.success) throw new HttpException('Snapshot unavailable', 503);
    return parsed.data;
  }

  @All('trial')
  trial(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const query = legacyTrialQuerySchema.safeParse(this.prepare(request, reply));
    if (!query.success) throw new HttpException('Invalid query', 400);
    const { snapshot, month } = query.data;
    const parsed = legacyTrialSchema.safeParse({
      contractVersion: '1', ...this.reader().trial(snapshot, month),
    });
    if (!parsed.success) throw new HttpException('Snapshot unavailable', 503);
    return parsed.data;
  }

  @All('ledger')
  ledger(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const query = legacyLedgerQuerySchema.safeParse(this.prepare(request, reply));
    if (!query.success) throw new HttpException('Invalid query', 400);
    const { snapshot, month, account, limit, cursor } = query.data;
    const parsed = legacyLedgerSchema.safeParse({
      contractVersion: '1',
      ...this.reader().ledger(snapshot, {
        month, account,
        ...(limit !== undefined ? { limit: Number(limit) } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      }),
    });
    if (!parsed.success) throw new HttpException('Snapshot unavailable', 503);
    return parsed.data;
  }
}

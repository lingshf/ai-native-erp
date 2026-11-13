import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { Controller, Get, HttpException, Inject, Module, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LegacyTeachingQueryService, RuntimeInfoService } from '@erp/application';
import type { LegacyTeachingReader, RuntimeInfoPort } from '@erp/application';
import { healthSchema } from '@erp/contracts';
import type { HealthResponse } from '@erp/contracts';
import { LocalRuntimeInfo, parseRuntimeConfiguration } from '@erp/infrastructure';
import type { RuntimeConfiguration, RuntimeEnvironment } from '@erp/infrastructure';
import { defaultErrorLogger, sendHttpError, UnifiedHttpExceptionFilter } from './errors.js';
import type { SafeErrorLogger } from './errors.js';
import {
  LEGACY_BOUNDARY, LEGACY_PATHS, LEGACY_SERVICE, LegacyController,
  LocalFinanceBoundary, financeHeaders, validateDevOrigin,
} from './legacy.js';

export type { SafeErrorEvent, SafeErrorLogger } from './errors.js';
export { UnifiedHttpExceptionFilter } from './errors.js';
export { validateDevOrigin } from './legacy.js';

const HEALTH_PATH = '/api/v1/health';
const RUNTIME_SERVICE = Symbol('RuntimeInfoService');

@Controller('api/v1')
class HealthController {
  constructor(@Inject(RUNTIME_SERVICE) private readonly runtime: RuntimeInfoService) {}

  @Get('health')
  health(@Query() query: Record<string, unknown>): HealthResponse {
    if (Object.keys(query).length !== 0) throw new HttpException('Invalid query', 400);
    return healthSchema.parse({ ...this.runtime.getRuntimeInfo(), contractVersion: '1' });
  }
}

export interface CreateApiOptions {
  readonly environment?: RuntimeEnvironment;
  readonly allowPortZero?: boolean;
  readonly webRoot?: string;
  readonly runtimeInfoPort?: RuntimeInfoPort;
  readonly logError?: SafeErrorLogger;
  /** Borrowed explicit snapshot: the composition root retains ownership. */
  readonly legacyReader?: LegacyTeachingReader;
  readonly devOrigin?: string;
  /** Factory-only test seam. The CLI never registers extra routes. */
  readonly registerTestRoutes?: (server: FastifyInstance) => void | Promise<void>;
}

export interface LocalApi {
  readonly app: NestFastifyApplication;
  readonly server: FastifyInstance;
  readonly configuration: RuntimeConfiguration;
  listen(): Promise<string>;
  close(): Promise<void>;
}

export function defaultWebRoot(): string {
  return fileURLToPath(new URL('../../web/dist/', import.meta.url));
}

export async function createApi(options: CreateApiOptions = {}): Promise<LocalApi> {
  const configuration = parseRuntimeConfiguration(options.environment ?? {}, {
    allowPortZero: options.allowPortZero === true,
  });
  const log = options.logError ?? defaultErrorLogger;
  const boundary = new LocalFinanceBoundary(validateDevOrigin(options.devOrigin));
  const runtime = new RuntimeInfoService(options.runtimeInfoPort ?? new LocalRuntimeInfo(configuration));
  @Module({
    controllers: [HealthController, LegacyController],
    providers: [
      { provide: RUNTIME_SERVICE, useValue: runtime },
      { provide: LEGACY_SERVICE, useValue: options.legacyReader
        ? new LegacyTeachingQueryService(options.legacyReader) : null },
      { provide: LEGACY_BOUNDARY, useValue: boundary },
    ],
  })
  class LocalApiModule {}

  const adapter = new FastifyAdapter({
    logger: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
    frameworkErrors(error: unknown, request: FastifyRequest, reply: FastifyReply) {
      // Router decoding can fail before onRequest and Nest's exception filter.
      if (request.url.split('?')[0]?.startsWith('/api/v1/legacy/')) financeHeaders(reply);
      sendHttpError(error, request, reply, log);
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(LocalApiModule, adapter, {
    logger: false,
    abortOnError: false,
  });
  const server = adapter.getInstance();
  try {
    server.addHook('onRequest', async (request, reply) => {
      const path = request.url.split('?')[0];
      if (path?.startsWith('/api/v1/legacy/')) financeHeaders(reply);
      if (path && LEGACY_PATHS.has(path)) {
        try {
          boundary.assert(request, reply);
        } catch (error) {
          sendHttpError(error, request, reply, log);
          return reply;
        }
      } else if (path === HEALTH_PATH && request.method !== 'GET') {
        sendHttpError(new HttpException('Method not allowed', 405), request, reply, log);
        return reply;
      } else if (path === '/api' || path?.startsWith('/api/')) {
        if (path !== HEALTH_PATH) {
          sendHttpError(new HttpException('Not found', 404), request, reply, log);
          return reply;
        }
      }
    });
    const root = options.webRoot ?? defaultWebRoot();
    if (!isAbsolute(root)) throw new TypeError('Web root must be absolute');
    let built = false;
    try {
      built = statSync(root).isDirectory() && statSync(join(root, 'index.html')).isFile();
    } catch (error) {
      if (!(error !== null && typeof error === 'object' && 'code' in error
        && (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) throw error;
    }
    if (built) {
      await server.register(fastifyStatic, { root, dotfiles: 'deny', index: ['index.html'] });
    } else {
      server.get('/', async () => { throw new HttpException('Web build unavailable', 503); });
      server.get('/*', async () => { throw new HttpException('Web build unavailable', 503); });
    }
    await options.registerTestRoutes?.(server);
    app.useGlobalFilters(new UnifiedHttpExceptionFilter(log));
    // Nest's Fastify error and not-found handlers both dispatch through this filter.
    await app.init();
    await server.ready();
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => {
      boundary.origin = undefined;
      return closing ??= app.close();
    };
    return {
      app,
      server,
      configuration,
      async listen() {
        try {
          await app.listen(configuration.port, configuration.host);
          const address = await app.getUrl();
          boundary.origin = new URL(address).origin;
          return address;
        } catch (error) {
          await close();
          throw error;
        }
      },
      close,
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}

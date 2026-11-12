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
import type { FastifyInstance } from 'fastify';
import { RuntimeInfoService } from '@erp/application';
import type { RuntimeInfoPort } from '@erp/application';
import { healthSchema } from '@erp/contracts';
import type { HealthResponse } from '@erp/contracts';
import { LocalRuntimeInfo, parseRuntimeConfiguration } from '@erp/infrastructure';
import type { RuntimeConfiguration, RuntimeEnvironment } from '@erp/infrastructure';
import { defaultErrorLogger, sendHttpError, UnifiedHttpExceptionFilter } from './errors.js';
import type { SafeErrorLogger } from './errors.js';

export type { SafeErrorEvent, SafeErrorLogger } from './errors.js';
export { UnifiedHttpExceptionFilter } from './errors.js';

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
  const runtime = new RuntimeInfoService(options.runtimeInfoPort ?? new LocalRuntimeInfo(configuration));
  @Module({
    controllers: [HealthController],
    providers: [{ provide: RUNTIME_SERVICE, useValue: runtime }],
  })
  class LocalApiModule {}

  const adapter = new FastifyAdapter({
    logger: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(LocalApiModule, adapter, {
    logger: false,
    abortOnError: false,
  });
  const server = adapter.getInstance();
  try {
    server.addHook('onRequest', async (request, reply) => {
      const path = request.url.split('?')[0];
      if (path === HEALTH_PATH && request.method !== 'GET') {
        sendHttpError(new HttpException('Method not allowed', 405), request, reply, log);
      } else if (path === '/api' || path?.startsWith('/api/')) {
        if (path !== HEALTH_PATH) {
          sendHttpError(new HttpException('Not found', 404), request, reply, log);
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
    return {
      app,
      server,
      configuration,
      async listen() {
        try {
          await app.listen(configuration.port, configuration.host);
          return await app.getUrl();
        } catch (error) {
          await app.close();
          throw error;
        }
      },
      close: () => app.close(),
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}

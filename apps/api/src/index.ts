import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LegacyTeachingQueryService, RuntimeInfoService } from '@erp/application';
import type { LegacyTeachingReader, RuntimeInfoPort } from '@erp/application';
import { healthSchema } from '@erp/contracts';
import { LocalRuntimeInfo, parseRuntimeConfiguration } from '@erp/infrastructure';
import type { RuntimeConfiguration, RuntimeEnvironment } from '@erp/infrastructure';
import { defaultErrorLogger, httpError, sendHttpError } from './errors.js';
import type { SafeErrorLogger } from './errors.js';
import {
  LEGACY_PATHS, registerLegacyRoutes,
  LocalFinanceBoundary, financeHeaders, validateDevOrigin,
} from './legacy.js';

export type { SafeErrorEvent, SafeErrorLogger } from './errors.js';
export { validateDevOrigin } from './legacy.js';

const HEALTH_PATH = '/api/v1/health';

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
  readonly app: FastifyInstance;
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
  const server = Fastify({
    logger: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
    frameworkErrors(error: unknown, request: FastifyRequest, reply: FastifyReply) {
      // Router decoding can fail before onRequest and the error handler.
      if (request.url.split('?')[0]?.startsWith('/api/v1/legacy/')) financeHeaders(reply);
      sendHttpError(error, request, reply, log);
    },
  });
  try {
    server.setErrorHandler((error, request, reply) => sendHttpError(error, request, reply, log));
    server.setNotFoundHandler((request, reply) => sendHttpError(httpError(404), request, reply, log));
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
        sendHttpError(httpError(405), request, reply, log);
        return reply;
      } else if (path === '/api' || path?.startsWith('/api/')) {
        if (path !== HEALTH_PATH) {
          sendHttpError(httpError(404), request, reply, log);
          return reply;
        }
      }
    });
    server.get<{ Querystring: Record<string, unknown> }>(HEALTH_PATH, async request => {
      if (Object.keys(request.query).length) throw httpError(400);
      return healthSchema.parse({ ...runtime.getRuntimeInfo(), contractVersion: '1' });
    });
    registerLegacyRoutes(server, options.legacyReader
      ? new LegacyTeachingQueryService(options.legacyReader) : undefined, boundary);
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
      server.register(fastifyStatic, { root, dotfiles: 'deny', index: ['index.html'] });
    } else {
      server.get('/', async () => { throw httpError(503); });
      server.get('/*', async () => { throw httpError(503); });
    }
    await options.registerTestRoutes?.(server);
    await server.ready();
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => {
      boundary.origin = undefined;
      return closing ??= server.close();
    };
    return {
      app: server,
      server,
      configuration,
      async listen() {
        try {
          const address = await server.listen({ port: configuration.port, host: configuration.host });
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
    await server.close();
    throw error;
  }
}

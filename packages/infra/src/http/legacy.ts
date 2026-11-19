import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LegacyTeachingQueryService } from "@erp/core/application";
import {
  legacyContextSchema,
  legacyTrialSchema,
  legacyLedgerSchema,
  legacyTrialQuerySchema,
  legacyLedgerQuerySchema,
} from "@erp/core/contracts";
import { httpError } from "./errors.ts";

export { validateDevOrigin } from "./dev-origin.ts";

export const LEGACY_PATHS = new Set([
  "/api/v1/legacy/context",
  "/api/v1/legacy/trial",
  "/api/v1/legacy/ledger",
]);

export function financeHeaders(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff");
}

export class LocalFinanceBoundary {
  origin: string | undefined;

  private readonly devOrigin: string | undefined;
  constructor(devOrigin: string | undefined) {
    this.devOrigin = devOrigin;
  }

  assert(request: FastifyRequest, reply: FastifyReply, methods: readonly string[] = ["GET"]): void {
    financeHeaders(reply);
    const origin = this.origin;
    const site = request.headers["sec-fetch-site"];
    if (
      !origin ||
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin !== undefined &&
        request.headers.origin !== origin &&
        request.headers.origin !== this.devOrigin) ||
      (site !== undefined && !["same-origin", "same-site", "none"].includes(String(site)))
    ) {
      throw httpError(403);
    }
    if (!methods.includes(request.method)) {
      reply.header("Allow", methods.join(", "));
      throw httpError(405);
    }
  }
}

function queryValues(request: FastifyRequest): Record<string, string> {
  const query = new URLSearchParams(request.url.split("?").slice(1).join("?"));
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of query) {
    if (Object.hasOwn(values, key)) throw httpError(400);
    values[key] = value;
  }
  return values;
}

export function registerLegacyRoutes(
  server: FastifyInstance,
  service: LegacyTeachingQueryService | undefined,
  boundary: LocalFinanceBoundary,
): void {
  const prepare = (request: FastifyRequest, reply: FastifyReply): Record<string, string> => {
    // Protect the matched handler itself, including any router-normalized path.
    boundary.assert(request, reply);
    return queryValues(request);
  };

  const reader = (): LegacyTeachingQueryService => {
    if (!service) throw httpError(503);
    return service;
  };

  server.all("/api/v1/legacy/context", (request, reply) => {
    const query = prepare(request, reply);
    if (Object.keys(query).length) throw httpError(400);
    const parsed = legacyContextSchema.safeParse({ contractVersion: "1", ...reader().context() });
    if (!parsed.success) throw httpError(503);
    return parsed.data;
  });

  server.all("/api/v1/legacy/trial", (request, reply) => {
    const query = legacyTrialQuerySchema.safeParse(prepare(request, reply));
    if (!query.success) throw httpError(400);
    const { snapshot, month } = query.data;
    const parsed = legacyTrialSchema.safeParse({
      contractVersion: "1",
      ...reader().trial(snapshot, month),
    });
    if (!parsed.success) throw httpError(503);
    return parsed.data;
  });

  server.all("/api/v1/legacy/ledger", (request, reply) => {
    const query = legacyLedgerQuerySchema.safeParse(prepare(request, reply));
    if (!query.success) throw httpError(400);
    const { snapshot, month, account, limit, cursor } = query.data;
    const parsed = legacyLedgerSchema.safeParse({
      contractVersion: "1",
      ...reader().ledger(snapshot, {
        month,
        account,
        ...(limit !== undefined ? { limit: Number(limit) } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      }),
    });
    if (!parsed.success) throw httpError(503);
    return parsed.data;
  });
}

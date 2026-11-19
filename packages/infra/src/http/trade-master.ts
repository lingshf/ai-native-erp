import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApplicationServices } from "@erp/core/application";
import {
  tradeQuerySchema,
  tradeAtSchema,
  tradeWriteSchema,
  tradeConfigSchema,
  tradePageSchema,
  companyCodeSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { tradeKinds } from "@erp/core/domain";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";

function parse<T>(schema: ContractSchema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw httpError(400);
  return parsed.data;
}
export function registerTradeRoutes(
  server: FastifyInstance,
  service: ApplicationServices["trade"] | undefined,
  boundary: LocalFinanceBoundary,
) {
  const prepare = (request: FastifyRequest, reply: FastifyReply, methods: readonly string[]) => {
    boundary.assert(request, reply, methods);
    if (
      request.method !== "GET" &&
      request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json"
    )
      throw httpError(415);
    if (!service) throw httpError(503);
    return service;
  };
  for (const kind of tradeKinds) {
    server.all(`/api/v1/trade/${kind}`, async (request, reply) => {
      const app = prepare(request, reply, ["GET", "POST", "PUT"]);
      if (request.method === "GET") {
        const { company, limit, cursor, search } = parse(tradeQuerySchema, request.query);
        return tradePageSchema.parse(
          await app.list(company, kind, {
            limit: Number(limit),
            ...(cursor !== undefined ? { cursor } : {}),
            ...(search !== undefined ? { search } : {}),
          }),
        );
      }
      if (
        typeof request.query !== "object" ||
        request.query === null ||
        Object.keys(request.query).length
      )
        throw httpError(400);
      const command = parse(tradeWriteSchema, request.body);
      if (command.kind !== kind || (request.method === "POST") !== (command.expectedRevision === 0))
        throw httpError(400);
      return reply
        .code(request.method === "POST" ? 201 : 200)
        .send(tradeConfigSchema.parse(await app.save(command)));
    });
    server.all<{ Params: { code: string } }>(
      `/api/v1/trade/${kind}/:code`,
      async (request, reply) => {
        const app = prepare(request, reply, ["GET"]);
        const { company, at } = parse(tradeAtSchema, request.query);
        return tradeConfigSchema.parse(
          await app.get(company, kind, parse(companyCodeSchema, request.params.code), at),
        );
      },
    );
  }
}

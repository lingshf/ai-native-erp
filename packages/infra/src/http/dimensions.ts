import { DomainError, type ApplicationServices } from "@erp/core/application";
import {
  dimensionConfigSchema,
  dimensionPageSchema,
  dimensionQuerySchema,
  dimensionWriteSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import type { FastifyInstance } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";
function parse<T>(schema: ContractSchema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new DomainError("INVALID_INPUT", {
      scope: "dimensions",
      path:
        parsed.error.issues[0]?.path
          .filter(
            (key) =>
              typeof key === "number" ||
              (typeof key === "string" &&
                key !== "config" &&
                /^[A-Za-z][A-Za-z0-9_]{0,39}$/u.test(key)),
          )
          .join(".")
          .slice(0, 160) || "form",
      rule: "shape",
    });
  return parsed.data;
}
export function registerDimensionRoutes(
  server: FastifyInstance,
  service: ApplicationServices["dimensions"] | undefined,
  boundary: LocalFinanceBoundary,
): void {
  server.all("/api/v1/dimensions", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST", "PUT"]);
    if (!service) throw httpError(503);
    if (request.method === "GET") {
      const { company, kind, dimension, limit, cursor } = parse(
        dimensionQuerySchema,
        request.query,
      );
      return dimensionPageSchema.parse(
        await service.list(
          company,
          kind,
          { limit: Number(limit), ...(cursor !== undefined ? { cursor } : {}) },
          dimension,
        ),
      );
    }
    if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
      throw httpError(415);
    if (
      typeof request.query !== "object" ||
      request.query === null ||
      Object.keys(request.query).length
    )
      throw httpError(400);
    const { company, config } = parse(dimensionWriteSchema, request.body);
    if ((request.method === "POST") !== (config.revision === 0)) throw httpError(400);
    return reply
      .code(request.method === "POST" ? 201 : 200)
      .send(dimensionConfigSchema.parse(await service.save(company, config)));
  });
}

import { businessError } from "@erp/core/domain";
import type { ApplicationServices } from "@erp/core/application";
import type { ContractSchema } from "@erp/core/contracts";
import type { FastifyRequest } from "fastify";
import { httpError } from "./errors.ts";

export function parse<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) businessError("form", "shape");
  return parsed.data;
}

export function readyService(
  service: ApplicationServices["events"] | undefined,
  request: FastifyRequest,
) {
  if (!service) throw httpError(503);
  if (request.method !== "GET") {
    if (
      request.query === null ||
      typeof request.query !== "object" ||
      Object.keys(request.query).length
    )
      throw httpError(400);
    if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
      throw httpError(415);
  }
  return service;
}

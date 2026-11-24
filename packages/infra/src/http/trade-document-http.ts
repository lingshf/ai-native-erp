import type { FastifyRequest } from "fastify";
import type { ApplicationServices } from "@erp/core/application";
import type { ContractSchema } from "@erp/core/contracts";
import { DomainError } from "@erp/core/domain";
import { httpError } from "./errors.ts";

export function parse<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new DomainError("INVALID_INPUT", { scope: "tradeDocument", path: "form", rule: "shape" });
  return parsed.data;
}

export function tradeDocumentReady(service: ApplicationServices["tradeDocs"] | undefined) {
  return (request: FastifyRequest) => {
    if (!service) throw httpError(503);
    if (request.method !== "GET") {
      if (
        typeof request.query !== "object" ||
        request.query === null ||
        Object.keys(request.query).length
      )
        throw httpError(400);
      if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
        throw httpError(415);
    }
    return service;
  };
}

export type TradeDocumentReady = ReturnType<typeof tradeDocumentReady>;

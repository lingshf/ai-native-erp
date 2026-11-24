import type { FastifyRequest } from "fastify";
import type { ApplicationServices } from "@erp/core/application";
import type { ContractSchema } from "@erp/core/contracts";
import { DomainError } from "@erp/core/domain";
import { httpError } from "./errors.ts";

// Same lowercase UUIDv4 shape the services check with checkedJournalId; legacy opening item ids
// (openingItemId) are generated in this shape too.
const tradeId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function invalidInput(): DomainError {
  return new DomainError("INVALID_INPUT", { scope: "tradeDocument", path: "form", rule: "shape" });
}

export function parse<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidInput();
  return parsed.data;
}

/** Validates a `documentId` / `itemId` path parameter before it reaches the service. */
export function parseTradeId(value: string): string {
  if (!tradeId.test(value)) throw invalidInput();
  return value;
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

import { DomainError, type ApplicationServices } from "@erp/core/application";
import {
  journalSaveSchema,
  journalDraftSchema,
  journalPreviewRequestSchema,
  journalPreviewSchema,
  journalConfirmSchema,
  journalReceiptSchema,
  journalDeleteSchema,
  journalDeletedSchema,
  journalDetailQuerySchema,
  journalListQuerySchema,
  journalDetailSchema,
  journalPageSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";
function parse<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new DomainError("INVALID_INPUT", { scope: "journals", path: "form", rule: "shape" });
  return parsed.data;
}
function noQuery(request: FastifyRequest) {
  if (
    typeof request.query !== "object" ||
    request.query === null ||
    Object.keys(request.query).length
  )
    throw httpError(400);
}
export function registerJournalRoutes(
  server: FastifyInstance,
  service: ApplicationServices["journals"] | undefined,
  boundary: LocalFinanceBoundary,
): void {
  const ready = (request: FastifyRequest) => {
    if (!service) throw httpError(503);
    if (request.method !== "GET") {
      noQuery(request);
      if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
        throw httpError(415);
    }
    return service;
  };
  server.all("/api/v1/journals", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = ready(request);
    const { company, status, limit, cursor } = parse(journalListQuerySchema, request.query);
    return journalPageSchema.parse(
      await app.list(company, status, { limit: Number(limit), ...(cursor ? { cursor } : {}) }),
    );
  });
  for (const action of ["drafts", "reverse", "replace", "reclassify"] as const) {
    server.all(`/api/v1/journals/${action}`, async (request, reply) => {
      boundary.assert(request, reply, ["POST"]);
      const app = ready(request);
      const { company, draft } = parse(journalSaveSchema, request.body);
      if (
        draft.revision !== 0 ||
        (action === "drafts" ? draft.operation !== "journal" : draft.operation !== action)
      )
        throw httpError(400);
      return reply.code(201).send(journalDraftSchema.parse(await app.save(company, draft)));
    });
  }
  server.all<{ Params: { id: string } }>("/api/v1/journals/drafts/:id", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "PUT", "DELETE"]);
    const app = ready(request);
    if (request.method === "GET") {
      const { company } = parse(journalDetailQuerySchema, request.query);
      return journalDraftSchema.parse(await app.draft(company, request.params.id));
    }
    if (request.method === "DELETE") {
      const { company, revision } = parse(journalDeleteSchema, request.body);
      return journalDeletedSchema.parse(await app.remove(company, request.params.id, revision));
    }
    const { company, draft } = parse(journalSaveSchema, request.body);
    if (draft.id !== request.params.id || draft.revision === 0) throw httpError(400);
    return journalDraftSchema.parse(await app.save(company, draft));
  });
  server.all("/api/v1/journals/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const app = ready(request);
    const input = parse(journalPreviewRequestSchema, request.body);
    return journalPreviewSchema.parse(await app.preview(input.company, input.draft));
  });
  server.all("/api/v1/journals/confirm", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    return journalReceiptSchema.parse(
      await ready(request).confirm(parse(journalConfirmSchema, request.body)),
    );
  });
  server.all<{ Params: { id: string } }>("/api/v1/journals/:id", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = ready(request);
    const { company } = parse(journalDetailQuerySchema, request.query);
    return journalDetailSchema.parse(await app.entry(company, request.params.id));
  });
}

import { businessError } from "@erp/core/domain";
import type { BusinessEventService } from "@erp/core/application";
import { businessMasterSaveSchema, businessMasterSchema, postingRuleSaveSchema, postingRuleSchema, businessMastersPageSchema, postingRulesPageSchema, businessListQuerySchema, businessPreviewRequestSchema, businessPreviewSchema, businessConfirmSchema, businessResultSchema, businessEventsPageSchema, businessSelectionSchema, queueListQuerySchema, transferQueuePageSchema, journalEnqueueSchema, transferConfirmSchema, transferWithdrawSchema, openClearingQuerySchema, openClearingPageSchema, type ContractSchema } from "@erp/core/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";
function parse<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) businessError("form", "shape");
  return parsed.data;
}
export function registerBusinessRoutes(server: FastifyInstance, service: BusinessEventService | undefined, boundary: LocalFinanceBoundary) {
  const ready = (request: FastifyRequest) => {
    if (!service) throw httpError(503);
    if (request.method !== "GET") {
      if (request.query === null || typeof request.query !== "object" || Object.keys(request.query).length) throw httpError(400);
      if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") throw httpError(415);
    }
    return service;
  };
  for (const [path, kind] of [["services", "service"], ["parties", "party"]] as const) {
    server.all(`/api/v1/${path}`, async (request, reply) => {
      boundary.assert(request, reply, ["GET", "POST"]);
      const app = ready(request);
      if (request.method === "GET") {
        const { company, limit, cursor } = parse(businessListQuerySchema, request.query);
        return businessMastersPageSchema.parse(await app.masters(company, kind, { limit: Number(limit), ...(cursor ? { cursor } : {}) }));
      }
      const { company, value } = parse(businessMasterSaveSchema, request.body);
      return businessMasterSchema.parse(await app.saveMaster(company, kind, value));
    });
  }
  server.all("/api/v1/posting-rules", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]); const app = ready(request);
    if (request.method === "GET") {
      const { company, limit, cursor } = parse(businessListQuerySchema, request.query);
      return postingRulesPageSchema.parse(await app.rules(company, { limit: Number(limit), ...(cursor ? { cursor } : {}) }));
    }
    const { company, value } = parse(postingRuleSaveSchema, request.body);
    return postingRuleSchema.parse(await app.saveRule(company, value));
  });
  server.all("/api/v1/events", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]); const app = ready(request);
    const { company, limit, cursor } = parse(businessListQuerySchema, request.query);
    return businessEventsPageSchema.parse(await app.list(company, { limit: Number(limit), ...(cursor ? { cursor } : {}) }));
  });
  server.all("/api/v1/events/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]); const app = ready(request);
    const { company, event } = parse(businessPreviewRequestSchema, request.body);
    return businessPreviewSchema.parse(await app.preview(company, event));
  });
  server.all("/api/v1/events/confirm", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    return businessResultSchema.parse(await ready(request).confirm(parse(businessConfirmSchema, request.body)));
  });
  server.all("/api/v1/events/open-items", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]); const app = ready(request);
    const { company, account, date, limit, cursor } = parse(openClearingQuerySchema, request.query);
    return openClearingPageSchema.parse(await app.openItems(company, account, date, { limit: Number(limit), ...(cursor ? { cursor } : {}) }));
  });
  server.all<{ Params: { id: string } }>("/api/v1/events/:id", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]); const app = ready(request);
    const { company } = parse(businessSelectionSchema, request.query);
    return businessResultSchema.parse(await app.detail(company, request.params.id));
  });
  server.all("/api/v1/transfer-queue", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]); const app = ready(request);
    if (request.method === "GET") {
      const { company, status, limit, cursor } = parse(queueListQuerySchema, request.query);
      return transferQueuePageSchema.parse(await app.queue(company, status, { limit: Number(limit), ...(cursor ? { cursor } : {}) }));
    }
    return businessResultSchema.parse(await app.enqueue(parse(journalEnqueueSchema, request.body)));
  });
  for (const action of ["preview", "confirm", "withdraw"] as const) {
    server.all<{ Params: { id: string } }>(`/api/v1/transfer-queue/:id/${action}`, async (request, reply) => {
      boundary.assert(request, reply, ["POST"]); const app = ready(request);
      if (action === "preview") {
        const { company } = parse(businessSelectionSchema, request.body);
        return businessPreviewSchema.parse(await app.transferPreview(company, request.params.id));
      }
      if (action === "confirm") {
        const { company, fingerprint, confirmation } = parse(transferConfirmSchema, request.body);
        return businessResultSchema.parse(await app.transfer(company, request.params.id, fingerprint, confirmation));
      }
      const { company, reason, confirmation } = parse(transferWithdrawSchema, request.body);
      return businessResultSchema.parse(await app.withdraw(company, request.params.id, reason, confirmation));
    });
  }
}

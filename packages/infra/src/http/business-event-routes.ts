import type { ApplicationServices } from "@erp/core/application";
import {
  businessListQuerySchema,
  businessPreviewRequestSchema,
  businessPreviewSchema,
  businessConfirmSchema,
  businessResultSchema,
  businessEventsPageSchema,
  businessSelectionSchema,
  openClearingQuerySchema,
  openClearingPageSchema,
} from "@erp/core/contracts";
import type { FastifyInstance } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, readyService } from "./business-event-guards.ts";

export function registerBusinessEventRoutes(
  server: FastifyInstance,
  service: ApplicationServices["events"] | undefined,
  boundary: LocalFinanceBoundary,
) {
  server.all("/api/v1/events", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = readyService(service, request);
    const { company, limit, cursor } = parse(businessListQuerySchema, request.query);
    return businessEventsPageSchema.parse(
      await app.list(company, { limit: Number(limit), ...(cursor ? { cursor } : {}) }),
    );
  });
  server.all("/api/v1/events/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const app = readyService(service, request);
    const { company, event } = parse(businessPreviewRequestSchema, request.body);
    return businessPreviewSchema.parse(await app.preview(company, event));
  });
  server.all("/api/v1/events/confirm", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    return businessResultSchema.parse(
      await readyService(service, request).confirm(parse(businessConfirmSchema, request.body)),
    );
  });
  server.all("/api/v1/events/open-items", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = readyService(service, request);
    const { company, account, date, limit, cursor } = parse(openClearingQuerySchema, request.query);
    return openClearingPageSchema.parse(
      await app.openItems(company, account, date, {
        limit: Number(limit),
        ...(cursor ? { cursor } : {}),
      }),
    );
  });
  server.all<{ Params: { id: string } }>("/api/v1/events/:id", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = readyService(service, request);
    const { company } = parse(businessSelectionSchema, request.query);
    return businessResultSchema.parse(await app.detail(company, request.params.id));
  });
}

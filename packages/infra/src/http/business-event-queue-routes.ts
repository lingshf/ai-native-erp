import type { ApplicationServices } from "@erp/core/application";
import {
  businessPreviewSchema,
  businessResultSchema,
  businessSelectionSchema,
  queueListQuerySchema,
  transferQueuePageSchema,
  journalEnqueueSchema,
  transferConfirmSchema,
  transferWithdrawSchema,
} from "@erp/core/contracts";
import type { FastifyInstance } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, readyService } from "./business-event-guards.ts";

export function registerBusinessQueueRoutes(
  server: FastifyInstance,
  service: ApplicationServices["events"] | undefined,
  boundary: LocalFinanceBoundary,
) {
  server.all("/api/v1/transfer-queue", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]);
    const app = readyService(service, request);
    if (request.method === "GET") {
      const { company, status, limit, cursor } = parse(queueListQuerySchema, request.query);
      return transferQueuePageSchema.parse(
        await app.queue(company, status, { limit: Number(limit), ...(cursor ? { cursor } : {}) }),
      );
    }
    return businessResultSchema.parse(await app.enqueue(parse(journalEnqueueSchema, request.body)));
  });
  for (const action of ["preview", "confirm", "withdraw"] as const) {
    server.all<{ Params: { id: string } }>(
      `/api/v1/transfer-queue/:id/${action}`,
      async (request, reply) => {
        boundary.assert(request, reply, ["POST"]);
        const app = readyService(service, request);
        if (action === "preview") {
          const { company } = parse(businessSelectionSchema, request.body);
          return businessPreviewSchema.parse(await app.transferPreview(company, request.params.id));
        }
        if (action === "confirm") {
          const { company, fingerprint, confirmation } = parse(transferConfirmSchema, request.body);
          return businessResultSchema.parse(
            await app.transfer(company, request.params.id, fingerprint, confirmation),
          );
        }
        const { company, reason, confirmation } = parse(transferWithdrawSchema, request.body);
        return businessResultSchema.parse(
          await app.withdraw(company, request.params.id, reason, confirmation),
        );
      },
    );
  }
}

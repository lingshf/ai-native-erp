import type { FastifyInstance } from "fastify";
import type { AiAssistantService } from "@erp/core/application";
import { aiRequestSchema, aiDraftResultSchema, aiExplainResultSchema } from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";
export function registerAiRoutes(
  server: FastifyInstance,
  service: AiAssistantService | undefined,
  boundary: LocalFinanceBoundary,
) {
  for (const action of ["draft", "explain"] as const)
    server.all(`/api/v1/ai/${action}`, async (request, reply) => {
      boundary.assert(request, reply, ["POST"]);
      if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
        throw httpError(415);
      if (Object.keys(request.query ?? {}).length) throw httpError(400);
      const input = aiRequestSchema.safeParse(request.body);
      if (!input.success) throw httpError(400);
      if (!service) throw httpError(503);
      const controller = new AbortController();
      const cancel = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.once("close", cancel);
      try {
        return action === "draft"
          ? aiDraftResultSchema.parse(await service.draft(input.data, controller.signal))
          : aiExplainResultSchema.parse(await service.explain(input.data, controller.signal));
      } finally {
        reply.raw.removeListener("close", cancel);
      }
    });
}

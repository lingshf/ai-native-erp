import type { FastifyInstance } from "fastify";
import type { PeriodCloseService } from "@erp/core/application";
import {
  closePreviewRequestSchema,
  closeConfirmSchema,
  openNextSchema,
  closePreviewSchema,
  closeResultSchema,
  periodSchema,
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";
export function registerPeriodCloseRoutes(
  server: FastifyInstance,
  service: PeriodCloseService | undefined,
  boundary: LocalFinanceBoundary,
) {
  for (const action of ["close-preview", "close", "open-next"] as const) {
    server.all<{ Params: { id: string } }>(
      `/api/v1/periods/:id/${action}`,
      async (request, reply) => {
        boundary.assert(request, reply, ["POST"]);
        if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
          throw httpError(415);
        if (Object.keys(request.query ?? {}).length) throw httpError(400);
        if (!service) throw httpError(503);
        const month = periodSchema.shape.month.safeParse(request.params.id);
        if (!month.success) throw httpError(400);
        if (action === "close-preview") {
          const parsed = closePreviewRequestSchema.safeParse(request.body);
          if (!parsed.success) throw httpError(400);
          return closePreviewSchema.parse(
            await service.preview({ ...parsed.data, month: month.data }),
          );
        }
        if (action === "close") {
          const parsed = closeConfirmSchema.safeParse(request.body);
          if (!parsed.success) throw httpError(400);
          return closeResultSchema.parse(
            await service.confirm({ ...parsed.data, month: month.data }),
          );
        }
        const parsed = openNextSchema.safeParse(request.body);
        if (!parsed.success) throw httpError(400);
        return periodSchema.parse(
          await service.openNext(parsed.data.company, month.data, parsed.data.revision),
        );
      },
    );
  }
}

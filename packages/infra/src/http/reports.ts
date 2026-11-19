import type { ReportService } from "@erp/core/application";
import {
  reportQuerySchema,
  reportSchema,
  ledgerQuerySchema,
  ledgerSchema,
} from "@erp/core/contracts";
import type { FastifyInstance } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";
export function registerReportRoutes(
  server: FastifyInstance,
  service: ReportService | undefined,
  boundary: LocalFinanceBoundary,
) {
  for (const kind of ["trial", "income", "balance-sheet", "reconciliation"]) {
    server.all(`/api/v1/reports/${kind}`, async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      if (!service) throw httpError(503);
      const parsed = reportQuerySchema.safeParse(request.query);
      if (!parsed.success) throw httpError(400);
      const { company, month, stage, watermark } = parsed.data;
      return reportSchema.parse(
        await (kind === "reconciliation"
          ? service.reconciliation(
              company,
              month,
              stage,
              watermark === undefined ? undefined : Number(watermark),
            )
          : service.report(
              company,
              month,
              stage,
              watermark === undefined ? undefined : Number(watermark),
            )),
      );
    });
  }
  server.all("/api/v1/ledger", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    if (!service) throw httpError(503);
    const parsed = ledgerQuerySchema.safeParse(request.query);
    if (!parsed.success) throw httpError(400);
    const { company, account, month, limit, cursor, dimension, value, stage, watermark } =
      parsed.data;
    return ledgerSchema.parse(
      await service.ledger(company, account, month, {
        limit: Number(limit),
        stage,
        ...(watermark === undefined ? {} : { watermark: Number(watermark) }),
        ...(cursor ? { cursor } : {}),
        ...(dimension && value !== undefined
          ? { dimension, value: value === "~" ? null : value }
          : {}),
      }),
    );
  });
}

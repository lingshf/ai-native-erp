import type { FastifyInstance } from "fastify";
import {
  tradeItemDetailSchema,
  tradeReconciliationSchema,
  tradeReportQuerySchema,
  tradeReportSchema,
  tradeReportingScopeSchema,
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, type TradeDocumentReady } from "./trade-document-http.ts";

// These routes parse the query before checking the service: without a service a bad query is 400.
export function registerTradeReportRoutes(
  server: FastifyInstance,
  ready: TradeDocumentReady,
  boundary: LocalFinanceBoundary,
): void {
  server.all("/api/v1/trade/reports/open-items", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const { company, limit, ...query } = parse(tradeReportQuerySchema, request.query);
    return tradeReportSchema.parse(
      await ready(request).report(company, { ...query, limit: Number(limit) }),
    );
  });
  server.all("/api/v1/trade/reports/reconciliation", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const { company, month } = parse(tradeReportingScopeSchema, request.query);
    return tradeReconciliationSchema.parse(await ready(request).reconciliation(company, month));
  });
  server.all<{ Params: { itemId: string } }>(
    "/api/v1/trade/reports/open-items/:itemId",
    async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      const { company, month } = parse(tradeReportingScopeSchema, request.query);
      return tradeItemDetailSchema.parse(
        await ready(request).itemDetail(company, request.params.itemId, month),
      );
    },
  );
}

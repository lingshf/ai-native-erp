import type { FastifyInstance } from "fastify";
import {
  tradeItemDetailSchema,
  tradeReconciliationSchema,
  tradeReportQuerySchema,
  tradeReportSchema,
  tradeReportingScopeSchema,
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, parseTradeId, type TradeDocumentReady } from "./trade-document-http.ts";

export function registerTradeReportRoutes(
  server: FastifyInstance,
  ready: TradeDocumentReady,
  boundary: LocalFinanceBoundary,
): void {
  server.all("/api/v1/trade/reports/open-items", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = ready(request);
    const { company, limit, ...query } = parse(tradeReportQuerySchema, request.query);
    return tradeReportSchema.parse(await app.report(company, { ...query, limit: Number(limit) }));
  });
  server.all("/api/v1/trade/reports/reconciliation", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = ready(request);
    const { company, month } = parse(tradeReportingScopeSchema, request.query);
    return tradeReconciliationSchema.parse(await app.reconciliation(company, month));
  });
  server.all<{ Params: { itemId: string } }>(
    "/api/v1/trade/reports/open-items/:itemId",
    async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      const app = ready(request);
      const { company, month } = parse(tradeReportingScopeSchema, request.query);
      const itemId = parseTradeId(request.params.itemId);
      return tradeItemDetailSchema.parse(await app.itemDetail(company, itemId, month));
    },
  );
}

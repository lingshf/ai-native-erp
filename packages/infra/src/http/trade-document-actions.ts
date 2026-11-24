import type { FastifyInstance } from "fastify";
import {
  tradeActionCommandSchema,
  tradeActionConfirmSchema,
  tradeActionListSchema,
  tradeActionPreviewSchema,
  tradeActionReceiptSchema,
  tradeCompanyQuerySchema,
  tradeSettlementCommandSchema,
  tradeSettlementConfirmSchema,
  tradeSettlementPreviewSchema,
  tradeSettlementReceiptSchema,
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, type TradeDocumentReady } from "./trade-document-http.ts";

export function registerTradeActionRoutes(
  server: FastifyInstance,
  ready: TradeDocumentReady,
  boundary: LocalFinanceBoundary,
): void {
  server.all("/api/v1/trade/actions/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    return tradeActionPreviewSchema.parse(
      await ready(request).previewAction(parse(tradeActionCommandSchema, request.body)),
    );
  });
  server.all("/api/v1/trade/actions", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const receipt = await ready(request).confirmAction(
      parse(tradeActionConfirmSchema, request.body),
    );
    return reply.code(201).send(tradeActionReceiptSchema.parse(receipt));
  });
  server.all<{ Params: { itemId: string } }>(
    "/api/v1/trade/open-items/:itemId/actions",
    async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      const { company } = parse(tradeCompanyQuerySchema, request.query);
      return tradeActionListSchema.parse(
        await ready(request).actions(company, request.params.itemId),
      );
    },
  );
  server.all("/api/v1/trade/settlements/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    return tradeSettlementPreviewSchema.parse(
      await ready(request).previewSettlement(parse(tradeSettlementCommandSchema, request.body)),
    );
  });
  server.all("/api/v1/trade/settlements", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const receipt = await ready(request).confirmSettlement(
      parse(tradeSettlementConfirmSchema, request.body),
    );
    return reply.code(201).send(tradeSettlementReceiptSchema.parse(receipt));
  });
}

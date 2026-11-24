import type { FastifyInstance } from "fastify";
import {
  companyCodeSchema,
  tradeCompanyQuerySchema,
  tradeOrderCommandSchema,
  tradeOrderInvoicingSchema,
  tradeOrderListQuerySchema,
  tradeOrderPageSchema,
  tradeOrderPreviewSchema,
  tradeOrderSchema,
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, type TradeDocumentReady } from "./trade-document-http.ts";

// Order routes are registered in two calls to keep the original registration order.
export function registerOrderEntryRoutes(
  server: FastifyInstance,
  ready: TradeDocumentReady,
  boundary: LocalFinanceBoundary,
): void {
  server.all("/api/v1/trade/orders", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]);
    const app = ready(request);
    if (request.method === "GET") {
      const { company, limit, cursor, party, side, from, to, invoicing } = parse(
        tradeOrderListQuerySchema,
        request.query,
      );
      return tradeOrderPageSchema.parse(
        await app.listOrders(company, {
          limit: Number(limit),
          ...(cursor ? { cursor } : {}),
          ...(party ? { party } : {}),
          ...(side ? { side } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(invoicing ? { invoicing } : {}),
        }),
      );
    }
    const order = await app.createOrder(parse(tradeOrderCommandSchema, request.body));
    return reply.code(201).send(tradeOrderSchema.parse(order));
  });
  server.all("/api/v1/trade/orders/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const app = ready(request);
    return tradeOrderPreviewSchema.parse(
      await app.previewOrder(parse(tradeOrderCommandSchema, request.body)),
    );
  });
}

export function registerOrderLookupRoutes(
  server: FastifyInstance,
  ready: TradeDocumentReady,
  boundary: LocalFinanceBoundary,
): void {
  server.all<{ Params: { orderId: string } }>(
    "/api/v1/trade/orders/:orderId",
    async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      const app = ready(request);
      const { company } = parse(tradeCompanyQuerySchema, request.query);
      return tradeOrderSchema.parse(
        await app.order(company, parse(companyCodeSchema, request.params.orderId)),
      );
    },
  );
  server.all<{ Params: { orderId: string } }>(
    "/api/v1/trade/orders/:orderId/invoicing",
    async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      const app = ready(request);
      const { company } = parse(tradeCompanyQuerySchema, request.query);
      return tradeOrderInvoicingSchema.parse(
        await app.orderInvoicing(company, parse(companyCodeSchema, request.params.orderId)),
      );
    },
  );
}

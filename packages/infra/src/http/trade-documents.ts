import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ApplicationServices } from "@erp/core/application";
import {
  companyCodeSchema,
  openItemPageSchema,
  openItemQuerySchema,
  tradeCompanyQuerySchema,
  tradeInvoiceCommandSchema,
  tradeInvoiceConfirmSchema,
  tradeInvoiceDetailSchema,
  tradeInvoiceListQuerySchema,
  tradeInvoicePageSchema,
  tradeInvoicePreviewSchema,
  tradeInvoiceReceiptSchema,
  tradeOrderCommandSchema,
  tradeOrderInvoicingSchema,
  tradeOrderListQuerySchema,
  tradeOrderPageSchema,
  tradeOrderPreviewSchema,
  tradeOrderSchema,
  tradeSettlementCommandSchema,
  tradeSettlementConfirmSchema,
  tradeSettlementPreviewSchema,
  tradeSettlementReceiptSchema,
  tradeActionCommandSchema,
  tradeActionConfirmSchema,
  tradeActionPreviewSchema,
  tradeActionReceiptSchema,
  tradeActionListSchema,
  tradeReportQuerySchema,
  tradeReportSchema,
  tradeReportingScopeSchema,
  tradeReconciliationSchema,
  tradeItemDetailSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { DomainError } from "@erp/core/domain";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";

function parse<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new DomainError("INVALID_INPUT", { scope: "tradeDocument", path: "form", rule: "shape" });
  return parsed.data;
}
export function registerTradeDocumentRoutes(
  server: FastifyInstance,
  service: ApplicationServices["tradeDocs"] | undefined,
  boundary: LocalFinanceBoundary,
): void {
  const ready = (request: FastifyRequest) => {
    if (!service) throw httpError(503);
    if (request.method !== "GET") {
      if (
        typeof request.query !== "object" ||
        request.query === null ||
        Object.keys(request.query).length
      )
        throw httpError(400);
      if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json")
        throw httpError(415);
    }
    return service;
  };
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
  server.all("/api/v1/trade/orders", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]);
    const app = ready(request);
    if (request.method === "GET") {
      const { company, limit, cursor, party, side, from, to } = parse(
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
  server.all("/api/v1/trade/invoices/preview", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const app = ready(request);
    return tradeInvoicePreviewSchema.parse(
      await app.preview(parse(tradeInvoiceCommandSchema, request.body)),
    );
  });
  server.all("/api/v1/trade/invoices", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]);
    const app = ready(request);
    if (request.method === "GET") {
      const { company, limit, cursor } = parse(tradeInvoiceListQuerySchema, request.query);
      return tradeInvoicePageSchema.parse(
        await app.list(company, { limit: Number(limit), ...(cursor ? { cursor } : {}) }),
      );
    }
    const receipt = await app.confirm(parse(tradeInvoiceConfirmSchema, request.body));
    return reply.code(201).send(tradeInvoiceReceiptSchema.parse(receipt));
  });
  server.all<{ Params: { documentId: string } }>(
    "/api/v1/trade/invoices/:documentId",
    async (request, reply) => {
      boundary.assert(request, reply, ["GET"]);
      const app = ready(request);
      const { company } = parse(tradeCompanyQuerySchema, request.query);
      return tradeInvoiceDetailSchema.parse(await app.detail(company, request.params.documentId));
    },
  );
  server.all("/api/v1/trade/open-items", async (request, reply) => {
    boundary.assert(request, reply, ["GET"]);
    const app = ready(request);
    const { company, limit, cursor, party, status } = parse(openItemQuerySchema, request.query);
    return openItemPageSchema.parse(
      await app.openItems(company, {
        limit: Number(limit),
        ...(cursor ? { cursor } : {}),
        ...(party ? { party } : {}),
        ...(status ? { status } : {}),
      }),
    );
  });
}

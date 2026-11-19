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
  tradeOrderSchema,
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
  server.all("/api/v1/trade/orders", async (request, reply) => {
    boundary.assert(request, reply, ["POST"]);
    const app = ready(request);
    const order = await app.createOrder(parse(tradeOrderCommandSchema, request.body));
    return reply.code(201).send(tradeOrderSchema.parse(order));
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

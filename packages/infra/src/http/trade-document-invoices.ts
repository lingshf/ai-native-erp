import type { FastifyInstance } from "fastify";
import {
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
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, type TradeDocumentReady } from "./trade-document-http.ts";

export function registerInvoiceRoutes(
  server: FastifyInstance,
  ready: TradeDocumentReady,
  boundary: LocalFinanceBoundary,
): void {
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
      const { company, limit, cursor, party, side, from, to } = parse(
        tradeInvoiceListQuerySchema,
        request.query,
      );
      return tradeInvoicePageSchema.parse(
        await app.list(company, {
          limit: Number(limit),
          ...(cursor ? { cursor } : {}),
          ...(party ? { party } : {}),
          ...(side ? { side } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
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

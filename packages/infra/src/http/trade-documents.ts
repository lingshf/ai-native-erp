import type { FastifyInstance } from "fastify";
import type { ApplicationServices } from "@erp/core/application";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { registerTradeActionRoutes } from "./trade-document-actions.ts";
import { tradeDocumentReady } from "./trade-document-http.ts";
import { registerInvoiceRoutes } from "./trade-document-invoices.ts";
import { registerOrderEntryRoutes, registerOrderLookupRoutes } from "./trade-document-orders.ts";
import { registerTradeReportRoutes } from "./trade-document-reports.ts";

export function registerTradeDocumentRoutes(
  server: FastifyInstance,
  service: ApplicationServices["tradeDocs"] | undefined,
  boundary: LocalFinanceBoundary,
): void {
  const ready = tradeDocumentReady(service);
  registerTradeReportRoutes(server, ready, boundary);
  registerOrderEntryRoutes(server, ready, boundary);
  registerTradeActionRoutes(server, ready, boundary);
  registerOrderLookupRoutes(server, ready, boundary);
  registerInvoiceRoutes(server, ready, boundary);
}

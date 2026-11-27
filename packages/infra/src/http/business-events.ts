import type { ApplicationServices } from "@erp/core/application";
import type { FastifyInstance } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { registerBusinessMasterRoutes } from "./business-event-master-routes.ts";
import { registerBusinessEventRoutes } from "./business-event-routes.ts";
import { registerBusinessQueueRoutes } from "./business-event-queue-routes.ts";

export function registerBusinessRoutes(
  server: FastifyInstance,
  service: ApplicationServices["events"] | undefined,
  boundary: LocalFinanceBoundary,
) {
  registerBusinessMasterRoutes(server, service, boundary);
  registerBusinessEventRoutes(server, service, boundary);
  registerBusinessQueueRoutes(server, service, boundary);
}

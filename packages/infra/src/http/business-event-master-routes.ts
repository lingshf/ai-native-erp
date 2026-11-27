import type { ApplicationServices } from "@erp/core/application";
import {
  businessMasterSaveSchema,
  businessMasterSchema,
  postingRuleSaveSchema,
  postingRuleSchema,
  businessMastersPageSchema,
  postingRulesPageSchema,
  businessListQuerySchema,
} from "@erp/core/contracts";
import type { FastifyInstance } from "fastify";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { parse, readyService } from "./business-event-guards.ts";

export function registerBusinessMasterRoutes(
  server: FastifyInstance,
  service: ApplicationServices["events"] | undefined,
  boundary: LocalFinanceBoundary,
) {
  for (const [path, kind] of [
    ["services", "service"],
    ["parties", "party"],
  ] as const) {
    server.all(`/api/v1/${path}`, async (request, reply) => {
      boundary.assert(request, reply, ["GET", "POST"]);
      const app = readyService(service, request);
      if (request.method === "GET") {
        const { company, limit, cursor } = parse(businessListQuerySchema, request.query);
        return businessMastersPageSchema.parse(
          await app.masters(company, kind, { limit: Number(limit), ...(cursor ? { cursor } : {}) }),
        );
      }
      const { company, value } = parse(businessMasterSaveSchema, request.body);
      return businessMasterSchema.parse(await app.saveMaster(company, kind, value));
    });
  }
  server.all("/api/v1/posting-rules", async (request, reply) => {
    boundary.assert(request, reply, ["GET", "POST"]);
    const app = readyService(service, request);
    if (request.method === "GET") {
      const { company, limit, cursor } = parse(businessListQuerySchema, request.query);
      return postingRulesPageSchema.parse(
        await app.rules(company, { limit: Number(limit), ...(cursor ? { cursor } : {}) }),
      );
    }
    const { company, value } = parse(postingRuleSaveSchema, request.body);
    return postingRuleSchema.parse(await app.saveRule(company, value));
  });
}

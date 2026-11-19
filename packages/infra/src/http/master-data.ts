import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MasterDataService } from "@erp/core/application";
import {
  companyInputSchema,
  companySchema,
  companyCodeSchema,
  companiesQuerySchema,
  companiesPageSchema,
  accountCommandSchema,
  accountSchema,
  accountCodeSchema,
  accountsQuerySchema,
  accountsPageSchema,
  accountAtQuerySchema,
  periodCommandSchema,
  periodSchema,
  periodsQuerySchema,
  periodsPageSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import type { LocalFinanceBoundary } from "./legacy.ts";
import { httpError } from "./errors.ts";

export function isMasterDataPath(path: string): boolean {
  return /^\/api\/v1\/(?:companies|accounts|periods|dimensions|journals|services|parties|posting-rules|events|transfer-queue|reports|ledger)(?:\/|$)/u.test(
    path,
  );
}
function parse<T>(schema: ContractSchema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw httpError(400);
  return parsed.data;
}
function noQuery(request: FastifyRequest): void {
  const query = request.query;
  if (typeof query !== "object" || query === null || Object.keys(query).length)
    throw httpError(400);
}
export function registerMasterDataRoutes(
  server: FastifyInstance,
  service: MasterDataService | undefined,
  boundary: LocalFinanceBoundary,
): void {
  const prepare = (request: FastifyRequest, reply: FastifyReply, methods: readonly string[]) => {
    boundary.assert(request, reply, methods);
    if (
      request.method !== "GET" &&
      request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json"
    )
      throw httpError(415);
    if (!service) throw httpError(503);
    return service;
  };
  server.all("/api/v1/companies", async (request, reply) => {
    const app = prepare(request, reply, ["GET", "POST"]);
    if (request.method === "GET") {
      const { limit, cursor } = parse(companiesQuerySchema, request.query);
      return companiesPageSchema.parse(
        await app.companies({ limit: Number(limit), ...(cursor !== undefined ? { cursor } : {}) }),
      );
    }
    noQuery(request);
    const created = await app.createCompany(parse(companyInputSchema, request.body));
    return reply.code(201).send(companySchema.parse(created));
  });
  server.all("/api/v1/accounts", async (request, reply) => {
    const app = prepare(request, reply, ["GET", "POST", "PUT"]);
    if (request.method === "GET") {
      const { company, limit, cursor } = parse(accountsQuerySchema, request.query);
      return accountsPageSchema.parse(
        await app.accounts(company, {
          limit: Number(limit),
          ...(cursor !== undefined ? { cursor } : {}),
        }),
      );
    }
    noQuery(request);
    const { company, revision, ...fields } = parse(accountCommandSchema, request.body);
    if ((request.method === "POST") !== (revision === 0)) throw httpError(400);
    const saved = await app.saveAccount(company, fields, revision);
    return reply.code(request.method === "POST" ? 201 : 200).send(accountSchema.parse(saved));
  });
  server.all<{ Params: { code: string } }>("/api/v1/accounts/:code", async (request, reply) => {
    const app = prepare(request, reply, ["GET"]);
    const { company, at } = parse(accountAtQuerySchema, request.query);
    const code = parse(accountCodeSchema, request.params.code);
    parse(companyCodeSchema, company);
    return accountSchema.parse(await app.account(company, code, at));
  });
  server.all("/api/v1/periods", async (request, reply) => {
    const app = prepare(request, reply, ["GET", "PUT"]);
    if (request.method === "GET") {
      const { company, limit, cursor } = parse(periodsQuerySchema, request.query);
      return periodsPageSchema.parse(
        await app.periods(company, {
          limit: Number(limit),
          ...(cursor !== undefined ? { cursor } : {}),
        }),
      );
    }
    noQuery(request);
    const { company, month, revision, status, reason, confirmed } = parse(
      periodCommandSchema,
      request.body,
    );
    return periodSchema.parse(
      await app.setPeriod(company, month, revision, status, reason, confirmed),
    );
  });
}

import { z } from "zod";
import { migrationStatusSchema } from "./migration.ts";
export * from "./migration.ts";
import { aiOpenApi } from "./ai-assistant.ts";
import { tradeMasterOpenApi } from "./trade-master.ts";
import { tradeDocumentsOpenApi } from "./trade-documents.ts";
import { tradeReportingOpenApi } from "./trade-reporting.ts";
export * from "./trade-reporting.ts";
export * from "./trade-documents.ts";
export * from "./trade-master.ts";
export * from "./ai-assistant.ts";
import { masterDataOpenApi } from "./master-data.ts";
import { dimensionsOpenApi } from "./dimensions.ts";
import { journalsOpenApi } from "./journals.ts";
import { businessEventsOpenApi } from "./business-events.ts";
import { reportsOpenApi } from "./reports.ts";
import { periodCloseOpenApi } from "./period-close.ts";
export * from "./period-close.ts";
export * from "./reports.ts";
export * from "./dimensions.ts";
import {
  legacyContextSchema,
  legacyTrialSchema,
  legacyLedgerSchema,
  legacyTrialQuerySchema,
  legacyLedgerQuerySchema,
} from "./legacy.ts";
export * from "./legacy.ts";
export * from "./master-data.ts";

export const healthSchema = z.strictObject({
  service: z.literal("ai-native-erp"),
  contractVersion: z.literal("1"),
  profile: z.literal("local"),
  data: z.enum(["unconfigured", "configured"]),
});

export const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNAVAILABLE",
  "INTERNAL_ERROR",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_CANCELLED",
  "AI_BUSY",
  "AI_RESPONSE",
  "AI_CLEANUP",
]);

export const errorSchema = z.strictObject({
  code: errorCodeSchema,
  messageKey: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
  fieldErrors: z.array(z.strictObject({ path: z.string(), messageKey: z.string().min(1) })),
  requestId: z.uuid(),
  retryable: z.boolean(),
});

export type HealthResponse = z.infer<typeof healthSchema>;
export type ErrorResponse = z.infer<typeof errorSchema>;

const response = (description: string, schema: string) => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
});

function legacyOperation(
  operationId: string,
  schema: string,
  query?: typeof legacyTrialQuerySchema | typeof legacyLedgerQuerySchema,
) {
  const querySchema = query ? z.toJSONSchema(query, { target: "draft-2020-12" }) : undefined;
  return {
    get: {
      operationId,
      parameters: Object.entries(querySchema?.properties ?? {}).map(([name, value]) => ({
        name,
        in: "query",
        required: querySchema?.required?.includes(name) ?? false,
        schema: value,
      })),
      responses: {
        "200": response(
          "Explicit verified read-only snapshot; not a live business ledger.",
          schema,
        ),
        ...Object.fromEntries(
          [400, 403, 404, 405, 409, 415, 500, 503].map((status) => [
            String(status),
            response("Explicit redacted snapshot query error.", "ErrorResponse"),
          ]),
        ),
      },
    },
  };
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "AI Native ERP Local runtime contract", version: "1" },
  paths: {
    "/api/v1/migration": legacyOperation("getMigrationStatus", "MigrationStatusResponse"),
    ...tradeMasterOpenApi.paths,
    ...tradeDocumentsOpenApi.paths,
    ...tradeReportingOpenApi.paths,
    ...aiOpenApi.paths,
    ...reportsOpenApi.paths,
    ...periodCloseOpenApi.paths,
    ...dimensionsOpenApi.paths,
    ...journalsOpenApi.paths,
    ...businessEventsOpenApi.paths,
    ...masterDataOpenApi.paths,
    "/api/v1/legacy/context": legacyOperation("getLegacyContext", "LegacyContextResponse"),
    "/api/v1/legacy/trial": legacyOperation(
      "getLegacyTrial",
      "LegacyTrialResponse",
      legacyTrialQuerySchema,
    ),
    "/api/v1/legacy/ledger": legacyOperation(
      "getLegacyLedger",
      "LegacyLedgerResponse",
      legacyLedgerQuerySchema,
    ),
    "/api/v1/health": {
      get: {
        operationId: "getRuntimeHealth",
        responses: {
          "200": response("Local runtime; no ledger is opened by this endpoint.", "HealthResponse"),
          ...Object.fromEntries(
            [400, 404, 405, 415, 500, 503].map((status) => [
              String(status),
              response("Explicit runtime error.", "ErrorResponse"),
            ]),
          ),
        },
      },
    },
  },
  components: {
    schemas: {
      MigrationStatusResponse: z.toJSONSchema(migrationStatusSchema, { target: "draft-2020-12" }),
      ...tradeMasterOpenApi.schemas,
      ...tradeDocumentsOpenApi.schemas,
      ...tradeReportingOpenApi.schemas,
      ...aiOpenApi.schemas,
      ...reportsOpenApi.schemas,
      ...periodCloseOpenApi.schemas,
      ...dimensionsOpenApi.schemas,
      ...journalsOpenApi.schemas,
      ...businessEventsOpenApi.schemas,
      ...masterDataOpenApi.schemas,
      HealthResponse: z.toJSONSchema(healthSchema, { target: "draft-2020-12" }),
      ErrorResponse: z.toJSONSchema(errorSchema, { target: "draft-2020-12" }),
      LegacyContextResponse: z.toJSONSchema(legacyContextSchema, { target: "draft-2020-12" }),
      LegacyTrialResponse: z.toJSONSchema(legacyTrialSchema, { target: "draft-2020-12" }),
      LegacyLedgerResponse: z.toJSONSchema(legacyLedgerSchema, { target: "draft-2020-12" }),
    },
  },
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function verifyOpenApi(document: unknown): void {
  if (JSON.stringify(stable(document)) !== JSON.stringify(stable(openApiDocument))) {
    throw new Error("OpenAPI artifact differs from its single-source runtime contracts.");
  }
}
export * from "./journals.ts";
export * from "./business-events.ts";

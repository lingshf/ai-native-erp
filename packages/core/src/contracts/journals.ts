import { z } from "zod";
import { companyCodeSchema, revisionSchema } from "./master-data.ts";
import { dimensionMapSchema, dimensionCodeSchema, dimensionValueCodeSchema } from "./dimensions.ts";
const id = z.uuidv4();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/u);
const operation = z.enum(["journal", "reverse", "replace", "reclassify"]);
const kind = z.enum(["normal", "adjusting"]);
const sourceRef = z.string().regex(/^[ -~]{0,100}$/u);
const suspense = z
  .strictObject({
    owner: z.string().max(80),
    reason: z.string().max(200),
    reviewDate: z.string().max(10),
  })
  .nullable();
export const journalInputLineSchema = z.strictObject({
  account: z.string().regex(/^(?:[1-9]\d{3})?$/u),
  debit: z.string().max(40),
  credit: z.string().max(40),
  dimensions: dimensionMapSchema,
  suspense,
});
export const journalDraftSchema = z.strictObject({
  id,
  revision: revisionSchema,
  sourceRef,
  date: z.string().max(10),
  documentDate: z.string().max(10).optional(),
  taxDate: z.string().max(10).optional(),
  memo: z.string().max(200),
  kind,
  operation,
  originalId: id.nullable(),
  headerDimensions: dimensionMapSchema,
  lines: z.array(journalInputLineSchema).max(500),
});
export const journalSaveSchema = z.strictObject({
  company: companyCodeSchema,
  draft: journalDraftSchema,
});
const selection = { company: companyCodeSchema, draftId: id, revision: revisionSchema };
export const journalPreviewRequestSchema = journalSaveSchema;
export const journalConfirmSchema = z.strictObject({
  ...selection,
  fingerprint,
  idempotencyKey: id,
  confirmation: z.literal("POST"),
});
export const journalDeleteSchema = z.strictObject({
  company: companyCodeSchema,
  revision: revisionSchema,
});
export const journalDeletedSchema = z.strictObject({ deleted: id });
export const journalDetailQuerySchema = z.strictObject({ company: companyCodeSchema });
export const journalListQuerySchema = z.strictObject({
  company: companyCodeSchema,
  status: z.enum(["draft", "posted"]).default("posted"),
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/u)
    .default("100"),
  cursor: id.optional(),
});
const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const origins = z.record(
  dimensionCodeSchema,
  z.array(
    z.strictObject({
      source: z.string().max(200),
      previous: dimensionValueCodeSchema.nullable().optional(),
      value: dimensionValueCodeSchema.nullable(),
    }),
  ),
);
export const journalLineSchema = z.strictObject({
  account: z.string().regex(/^[1-9]\d{3}$/u),
  debit: minor,
  credit: minor,
  dimensions: dimensionMapSchema,
  dimensionOrigins: origins,
  role: z.enum(["business", "balance", "historical"]),
  suspense,
  balancing: z
    .strictObject({
      dimension: dimensionCodeSchema,
      value: dimensionValueCodeSchema,
      businessNet: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
      configurationRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    })
    .nullable(),
  historical: z.strictObject({ entryId: id, lineNo: z.number().int().min(1).max(2000) }).nullable(),
  group: z.enum(["originalReverse", "newAllocation"]).nullable(),
});
const planned = {
  kind: z.enum(["normal", "adjusting", "closing"]),
  role: z.enum(["normal", "reversal", "reclassification"]),
  lines: z.array(journalLineSchema).min(2).max(2000),
  debit: minor,
  credit: minor,
};
export const journalEntrySchema = z.strictObject({
  ...planned,
  id,
  sourceRef,
  date: z.iso.date(),
  documentDate: z.iso.date(),
  taxDate: z.iso.date(),
  module: companyCodeSchema.nullable().default(null),
  memo: z.string().max(200),
  operation,
  postedAt: z.iso.datetime(),
  fingerprint,
});
const correction = z.strictObject({
  originalId: id,
  outputId: id,
  operation: z.enum(["reverse", "replace", "reclassify"]),
  date: z.iso.date(),
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export const journalDetailSchema = z.strictObject({
  entry: journalEntrySchema,
  chain: z.array(correction),
  businessEventId: id.nullable(),
});
export const journalPlanSchema = z.strictObject({
  version: z.literal(1),
  company: companyCodeSchema,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  scale: z.number().int().min(0).max(4),
  draftId: id,
  draftRevision: revisionSchema,
  sourceRef,
  date: z.iso.date(),
  documentDate: z.iso.date(),
  taxDate: z.iso.date(),
  module: companyCodeSchema.nullable().default(null),
  memo: z.string().max(200),
  operation,
  originalId: id.nullable(),
  journals: z.array(z.strictObject(planned)).min(1).max(2),
});
export const journalPreviewSchema = z.strictObject({ fingerprint, plan: journalPlanSchema });
export const journalReceiptSchema = z.strictObject({
  company: companyCodeSchema,
  sourceRef,
  idempotencyKey: id,
  draftId: id,
  draftRevision: revisionSchema,
  fingerprint,
  operation: z.enum([
    "journal",
    "reverse",
    "replace",
    "reclassify",
    "cash_service",
    "cash_service.cancel",
    "statistics",
    "clearing.match",
    "period.close",
  ]),
  module: companyCodeSchema.nullable().default(null),
  journalIds: z.array(id).max(10),
  postedAt: z.iso.datetime(),
});
export const journalPageSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id,
        date: z.string().max(10),
        sourceRef,
        memo: z.string().max(200),
        operation,
        revision: revisionSchema.nullable(),
      }),
    )
    .max(500),
  nextCursor: id.nullable(),
});
export type JournalDraftDto = z.infer<typeof journalDraftSchema>;
export type JournalPreviewDto = z.infer<typeof journalPreviewSchema>;
export type JournalEntryDto = z.infer<typeof journalEntrySchema>;
export type JournalPageDto = z.infer<typeof journalPageSchema>;
export type JournalReceiptDto = z.infer<typeof journalReceiptSchema>;
export type JournalDetailDto = z.infer<typeof journalDetailSchema>;
const components = {
  JournalDraft: journalDraftSchema,
  JournalSave: journalSaveSchema,
  JournalPreviewRequest: journalPreviewRequestSchema,
  JournalPreview: journalPreviewSchema,
  JournalConfirm: journalConfirmSchema,
  JournalReceipt: journalReceiptSchema,
  JournalDelete: journalDeleteSchema,
  JournalDeleted: journalDeletedSchema,
  JournalDetail: journalDetailSchema,
  JournalPage: journalPageSchema,
};
function httpOperation(
  operationId: string,
  output: keyof typeof components,
  input?: keyof typeof components,
  query?: z.ZodType,
  withId = false,
) {
  const querySchema = query ? z.toJSONSchema(query) : undefined;
  return {
    operationId,
    parameters: [
      ...(withId ? [{ name: "id", in: "path", required: true, schema: z.toJSONSchema(id) }] : []),
      ...Object.entries(querySchema?.properties ?? {}).map(([name, schema]) => ({
        name,
        in: "query",
        required: querySchema?.required?.includes(name) ?? false,
        schema,
      })),
    ],
    ...(input
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: `#/components/schemas/${input}` } } },
          },
        }
      : {}),
    responses: Object.fromEntries(
      [
        200,
        ...(operationId.startsWith("create") ? [201] : []),
        400,
        403,
        404,
        405,
        409,
        415,
        500,
        503,
      ].map((status) => [
        String(status),
        {
          description: status < 300 ? "Explicit local journal result." : "Redacted journal error.",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${status < 300 ? output : "ErrorResponse"}` },
            },
          },
        },
      ]),
    ),
  };
}
export const journalsOpenApi = {
  paths: {
    "/api/v1/journals": {
      get: httpOperation("listJournals", "JournalPage", undefined, journalListQuerySchema),
    },
    "/api/v1/journals/drafts": {
      post: httpOperation("createJournalDraft", "JournalDraft", "JournalSave"),
    },
    "/api/v1/journals/drafts/{id}": {
      get: httpOperation(
        "getJournalDraft",
        "JournalDraft",
        undefined,
        journalDetailQuerySchema,
        true,
      ),
      put: httpOperation("saveJournalDraft", "JournalDraft", "JournalSave", undefined, true),
      delete: httpOperation(
        "deleteJournalDraft",
        "JournalDeleted",
        "JournalDelete",
        undefined,
        true,
      ),
    },
    "/api/v1/journals/{id}": {
      get: httpOperation("getJournal", "JournalDetail", undefined, journalDetailQuerySchema, true),
    },
    "/api/v1/journals/preview": {
      post: httpOperation("previewJournal", "JournalPreview", "JournalPreviewRequest"),
    },
    "/api/v1/journals/confirm": {
      post: httpOperation("confirmJournal", "JournalReceipt", "JournalConfirm"),
    },
    ...Object.fromEntries(
      ["reverse", "replace", "reclassify"].map((action) => [
        `/api/v1/journals/${action}`,
        { post: httpOperation(`createJournal${action}`, "JournalDraft", "JournalSave") },
      ]),
    ),
  },
  schemas: Object.fromEntries(
    Object.entries(components).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
  ),
};

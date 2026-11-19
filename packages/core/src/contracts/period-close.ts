import { z } from "zod";
import { companyCodeSchema, periodSchema, revisionSchema } from "./master-data.ts";
import { journalLineSchema, journalReceiptSchema } from "./journals.ts";
const command = {
  company: companyCodeSchema,
  revision: revisionSchema,
  commandId: z.uuidv4(),
};
const month = periodSchema.shape.month;
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/u);
export const closePreviewRequestSchema = z.strictObject(command);
export const closeConfirmSchema = z.strictObject({
  ...command,
  fingerprint,
  confirmation: z.literal("CLOSE"),
});
export const openNextSchema = z.strictObject({
  company: companyCodeSchema,
  revision: revisionSchema,
});
export const closePreviewSchema = z.strictObject({
  ...command,
  month,
  fingerprint,
  action: z.enum(["freeze", "close"]),
  snapshot: z.strictObject({
    watermark: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    accountRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }),
  date: z.iso.date(),
  netProfit: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  blockers: z.array(z.enum(["drafts", "queue", "priorPeriods"])).max(3),
  lines: z.array(journalLineSchema).max(10000),
});
export const closeResultSchema = z.strictObject({
  preview: closePreviewSchema,
  period: periodSchema,
  receipt: journalReceiptSchema,
});
export type ClosePreviewDto = z.infer<typeof closePreviewSchema>;
export type CloseResultDto = z.infer<typeof closeResultSchema>;
const components = {
  ClosePreviewRequest: closePreviewRequestSchema,
  CloseConfirm: closeConfirmSchema,
  OpenNext: openNextSchema,
  ClosePreview: closePreviewSchema,
  CloseResult: closeResultSchema,
  NextPeriod: periodSchema,
};
export const periodCloseOpenApi = {
  schemas: Object.fromEntries(
    Object.entries(components).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
  ),
  paths: Object.fromEntries(
    [
      ["close-preview", "ClosePreviewRequest", "ClosePreview"],
      ["close", "CloseConfirm", "CloseResult"],
      ["open-next", "OpenNext", "NextPeriod"],
    ].map(([path, input, output]) => [
      `/api/v1/periods/{id}/${path}`,
      {
        post: {
          operationId: `period-${path}`,
          parameters: [{ name: "id", in: "path", required: true, schema: z.toJSONSchema(month) }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: `#/components/schemas/${input}` } } },
          },
          responses: Object.fromEntries(
            [200, 400, 403, 404, 405, 409, 415, 500, 503].map((status) => [
              String(status),
              {
                description:
                  status === 200 ? "Explicit period close result." : "Redacted period close error.",
                content: {
                  "application/json": {
                    schema: {
                      $ref: `#/components/schemas/${status === 200 ? output : "ErrorResponse"}`,
                    },
                  },
                },
              },
            ]),
          ),
        },
      },
    ]),
  ),
};

import { z } from "zod";
import { companyCodeSchema, periodSchema } from "./master-data.ts";
import { journalDraftSchema } from "./journals.ts";
export const aiRequestSchema = z.strictObject({
  company: companyCodeSchema,
  month: periodSchema.shape.month,
  prompt: z.string().trim().min(1).max(4000),
});
export const aiDraftResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("candidate"),
    draft: journalDraftSchema,
    rationale: z.string().min(1).max(2000),
  }),
  z.strictObject({
    status: z.literal("invalid"),
    draft: journalDraftSchema.nullable(),
    rationale: z.string().max(2000).nullable(),
    issues: z
      .array(z.strictObject({ path: z.string().max(200), messageKey: z.string().max(200) }))
      .min(1)
      .max(100),
  }),
]);
export const aiExplainResultSchema = z.strictObject({ text: z.string().min(1).max(262144) });
export type AiDraftResultDto = z.infer<typeof aiDraftResultSchema>;
const components = {
  AiRequest: aiRequestSchema,
  AiDraftResult: aiDraftResultSchema,
  AiExplainResult: aiExplainResultSchema,
};
export const aiOpenApi = {
  schemas: Object.fromEntries(
    Object.entries(components).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
  ),
  paths: Object.fromEntries(
    [
      ["draft", "AiDraftResult"],
      ["explain", "AiExplainResult"],
    ].map(([action, output]) => [
      `/api/v1/ai/${action}`,
      {
        post: {
          operationId: `ai-${action}`,
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiRequest" } } },
          },
          responses: Object.fromEntries(
            [200, 400, 403, 404, 405, 409, 415, 500, 502, 503, 504].map((status) => [
              String(status),
              {
                description:
                  status === 200
                    ? "Candidate or explanation only; never saved or posted."
                    : "Redacted AI error.",
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

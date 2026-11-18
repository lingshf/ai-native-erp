import { z } from "zod";
import { companyCodeSchema, revisionSchema } from "./master-data.ts";

export const dimensionCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/u);
export const dimensionValueCodeSchema = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/u);
const day = z.iso.date();
const name = z
  .string()
  .regex(/^[^\p{Cc}]+$/u)
  .trim()
  .min(1)
  .max(80);
const list = z.array(dimensionCodeSchema).max(32);
export const dimensionMapSchema = z
  .record(dimensionCodeSchema, dimensionValueCodeSchema.nullable())
  .refine((value) => Object.keys(value).length <= 32);
const conditional = z.strictObject({
  when: dimensionMapSchema,
  required: list,
  fixed: dimensionMapSchema,
});
function configuration(revision: z.ZodNumber) {
  const common = { revision, active: z.boolean(), from: day, to: day };
  return z.discriminatedUnion("kind", [
    z.strictObject({ ...common, kind: z.literal("dimension"), code: dimensionCodeSchema, name }),
    z.strictObject({
      ...common,
      kind: z.literal("value"),
      dimension: dimensionCodeSchema,
      code: dimensionValueCodeSchema,
      name,
    }),
    z.strictObject({
      ...common,
      kind: z.literal("defaults"),
      code: z.string().regex(/^(?:LEDGER|[1-9]\d{3})$/u),
      values: dimensionMapSchema,
    }),
    z.strictObject({
      ...common,
      kind: z.literal("derivation"),
      code: dimensionCodeSchema,
      when: dimensionMapSchema,
      values: dimensionMapSchema,
      mode: z.enum(["fill", "replace"]),
    }),
    z.strictObject({
      ...common,
      kind: z.literal("structure"),
      code: z.string().regex(/^[1-9]\d{3}$/u),
      required: list,
      optional: list,
      forbidden: list,
      allowed: z.array(dimensionMapSchema).max(100),
      fixed: dimensionMapSchema,
      conditionals: z.array(conditional).max(100),
    }),
    z.strictObject({
      ...common,
      kind: z.literal("balance"),
      code: z.literal("LEDGER"),
      dimension: dimensionCodeSchema,
      account: z.string().regex(/^[1-9]\d{3}$/u),
    }),
  ]);
}
export const dimensionCommandSchema = configuration(revisionSchema);
export const dimensionConfigSchema = configuration(
  z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
);
export const dimensionWriteSchema = z.strictObject({
  company: companyCodeSchema,
  config: dimensionCommandSchema,
});
export const dimensionQuerySchema = z.strictObject({
  company: companyCodeSchema,
  kind: z
    .enum(["dimension", "value", "defaults", "derivation", "structure", "balance"])
    .default("dimension"),
  dimension: dimensionCodeSchema.optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/u)
    .default("100"),
  cursor: dimensionValueCodeSchema.optional(),
});
export const dimensionPageSchema = z.strictObject({
  items: z.array(dimensionConfigSchema).max(500),
  nextCursor: dimensionValueCodeSchema.nullable(),
});
export type DimensionCommand = z.infer<typeof dimensionCommandSchema>;
export type DimensionDto = z.infer<typeof dimensionConfigSchema>;
export const dimensionsOpenApi = {
  paths: {
    "/api/v1/dimensions": {
      get: {
        operationId: "listDimensions",
        parameters: Object.entries(z.toJSONSchema(dimensionQuerySchema).properties ?? {}).map(
          ([name, schema]) => ({ name, in: "query", required: name === "company", schema }),
        ),
        responses: Object.fromEntries(
          [200, 400, 403, 404, 405, 500, 503].map((status) => [
            status,
            {
              description: "Bounded Local dimension configuration.",
              content: {
                "application/json": {
                  schema: {
                    $ref: `#/components/schemas/${status === 200 ? "DimensionPage" : "ErrorResponse"}`,
                  },
                },
              },
            },
          ]),
        ),
      },
      ...Object.fromEntries(
        ["post", "put"].map((method) => [
          method,
          {
            operationId: `${method}DimensionConfiguration`,
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/DimensionWrite" } },
              },
            },
            responses: Object.fromEntries(
              [method === "post" ? 201 : 200, 400, 403, 404, 405, 409, 415, 500, 503].map(
                (status) => [
                  status,
                  {
                    description:
                      "Revision CAS and immutable history; field errors preserve drafts.",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: `#/components/schemas/${status < 300 ? "DimensionConfiguration" : "ErrorResponse"}`,
                        },
                      },
                    },
                  },
                ],
              ),
            ),
          },
        ]),
      ),
    },
  },
  schemas: Object.fromEntries(
    Object.entries({
      DimensionWrite: dimensionWriteSchema,
      DimensionConfiguration: dimensionConfigSchema,
      DimensionPage: dimensionPageSchema,
    }).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })]),
  ),
};

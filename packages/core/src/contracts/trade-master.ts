import { z } from "zod";
import { companyCodeSchema, accountCodeSchema, revisionSchema } from "./master-data.ts";

const name = z
  .string()
  .regex(/^[^\p{Cc}]+$/u)
  .trim()
  .min(1)
  .max(160);
const day = z.iso.date().refine((value) => value >= "1900-01-01" && value <= "9998-12-31");
const percent = z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u);
const window = { name, from: day, to: day };
const allowedTaxCodes = z.array(companyCodeSchema).max(100);
const defaultDimensions = z
  .record(companyCodeSchema, companyCodeSchema.nullable())
  .refine((value) => Object.keys(value).length <= 32);
const party = z.strictObject({
  ...window,
  role: z.enum(["vendor", "customer", "both"]),
  apProfile: companyCodeSchema.nullable(),
  arProfile: companyCodeSchema.nullable(),
  terms: companyCodeSchema,
  allowedTaxCodes,
  defaultDimensions,
});
const product = z.strictObject({
  ...window,
  type: z.enum(["expense", "service"]),
  expenseAccount: accountCodeSchema.nullable(),
  revenueAccount: accountCodeSchema.nullable(),
  allowedTaxCodes,
  defaultDimensions,
});
const profile = z.strictObject({
  ...window,
  side: z.enum(["AP", "AR"]),
  controlAccount: accountCodeSchema,
  advanceAccount: accountCodeSchema,
  cashAccount: accountCodeSchema,
  discountAccount: accountCodeSchema,
});
const terms = z.strictObject({
  ...window,
  dueDays: z.number().int().min(0).max(3650),
  discountDays: z.number().int().min(0).max(3650),
  discountPercent: percent,
  allowPartialDiscount: z.boolean(),
});
const tax = z.strictObject({
  ...window,
  mode: z.enum(["ordinary", "zero", "exempt"]),
  rates: z
    .array(z.strictObject({ id: companyCodeSchema, from: day, to: day, ratePercent: percent }))
    .min(1)
    .max(100),
  deductiblePercent: percent,
  inputAccount: accountCodeSchema.nullable(),
  outputAccount: accountCodeSchema.nullable(),
});
const common = {
  code: companyCodeSchema,
  active: z.boolean(),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
};
const command = {
  company: companyCodeSchema,
  code: companyCodeSchema,
  active: z.boolean(),
  expectedRevision: revisionSchema,
};
export const tradeKindSchema = z.enum([
  "tradeParty",
  "tradeProduct",
  "tradeProfile",
  "tradeTerms",
  "taxCode",
]);
export const tradeConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...common, kind: z.literal("tradeParty"), data: party }),
  z.strictObject({ ...common, kind: z.literal("tradeProduct"), data: product }),
  z.strictObject({ ...common, kind: z.literal("tradeProfile"), data: profile }),
  z.strictObject({ ...common, kind: z.literal("tradeTerms"), data: terms }),
  z.strictObject({ ...common, kind: z.literal("taxCode"), data: tax }),
]);
export const tradeWriteSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...command, kind: z.literal("tradeParty"), data: party }),
  z.strictObject({ ...command, kind: z.literal("tradeProduct"), data: product }),
  z.strictObject({ ...command, kind: z.literal("tradeProfile"), data: profile }),
  z.strictObject({ ...command, kind: z.literal("tradeTerms"), data: terms }),
  z.strictObject({ ...command, kind: z.literal("taxCode"), data: tax }),
]);
export const tradeQuerySchema = z.strictObject({
  company: companyCodeSchema,
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/u)
    .default("100"),
  cursor: companyCodeSchema.optional(),
  search: name.optional(),
});
export const tradeAtSchema = z.strictObject({
  company: companyCodeSchema,
  at: z.iso.datetime({ precision: 3 }).optional(),
});
export const tradePageSchema = z.strictObject({
  items: z.array(tradeConfigSchema).max(500),
  nextCursor: companyCodeSchema.nullable(),
});
export type TradeDto = z.infer<typeof tradeConfigSchema>;
export type TradeCommand = z.infer<typeof tradeWriteSchema>;
const ref = (schema: string) => ({
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
});
export const tradeMasterOpenApi = {
  paths: Object.fromEntries(
    tradeKindSchema.options.flatMap((kind) => [
      [
        `/api/v1/trade/${kind}`,
        Object.fromEntries(
          ["get", "post", "put"].map((method) => [
            method,
            {
              operationId: `${method}${kind}`,
              ...(method === "get"
                ? {
                    parameters: Object.entries(
                      z.toJSONSchema(tradeQuerySchema).properties ?? {},
                    ).map(([name, schema]) => ({
                      name,
                      in: "query",
                      required: name === "company",
                      schema,
                    })),
                  }
                : { requestBody: { required: true, ...ref("TradeWrite") } }),
              responses: {
                [method === "post" ? 201 : 200]: {
                  description:
                    "Company-scoped trade configuration; revision CAS and immutable history.",
                  ...ref(method === "get" ? "TradePage" : "TradeConfig"),
                },
                ...Object.fromEntries(
                  [400, 403, 404, 405, 409, 415, 500, 503].map((status) => [
                    status,
                    { description: "Explicit safe error.", ...ref("ErrorResponse") },
                  ]),
                ),
              },
            },
          ]),
        ),
      ],
      [
        `/api/v1/trade/${kind}/{code}`,
        {
          get: {
            operationId: `get${kind}At`,
            parameters: [
              {
                name: "code",
                in: "path",
                required: true,
                schema: z.toJSONSchema(companyCodeSchema),
              },
              ...Object.entries(z.toJSONSchema(tradeAtSchema).properties ?? {}).map(
                ([name, schema]) => ({
                  name,
                  in: "query",
                  required: name === "company",
                  schema,
                }),
              ),
            ],
            responses: {
              200: {
                description:
                  "Current or recorded-at historical configuration, including disabled records.",
                ...ref("TradeConfig"),
              },
              ...Object.fromEntries(
                [400, 403, 404, 405, 500, 503].map((status) => [
                  status,
                  { description: "Explicit safe error.", ...ref("ErrorResponse") },
                ]),
              ),
            },
          },
        },
      ],
    ]),
  ),
  schemas: {
    TradeConfig: z.toJSONSchema(tradeConfigSchema),
    TradeWrite: z.toJSONSchema(tradeWriteSchema),
    TradePage: z.toJSONSchema(tradePageSchema),
  },
};

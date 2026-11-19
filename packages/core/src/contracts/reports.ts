import { z } from "zod";
import {
  companyCodeSchema,
  accountCodeSchema,
  accountSchema,
  periodSchema,
  companiesQuerySchema,
} from "./master-data.ts";
import { dimensionMapSchema, dimensionCodeSchema, dimensionValueCodeSchema } from "./dimensions.ts";
const minor = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const nonnegative = minor.min(0);
const stage = z.enum(["unadjusted", "adjusted", "postClosing"]);
const scope = { company: companyCodeSchema, month: periodSchema.shape.month };
export const reportQuerySchema = z.strictObject({ ...scope, stage: stage.default("adjusted") });
export const ledgerQuerySchema = z
  .strictObject({
    ...scope,
    stage: stage.default("adjusted"),
    account: accountCodeSchema,
    limit: companiesQuerySchema.shape.limit,
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .max(2048)
      .optional(),
    dimension: dimensionCodeSchema.optional(),
    value: z.union([dimensionValueCodeSchema, z.literal("~")]).optional(),
  })
  .refine((value) => (value.dimension === undefined) === (value.value === undefined));
export const ledgerCursorSchema = z.strictObject({
  ...scope,
  stage,
  account: accountCodeSchema,
  dimension: dimensionCodeSchema.nullable(),
  value: dimensionValueCodeSchema.nullable(),
  watermark: nonnegative,
  date: z.iso.date(),
  entryId: z.uuidv4(),
  lineNo: z.number().int().min(1).max(2000),
});
const row = accountSchema.extend({
  opening: minor,
  debit: nonnegative,
  credit: nonnegative,
  closing: minor,
  yearNet: minor,
  normalBalance: minor,
  abnormal: z.boolean(),
});
const income = z.strictObject({ revenue: minor, expense: minor, profit: minor });
export const reportSchema = z.strictObject({
  ...scope,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  scale: z.number().int().min(0).max(4),
  stage,
  basis: z.literal("current-account-configuration"),
  trial: z.strictObject({ rows: z.array(row).max(9000), debit: nonnegative, credit: nonnegative }),
  groups: z.array(
    z.strictObject({
      reportGroup: accountSchema.shape.reportGroup,
      category: accountSchema.shape.category,
      opening: minor,
      activity: minor,
      closing: minor,
      accounts: z.array(accountCodeSchema),
    }),
  ),
  income: z.strictObject({ month: income, ytd: income }),
  balanceSheet: z.strictObject({
    assets: minor,
    liabilities: minor,
    capitalAndRetained: minor,
    currentEarnings: minor,
    equity: minor,
  }),
  equitySummary: z.strictObject({
    opening: minor,
    movements: minor,
    profit: minor,
    closing: minor,
  }),
  contraGroups: z.array(
    z.strictObject({
      account: accountCodeSchema,
      gross: minor,
      contra: minor,
      net: minor,
      accounts: z.array(accountCodeSchema),
    }),
  ),
  reconciliation: z.strictObject({
    checks: z.array(
      z.strictObject({
        id: z.enum([
          "trial",
          "tb.unadjusted",
          "tb.adjusted",
          "tb.postClosing",
          "balanceSheet",
          "equitySummary",
          "profit",
        ]),
        left: minor,
        right: minor,
        difference: minor,
        pass: z.boolean(),
      }),
    ),
    allPass: z.boolean(),
  }),
});
export const ledgerSchema = z.strictObject({
  ...scope,
  stage,
  account: accountCodeSchema,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  scale: z.number().int().min(0).max(4),
  opening: minor,
  debit: nonnegative,
  credit: nonnegative,
  closing: minor,
  total: nonnegative,
  watermark: nonnegative,
  items: z
    .array(
      z.strictObject({
        entryId: z.uuidv4(),
        lineNo: z.number().int().min(1).max(2000),
        date: z.iso.date(),
        sourceRef: z.string().max(100),
        memo: z.string().max(200),
        debit: nonnegative,
        credit: nonnegative,
        dimensions: dimensionMapSchema,
        balance: minor,
      }),
    )
    .max(500),
  nextCursor: z.string().max(2048).nullable(),
});
export type ReportDto = z.infer<typeof reportSchema>;
export type LedgerDto = z.infer<typeof ledgerSchema>;
const routes = Object.fromEntries(
  ["trial", "income", "balance-sheet", "reconciliation"].map((kind) => [
    `/api/v1/reports/${kind}`,
    { query: reportQuerySchema, schema: "LedgerReport" },
  ]),
);
export const reportsOpenApi = {
  paths: Object.fromEntries(
    Object.entries({
      ...routes,
      "/api/v1/ledger": { query: ledgerQuerySchema, schema: "LedgerPage" },
    }).map(([path, value]) => {
      const query = z.toJSONSchema(value.query, { target: "draft-2020-12" });
      return [
        path,
        {
          get: {
            operationId: `get${path.split("/").at(-1)?.replaceAll("-", "_")}`,
            parameters: Object.entries(query.properties ?? {}).map(([name, schema]) => ({
              name,
              in: "query",
              required: query.required?.includes(name) ?? false,
              schema,
            })),
            responses: Object.fromEntries(
              [200, 400, 403, 404, 405, 500, 503].map((status) => [
                String(status),
                {
                  description:
                    status === 200
                      ? "Live SQLite ledger, exact integer minor units."
                      : "Explicit query error.",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: `#/components/schemas/${status === 200 ? value.schema : "ErrorResponse"}`,
                      },
                    },
                  },
                },
              ]),
            ),
          },
        },
      ];
    }),
  ),
  schemas: {
    LedgerReport: z.toJSONSchema(reportSchema, { target: "draft-2020-12" }),
    LedgerPage: z.toJSONSchema(ledgerSchema, { target: "draft-2020-12" }),
  },
};

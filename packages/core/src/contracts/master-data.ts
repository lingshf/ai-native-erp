import { z } from "zod";
export type ContractSchema<T> = Pick<z.ZodType<T>, "safeParse">;

export const companyCodeSchema = z.string().regex(/^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u);
export const accountCodeSchema = z.string().regex(/^[1-9]\d{3}$/u);
const name = (max: number) =>
  z
    .string()
    .regex(/^[^\p{Cc}]+$/u)
    .trim()
    .min(1)
    .max(max);
export const revisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const storedRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const companyInputSchema = z.strictObject({
  code: companyCodeSchema,
  name: name(160),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  scale: z.number().int().min(0).max(4),
  year: z.number().int().min(1900).max(9998),
  closeMode: z.enum(["monthly-teaching", "annual"]),
});
export const companySchema = companyInputSchema.extend({ revision: storedRevision });
export const accountFieldsSchema = z.strictObject({
  code: accountCodeSchema,
  name: name(80),
  category: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  reportGroup: z.enum([
    "cash",
    "receivables",
    "inventory",
    "prepayments",
    "fixedAssets",
    "otherAssets",
    "payables",
    "taxLiabilities",
    "otherLiabilities",
    "capital",
    "retainedEarnings",
    "otherEquity",
    "sales",
    "otherRevenue",
    "costOfSales",
    "operatingExpense",
    "otherExpense",
  ]),
  normalSide: z.enum(["DEBIT", "CREDIT"]),
  purpose: z.enum(["general", "control", "clearing", "suspense"]),
  controlModule: z
    .enum(["AP", "AR", "INVENTORY", "ASSET", "BANK", "TAX", "LEASE", "IC"])
    .nullable(),
  contraOf: accountCodeSchema.nullable(),
  manualAllowed: z.boolean(),
  active: z.boolean(),
});
export const accountSchema = accountFieldsSchema.extend({
  revision: storedRevision,
  builtin: z.boolean(),
});
export const accountCommandSchema = accountFieldsSchema.extend({
  company: companyCodeSchema,
  revision: revisionSchema,
});
const monthSchema = z.string().regex(/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/u);
export const periodSchema = z.strictObject({
  month: monthSchema,
  status: z.enum(["open", "frozen", "closed"]),
  revision: storedRevision,
});
export const periodCommandSchema = z.strictObject({
  company: companyCodeSchema,
  month: monthSchema,
  revision: revisionSchema.min(1),
  status: periodSchema.shape.status,
  reason: name(160),
  confirmed: z.boolean(),
});
const limit = z
  .string()
  .regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/u)
  .default("100");
export const companiesQuerySchema = z.strictObject({ limit, cursor: companyCodeSchema.optional() });
export const accountsQuerySchema = z.strictObject({
  company: companyCodeSchema,
  limit,
  cursor: accountCodeSchema.optional(),
});
export const periodsQuerySchema = z.strictObject({
  company: companyCodeSchema,
  limit,
  cursor: monthSchema.optional(),
});
export const accountAtQuerySchema = z.strictObject({
  company: companyCodeSchema,
  at: z.iso.datetime({ precision: 3 }).optional(),
});
export const companiesPageSchema = z.strictObject({
  items: z.array(companySchema).max(500),
  nextCursor: companyCodeSchema.nullable(),
});
export const accountsPageSchema = z.strictObject({
  items: z.array(accountSchema).max(500),
  nextCursor: accountCodeSchema.nullable(),
});
export const periodsPageSchema = z.strictObject({
  items: z.array(periodSchema).max(500),
  nextCursor: monthSchema.nullable(),
});
export type CompanyDto = z.infer<typeof companySchema>;
export type AccountDto = z.infer<typeof accountSchema>;
export type AccountCommand = z.infer<typeof accountCommandSchema>;
export type CompaniesPage = z.infer<typeof companiesPageSchema>;
export type AccountsPage = z.infer<typeof accountsPageSchema>;

const schemas = {
  CompanyInput: companyInputSchema,
  Company: companySchema,
  CompaniesPage: companiesPageSchema,
  AccountCommand: accountCommandSchema,
  Account: accountSchema,
  AccountsPage: accountsPageSchema,
  PeriodCommand: periodCommandSchema,
  Period: periodSchema,
  PeriodsPage: periodsPageSchema,
};
function operation(id: string, result: string, query?: z.ZodObject, body?: string, status = 200) {
  const json = query ? z.toJSONSchema(query) : undefined;
  const ref = (name: string) => ({
    content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
  });
  return {
    operationId: id,
    ...(json
      ? {
          parameters: Object.entries(json.properties ?? {}).map(([name, schema]) => ({
            name,
            in: "query",
            required: json.required?.includes(name) ?? false,
            schema,
          })),
        }
      : {}),
    ...(body ? { requestBody: { required: true, ...ref(body) } } : {}),
    responses: {
      [status]: {
        description: "Local master data. Writes use revision CAS and append configuration history.",
        ...ref(result),
      },
      ...Object.fromEntries(
        [400, 403, 404, 405, 409, 415, 500, 503].map((code) => [
          code,
          { description: "Explicit safe error.", ...ref("ErrorResponse") },
        ]),
      ),
    },
  };
}
const history = operation("getAccountAt", "Account", accountAtQuerySchema);
export const masterDataOpenApi = {
  paths: {
    "/api/v1/companies": {
      get: operation("listCompanies", "CompaniesPage", companiesQuerySchema),
      post: operation("createCompany", "Company", undefined, "CompanyInput", 201),
    },
    "/api/v1/accounts": {
      get: operation("listAccounts", "AccountsPage", accountsQuerySchema),
      post: operation("createAccount", "Account", undefined, "AccountCommand", 201),
      put: operation("updateAccount", "Account", undefined, "AccountCommand"),
    },
    "/api/v1/accounts/{code}": {
      get: {
        ...history,
        parameters: [
          { name: "code", in: "path", required: true, schema: z.toJSONSchema(accountCodeSchema) },
          ...(history.parameters ?? []),
        ],
      },
    },
    "/api/v1/periods": {
      get: operation("listPeriods", "PeriodsPage", periodsQuerySchema),
      put: operation("updatePeriod", "Period", undefined, "PeriodCommand"),
    },
  },
  schemas: Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
  ),
};

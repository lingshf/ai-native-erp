import { z } from "zod";
import { accountCodeSchema, companyCodeSchema, periodSchema } from "./master-data.ts";
import {
  openItemSchema,
  tradeActionListSchema,
  tradeSettlementReceiptSchema,
  tradeInvoiceDetailSchema,
} from "./trade-documents.ts";

const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signed = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/u);
export const tradeReportingScopeSchema = z.strictObject({
  company: companyCodeSchema,
  month: periodSchema.shape.month.optional(),
});
export const tradeReportQuerySchema = tradeReportingScopeSchema.extend({
  side: z.enum(["AP", "AR"]).optional(),
  party: companyCodeSchema.optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/u)
    .default("100"),
  cursor: z.uuidv4().optional(),
  snapshot: fingerprint.optional(),
});
export const tradeReportItemSchema = z.strictObject({
  kind: z.enum(["invoice", "credit", "advance"]),
  side: z.enum(["AP", "AR"]),
  documentId: z.uuidv4(),
  party: companyCodeSchema,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  externalNo: z.string().max(100),
  version: minor.min(1),
  currentVersion: minor.min(1),
  accountingDate: z.iso.date(),
  documentDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  remainingNetMinor: minor,
  remainingTaxMinor: minor,
  remainingGrossMinor: minor,
  overdueDays: minor.nullable(),
  ageingBucket: z
    .enum(["notDue", "overdue1_30", "overdue31_60", "overdue61_90", "overdue91Plus"])
    .nullable(),
  controlAccount: accountCodeSchema,
  sourceReference: z.string().max(100),
  journalId: z.uuidv4(),
});
export const tradeReportSchema = z.strictObject({
  company: companyCodeSchema,
  basis: z.enum(["current", "monthEnd"]),
  asOf: z.iso.date().nullable(),
  ageingDate: z.iso.date(),
  snapshot: fingerprint,
  items: z.array(tradeReportItemSchema).max(500),
  nextCursor: z.uuidv4().nullable(),
  totals: z.strictObject({
    invoiceGrossMinor: minor,
    notDue: minor,
    overdue1_30: minor,
    overdue31_60: minor,
    overdue61_90: minor,
    overdue91Plus: minor,
    creditGrossMinor: minor,
    advanceGrossMinor: minor,
  }),
});
export const tradeReconciliationSchema = z.strictObject({
  company: companyCodeSchema,
  asOf: z.iso.date().nullable(),
  basis: z.literal("debitMinusCredit"),
  scope: z.literal("companyAllParties"),
  rows: z.array(
    z.strictObject({
      account: accountCodeSchema,
      subledgerMinor: signed,
      tradeGlMinor: signed,
      otherSourceMinor: signed,
      glMinor: signed,
      tradeDifferenceMinor: signed,
      differenceMinor: signed,
    }),
  ),
});
export const tradeItemDetailSchema = z.strictObject({
  company: companyCodeSchema,
  asOf: z.iso.date().nullable(),
  selected: tradeReportItemSchema,
  current: openItemSchema,
  document: tradeInvoiceDetailSchema.shape.document.nullable(),
  originalDocumentId: z.uuidv4().nullable(),
  settlements: z.array(tradeSettlementReceiptSchema),
  actions: tradeActionListSchema,
});
export type TradeReportDto = z.infer<typeof tradeReportSchema>;
export type TradeReconciliationDto = z.infer<typeof tradeReconciliationSchema>;
export type TradeItemDetailDto = z.infer<typeof tradeItemDetailSchema>;
function get(operationId: string, schema: string, query: z.ZodObject, item = false) {
  const json = z.toJSONSchema(query);
  return {
    get: {
      operationId,
      parameters: [
        ...(item
          ? [{ name: "itemId", in: "path", required: true, schema: z.toJSONSchema(z.uuidv4()) }]
          : []),
        ...Object.entries(json.properties ?? {}).map(([name, schema]) => ({
          name,
          in: "query",
          required: json.required?.includes(name) ?? false,
          schema,
        })),
      ],
      responses: Object.fromEntries(
        [200, 400, 403, 404, 405, 409, 500, 503].map((status) => [
          status,
          {
            description:
              status === 200
                ? "Read-only saved trade facts. Historical and current versions are distinct; reconciliation covers all company parties, debit minus credit."
                : "Explicit safe error.",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${status === 200 ? schema : "ErrorResponse"}`,
                },
              },
            },
          },
        ]),
      ),
    },
  };
}
export const tradeReportingOpenApi = {
  paths: {
    "/api/v1/trade/reports/open-items": get(
      "tradeOpenItemsReport",
      "TradeReport",
      tradeReportQuerySchema,
    ),
    "/api/v1/trade/reports/reconciliation": get(
      "tradeReconciliation",
      "TradeReconciliation",
      tradeReportingScopeSchema,
    ),
    "/api/v1/trade/reports/open-items/{itemId}": get(
      "tradeOpenItemDetail",
      "TradeItemDetail",
      tradeReportingScopeSchema,
      true,
    ),
  },
  schemas: {
    TradeReport: z.toJSONSchema(tradeReportSchema),
    TradeReconciliation: z.toJSONSchema(tradeReconciliationSchema),
    TradeItemDetail: z.toJSONSchema(tradeItemDetailSchema),
  },
};

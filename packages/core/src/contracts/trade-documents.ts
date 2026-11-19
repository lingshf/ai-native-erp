import { z } from "zod";
import { accountCodeSchema, companyCodeSchema } from "./master-data.ts";
import { dimensionMapSchema } from "./dimensions.ts";
import { journalPlanSchema } from "./journals.ts";

const id = z.uuidv4();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/u);
const day = z.iso.date();
const side = z.enum(["AP", "AR"]);
const poMatch = z.enum(["notApplicable", "matched", "exception"]);
const currency = z.string().regex(/^[A-Z]{3}$/u);
const lineId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,59}$/u);
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u);
const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signed = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const lines = <T extends z.ZodType>(line: T) => z.array(line).min(1).max(100);
const rounding = z.enum(["line", "document"]);
const orderLineInput = {
  lineId,
  product: companyCodeSchema,
  taxCode: companyCodeSchema,
  quantity: decimal,
  unitPrice: decimal,
  discountPercent: decimal,
  taxableCharge: decimal,
};
const orderHeader = {
  orderId: companyCodeSchema,
  side,
  party: companyCodeSchema,
  currency,
  orderDate: day,
  priceIncludesTax: z.boolean(),
  rounding,
};
export const tradeOrderCommandSchema = z.strictObject({
  company: companyCodeSchema,
  ...orderHeader,
  lines: lines(z.strictObject(orderLineInput)),
});
export const tradeOrderSchema = z.strictObject({
  ...orderHeader,
  commandHash: fingerprint,
  recordedAt: z.iso.datetime({ precision: 3 }),
  lines: lines(
    z.strictObject({
      ...orderLineInput,
      lineNo: z.number().int().min(1).max(100),
      net: minor,
      tax: minor,
      gross: minor,
    }),
  ),
});
export const tradeInvoiceCommandSchema = z.strictObject({
  company: companyCodeSchema,
  documentId: id,
  side,
  party: companyCodeSchema,
  externalInvoice: z
    .string()
    .regex(/^[^\p{Cc}]*$/u)
    .max(100),
  currency,
  accountingDate: day,
  documentDate: day,
  taxDate: day,
  orderId: companyCodeSchema.nullable(),
  priceIncludesTax: z.boolean(),
  rounding,
  headerDimensions: dimensionMapSchema,
  matchingException: z
    .strictObject({
      confirmed: z.literal(true),
      reason: z
        .string()
        .regex(/^[^\p{Cc}]*$/u)
        .max(160),
    })
    .nullable(),
  lines: lines(
    z.strictObject({
      ...orderLineInput,
      taxCode: companyCodeSchema.nullable(),
      orderLineId: lineId.nullable(),
      dimensions: dimensionMapSchema,
    }),
  ),
});
export const tradeInvoiceConfirmSchema = z.strictObject({
  command: tradeInvoiceCommandSchema,
  fingerprint,
  idempotencyKey: id,
  confirmation: z.literal("POST"),
});
const amounts = {
  net: minor,
  tax: minor,
  gross: minor,
  deductibleTax: minor,
  nonDeductibleTax: minor,
  expense: minor,
  cashDiscountBase: minor,
};
const treatment = z.enum(["standard", "zero", "exempt"]);
export const tradeCalculationSchema = z.strictObject({
  ...amounts,
  algorithm: z.literal("trade-v1-half-up-largest-remainder"),
  currency,
  scale: z.number().int().min(0).max(4),
  priceMode: z.enum(["exclusive", "inclusive"]),
  rounding,
  lines: lines(
    z.strictObject({
      ...amounts,
      id: lineId,
      taxCode: companyCodeSchema,
      treatment,
      roundingSource: z.strictObject({
        lineIndex: z.number().int().min(0).max(99),
        group: z.tuple([z.string(), treatment, z.string(), z.string()]),
        exactTaxNumerator: z.string().regex(/^\d+$/u),
        exactTaxDenominator: z.string().regex(/^[1-9]\d*$/u),
        lineRoundedTax: minor,
        adjustment: signed,
      }),
    }),
  ),
});
export const tradeLineMatchSchema = z.strictObject({
  lineId,
  orderLineId: lineId,
  orderQuantity: decimal,
  previouslyInvoiced: decimal,
  quantity: decimal,
  expectedNet: minor,
  invoiceNet: minor,
  variance: signed,
  withinTolerance: z.boolean(),
});
export const tradeInvoicePreviewSchema = z.strictObject({
  fingerprint,
  side,
  externalNoNormalized: z.string().min(1).max(100),
  calculation: tradeCalculationSchema,
  poMatch,
  matches: z.array(tradeLineMatchSchema).max(100),
  dueDate: day,
  discountDate: day,
  controlAccount: accountCodeSchema,
  journal: journalPlanSchema,
});
export const tradeInvoiceReceiptSchema = z.strictObject({
  company: companyCodeSchema,
  documentId: id,
  idempotencyKey: id,
  fingerprint,
  sourceRef: z.string().regex(/^[ -~]{1,100}$/u),
  journalIds: z.array(id).min(1).max(2),
  poMatch,
  gross: minor,
  postedAt: z.iso.datetime({ precision: 3 }),
});
export const openItemSchema = z.strictObject({
  itemId: id,
  side,
  party: companyCodeSchema,
  externalNo: z.string().max(100),
  controlAccount: accountCodeSchema,
  dimensions: dimensionMapSchema,
  currency,
  accountingDate: day,
  documentDate: day,
  dueDate: day,
  discountDate: day,
  gross: minor,
  net: minor,
  tax: minor,
  remainingGross: minor,
  remainingNet: minor,
  remainingTax: minor,
  status: z.enum(["open", "settled"]),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
const documentLine = z.strictObject({
  lineId,
  lineNo: z.number().int().min(1).max(100),
  product: companyCodeSchema,
  account: accountCodeSchema,
  taxCode: companyCodeSchema,
  taxRateId: companyCodeSchema,
  ratePercent: decimal,
  quantity: decimal,
  unitPrice: decimal,
  discountPercent: decimal,
  taxableCharge: decimal,
  net: minor,
  tax: minor,
  gross: minor,
  deductibleTax: minor,
  orderId: companyCodeSchema.nullable(),
  orderLineId: lineId.nullable(),
  expectedNet: minor.nullable(),
  matchStatus: poMatch,
});
export const tradeInvoiceDetailSchema = z.strictObject({
  document: z.strictObject({
    documentId: id,
    side,
    party: companyCodeSchema,
    externalNo: z.string().max(100),
    externalNoNormalized: z.string().min(1).max(100),
    currency,
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    dueDate: day,
    discountDate: day,
    orderId: companyCodeSchema.nullable(),
    poMatch,
    exceptionReason: z.string().max(160).nullable(),
    net: minor,
    tax: minor,
    gross: minor,
    journalId: id,
    receiptKey: id,
    fingerprint,
    commandHash: fingerprint,
    postedAt: z.iso.datetime({ precision: 3 }),
    controlAccount: accountCodeSchema,
    controlDimensions: dimensionMapSchema,
    lines: lines(documentLine),
  }),
  calculation: tradeCalculationSchema,
  matches: z.array(tradeLineMatchSchema).max(100),
  receipt: tradeInvoiceReceiptSchema,
  openItem: openItemSchema,
});
const limit = z
  .string()
  .regex(/^(?:[1-9]\d?|[1-4]\d{2}|500)$/u)
  .default("100");
export const tradeCompanyQuerySchema = z.strictObject({ company: companyCodeSchema });
export const tradeInvoiceListQuerySchema = z.strictObject({
  company: companyCodeSchema,
  limit,
  cursor: z
    .string()
    .regex(/^[1-9]\d{0,15}$/u)
    .optional(),
});
export const openItemQuerySchema = z.strictObject({
  company: companyCodeSchema,
  limit,
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}\|[0-9a-f-]{36}$/u)
    .optional(),
  party: companyCodeSchema.optional(),
  status: z.enum(["open", "settled"]).optional(),
});
export const tradeInvoicePageSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        documentId: id,
        side,
        party: companyCodeSchema,
        externalNo: z.string().max(100),
        accountingDate: day,
        documentDate: day,
        dueDate: day,
        poMatch,
        gross: minor,
        currency,
        journalId: id,
        cursor: z.string().regex(/^[1-9]\d{0,15}$/u),
      }),
    )
    .max(500),
  nextCursor: z.string().nullable(),
});
export const openItemPageSchema = z.strictObject({
  items: z.array(openItemSchema).max(500),
  nextCursor: z.string().nullable(),
});
export type TradeInvoiceCommandDto = z.infer<typeof tradeInvoiceCommandSchema>;
export type TradeInvoicePreviewDto = z.infer<typeof tradeInvoicePreviewSchema>;
export type TradeInvoiceReceiptDto = z.infer<typeof tradeInvoiceReceiptSchema>;
export type TradeInvoicePageDto = z.infer<typeof tradeInvoicePageSchema>;
export type TradeInvoiceDetailDto = z.infer<typeof tradeInvoiceDetailSchema>;

const ref = (schema: string) => ({
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
});
const errors = (statuses: readonly number[]) =>
  Object.fromEntries(
    statuses.map((status) => [
      status,
      { description: "Explicit safe error.", ...ref("ErrorResponse") },
    ]),
  );
const query = (schema: z.ZodObject) =>
  Object.entries(z.toJSONSchema(schema).properties ?? {}).map(([name, value]) => ({
    name,
    in: "query",
    required: name === "company",
    schema: value,
  }));
const pathParam = (name: string, schema: z.ZodType) => ({
  name,
  in: "path",
  required: true,
  schema: z.toJSONSchema(schema),
});
export const tradeDocumentsOpenApi = {
  paths: {
    "/api/v1/trade/orders": {
      post: {
        operationId: "createTradeOrder",
        requestBody: { required: true, ...ref("TradeOrderCommand") },
        responses: {
          201: {
            description: "Immutable purchase/sales order; identical retries return it.",
            ...ref("TradeOrder"),
          },
          ...errors([400, 403, 405, 409, 415, 500, 503]),
        },
      },
    },
    "/api/v1/trade/orders/{orderId}": {
      get: {
        operationId: "getTradeOrder",
        parameters: [pathParam("orderId", companyCodeSchema), ...query(tradeCompanyQuerySchema)],
        responses: {
          200: { description: "Stored order with per-line net amounts.", ...ref("TradeOrder") },
          ...errors([400, 403, 404, 405, 500, 503]),
        },
      },
    },
    "/api/v1/trade/invoices/preview": {
      post: {
        operationId: "previewTradeInvoice",
        requestBody: { required: true, ...ref("TradeInvoiceCommand") },
        responses: {
          200: {
            description:
              "Read-only calculation, order matching and TRADE journal plan with fingerprint.",
            ...ref("TradeInvoicePreview"),
          },
          ...errors([400, 403, 404, 405, 409, 415, 500, 503]),
        },
      },
    },
    "/api/v1/trade/invoices": {
      get: {
        operationId: "listTradeInvoices",
        parameters: query(tradeInvoiceListQuerySchema),
        responses: {
          200: { description: "Posted trade invoices, newest first.", ...ref("TradeInvoicePage") },
          ...errors([400, 403, 404, 405, 500, 503]),
        },
      },
      post: {
        operationId: "confirmTradeInvoice",
        requestBody: { required: true, ...ref("TradeInvoiceConfirm") },
        responses: {
          201: {
            description: "Atomic document, GL, open item, receipt and audit; idempotent by key.",
            ...ref("TradeInvoiceReceipt"),
          },
          ...errors([400, 403, 404, 405, 409, 415, 500, 503]),
        },
      },
    },
    "/api/v1/trade/invoices/{documentId}": {
      get: {
        operationId: "getTradeInvoice",
        parameters: [pathParam("documentId", id), ...query(tradeCompanyQuerySchema)],
        responses: {
          200: {
            description: "Posted invoice with calculation, matches, receipt and open item.",
            ...ref("TradeInvoiceDetail"),
          },
          ...errors([400, 403, 404, 405, 500, 503]),
        },
      },
    },
    "/api/v1/trade/open-items": {
      get: {
        operationId: "listOpenItems",
        parameters: query(openItemQuerySchema),
        responses: {
          200: { description: "AP/AR open items by due date.", ...ref("OpenItemPage") },
          ...errors([400, 403, 404, 405, 500, 503]),
        },
      },
    },
  },
  schemas: {
    TradeOrderCommand: z.toJSONSchema(tradeOrderCommandSchema),
    TradeOrder: z.toJSONSchema(tradeOrderSchema),
    TradeInvoiceCommand: z.toJSONSchema(tradeInvoiceCommandSchema),
    TradeInvoiceConfirm: z.toJSONSchema(tradeInvoiceConfirmSchema),
    TradeInvoicePreview: z.toJSONSchema(tradeInvoicePreviewSchema),
    TradeInvoiceReceipt: z.toJSONSchema(tradeInvoiceReceiptSchema),
    TradeInvoiceDetail: z.toJSONSchema(tradeInvoiceDetailSchema),
    TradeInvoicePage: z.toJSONSchema(tradeInvoicePageSchema),
    OpenItemPage: z.toJSONSchema(openItemPageSchema),
  },
};

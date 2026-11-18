import { z } from "zod";
import { companyCodeSchema, revisionSchema } from "./master-data.ts";
import { dimensionMapSchema } from "./dimensions.ts";
import { journalDraftSchema, journalPlanSchema, journalReceiptSchema, journalLineSchema, journalConfirmSchema } from "./journals.ts";
const id = z.uuidv4();
const code = companyCodeSchema;
const page = { company: code, limit: z.string().regex(/^(?:[1-9]\d?|100)$/u).default("100"), cursor: z.string().max(100).optional() };
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const scope = z.enum(["exact", "group", "all"]);
export const businessMasterSchema = z.strictObject({ code, name: z.string().min(1).max(80), group: code, active: z.boolean(), revision: revisionSchema, dimensions: dimensionMapSchema });
export const postingRuleSchema = z.strictObject({ code, active: z.boolean(), revision: revisionSchema,
  direction: z.enum(["receive", "pay"]), meaning: z.enum(["cash", "offset"]),
  objectScope: scope, objectCode: z.string().min(1).max(40), partyScope: scope, partyCode: z.string().min(1).max(40),
  account: z.string().regex(/^[1-9]\d{3}$/u), dimensions: dimensionMapSchema, from: z.iso.date(), to: z.iso.date() });
export const businessMasterSaveSchema = z.strictObject({ company: code, value: businessMasterSchema });
export const postingRuleSaveSchema = z.strictObject({ company: code, value: postingRuleSchema });
const base = { id, sourceRef: z.string().regex(/^[ -~]{1,100}$/u), date: z.iso.date(), memo: z.string().min(1).max(200) };
const lineRef = z.strictObject({ entryId: id, lineNo: z.number().int().min(1).max(2000) });
export const businessEventSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...base, operation: z.literal("cash_service"), direction: z.enum(["receive", "pay"]), service: code, party: code.nullable(), currency: z.string().regex(/^[A-Z]{3}$/u), amount: z.string().min(1).max(40), dimensions: dimensionMapSchema }),
  z.strictObject({ ...base, operation: z.literal("cash_service.cancel"), originalId: id }),
  z.strictObject({ ...base, operation: z.literal("statistics"), code, quantity: z.string().min(1).max(40), unit: z.string().min(1).max(40), dimensions: dimensionMapSchema }),
  z.strictObject({ ...base, operation: z.literal("clearing.match"), account: z.string().regex(/^[1-9]\d{3}$/u), lines: z.array(lineRef).min(2).max(500) }),
]);
const storedEvent = z.union([businessEventSchema, journalDraftSchema.extend({ operation: z.literal("journal"), originalId: z.null() })]);
const postingPlan = journalPlanSchema.extend({ journals: z.array(journalPlanSchema.shape.journals.element).max(2) });
const statistics = z.strictObject({ code, quantity: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), scale: z.literal(6), unit: z.string().min(1).max(40), dimensions: dimensionMapSchema, dimensionOrigins: journalLineSchema.shape.dimensionOrigins });
export const businessPreviewSchema = z.strictObject({ fingerprint, plan: postingPlan, statistics: statistics.nullable(), clearing: z.array(lineRef).max(500),
  matches: z.array(z.strictObject({ meaning: z.enum(["cash", "offset"]), rule: code, revision: revisionSchema, account: z.string().regex(/^[1-9]\d{3}$/u),
    candidates: z.array(z.strictObject({ objectScope: scope, partyScope: scope, count: z.number().int().min(1).max(5000) })).max(9) })).max(2) });
const status = z.enum(["pending", "failed", "transferred", "withdrawn"]);
export const transferQueueSchema = z.strictObject({ id, sourceRef: base.sourceRef, date: base.date, memo: base.memo, status, createdAt: z.iso.datetime(), revision: revisionSchema,
  journalIds: z.array(id).max(2), fingerprint: fingerprint.nullable(), plan: postingPlan.nullable(), error: z.string().max(80).nullable(), reason: z.string().max(200).nullable() });
export const queueSummarySchema = transferQueueSchema.omit({ plan: true });
export const businessRecordSchema = z.strictObject({ event: storedEvent, preview: businessPreviewSchema, receipt: journalReceiptSchema, createdAt: z.iso.datetime() });
export const businessResultSchema = businessRecordSchema.extend({ status: z.enum(["pending", "failed", "transferred", "withdrawn", "recorded", "posted", "cancelled"]), journalIds: z.array(id).max(2), queue: transferQueueSchema.nullable() });
export const businessSummarySchema = z.strictObject({ ...base, operation: z.enum(["cash_service", "cash_service.cancel", "statistics", "clearing.match", "journal"]), status: businessResultSchema.shape.status, createdAt: z.iso.datetime() });
const paged = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item).max(100), nextCursor: z.string().max(100).nullable() });
export const businessMastersPageSchema = paged(businessMasterSchema);
export const postingRulesPageSchema = paged(postingRuleSchema);
export const businessEventsPageSchema = paged(businessSummarySchema);
export const transferQueuePageSchema = paged(queueSummarySchema);
export const openClearingLineSchema = lineRef.extend({ account: z.string().regex(/^[1-9]\d{3}$/u), date: z.iso.date(), memo: z.string().max(200), debit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), credit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), dimensions: dimensionMapSchema });
export const openClearingPageSchema = paged(openClearingLineSchema);
export const businessListQuerySchema = z.strictObject(page);
export const queueListQuerySchema = z.strictObject({ ...page, status });
export const openClearingQuerySchema = z.strictObject({ ...page, account: z.string().regex(/^[1-9]\d{3}$/u), date: z.iso.date() });
export const businessSelectionSchema = z.strictObject({ company: code });
export const businessPreviewRequestSchema = z.strictObject({ company: code, event: businessEventSchema });
export const businessConfirmSchema = businessPreviewRequestSchema.extend({ fingerprint, idempotencyKey: id, confirmation: z.literal("POST") });
export const journalEnqueueSchema = journalConfirmSchema.extend({ confirmation: z.literal("QUEUE") });
export const transferConfirmSchema = z.strictObject({ company: code, fingerprint, confirmation: z.literal("TRANSFER") });
export const transferWithdrawSchema = z.strictObject({ company: code, reason: z.string().min(1).max(200), confirmation: z.literal("WITHDRAW") });
export type BusinessEventDto = z.infer<typeof businessEventSchema>;
export type BusinessMasterDto = z.infer<typeof businessMasterSchema>;
export type PostingRuleDto = z.infer<typeof postingRuleSchema>;
export type BusinessPreviewDto = z.infer<typeof businessPreviewSchema>;
export type BusinessResultDto = z.infer<typeof businessResultSchema>;
export type BusinessSummaryDto = z.infer<typeof businessSummarySchema>;
export type QueueSummaryDto = z.infer<typeof queueSummarySchema>;
export type OpenClearingLineDto = z.infer<typeof openClearingLineSchema>;
const components = { BusinessMaster: businessMasterSchema, BusinessMasterSave: businessMasterSaveSchema, PostingRule: postingRuleSchema, PostingRuleSave: postingRuleSaveSchema,
  BusinessMastersPage: businessMastersPageSchema, PostingRulesPage: postingRulesPageSchema, BusinessEvent: businessEventSchema, BusinessPreview: businessPreviewSchema,
  BusinessPreviewRequest: businessPreviewRequestSchema, BusinessConfirm: businessConfirmSchema, BusinessResult: businessResultSchema, BusinessEventsPage: businessEventsPageSchema,
  TransferQueuePage: transferQueuePageSchema, JournalEnqueue: journalEnqueueSchema, TransferConfirm: transferConfirmSchema, TransferWithdraw: transferWithdrawSchema,
  BusinessSelection: businessSelectionSchema, OpenClearingPage: openClearingPageSchema };
function endpoint(operationId: string, output: keyof typeof components, input?: keyof typeof components, query?: z.ZodType, withId = false) {
  const definition = query ? z.toJSONSchema(query) : undefined;
  return { operationId, parameters: [
    ...(withId ? [{ name: "id", in: "path", required: true, schema: z.toJSONSchema(id) }] : []),
    ...Object.entries(definition?.properties ?? {}).map(([name, schema]) => ({ name, in: "query", required: definition?.required?.includes(name) ?? false, schema })) ],
    ...(input ? { requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${input}` } } } } } : {}),
    responses: Object.fromEntries([200,400,403,404,405,409,415,500,503].map(value => [value, { description: value === 200 ? "Explicit scoped result." : "Explicit safe error.", content: { "application/json": { schema: { $ref: `#/components/schemas/${value === 200 ? output : "ErrorResponse"}` } } } }])) };
}
export const businessEventsOpenApi = {
  schemas: Object.fromEntries(Object.entries(components).map(([name, schema]) => [name, z.toJSONSchema(schema)])),
  paths: {
    "/api/v1/services": { get: endpoint("listBusinessServices", "BusinessMastersPage", undefined, businessListQuerySchema), post: endpoint("saveBusinessService", "BusinessMaster", "BusinessMasterSave") },
    "/api/v1/parties": { get: endpoint("listBusinessParties", "BusinessMastersPage", undefined, businessListQuerySchema), post: endpoint("saveBusinessParty", "BusinessMaster", "BusinessMasterSave") },
    "/api/v1/posting-rules": { get: endpoint("listPostingRules", "PostingRulesPage", undefined, businessListQuerySchema), post: endpoint("savePostingRule", "PostingRule", "PostingRuleSave") },
    "/api/v1/events": { get: endpoint("listBusinessEvents", "BusinessEventsPage", undefined, businessListQuerySchema) },
    "/api/v1/events/preview": { post: endpoint("previewBusinessEvent", "BusinessPreview", "BusinessPreviewRequest") },
    "/api/v1/events/confirm": { post: endpoint("confirmBusinessEvent", "BusinessResult", "BusinessConfirm") },
    "/api/v1/events/open-items": { get: endpoint("listOpenClearingItems", "OpenClearingPage", undefined, openClearingQuerySchema) },
    "/api/v1/events/{id}": { get: endpoint("getBusinessEvent", "BusinessResult", undefined, businessSelectionSchema, true) },
    "/api/v1/transfer-queue": { get: endpoint("listTransferQueue", "TransferQueuePage", undefined, queueListQuerySchema), post: endpoint("enqueueJournal", "BusinessResult", "JournalEnqueue") },
    "/api/v1/transfer-queue/{id}/preview": { post: endpoint("previewQueueTransfer", "BusinessPreview", "BusinessSelection", undefined, true) },
    "/api/v1/transfer-queue/{id}/confirm": { post: endpoint("confirmQueueTransfer", "BusinessResult", "TransferConfirm", undefined, true) },
    "/api/v1/transfer-queue/{id}/withdraw": { post: endpoint("withdrawQueueTransfer", "BusinessResult", "TransferWithdraw", undefined, true) },
  },
};

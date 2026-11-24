import type { BusinessEventDto } from "@erp/core/contracts";
export type DraftOperation = "cash_service" | "statistics" | "clearing.match";
/** A new empty draft for `operation`, or a cancellation of `originalId` when given. */
export function freshDraft(
  operation: DraftOperation,
  currency: string,
  originalId?: string,
): BusinessEventDto {
  const base = { id: crypto.randomUUID(), sourceRef: "", date: "", memo: "" };
  return originalId
    ? { ...base, operation: "cash_service.cancel", originalId }
    : operation === "cash_service"
      ? {
          ...base,
          operation,
          direction: "receive",
          service: "",
          party: null,
          currency,
          amount: "",
          dimensions: {},
        }
      : operation === "statistics"
        ? { ...base, operation, code: "", quantity: "", unit: "", dimensions: {} }
        : { ...base, operation, account: "", lines: [] };
}

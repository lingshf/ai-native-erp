import {
  tradeSettlementCommandSchema,
  tradeSettlementConfirmSchema,
  type CompanyDto,
} from "@erp/core/contracts";
import type { Saved } from "./settlement-model.ts";

const day = () => new Date().toISOString().slice(0, 10);
export const storageKey = (company: string) => `erp.tradeSettlements.v1.${company}`;

export function initial(company: CompanyDto): { saved: Saved; failed: boolean } {
  const date = day();
  const empty: Saved = {
    command: {
      company: company.code,
      paymentId: crypto.randomUUID(),
      side: "AP",
      party: "",
      currency: company.currency,
      accountingDate: date,
      documentDate: date,
      taxDate: date,
      items: [],
    },
    pending: null,
  };
  try {
    const raw = window.sessionStorage.getItem(storageKey(company.code));
    if (!raw) return { saved: empty, failed: false };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("command" in value) || !("pending" in value))
      throw new Error("Invalid saved settlement");
    const c = value.command;
    if (
      !c ||
      typeof c !== "object" ||
      !("party" in c) ||
      typeof c.party !== "string" ||
      !("items" in c) ||
      !Array.isArray(c.items)
    )
      throw new Error("Invalid saved settlement");
    const parsed = tradeSettlementCommandSchema.parse({
      ...c,
      party: c.party || "DRAFT",
      items: c.items.length
        ? c.items
        : [{ itemId: crypto.randomUUID(), revision: 1, gross: 1, takeDiscount: false }],
    });
    if (parsed.company !== company.code || parsed.currency !== company.currency)
      throw new Error("Invalid company");
    const pending =
      value.pending === null ? null : tradeSettlementConfirmSchema.parse(value.pending);
    if (
      pending &&
      JSON.stringify(pending.command) !==
        JSON.stringify({ ...parsed, party: c.party, items: c.items })
    )
      throw new Error("Invalid pending settlement");
    return {
      saved: {
        command: { ...parsed, party: c.party, items: c.items.length ? parsed.items : [] },
        pending,
      },
      failed: false,
    };
  } catch {
    return { saved: empty, failed: true };
  }
}

import { tradeActionConfirmSchema, type TradeActionCommandDto } from "@erp/core/contracts";
import type { label } from "../ui/index.ts";

export type Key = Exclude<Parameters<typeof label>[1], "shell.httpError">;
export type T = (key: Key) => string;
export type Money = (minor: number) => string;

// Upper bound shared by credit lines and reversed items, both in the form and in restore().
export const MAX_ACTION_ROWS = 100;
export const PARTY_FILTER_MAX_LENGTH = 60;
export const REASON_MAX_LENGTH = 160;

export type Pending = ReturnType<typeof tradeActionConfirmSchema.parse>;
export type Draft = {
  kind: TradeActionCommandDto["kind"];
  actionId: string;
  side: "AP" | "AR";
  party: string;
  accountingDate: string;
  documentDate: string;
  taxDate: string;
  gross: string;
  sourceId: string;
  targetId: string;
  relatedRevision: string;
  settlementId: string;
  reason: string;
  lines: { id: string; sourceLineId: string; quantity: string }[];
  items: string[];
};
export type Saved = { draft: Draft; pending: Pending | null };
export function empty(): Draft {
  const day = new Date().toISOString().slice(0, 10);
  return {
    kind: "advance",
    actionId: crypto.randomUUID(),
    side: "AP",
    party: "",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    gross: "",
    sourceId: "",
    targetId: "",
    relatedRevision: "",
    settlementId: "",
    reason: "",
    lines: [{ id: crypto.randomUUID(), sourceLineId: "", quantity: "" }],
    items: [],
  };
}
export const key = (company: string) => `erp.tradeActions.v1.${company}`;
export const partyCode = /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u;
export function restore(company: string): { saved: Saved; failed: boolean } {
  const fallback: Saved = { draft: empty(), pending: null };
  try {
    const raw = sessionStorage.getItem(key(company));
    if (!raw) return { saved: fallback, failed: false };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("draft" in value) || !("pending" in value))
      throw new Error("Invalid trade draft");
    const draft = value.draft;
    if (!draft || typeof draft !== "object" || Array.isArray(draft))
      throw new Error("Invalid trade draft");
    const scalar = Object.entries(fallback.draft)
      .filter(([, value]) => typeof value === "string")
      .map(([key]) => key);
    if (
      Object.keys(draft).length !== Object.keys(fallback.draft).length ||
      scalar.some((key) => !(key in draft) || typeof Reflect.get(draft, key) !== "string") ||
      !("kind" in draft) ||
      !["advance", "credit", "apply", "cancel", "reverse"].includes(String(draft.kind)) ||
      !("side" in draft) ||
      !["AP", "AR"].includes(String(draft.side)) ||
      !("items" in draft) ||
      !Array.isArray(draft.items) ||
      draft.items.length > MAX_ACTION_ROWS ||
      draft.items.some((id: unknown) => typeof id !== "string") ||
      !("lines" in draft) ||
      !Array.isArray(draft.lines) ||
      draft.lines.length > MAX_ACTION_ROWS ||
      draft.lines.some(
        (line: unknown) =>
          !line ||
          typeof line !== "object" ||
          !("id" in line) ||
          typeof line.id !== "string" ||
          !("sourceLineId" in line) ||
          typeof line.sourceLineId !== "string" ||
          !("quantity" in line) ||
          typeof line.quantity !== "string",
      )
    )
      throw new Error("Invalid trade draft");
    const pending = value.pending === null ? null : tradeActionConfirmSchema.parse(value.pending);
    if (
      pending &&
      (pending.command.company !== company ||
        pending.command.actionId !== Reflect.get(draft, "actionId") ||
        pending.command.kind !== draft.kind ||
        pending.command.accountingDate !== Reflect.get(draft, "accountingDate") ||
        pending.command.documentDate !== Reflect.get(draft, "documentDate") ||
        pending.command.taxDate !== Reflect.get(draft, "taxDate"))
    )
      throw new Error("Invalid pending trade command");
    return { saved: { draft: draft as Draft, pending }, failed: false };
  } catch {
    return { saved: fallback, failed: true };
  }
}

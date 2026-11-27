import type { CompanyDto, DimensionDto } from "@erp/core/contracts";
import type { Kind } from "./dimension-types.ts";

export const specific = {
  dimension: ["name"],
  value: ["name"],
  defaults: ["values"],
  derivation: ["when", "values", "mode"],
  structure: ["required", "optional", "forbidden", "allowed", "fixed", "conditionals"],
  balance: ["dimension", "account"],
} as const;
export const arrays = new Set(["required", "optional", "forbidden"]);
export const jsonFields = new Set(["values", "when", "allowed", "fixed", "conditionals"]);
export type DraftField = "code" | "from" | "to" | (typeof specific)[Kind][number];
export type Draft = Record<string, string>;

export function initialDraft(kind: Kind, company: CompanyDto, initial: DimensionDto | null) {
  const value: Record<string, string> = {
    code: kind === "balance" ? "LEDGER" : "",
    from: `${company.year}-01-01`,
    to: `${company.year}-12-31`,
    active: "true",
  };
  for (const field of specific[kind])
    value[field] = jsonFields.has(field)
      ? field === "allowed" || field === "conditionals"
        ? "[]"
        : "{}"
      : "";
  if (initial)
    for (const [key, item] of Object.entries(initial))
      value[key] =
        arrays.has(key) && Array.isArray(item)
          ? item.join(",")
          : item !== null && typeof item === "object"
            ? JSON.stringify(item)
            : String(item);
  return value;
}

// Stops at the first JSON field with a syntax error, in field order; any other error propagates.
export function parseDraftFields(
  fields: readonly DraftField[],
  draft: Draft,
): { values: Record<string, unknown> } | { invalidField: DraftField } {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    try {
      values[field] = arrays.has(field)
        ? draft[field]
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : jsonFields.has(field)
          ? JSON.parse(draft[field])
          : draft[field];
    } catch (issue) {
      if (!(issue instanceof SyntaxError)) throw issue;
      return { invalidField: field };
    }
  }
  return { values };
}

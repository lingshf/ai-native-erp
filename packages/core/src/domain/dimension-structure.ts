import type { DimensionConfigOf } from "./dimension-catalog.ts";
import { dimensionError } from "./dimension-issues.ts";
import { mapSignature, matches } from "./dimension-map.ts";
import { applyDimensions, type DimensionResolution } from "./dimension-resolution.ts";
import type { DimensionMap } from "./dimensions.ts";

type StructureRule = DimensionConfigOf<"structure">;
type ConditionalRule = StructureRule["conditionals"][number];

function mergeConditionalFixed(candidate: Record<string, string | null>, fixed: DimensionMap) {
  for (const [key, value] of Object.entries(fixed)) {
    if (Object.hasOwn(candidate, key) && candidate[key] !== value)
      dimensionError(`fixed.${key}`, "conflict");
    candidate[key] = value;
  }
}
// Re-evaluates conditionals against the fixed values they produce until the fixed values stop changing.
function settleConditionals(
  structure: StructureRule,
  result: DimensionMap,
): { fixed: DimensionMap; active: ConditionalRule[] } {
  let fixed: DimensionMap = structure.fixed;
  const seen = new Set<string>();
  for (;;) {
    const signature = mapSignature(fixed);
    if (seen.has(signature) || seen.size > 200) dimensionError("conditionals", "cycle");
    seen.add(signature);
    const final = { ...result, ...fixed },
      candidate = { ...structure.fixed };
    const active = structure.conditionals.filter((rule) => matches(rule.when, final));
    for (const rule of active) mergeConditionalFixed(candidate, rule.fixed);
    if (mapSignature(candidate) === signature) return { fixed, active };
    fixed = candidate;
  }
}
export function applyStructure(
  resolution: DimensionResolution,
  structure: StructureRule,
  input: { readonly account: string; readonly explicit?: DimensionMap },
) {
  const { result } = resolution;
  const required = new Set(structure.required);
  const { fixed, active } = settleConditionals(structure, result);
  for (const rule of active) for (const key of rule.required) required.add(key);
  for (const [key, value] of Object.entries(fixed))
    if (Object.hasOwn(input.explicit ?? {}, key) && input.explicit?.[key] !== value)
      dimensionError(`fixed.${key}`, "conflict");
  applyDimensions(resolution, fixed, `fixed:${input.account}@${structure.revision}`);
  for (const key of required)
    if (result[key] == null) dimensionError(`dimensions.${key}`, "required");
  for (const key of structure.forbidden)
    if (Object.hasOwn(result, key)) dimensionError(`dimensions.${key}`, "forbidden");
  if (structure.allowed.length && !structure.allowed.some((combo) => matches(combo, result)))
    dimensionError("dimensions", "combination");
}

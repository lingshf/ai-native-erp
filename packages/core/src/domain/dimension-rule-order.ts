import type { DimensionConfigOf } from "./dimension-catalog.ts";
import { dimensionError } from "./dimension-issues.ts";

export type DerivationRule = DimensionConfigOf<"derivation">;

// True when `rule` reads (in `when`) a dimension that `writer` writes (in `values`).
const dependsOn = (rule: DerivationRule, writer: DerivationRule) =>
  Object.keys(rule.when).some((key) => Object.hasOwn(writer.values, key));
export function orderedRules(rules: readonly DerivationRule[]): DerivationRule[] {
  const remaining = new Set(rules);
  const sorted: (typeof rules)[number][] = [];
  while (remaining.size) {
    const ready = [...remaining].filter(
      (rule) => ![...remaining].some((other) => other !== rule && dependsOn(rule, other)),
    );
    if (!ready.length || ready.some((rule) => dependsOn(rule, rule)))
      dimensionError("when", "cycle");
    for (const rule of ready) {
      sorted.push(rule);
      remaining.delete(rule);
    }
  }
  return sorted;
}

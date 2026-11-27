import {
  type DimensionConfigOf,
  type DimensionReferences,
  effective,
} from "./dimension-catalog.ts";
import { dimensionError } from "./dimension-issues.ts";
import { matches } from "./dimension-map.ts";
import type { DerivationRule } from "./dimension-rule-order.ts";
import type { DimensionMap } from "./dimensions.ts";

// Created anew by every `resolve` call; never shared between calls.
export interface DimensionResolution {
  readonly result: Record<string, string | null>;
  readonly origins: Record<
    string,
    { source: string; previous?: string | null; value: string | null }[]
  >;
}

export function applyDimensions(
  resolution: DimensionResolution,
  map: DimensionMap,
  source: string,
  fill = false,
) {
  const { result, origins } = resolution;
  for (const [key, value] of Object.entries(map)) {
    if (
      !/^[A-Z][A-Z0-9_]{0,31}$/u.test(key) ||
      (value !== null && (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9_-]{0,39}$/u.test(value)))
    )
      dimensionError("dimensions", "shape");
    if (fill && Object.hasOwn(result, key)) continue;
    origins[key] ??= [];
    origins[key].push({
      source,
      ...(Object.hasOwn(result, key) ? { previous: result[key] } : {}),
      value,
    });
    result[key] = value;
  }
}
export function applyAccountDefaults(
  resolution: DimensionResolution,
  defaults: ReadonlyMap<string, DimensionConfigOf<"defaults">>,
  input: { readonly account: string; readonly day: string },
) {
  for (const key of new Set(["LEDGER", input.account])) {
    const config = defaults.get(key);
    if (config && effective(config, input.day))
      applyDimensions(resolution, config.values, `defaults:${key}@${config.revision}`);
  }
}
// Two derivations firing in one resolve must not write different values to the same dimension.
function recordDerivationWrites(writes: Map<string, string | null>, rule: DerivationRule) {
  for (const [key, value] of Object.entries(rule.values)) {
    if (writes.has(key) && writes.get(key) !== value)
      dimensionError(`derivation.${rule.code}.${key}`, "conflict");
    writes.set(key, value);
  }
}
export function applyDerivations(
  resolution: DimensionResolution,
  rules: readonly DerivationRule[],
  input: { readonly day: string },
) {
  const writes = new Map<string, string | null>();
  for (const rule of rules)
    if (effective(rule, input.day) && matches(rule.when, resolution.result)) {
      recordDerivationWrites(writes, rule);
      applyDimensions(
        resolution,
        rule.values,
        `derivation:${rule.code}@${rule.revision}:${rule.mode}`,
        rule.mode === "fill",
      );
    }
}
export function checkResolvedReferences(
  references: DimensionReferences,
  result: Readonly<Record<string, string | null>>,
  input: { readonly day: string },
) {
  for (const [key, value] of Object.entries(result)) {
    const dimension = references.definitions.get(key),
      entry = value === null ? null : references.values.get(`${key}:${value}`);
    if (
      !dimension ||
      !effective(dimension, input.day) ||
      (value !== null && (!entry || !effective(entry, input.day)))
    )
      dimensionError(`dimensions.${key}`, "reference");
  }
}

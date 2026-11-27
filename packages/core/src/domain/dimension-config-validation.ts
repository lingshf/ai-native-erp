import {
  catalogReferences,
  type DimensionConfigOf,
  type DimensionReferences,
} from "./dimension-catalog.ts";
import { checkedDimensionDay, dimensionError } from "./dimension-issues.ts";
import { mapSignature } from "./dimension-map.ts";
import { type DerivationRule, orderedRules } from "./dimension-rule-order.ts";
import type { DimensionConfig, DimensionMap } from "./dimensions.ts";

function checkConfigShape(config: DimensionConfig): void {
  const codePattern =
    config.kind === "value"
      ? /^[A-Z0-9][A-Z0-9_-]{0,39}$/u
      : config.kind === "structure"
        ? /^[1-9]\d{3}$/u
        : config.kind === "balance"
          ? /^LEDGER$/u
          : config.kind === "defaults"
            ? /^(?:LEDGER|[1-9]\d{3})$/u
            : /^[A-Z][A-Z0-9_]{0,31}$/u;
  if (!codePattern.test(config.code)) dimensionError("code", "shape");
  if (!Number.isSafeInteger(config.revision) || config.revision < 1)
    dimensionError("revision", "shape");
  if (
    (config.kind === "dimension" || config.kind === "value") &&
    (!config.name.trim() || config.name.length > 80 || /\p{Cc}/u.test(config.name))
  )
    dimensionError("name", "shape");
  if (config.kind === "balance" && !/^[1-9]\d{3}$/u.test(config.account))
    dimensionError("account", "shape");
  checkedDimensionDay(config.from, "from");
  checkedDimensionDay(config.to, "to");
  if (
    new TextEncoder().encode(JSON.stringify(config)).byteLength > 64000 ||
    typeof config.active !== "boolean"
  )
    dimensionError("form", "shape");
  if (config.from > config.to) dimensionError("to", "window");
}
function checkDimensionReference(references: DimensionReferences, key: string, path: string) {
  if (!references.definitions.has(key)) dimensionError(path, "reference");
}
function checkDimensionMap(references: DimensionReferences, input: DimensionMap, path: string) {
  if (Object.keys(input).length > 32) dimensionError(path, "shape");
  for (const [key, value] of Object.entries(input)) {
    checkDimensionReference(references, key, `${path}.${key}`);
    if (value !== null && !references.values.has(`${key}:${value}`))
      dimensionError(`${path}.${key}`, "reference");
  }
}
function checkDimensionList(
  references: DimensionReferences,
  items: readonly string[],
  path: string,
) {
  if (items.length > 32) dimensionError(path, "shape");
  if (new Set(items).size !== items.length) dimensionError(path, "duplicate");
  for (const [index, key] of items.entries())
    checkDimensionReference(references, key, `${path}.${index}`);
}
function checkDerivation(
  config: DerivationRule,
  catalog: readonly DimensionConfig[],
  references: DimensionReferences,
) {
  checkDimensionMap(references, config.when, "when");
  if (!Object.keys(config.when).length || !Object.keys(config.values).length)
    dimensionError("when", "required");
  // Only checks for a cycle among the active rules; the order itself is not needed here.
  orderedRules([
    ...catalog.filter(
      (item): item is DerivationRule =>
        item.kind === "derivation" && item.active && item.code !== config.code,
    ),
    ...(config.active ? [config] : []),
  ]);
}
function checkStructure(config: DimensionConfigOf<"structure">, references: DimensionReferences) {
  if (config.allowed.length > 100 || config.conditionals.length > 100)
    dimensionError("allowed", "shape");
  checkDimensionList(references, config.required, "required");
  checkDimensionList(references, config.optional, "optional");
  checkDimensionList(references, config.forbidden, "forbidden");
  const fields = new Set<string>();
  for (const field of ["required", "optional", "forbidden"] as const) {
    for (const [index, key] of config[field].entries()) {
      if (fields.has(key)) dimensionError(`${field}.${index}`, "duplicate");
      fields.add(key);
    }
  }
  checkDimensionMap(references, config.fixed, "fixed");
  if (config.forbidden.some((key) => Object.hasOwn(config.fixed, key)))
    dimensionError("fixed", "forbidden");
  const seen = new Set<string>();
  for (const [index, combo] of config.allowed.entries()) {
    checkDimensionMap(references, combo, `allowed.${index}`);
    if (config.forbidden.some((key) => Object.hasOwn(combo, key)))
      dimensionError(`allowed.${index}`, "combination");
    const signature = mapSignature(combo);
    if (seen.has(signature)) dimensionError(`allowed.${index}`, "duplicate");
    seen.add(signature);
  }
  for (const [index, rule] of config.conditionals.entries()) {
    checkDimensionMap(references, rule.when, `conditionals.${index}.when`);
    checkDimensionMap(references, rule.fixed, `conditionals.${index}.fixed`);
    checkDimensionList(references, rule.required, `conditionals.${index}.required`);
    if (
      rule.required.some((key) => config.forbidden.includes(key)) ||
      Object.keys(rule.fixed).some((key) => config.forbidden.includes(key))
    )
      dimensionError(`conditionals.${index}`, "forbidden");
  }
}
export function validateDimensionConfig(
  config: DimensionConfig,
  catalog: readonly DimensionConfig[],
): void {
  checkConfigShape(config);
  const references = catalogReferences(catalog);
  if (config.kind === "value" || config.kind === "balance")
    checkDimensionReference(references, config.dimension, "dimension");
  if (config.kind === "defaults" || config.kind === "derivation")
    checkDimensionMap(references, config.values, "values");
  if (config.kind === "derivation") checkDerivation(config, catalog, references);
  if (config.kind === "structure") checkStructure(config, references);
}

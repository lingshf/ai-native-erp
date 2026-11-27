import { checkedMinor, type Account } from "./index.ts";
import { catalogReferences, effective, indexByKind } from "./dimension-catalog.ts";
import { checkedDimensionDay, dimensionError } from "./dimension-issues.ts";
import { ordered } from "./dimension-map.ts";
import {
  applyAccountDefaults,
  applyDerivations,
  applyDimensions,
  checkResolvedReferences,
  type DimensionResolution,
} from "./dimension-resolution.ts";
import { orderedRules } from "./dimension-rule-order.ts";
import { applyStructure } from "./dimension-structure.ts";

export { dimensionKey } from "./dimension-catalog.ts";
export { validateDimensionConfig } from "./dimension-config-validation.ts";
export { checkedDimensionDay, dimensionError } from "./dimension-issues.ts";

export type DimensionMap = Readonly<Record<string, string | null>>;
interface Base {
  readonly code: string;
  readonly revision: number;
  readonly active: boolean;
  readonly from: string;
  readonly to: string;
}
export type DimensionConfig = Base &
  (
    | { readonly kind: "dimension"; readonly name: string }
    | { readonly kind: "value"; readonly dimension: string; readonly name: string }
    | { readonly kind: "defaults"; readonly values: DimensionMap }
    | {
        readonly kind: "derivation";
        readonly when: DimensionMap;
        readonly values: DimensionMap;
        readonly mode: "fill" | "replace";
      }
    | {
        readonly kind: "structure";
        readonly required: readonly string[];
        readonly optional: readonly string[];
        readonly forbidden: readonly string[];
        readonly allowed: readonly DimensionMap[];
        readonly fixed: DimensionMap;
        readonly conditionals: readonly {
          readonly when: DimensionMap;
          readonly required: readonly string[];
          readonly fixed: DimensionMap;
        }[];
      }
    | { readonly kind: "balance"; readonly dimension: string; readonly account: string }
  );
export interface DimensionFieldIssue {
  readonly scope: "dimensions";
  readonly path: string;
  readonly rule:
    | "shape"
    | "reference"
    | "window"
    | "duplicate"
    | "cycle"
    | "conflict"
    | "required"
    | "forbidden"
    | "combination"
    | "balance";
}
export function compileDimensionRules(catalog: readonly DimensionConfig[]) {
  const references = catalogReferences(catalog);
  const defaults = indexByKind(catalog, "defaults");
  const structures = indexByKind(catalog, "structure");
  const rules = orderedRules(
    catalog.filter(
      (item): item is Extract<DimensionConfig, { kind: "derivation" }> =>
        item.kind === "derivation" && item.active,
    ),
  );
  return {
    resolve(input: {
      account: string;
      day: string;
      master?: DimensionMap;
      header?: DimensionMap;
      explicit?: DimensionMap;
    }) {
      checkedDimensionDay(input.day);
      const resolution: DimensionResolution = { result: {}, origins: {} };
      // Later sources override earlier ones: defaults (LEDGER, then the account), master, header,
      // line, derivations, then the account structure's fixed values.
      applyAccountDefaults(resolution, defaults, input);
      applyDimensions(resolution, input.master ?? {}, "master");
      applyDimensions(resolution, input.header ?? {}, "header");
      applyDimensions(resolution, input.explicit ?? {}, "line");
      applyDerivations(resolution, rules, input);
      const structure = structures.get(input.account);
      if (structure && effective(structure, input.day))
        applyStructure(resolution, structure, input);
      checkResolvedReferences(references, resolution.result, input);
      return {
        dimensions: ordered(resolution.result),
        dimensionOrigins: ordered(resolution.origins),
      };
    },
  };
}
export function dimensionBalance(
  config: Extract<DimensionConfig, { kind: "balance" }> | undefined,
  day: string,
  lines: readonly { debit: number; credit: number; dimensions: DimensionMap }[],
  account: Pick<Account, "code" | "active" | "purpose"> | null,
) {
  checkedDimensionDay(day);
  const groups = new Map<string, bigint>();
  let total = 0n;
  for (const [index, line] of lines.entries()) {
    if (
      !Number.isSafeInteger(line.debit) ||
      !Number.isSafeInteger(line.credit) ||
      line.debit < 0 ||
      line.credit < 0 ||
      line.debit > 0 === line.credit > 0
    )
      dimensionError(`lines.${index}`, "balance");
    const net = BigInt(line.debit) - BigInt(line.credit);
    total += net;
  }
  if (total !== 0n) dimensionError("lines", "balance");
  if (!config || !effective(config, day)) return [];
  if (
    !account ||
    account.code !== config.account ||
    !account.active ||
    account.purpose !== "clearing"
  )
    dimensionError("account", "reference");
  for (const [index, line] of lines.entries()) {
    const value = line.dimensions[config.dimension];
    if (value == null) dimensionError(`lines.${index}.dimensions.${config.dimension}`, "required");
    groups.set(value, (groups.get(value) ?? 0n) + BigInt(line.debit) - BigInt(line.credit));
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .filter(([, net]) => net !== 0n)
    .map(([value, net]) => ({
      account: config.account,
      debit: net < 0n ? checkedMinor(-net, 0) : 0,
      credit: net > 0n ? checkedMinor(net, 0) : 0,
      dimensions: { [config.dimension]: value },
      configurationRevision: config.revision,
      businessNet: checkedMinor(net, 0),
    }));
}

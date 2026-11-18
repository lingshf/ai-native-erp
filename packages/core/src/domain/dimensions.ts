import { DomainError, checkedMinor } from "./index.ts";

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
export function dimensionError(path: string, rule: DimensionFieldIssue["rule"]): never {
  throw new DomainError("INVALID_INPUT", { scope: "dimensions", path, rule });
}
export function checkedDimensionDay(day: string, path = "day"): void {
  if (
    !/^(?:19\d{2}|[2-9]\d{3})-\d\d-\d\d$/u.test(day) ||
    day > "9998-12-31" ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    dimensionError(path, "window");
}
export const dimensionKey = (config: DimensionConfig) =>
  config.kind === "value" ? `${config.dimension}:${config.code}` : config.code;
const effective = (config: Base, day: string) =>
  config.active && config.from <= day && day <= config.to;
const ordered = <T>(map: Readonly<Record<string, T>>) =>
  Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
function orderedRules(rules: readonly Extract<DimensionConfig, { kind: "derivation" }>[]) {
  const remaining = new Set(rules);
  const sorted: (typeof rules)[number][] = [];
  while (remaining.size) {
    const ready = [...remaining].filter(
      (rule) =>
        ![...remaining].some(
          (other) =>
            other !== rule &&
            Object.keys(rule.when).some((key) => Object.hasOwn(other.values, key)),
        ),
    );
    if (
      !ready.length ||
      ready.some((rule) => Object.keys(rule.when).some((key) => Object.hasOwn(rule.values, key)))
    )
      dimensionError("when", "cycle");
    for (const rule of ready) {
      sorted.push(rule);
      remaining.delete(rule);
    }
  }
  return sorted;
}
export function validateDimensionConfig(
  config: DimensionConfig,
  catalog: readonly DimensionConfig[],
): void {
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
  const definitions = new Map(
    catalog.filter((item) => item.kind === "dimension").map((item) => [item.code, item]),
  );
  const values = new Map(
    catalog.filter((item) => item.kind === "value").map((item) => [dimensionKey(item), item]),
  );
  const reference = (key: string, path: string) => {
    if (!definitions.has(key)) dimensionError(path, "reference");
  };
  const map = (input: DimensionMap, path: string) => {
    if (Object.keys(input).length > 32) dimensionError(path, "shape");
    for (const [key, value] of Object.entries(input)) {
      reference(key, `${path}.${key}`);
      if (value !== null && !values.has(`${key}:${value}`))
        dimensionError(`${path}.${key}`, "reference");
    }
  };
  const list = (items: readonly string[], path: string) => {
    if (items.length > 32) dimensionError(path, "shape");
    if (new Set(items).size !== items.length) dimensionError(path, "duplicate");
    for (const [index, key] of items.entries()) reference(key, `${path}.${index}`);
  };
  if (config.kind === "value" || config.kind === "balance")
    reference(config.dimension, "dimension");
  if (config.kind === "defaults" || config.kind === "derivation") map(config.values, "values");
  if (config.kind === "derivation") {
    map(config.when, "when");
    if (!Object.keys(config.when).length || !Object.keys(config.values).length)
      dimensionError("when", "required");
    orderedRules([
      ...catalog.filter(
        (item): item is Extract<DimensionConfig, { kind: "derivation" }> =>
          item.kind === "derivation" && item.active && item.code !== config.code,
      ),
      ...(config.active ? [config] : []),
    ]);
  }
  if (config.kind === "structure") {
    if (config.allowed.length > 100 || config.conditionals.length > 100)
      dimensionError("allowed", "shape");
    list(config.required, "required");
    list(config.optional, "optional");
    list(config.forbidden, "forbidden");
    const fields = [...config.required, ...config.optional, ...config.forbidden];
    if (new Set(fields).size !== fields.length) dimensionError("forbidden", "duplicate");
    map(config.fixed, "fixed");
    if (config.forbidden.some((key) => Object.hasOwn(config.fixed, key)))
      dimensionError("fixed", "forbidden");
    const seen = new Set<string>();
    for (const [index, combo] of config.allowed.entries()) {
      map(combo, `allowed.${index}`);
      if (config.forbidden.some((key) => Object.hasOwn(combo, key)))
        dimensionError(`allowed.${index}`, "combination");
      const signature = JSON.stringify(ordered(combo));
      if (seen.has(signature)) dimensionError(`allowed.${index}`, "duplicate");
      seen.add(signature);
    }
    for (const [index, rule] of config.conditionals.entries()) {
      map(rule.when, `conditionals.${index}.when`);
      map(rule.fixed, `conditionals.${index}.fixed`);
      list(rule.required, `conditionals.${index}.required`);
      if (
        rule.required.some((key) => config.forbidden.includes(key)) ||
        Object.keys(rule.fixed).some((key) => config.forbidden.includes(key))
      )
        dimensionError(`conditionals.${index}`, "forbidden");
    }
  }
}
export function compileDimensionRules(catalog: readonly DimensionConfig[]) {
  const definitions = new Map(
    catalog.filter((item) => item.kind === "dimension").map((item) => [item.code, item]),
  );
  const values = new Map(
    catalog.filter((item) => item.kind === "value").map((item) => [dimensionKey(item), item]),
  );
  const defaults = new Map(
    catalog.filter((item) => item.kind === "defaults").map((item) => [item.code, item]),
  );
  const structures = new Map(
    catalog.filter((item) => item.kind === "structure").map((item) => [item.code, item]),
  );
  const rules = orderedRules(
    catalog.filter(
      (item): item is Extract<DimensionConfig, { kind: "derivation" }> =>
        item.kind === "derivation" && item.active,
    ),
  );
  const matches = (when: DimensionMap, input: DimensionMap) =>
    Object.entries(when).every(([key, value]) => Object.hasOwn(input, key) && input[key] === value);
  return {
    resolve(input: {
      account: string;
      day: string;
      master?: DimensionMap;
      header?: DimensionMap;
      explicit?: DimensionMap;
    }) {
      checkedDimensionDay(input.day);
      const result: Record<string, string | null> = {};
      const origins: Record<
        string,
        { source: string; previous?: string | null; value: string | null }[]
      > = {};
      const apply = (map: DimensionMap, source: string, fill = false) => {
        for (const [key, value] of Object.entries(map)) {
          if (
            !/^[A-Z][A-Z0-9_]{0,31}$/u.test(key) ||
            (value !== null &&
              (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9_-]{0,39}$/u.test(value)))
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
      };
      for (const key of new Set(["LEDGER", input.account])) {
        const config = defaults.get(key);
        if (config && effective(config, input.day))
          apply(config.values, `defaults:${key}@${config.revision}`);
      }
      apply(input.master ?? {}, "master");
      apply(input.header ?? {}, "header");
      apply(input.explicit ?? {}, "line");
      const writes = new Map<string, string | null>();
      for (const rule of rules)
        if (effective(rule, input.day) && matches(rule.when, result)) {
          for (const [key, value] of Object.entries(rule.values)) {
            if (writes.has(key) && writes.get(key) !== value)
              dimensionError(`derivation.${rule.code}.${key}`, "conflict");
            writes.set(key, value);
          }
          apply(
            rule.values,
            `derivation:${rule.code}@${rule.revision}:${rule.mode}`,
            rule.mode === "fill",
          );
        }
      const structure = structures.get(input.account);
      if (structure && effective(structure, input.day)) {
        const required = new Set(structure.required);
        let fixed: DimensionMap = structure.fixed;
        const seen = new Set<string>();
        for (;;) {
          const signature = JSON.stringify(ordered(fixed));
          if (seen.has(signature) || seen.size > 200) dimensionError("conditionals", "cycle");
          seen.add(signature);
          const final = { ...result, ...fixed },
            candidate = { ...structure.fixed };
          const active = structure.conditionals.filter((rule) => matches(rule.when, final));
          for (const rule of active)
            for (const [key, value] of Object.entries(rule.fixed)) {
              if (Object.hasOwn(candidate, key) && candidate[key] !== value)
                dimensionError(`fixed.${key}`, "conflict");
              candidate[key] = value;
            }
          if (JSON.stringify(ordered(candidate)) === signature) {
            for (const rule of active) for (const key of rule.required) required.add(key);
            break;
          }
          fixed = candidate;
        }
        for (const [key, value] of Object.entries(fixed))
          if (Object.hasOwn(input.explicit ?? {}, key) && input.explicit?.[key] !== value)
            dimensionError(`fixed.${key}`, "conflict");
        apply(fixed, `fixed:${input.account}@${structure.revision}`);
        for (const key of required)
          if (result[key] == null) dimensionError(`dimensions.${key}`, "required");
        for (const key of structure.forbidden)
          if (Object.hasOwn(result, key)) dimensionError(`dimensions.${key}`, "forbidden");
        if (structure.allowed.length && !structure.allowed.some((combo) => matches(combo, result)))
          dimensionError("dimensions", "combination");
      }
      for (const [key, value] of Object.entries(result)) {
        const dimension = definitions.get(key),
          entry = value === null ? null : values.get(`${key}:${value}`);
        if (
          !dimension ||
          !effective(dimension, input.day) ||
          (value !== null && (!entry || !effective(entry, input.day)))
        )
          dimensionError(`dimensions.${key}`, "reference");
      }
      return { dimensions: ordered(result), dimensionOrigins: ordered(origins) };
    },
  };
}
export function dimensionBalance(
  config: Extract<DimensionConfig, { kind: "balance" }> | undefined,
  day: string,
  lines: readonly { debit: number; credit: number; dimensions: DimensionMap }[],
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

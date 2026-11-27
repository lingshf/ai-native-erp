import type { DimensionConfig } from "./dimensions.ts";

export type DimensionConfigOf<K extends DimensionConfig["kind"]> = Extract<
  DimensionConfig,
  { kind: K }
>;
export interface DimensionReferences {
  readonly definitions: ReadonlyMap<string, DimensionConfigOf<"dimension">>;
  readonly values: ReadonlyMap<string, DimensionConfigOf<"value">>;
}

export const dimensionKey = (config: DimensionConfig) =>
  config.kind === "value" ? `${config.dimension}:${config.code}` : config.code;
export const effective = (config: Pick<DimensionConfig, "active" | "from" | "to">, day: string) =>
  config.active && config.from <= day && day <= config.to;
// Keys by dimensionKey: `dimension:code` for values, `code` for every other kind.
export function indexByKind<K extends DimensionConfig["kind"]>(
  catalog: readonly DimensionConfig[],
  kind: K,
) {
  return new Map(
    catalog
      .filter((item): item is DimensionConfigOf<K> => item.kind === kind)
      .map((item) => [dimensionKey(item), item]),
  );
}
export function catalogReferences(catalog: readonly DimensionConfig[]): DimensionReferences {
  return {
    definitions: indexByKind(catalog, "dimension"),
    values: indexByKind(catalog, "value"),
  };
}

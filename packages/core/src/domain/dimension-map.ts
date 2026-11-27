import type { DimensionMap } from "./dimensions.ts";

export const ordered = <T>(map: Readonly<Record<string, T>>) =>
  Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
export const mapSignature = (map: DimensionMap) => JSON.stringify(ordered(map));
export const matches = (when: DimensionMap, input: DimensionMap) =>
  Object.entries(when).every(([key, value]) => Object.hasOwn(input, key) && input[key] === value);

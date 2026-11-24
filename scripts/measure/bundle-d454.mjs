// D454: decides whether a first screen that differs only in preload order counts as ±0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bytesOf, firstScreenClosure, sorted, unhashedName } from "./bundle-graph.mjs";

export const D454_MASKED_TOLERANCE_BYTES = 10;
const PRELOAD_TABLE = /m\.f=(\[[^\]]*\])/;
const MAP_DEPS_CALL = /__vite__mapDeps\(\[([\d,]*)\]\)/g;
const D454_RULES = [
  "① preload set equal",
  "② raw ±0",
  "③ text equal after sorting m.f and __vite__mapDeps",
  `④ masked gzip-9 |Δ| ≤ ${D454_MASKED_TOLERANCE_BYTES} B`,
];

const sameSet = (a, b) => sorted(new Set(a)).join("\n") === sorted(new Set(b)).join("\n");

// D454 ③: sort the m.f file table and every __vite__mapDeps list, so only preload order is ignored.
export function sortPreloads(text) {
  const tableText = text.match(PRELOAD_TABLE)?.[1];
  if (!tableText) return unhashedName(text);
  const table = JSON.parse(tableText).map(unhashedName);
  const sortedList = (list) => sorted(list.split(",").map((index) => table[Number(index)]));
  return unhashedName(text)
    .replace(unhashedName(tableText), JSON.stringify(sorted(table)))
    .replace(MAP_DEPS_CALL, (_, list) => `__vite__mapDeps(${JSON.stringify(sortedList(list))})`);
}
const chunkText = (build, key) => readFileSync(join(build.dir, build.chunks.get(key).file), "utf8");
const preloadFiles = (text) => JSON.parse(text.match(PRELOAD_TABLE)?.[1] ?? "[]");
const preloadTable = (build, keys) =>
  [...keys].flatMap((key) => preloadFiles(chunkText(build, key))).map(unhashedName);
const sortedText = (build, keys) =>
  sorted(keys)
    .map((key) => sortPreloads(chunkText(build, key)))
    .join("\n");

// D454: a first screen differing only in preload order counts as ±0 when all four rules hold.
export function d454Verdict(base, head) {
  const keys = { base: firstScreenClosure(base), head: firstScreenClosure(head) };
  const bytes = { base: bytesOf(base, keys.base), head: bytesOf(head, keys.head) };
  const passes = [
    sameSet(keys.base, keys.head) &&
      sameSet(preloadTable(base, keys.base), preloadTable(head, keys.head)),
    bytes.base.raw === bytes.head.raw,
    sortedText(base, keys.base) === sortedText(head, keys.head),
    Math.abs(bytes.head.gzip - bytes.base.gzip) <= D454_MASKED_TOLERANCE_BYTES,
  ];
  const rules = D454_RULES.map((rule, index) => ({ rule, pass: passes[index] }));
  return { rules, pass: passes.every(Boolean) };
}

// Budget items, limits and budget flags (D454 / D460): what is measured and whether it passes.
import { usageError } from "./bundle-errors.mjs";
import {
  bytesOf,
  fileBytes,
  firstScreenClosure,
  jsBytes,
  NO_BYTES,
  routeAddedBytes,
  routeKeys,
  sorted,
  unhashedName,
} from "./bundle-graph.mjs";

const DEFAULT_LIMIT = Object.freeze({ text: "±0", min: 0, max: 0 });

function measuredSide(build) {
  const cssFiles = [...build.chunks.values()].flatMap((chunk) => chunk.css);
  const css = new Map(cssFiles.map((file) => [unhashedName(file), file]));
  return { build, firstScreen: firstScreenClosure(build), css };
}
const has = (side, key) => side.build.chunks.has(key);
const firstScreenValue = (side) => bytesOf(side.build, side.firstScreen);
const routeValue = (side, key) =>
  has(side, key) ? routeAddedBytes(side.build, key, side.firstScreen) : NO_BYTES;
const chunkValue = (side, key) => (has(side, key) ? jsBytes(side.build, key) : NO_BYTES);
const cssValue = (side, key) =>
  side.css.has(key) ? fileBytes(side.build, side.css.get(key)) : NO_BYTES;
const chunksOutsideFirstScreen = (side) =>
  [...side.build.chunks]
    .filter(([key, chunk]) => chunk.file.endsWith(".js") && !side.firstScreen.has(key))
    .map(([key]) => key);

// Budget items: the first screen, every lazy route, every JS chunk outside the first screen, every CSS
// file. base / head are masked gzip-9 (budgets decide on them); rawBase / rawHead are for reference.
export function budgetItems(base, head) {
  const sides = [measuredSide(base), measuredSide(head)];
  const [b, h] = sides;
  const row = (kind, key, value) => {
    const [before, after] = [value(b, key), value(h, key)];
    const raw = { rawBase: before.raw, rawHead: after.raw };
    return { kind, key, base: before.gzip, head: after.gzip, ...raw };
  };
  const keysOf = (pick) => sorted(new Set(sides.flatMap(pick)));
  return [
    row("first-screen", "first-screen", firstScreenValue),
    ...keysOf((side) => routeKeys(side.build)).map((key) => row("route", key, routeValue)),
    ...keysOf(chunksOutsideFirstScreen).map((key) => row("chunk", key, chunkValue)),
    ...keysOf((side) => [...side.css.keys()]).map((key) => row("chunk", key, cssValue)),
  ];
}

// A limit is "+N" (growth up to N B, any shrink) or "±N" / "N" (|Δ| ≤ N B).
export function parseLimit(text) {
  const match = /^(\+|±)?(\d+)$/.exec(text ?? "");
  if (!match) throw usageError(`invalid limit "${text}": use +N, ±N or N bytes`);
  const bytes = Number(match[2]);
  return { text, min: match[1] === "+" ? -Infinity : -bytes, max: bytes };
}

// D454 / D460: each item passes within its limit (default ±0); --d454 also passes a D454 first screen.
export function checkBudgets(items, budgets, d454Pass = false) {
  const known = new Set(items.map((item) => `${item.kind}:${item.key}`));
  const requested = ["chunk", "route"].flatMap((kind) =>
    [...budgets[kind].keys()].map((key) => `${kind}:${key}`),
  );
  const missing = requested.find((id) => !known.has(id));
  if (missing) throw usageError(`--${missing.replace(":", " ")}: no such item in either build`);
  return items.map((item) => {
    const delta = item.head - item.base;
    const limit = budgets[item.kind].get(item.key) ?? DEFAULT_LIMIT;
    const withinLimit = delta >= limit.min && delta <= limit.max;
    const d454Exempt = item.kind === "first-screen" && budgets.d454 && d454Pass;
    return { ...item, delta, limit: limit.text, pass: withinLimit || d454Exempt };
  });
}

const BUDGET_FLAGS = {
  "--first-screen": (budgets, value) =>
    budgets["first-screen"].set("first-screen", parseLimit(value)),
  "--chunk": (budgets, value) => addKeyedLimit(budgets.chunk, "--chunk", value),
  "--route": (budgets, value) => addKeyedLimit(budgets.route, "--route", value),
};
function addKeyedLimit(target, flag, value) {
  const separator = value?.lastIndexOf("=") ?? -1;
  if (separator <= 0) throw usageError(`${flag} needs <key>=<limit>, got "${value}"`);
  target.set(value.slice(0, separator), parseLimit(value.slice(separator + 1)));
}

// Takes the budget flags out of argv; every other token is returned in `rest` for the caller.
export function parseBudgetArgs(argv) {
  const budgets = { d454: false, "first-screen": new Map(), chunk: new Map(), route: new Map() };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--d454") budgets.d454 = true;
    else if (BUDGET_FLAGS[flag]) BUDGET_FLAGS[flag](budgets, argv[++index]);
    else rest.push(flag);
  }
  return { budgets, rest };
}

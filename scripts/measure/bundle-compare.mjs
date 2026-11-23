// Compares two Vite builds made with `vite build --manifest` by the D432 / D454 rules and checks budgets.
// Usage: node scripts/measure/bundle-compare.mjs <base-dist> <head-dist>
//          [--first-screen ±B] [--d454] [--chunk <key>=<limit>]... [--route <key>=<limit>]...
// Unlisted items must stay ±0. Exit codes: see EXIT_CODES and scripts/measure/README.md.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

export const EXIT_CODES = Object.freeze({ pass: 0, budgetFail: 1, usage: 2, provenance: 3 });
export const GZIP_LEVEL = 9;
export const D454_MASKED_TOLERANCE_BYTES = 10;
const MANIFEST_PATH = join(".vite", "manifest.json");
// Vite / Rolldown content hashes: 8 characters of [A-Za-z0-9_-] before .js / .css (same as #288).
const HASHED_NAME = /([A-Za-z0-9_.-]+?)-[A-Za-z0-9_-]{8}\.(js|css)/g;
const HTML_SCRIPT = /<(?:script|link)\b[^>]*?(?:src|href)="(?:\.?\/)?(assets\/[^"]+\.js)"/g;
const PRELOAD_TABLE = /m\.f=(\[[^\]]*\])/;
const MAP_DEPS_CALL = /__vite__mapDeps\(\[([\d,]*)\]\)/g;
const DEFAULT_LIMIT = Object.freeze({ text: "±0", min: 0, max: 0 });
const D454_RULES = [
  "① preload set equal",
  "② raw ±0",
  "③ text equal after sorting m.f and __vite__mapDeps",
  `④ masked gzip-9 |Δ| ≤ ${D454_MASKED_TOLERANCE_BYTES} B`,
];

export const measureError = (exitCode, message) => Object.assign(new Error(message), { exitCode });
export const usageError = (message) => measureError(EXIT_CODES.usage, message);

// D432: asset hashes are masked before compressing, so a renamed but otherwise equal asset compares equal.
export const maskHashes = (text) => text.replace(HASHED_NAME, "$1-HASH.$2");
export const unhashedName = (name) => name.replace(HASHED_NAME, "$1.$2");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sorted = (items) => [...items].sort();
const sameSet = (a, b) => sorted(new Set(a)).join("\n") === sorted(new Set(b)).join("\n");
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const sum = (values) => values.reduce((total, value) => total + value, 0);

// D432: raw bytes and gzip-9 of the hash-masked content; the SHA-256 is of the raw file.
export function assetBytes(content) {
  return {
    raw: content.length,
    gzip: gzipSync(maskHashes(content.toString("utf8")), { level: GZIP_LEVEL }).length,
    sha256: sha256(content),
  };
}

export function loadBuild(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), "utf8"));
  const chunks = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    chunks.set(unhashedName(key), {
      file: entry.file,
      imports: (entry.imports ?? []).map(unhashedName),
      css: entry.css ?? [],
      isDynamicEntry: entry.isDynamicEntry === true,
    });
  }
  return { dir, chunks, html: readFileSync(join(dir, "index.html"), "utf8"), bytes: new Map() };
}

const fileBytes = (build, file) =>
  build.bytes.get(file) ??
  build.bytes.set(file, assetBytes(readFileSync(join(build.dir, file)))).get(file);

function keyOfFile(build, file) {
  for (const [key, chunk] of build.chunks) if (chunk.file === file) return key;
  throw new Error(`${build.dir}: index.html refers to ${file}, which is not in the manifest`);
}

export function staticClosure(build, roots, seen = new Set()) {
  for (const key of roots) {
    if (seen.has(key)) continue;
    if (!build.chunks.has(key)) throw new Error(`${build.dir}: unknown chunk ${key}`);
    seen.add(key);
    staticClosure(build, build.chunks.get(key).imports, seen);
  }
  return seen;
}

// D432 / D454: the first screen is index.html's entry script and modulepreloads plus their static imports.
export function firstScreenClosure(build) {
  const roots = [...build.html.matchAll(HTML_SCRIPT)].map((match) => keyOfFile(build, match[1]));
  return staticClosure(build, roots);
}

// D432: a lazy route adds the static closure of its dynamic entry minus the first screen.
export function routeAddedKeys(build, route, firstScreen) {
  return sorted([...staticClosure(build, [route])].filter((key) => !firstScreen.has(key)));
}

const jsBytes = (build, key) => fileBytes(build, build.chunks.get(key).file);
const totalOf = (build, keys, field) => sum([...keys].map((key) => jsBytes(build, key)[field]));

// D432: route-added JS is the masked gzip-9 sum of routeAddedKeys; a shared chunk counts for every route.
export function routeAddedBytes(build, route, firstScreen) {
  return totalOf(build, routeAddedKeys(build, route, firstScreen), "gzip");
}

// D432: the CSS a route loads is the CSS of its whole static closure, first screen included.
export function routeCss(build, route) {
  const files = [...staticClosure(build, [route])].flatMap((key) => build.chunks.get(key).css);
  return sorted(new Set(files)).map((file) => ({
    key: unhashedName(file),
    ...fileBytes(build, file),
  }));
}

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
const preloadTable = (build, keys) =>
  [...keys]
    .flatMap((key) => JSON.parse(chunkText(build, key).match(PRELOAD_TABLE)?.[1] ?? "[]"))
    .map(unhashedName);
const sortedText = (build, keys) =>
  sorted(keys)
    .map((key) => sortPreloads(chunkText(build, key)))
    .join("\n");

// D454: a first screen differing only in preload order counts as ±0 when all four rules hold.
export function d454Verdict(base, head) {
  const keys = { base: firstScreenClosure(base), head: firstScreenClosure(head) };
  const gzipDelta = totalOf(head, keys.head, "gzip") - totalOf(base, keys.base, "gzip");
  const passes = [
    sameSet(keys.base, keys.head) &&
      sameSet(preloadTable(base, keys.base), preloadTable(head, keys.head)),
    totalOf(base, keys.base, "raw") === totalOf(head, keys.head, "raw"),
    sortedText(base, keys.base) === sortedText(head, keys.head),
    Math.abs(gzipDelta) <= D454_MASKED_TOLERANCE_BYTES,
  ];
  const rules = D454_RULES.map((rule, index) => ({ rule, pass: passes[index] }));
  return { rules, pass: passes.every(Boolean) };
}

const routeKeys = (build) => [...build.chunks].filter(([, c]) => c.isDynamicEntry).map(([k]) => k);

function measuredSide(build) {
  const cssFiles = [...build.chunks.values()].flatMap((chunk) => chunk.css);
  const css = new Map(cssFiles.map((file) => [unhashedName(file), file]));
  return { build, firstScreen: firstScreenClosure(build), css };
}
const has = (side, key) => side.build.chunks.has(key);
const firstScreenValue = (side) => totalOf(side.build, side.firstScreen, "gzip");
const routeValue = (side, key) =>
  has(side, key) ? routeAddedBytes(side.build, key, side.firstScreen) : 0;
const chunkValue = (side, key) => (has(side, key) ? jsBytes(side.build, key).gzip : 0);
const cssValue = (side, key) =>
  side.css.has(key) ? fileBytes(side.build, side.css.get(key)).gzip : 0;
const chunksOutsideFirstScreen = (side) =>
  [...side.build.chunks]
    .filter(([key, chunk]) => chunk.file.endsWith(".js") && !side.firstScreen.has(key))
    .map(([key]) => key);

// Budget items: the first screen, every lazy route, every JS chunk outside the first screen, every CSS file.
export function budgetItems(base, head) {
  const sides = [measuredSide(base), measuredSide(head)];
  const [b, h] = sides;
  const row = (kind, key, value) => ({ kind, key, base: value(b, key), head: value(h, key) });
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
  for (const kind of ["chunk", "route"]) {
    for (const key of budgets[kind].keys()) {
      if (!known.has(`${kind}:${key}`))
        throw usageError(`--${kind} ${key}: no such item in either build`);
    }
  }
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

// D487: every file of the build with its full SHA-256, sorted by path.
export function assetDigests(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => `${sha256(readFileSync(file))}  ${relative(dir, file).replaceAll("\\", "/")}`)
    .sort((a, b) => a.slice(66).localeCompare(b.slice(66)));
}

function routeCssLines(base, head) {
  const summary = (files) => files.map((file) => `${file.key} ${file.gzip}`).join(", ");
  const show = (build, route) => (build.chunks.has(route) ? summary(routeCss(build, route)) : "—");
  const routes = sorted(new Set([...routeKeys(base), ...routeKeys(head)]));
  return routes.map((route) => `${route}: ${show(base, route)} → ${show(head, route)}`);
}

const budgetRow = (r) =>
  `| ${r.kind} | ${r.key} | ${r.base} | ${r.head} | ${signed(r.delta)} | ${r.limit} | ${r.pass ? "PASS" : "FAIL"} |`;

export function formatReport(base, head, rows, d454) {
  const firstScreen = { base: firstScreenClosure(base), head: firstScreenClosure(head) };
  const lines = [
    "## First screen (D432 / D454)",
    `JS base: ${sorted(firstScreen.base).join(", ")}`,
    `JS head: ${sorted(firstScreen.head).join(", ")}`,
    `raw B: ${totalOf(base, firstScreen.base, "raw")} → ${totalOf(head, firstScreen.head, "raw")}`,
    ...d454.rules.map(({ rule, pass }) => `D454 ${rule}: ${pass}`),
    "",
    "## Route CSS (masked gzip-9 B, base → head)",
    ...routeCssLines(base, head),
    "",
    "## Budgets (masked gzip-9 B)",
    "| kind | key | base | head | Δ | limit | result |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(budgetRow),
  ];
  for (const [side, build] of Object.entries({ base, head })) {
    lines.push("", `## Asset SHA-256 (${side}: ${build.dir})`, ...assetDigests(build.dir));
  }
  return lines;
}

export function compareDists(baseDir, headDir, budgets) {
  const base = loadBuild(baseDir);
  const head = loadBuild(headDir);
  const d454 = d454Verdict(base, head);
  const rows = checkBudgets(budgetItems(base, head), budgets, d454.pass);
  const failures = rows.filter((row) => !row.pass).length;
  const result = failures === 0 ? "RESULT: PASS" : `RESULT: FAIL (${failures})`;
  const lines = [...formatReport(base, head, rows, d454), "", result];
  return { lines, exitCode: failures === 0 ? EXIT_CODES.pass : EXIT_CODES.budgetFail };
}

function main(argv) {
  const { budgets, rest } = parseBudgetArgs(argv);
  if (rest.length !== 2 || rest.some((arg) => arg.startsWith("--"))) {
    throw usageError(`expected <base-dist> <head-dist> and budget flags, got: ${rest.join(" ")}`);
  }
  const { lines, exitCode } = compareDists(rest[0], rest[1], budgets);
  console.log(lines.join("\n"));
  return exitCode;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`bundle-compare: ${error.message}`);
    process.exitCode = error.exitCode ?? EXIT_CODES.usage;
  }
}

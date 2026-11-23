import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assetBytes,
  budgetItems,
  checkBudgets,
  compareDists,
  d454Verdict,
  EXIT_CODES,
  firstScreenClosure,
  loadBuild,
  parseBudgetArgs,
  routeAddedBytes,
  routeAddedKeys,
} from "../../../../scripts/measure/bundle-compare.mjs";
import { parseMeasureArgs } from "../../../../scripts/measure/bundle-measure.mjs";

const BASE_HASH = "AAAAAAAA";
const HEAD_HASH = "BBBBBBBB";
const FULL_SHA = "0123456789abcdef0123456789abcdef01234567";
const NO_BUDGETS = parseBudgetArgs([]).budgets;

// A small Vite app: index.html → _shared → _deep on the first screen; two lazy routes share _common.
function chunkTexts(hash) {
  return {
    "index.html": `import"./shared-${hash}.js";const r=[()=>import("./A-${hash}.js"),()=>import("./B-${hash}.js")];`,
    "_shared.js": `import"./deep-${hash}.js";export const shared="shared";`,
    "_deep.js": `export const deep="deep";`,
    "src/A.tsx": `import"./common-${hash}.js";import"./index-${hash}.js";export const a="route A";`,
    "src/B.tsx": `import"./common-${hash}.js";import"./index-${hash}.js";export const b="route B";`,
    "_common.js": `export const common="${"shared by both routes ".repeat(8)}";`,
  };
}

function manifestFor(hash) {
  const chunk = (file, imports = [], extra = {}) => ({
    file: `assets/${file}-${hash}.js`,
    imports,
    ...extra,
  });
  return {
    "index.html": chunk("index", [`_shared-${hash}.js`], {
      dynamicImports: ["src/A.tsx", "src/B.tsx"],
      css: [`assets/index-${hash}.css`],
    }),
    [`_shared-${hash}.js`]: chunk("shared", [`_deep-${hash}.js`]),
    [`_deep-${hash}.js`]: chunk("deep"),
    "src/A.tsx": chunk("A", [`_common-${hash}.js`, "index.html"], { isDynamicEntry: true }),
    "src/B.tsx": chunk("B", [`_common-${hash}.js`, "index.html"], { isDynamicEntry: true }),
    [`_common-${hash}.js`]: chunk("common"),
  };
}

function writeDist(t, hash, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "erp-bundle-compare-"));
  t.onTestFinished(() => rmSync(dir, { recursive: true }));
  mkdirSync(join(dir, "assets"));
  mkdirSync(join(dir, ".vite"));
  const manifest = manifestFor(hash);
  const texts = { ...chunkTexts(hash), ...overrides };
  for (const [key, entry] of Object.entries(manifest)) {
    writeFileSync(join(dir, entry.file), texts[key.replace(`-${hash}`, "")]);
  }
  writeFileSync(join(dir, `assets/index-${hash}.css`), "body{margin:0}");
  writeFileSync(join(dir, ".vite/manifest.json"), JSON.stringify(manifest));
  const html = `<script type="module" src="/assets/index-${hash}.js"></script><link rel="modulepreload" href="/assets/shared-${hash}.js">`;
  writeFileSync(join(dir, "index.html"), html);
  return dir;
}

test("M2: assets that differ only in their content hashes compare equal; a real change does not", (t) => {
  const base = assetBytes(Buffer.from(`import"./deep-${BASE_HASH}.js";`));
  const head = assetBytes(Buffer.from(`import"./deep-${HEAD_HASH}.js";`));
  assert.equal(head.gzip - base.gzip, 0);
  assert.notEqual(head.sha256, base.sha256);
  const changed = assetBytes(
    Buffer.from(`import"./deep-${HEAD_HASH}.js";import"./x-${HEAD_HASH}.js";`),
  );
  assert.notEqual(changed.gzip - base.gzip, 0);

  const result = compareDists(writeDist(t, BASE_HASH), writeDist(t, HEAD_HASH), NO_BUDGETS);
  assert.equal(result.exitCode, EXIT_CODES.pass);
  assert.ok(result.lines.includes("RESULT: PASS"));
});

test("M3: the first screen is the entry and its static imports, never a dynamic import", (t) => {
  const build = loadBuild(writeDist(t, BASE_HASH));
  assert.deepEqual([...firstScreenClosure(build)].sort(), ["_deep.js", "_shared.js", "index.html"]);
});

test("M6: a chunk shared by two lazy routes counts for both; first-screen chunks count for neither", (t) => {
  const build = loadBuild(writeDist(t, BASE_HASH));
  const firstScreen = firstScreenClosure(build);
  assert.deepEqual(routeAddedKeys(build, "src/A.tsx", firstScreen), ["_common.js", "src/A.tsx"]);
  assert.deepEqual(routeAddedKeys(build, "src/B.tsx", firstScreen), ["_common.js", "src/B.tsx"]);
  const gzipOf = (key) => assetBytes(Buffer.from(chunkTexts(BASE_HASH)[key])).gzip;
  assert.equal(
    routeAddedBytes(build, "src/A.tsx", firstScreen),
    gzipOf("_common.js") + gzipOf("src/A.tsx"),
  );
});

// An entry whose preload table m.f is used by two __vite__mapDeps calls, as Vite emits it.
function preloadEntry(hash, { table = ["A", "B"], calls = ["0,1", "1"], tail = "x=1" } = {}) {
  const files = JSON.stringify(table.map((name) => `assets/${name}-${hash}.js`));
  const mapDeps = calls.map((list) => `__vite__mapDeps([${list}])`).join(";");
  return `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=${files})))=>i.map(i=>d[i]);${mapDeps};${tail};`;
}

function d454Rules(t, headEntry) {
  const base = loadBuild(writeDist(t, BASE_HASH, { "index.html": preloadEntry(BASE_HASH) }));
  const head = loadBuild(writeDist(t, HEAD_HASH, { "index.html": headEntry }));
  return d454Verdict(base, head).rules.map((rule) => rule.pass);
}

test("M4: D454 passes a first screen whose only difference is preload order", (t) => {
  const reordered = preloadEntry(HEAD_HASH, { table: ["B", "A"], calls: ["1,0", "0"] });
  assert.deepEqual(d454Rules(t, reordered), [true, true, true, true]);
});

test("M4: each D454 rule fails on its own counterexample", (t) => {
  const otherFile = preloadEntry(HEAD_HASH, { table: ["A", "C"] });
  assert.equal(d454Rules(t, otherFile)[0], false, "① preload set differs");
  const oneByteMore = preloadEntry(HEAD_HASH, { tail: "x=10" });
  assert.equal(d454Rules(t, oneByteMore)[1], false, "② raw bytes differ");
  const sameSizeEdit = preloadEntry(HEAD_HASH, { tail: "x=2" });
  assert.deepEqual(
    d454Rules(t, sameSizeEdit).slice(1, 3),
    [true, false],
    "③ text differs at equal size",
  );
  const repetitive = loadBuild(
    writeDist(t, BASE_HASH, { "index.html": `x="${"a".repeat(400)}";` }),
  );
  const noisy = Array.from({ length: 400 }, (_, i) =>
    String.fromCharCode(97 + ((i * 7919) % 26)),
  ).join("");
  const varied = loadBuild(writeDist(t, HEAD_HASH, { "index.html": `x="${noisy}";` }));
  assert.equal(d454Verdict(repetitive, varied).rules[3].pass, false, "④ masked gzip-9 |Δ| > 10 B");
});

test("M5: a budget passes within and at its limit, fails above it, and unlisted items stay ±0", () => {
  const items = [
    { kind: "chunk", key: "src/A.tsx", base: 100, head: 108 },
    { kind: "chunk", key: "_common.js", base: 50, head: 51 },
  ];
  const verdicts = (limit) => {
    const { budgets } = parseBudgetArgs(["--chunk", `src/A.tsx=${limit}`]);
    return checkBudgets(items, budgets).map((row) => row.pass);
  };
  assert.deepEqual(verdicts("+10"), [true, false]);
  assert.deepEqual(verdicts("+8"), [true, false]);
  assert.deepEqual(verdicts("+7"), [false, false]);
});

test("M5: exit codes are 0 within or at the limit, 1 above it or for an unlisted change", (t) => {
  const baseDir = writeDist(t, BASE_HASH);
  const headDir = writeDist(t, HEAD_HASH, {
    "src/A.tsx": `${chunkTexts(HEAD_HASH)["src/A.tsx"]}export const more=1;`,
  });
  const delta = budgetItems(loadBuild(baseDir), loadBuild(headDir)).find(
    (i) => i.key === "src/A.tsx" && i.kind === "chunk",
  );
  const grown = delta.head - delta.base;
  assert.ok(grown > 0);
  const exitCode = (flags) =>
    compareDists(baseDir, headDir, parseBudgetArgs(flags).budgets).exitCode;
  const routeA = `src/A.tsx=+${grown}`;
  assert.equal(
    exitCode(["--chunk", `src/A.tsx=+${grown + 1}`, "--route", routeA]),
    EXIT_CODES.pass,
  );
  assert.equal(exitCode(["--chunk", `src/A.tsx=+${grown}`, "--route", routeA]), EXIT_CODES.pass);
  assert.equal(
    exitCode(["--chunk", `src/A.tsx=+${grown - 1}`, "--route", routeA]),
    EXIT_CODES.budgetFail,
  );
  assert.equal(
    exitCode(["--chunk", `src/A.tsx=+${grown}`]),
    EXIT_CODES.budgetFail,
    "route A is unlisted",
  );
});

test("M7: bundle-measure refuses short SHAs, branch names, an existing --work and unknown flags", () => {
  const exitCodeOf = (argv, pathExists = () => false) => {
    try {
      parseMeasureArgs(argv, pathExists);
    } catch (error) {
      return { exitCode: error.exitCode, message: error.message };
    }
    return { exitCode: EXIT_CODES.pass, message: "" };
  };
  const args = (base, extra = []) => ["--base", base, "--head", FULL_SHA, "--work", "w", ...extra];
  const shortSha = exitCodeOf(args(FULL_SHA.slice(0, 7)));
  assert.equal(shortSha.exitCode, EXIT_CODES.provenance);
  assert.match(shortSha.message, /not a full 40-character lowercase SHA/);
  assert.equal(exitCodeOf(args("main")).exitCode, EXIT_CODES.provenance);
  const existing = exitCodeOf(args(FULL_SHA), () => true);
  assert.equal(existing.exitCode, EXIT_CODES.provenance);
  assert.match(existing.message, /already exists/);
  const unknown = exitCodeOf(args(FULL_SHA, ["--verbose", "1"]));
  assert.equal(unknown.exitCode, EXIT_CODES.usage);
  assert.match(unknown.message, /unknown argument "--verbose"/);
  assert.equal(exitCodeOf(args(FULL_SHA)).exitCode, EXIT_CODES.pass);
});

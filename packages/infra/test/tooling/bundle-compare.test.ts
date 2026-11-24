import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assetBytes,
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
  const html = `<script type="module" src="/assets/index-${hash}.js"></script><link rel="modulepreload" href="/assets/shared-${hash}.js"><link rel="prefetch" href="/assets/A-${hash}.js">`;
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

test("M3: the first screen is the entry, modulepreloads and their static imports, never a prefetch or a dynamic import", (t) => {
  const build = loadBuild(writeDist(t, BASE_HASH));
  assert.deepEqual([...firstScreenClosure(build)].sort(), ["_deep.js", "_shared.js", "index.html"]);
});

test("M6: a chunk shared by two lazy routes counts for both; first-screen chunks count for neither", (t) => {
  const build = loadBuild(writeDist(t, BASE_HASH));
  const firstScreen = firstScreenClosure(build);
  assert.deepEqual(routeAddedKeys(build, "src/A.tsx", firstScreen), ["_common.js", "src/A.tsx"]);
  assert.deepEqual(routeAddedKeys(build, "src/B.tsx", firstScreen), ["_common.js", "src/B.tsx"]);
  const bytesOf = (key) => assetBytes(Buffer.from(chunkTexts(BASE_HASH)[key]));
  const keys = ["_common.js", "src/A.tsx"];
  assert.deepEqual(routeAddedBytes(build, "src/A.tsx", firstScreen), {
    raw: keys.reduce((total, key) => total + bytesOf(key).raw, 0),
    gzip: keys.reduce((total, key) => total + bytesOf(key).gzip, 0),
  });
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

// The boundaries are covered by the lightweight test above; this one only checks the exit codes.
test("M5: the exit code is 0 at the limit and 1 above it", (t) => {
  const grownText = `${chunkTexts(HEAD_HASH)["src/A.tsx"]}export const more=1;`;
  const baseDir = writeDist(t, BASE_HASH);
  const headDir = writeDist(t, HEAD_HASH, { "src/A.tsx": grownText });
  const gzipOf = (text) => assetBytes(Buffer.from(text)).gzip;
  const grown = gzipOf(grownText) - gzipOf(chunkTexts(BASE_HASH)["src/A.tsx"]);
  assert.ok(grown > 0);
  // Route A grows by the same bytes: its other chunk, _common, is unchanged.
  const exitCodeAt = (limit) => {
    const flags = ["--chunk", `src/A.tsx=+${limit}`, "--route", `src/A.tsx=+${limit}`];
    return compareDists(baseDir, headDir, parseBudgetArgs(flags).budgets).exitCode;
  };
  assert.equal(exitCodeAt(grown), EXIT_CODES.pass);
  assert.equal(exitCodeAt(grown - 1), EXIT_CODES.budgetFail);
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
  const optionAsValue = ["--base", FULL_SHA, "--head", FULL_SHA, "--work", "--unknown"];
  const missingWork = exitCodeOf(optionAsValue);
  assert.equal(missingWork.exitCode, EXIT_CODES.usage);
  assert.match(missingWork.message, /--work needs a value/);
  assert.equal(exitCodeOf(args(FULL_SHA)).exitCode, EXIT_CODES.pass);
});

// Locates everything the preflight reads under one checkout (S12 SLOT-02). Each checkout is checked
// with its own tsconfig.preflight.json, baseline, tsc and @babel/parser, so a base worktree is judged by
// the rules it shipped with. Any missing or unreadable input is a PreflightConfigError (exit 4).
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseBaseline } from "./baseline.mjs";
import { PreflightConfigError } from "./errors.mjs";

const SLOT_DIR = join("scripts", "slot");
const TSCONFIG_NAME = "tsconfig.preflight.json";
const BASELINE_NAME = "preflight-baseline.json";
const TSC_BIN = join("node_modules", "typescript", "bin", "tsc");
const BABEL_PARSER = "@babel/parser";

/** Config files are checked before the tools, so a bad baseline is reported as such. */
export function resolveSetup(rootArgument) {
  const root = resolve(rootArgument);
  if (!isDirectory(root)) throw new PreflightConfigError(`--root is not a directory: ${root}`);
  const tsconfigPath = join(root, SLOT_DIR, TSCONFIG_NAME);
  const include = readTsconfigInclude(tsconfigPath);
  const baselinePath = join(root, SLOT_DIR, BASELINE_NAME);
  const baseline = parseBaseline(readRequiredFile(baselinePath, "baseline"), baselinePath);
  const tscPath = join(root, TSC_BIN);
  if (!existsSync(tscPath))
    throw new PreflightConfigError(`tsc not found under --root: ${tscPath}`);
  return {
    root,
    tsconfigPath,
    baselinePath,
    baseline,
    tscPath,
    parse: loadBabelParser(root),
    coveredFiles: expandInclude(include, dirname(tsconfigPath)),
  };
}

export function requireExistingFiles(paths) {
  return paths.map((path) => {
    const absolute = resolve(path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new PreflightConfigError(`--files entry does not exist: ${path}`);
    }
    return absolute;
  });
}

function readTsconfigInclude(tsconfigPath) {
  const text = readRequiredFile(tsconfigPath, "tsconfig");
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new PreflightConfigError(`tsconfig is not valid JSON: ${tsconfigPath}: ${error.message}`);
  }
  if (!Array.isArray(config.include) || config.include.length === 0) {
    throw new PreflightConfigError(`tsconfig has no include list: ${tsconfigPath}`);
  }
  return config.include;
}

function readRequiredFile(path, what) {
  if (!existsSync(path)) throw new PreflightConfigError(`${what} file missing: ${path}`);
  return readFileSync(path, "utf8");
}

function loadBabelParser(root) {
  const requireFromRoot = createRequire(join(root, "package.json"));
  try {
    return requireFromRoot(BABEL_PARSER).parse;
  } catch (error) {
    throw new PreflightConfigError(`${BABEL_PARSER} not found under --root: ${error.message}`);
  }
}

function expandInclude(patterns, baseDirectory) {
  const files = patterns.flatMap((pattern) =>
    globSync(pattern, { cwd: baseDirectory }).map((match) => resolve(baseDirectory, match)),
  );
  return [...new Set(files)].sort();
}

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

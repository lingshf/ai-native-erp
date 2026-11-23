// Pre-slot static check (S12 SLOT-02; S11 retrospective action 2, D407 / D408). slot-run.ps1 runs it
// before the build, the process precheck and any step; it can also be run by hand:
//   node scripts/slot/preflight.mjs --root <checkout> [--files <path>...]
// Part 1, tsc: <root>'s tsc on scripts/slot/tsconfig.preflight.json (the scenario and slow-test files
// that `npm run typecheck` does not cover). Part 2, TDZ: preflight/tdz.mjs on the same files and on
// --files (for example forensic .mjs scripts). Both compare against scripts/slot/preflight-baseline.json.
// Exit codes: 0 no new finding; 4 input or configuration error (also any internal error); 6 new finding.
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { compareWithBaseline, countByKey } from "./preflight/baseline.mjs";
import { PreflightConfigError } from "./preflight/errors.mjs";
import { requireExistingFiles, resolveSetup } from "./preflight/setup.mjs";
import { findTdzFindings } from "./preflight/tdz.mjs";
import { runTsc, tscKey } from "./preflight/tsc.mjs";

const EXIT_CLEAN = 0;
const EXIT_CONFIG_ERROR = 4;
const EXIT_NEW_FINDINGS = 6;
const USAGE = "usage: node scripts/slot/preflight.mjs --root <checkout> [--files <path>...]";
const PARSER_PLUGINS = ["typescript", "jsx"];

function main(argv) {
  const options = parseOptions(argv);
  const extraFiles = requireExistingFiles(options.files);
  const setup = resolveSetup(options.root);
  const { baseline } = setup;
  console.log(`preflight root=${setup.root}`);
  console.log(`preflight tsconfig=${setup.tsconfigPath} baseline=${setup.baselinePath}`);
  const tscRows = checkTsc(setup, baseline.tsc);
  const tdzFiles = [...new Set([...setup.coveredFiles, ...extraFiles])];
  const tdzRows = checkTdz(setup, tdzFiles, baseline.tdz);
  return summarize(tscRows, tdzRows);
}

function parseOptions(argv) {
  const options = { root: undefined, files: [] };
  let collectingFiles = false;
  let filesGiven = false;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--root") {
      options.root = argv[++index];
      collectingFiles = false;
    } else if (token === "--files") {
      collectingFiles = true;
      filesGiven = true;
    } else if (collectingFiles && !token.startsWith("--")) {
      options.files.push(token);
    } else {
      throw new PreflightConfigError(`unknown argument ${token}; ${USAGE}`);
    }
  }
  if (!options.root) throw new PreflightConfigError(`--root is required; ${USAGE}`);
  // An empty --files would silently check only the default scope; the caller meant extra files (D408).
  if (filesGiven && options.files.length === 0) {
    throw new PreflightConfigError(`--files needs at least one path; ${USAGE}`);
  }
  return options;
}

function checkTsc(setup, allowedCounts) {
  const diagnostics = runTsc(setup);
  const rows = compareWithBaseline(countByKey(diagnostics, tscKey), allowedCounts);
  const newKeys = new Set(rows.filter((row) => row.status === "new").map((row) => row.key));
  console.log(`tsc errors=${diagnostics.length}`);
  for (const diagnostic of diagnostics) {
    const marker = newKeys.has(tscKey(diagnostic)) ? "NEW" : "baseline";
    const location = `${diagnostic.file}(${diagnostic.line},${diagnostic.column})`;
    console.log(`tsc ${marker} ${location} ${diagnostic.code}: ${diagnostic.message}`);
    for (const detail of diagnostic.details) console.log(`    ${detail}`);
  }
  printRows("tsc", rows);
  return rows;
}

function checkTdz(setup, files, allowedCounts) {
  const findings = files.flatMap((file) => findingsInFile(setup, file));
  const rows = compareWithBaseline(
    countByKey(findings, (found) => found.key),
    allowedCounts,
  );
  const newKeys = new Set(rows.filter((row) => row.status === "new").map((row) => row.key));
  console.log(`tdz files=${files.length} findings=${findings.length}`);
  for (const found of findings) {
    const marker = newKeys.has(found.key) ? "NEW" : "baseline";
    const via = found.via.length > 0 ? ` via ${found.via.join(" -> ")}` : " direct";
    console.log(
      `tdz ${marker} ${found.file}:${found.line} ${found.key} (declared line ${found.declarationLine})${via}`,
    );
  }
  printRows("tdz", rows);
  return rows;
}

function findingsInFile(setup, file) {
  const shownPath = relative(setup.root, file).replaceAll("\\", "/");
  let ast;
  try {
    ast = setup.parse(readFileSync(file, "utf8"), {
      sourceType: "module",
      plugins: PARSER_PLUGINS,
    });
  } catch (error) {
    throw new PreflightConfigError(`cannot parse ${shownPath}: ${error.message}`);
  }
  return findTdzFindings(ast).map((found) => ({ ...found, file: shownPath }));
}

function printRows(part, rows) {
  for (const row of rows) {
    console.log(
      `${part} key ${row.status} count=${row.count} baseline=${row.allowed} :: ${row.key}`,
    );
  }
}

function summarize(tscRows, tdzRows) {
  const all = [...tscRows, ...tdzRows];
  const newCount = all.filter((row) => row.status === "new").length;
  const reducedCount = all.filter((row) => row.status === "reduced").length;
  const exitCode = newCount > 0 ? EXIT_NEW_FINDINGS : EXIT_CLEAN;
  console.log(
    `preflight result exit=${exitCode} new-keys=${newCount} reduced-keys=${reducedCount}`,
  );
  return exitCode;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  const kind = error instanceof PreflightConfigError ? "config error" : "internal error";
  console.log(
    `preflight ${kind}: ${error instanceof PreflightConfigError ? error.message : error.stack}`,
  );
  console.log(`preflight result exit=${EXIT_CONFIG_ERROR}`);
  process.exitCode = EXIT_CONFIG_ERROR;
}

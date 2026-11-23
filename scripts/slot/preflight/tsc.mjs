// tsc part of the preflight (S12 SLOT-02): runs the checkout's own tsc on tsconfig.preflight.json and
// reads its plain-text diagnostics.
import { spawnSync } from "node:child_process";
import { PreflightConfigError } from "./errors.mjs";

const LOCATED_ERROR = /^(?<file>.+)\((?<line>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.*)$/;
const GLOBAL_ERROR = /^error (?<code>TS\d+): (?<message>.*)$/;
const CONTINUATION = /^\s+\S/;
// tsc abbreviates long unions as "... 791 more ..."; the count moves with every new i18n key, so the
// baseline key must not depend on it.
const ELIDED_COUNT = /\.\.\. \d+ more \.\.\./g;

/**
 * Returns the located diagnostics ({ file, line, column, code, message, details }). A diagnostic
 * without a file (for example an unreadable tsconfig) or a failing run without diagnostics is a
 * configuration problem, not a finding.
 */
export function runTsc({ root, tscPath, tsconfigPath }) {
  const run = spawnSync(process.execPath, [tscPath, "-p", tsconfigPath, "--pretty", "false"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw new PreflightConfigError(`cannot run tsc: ${run.error.message}`);
  const { diagnostics, globalErrors } = parseDiagnostics(run.stdout);
  if (globalErrors.length > 0) {
    throw new PreflightConfigError(`tsc configuration error: ${globalErrors.join(" | ")}`);
  }
  if (run.status !== 0 && diagnostics.length === 0) {
    throw new PreflightConfigError(`tsc exit ${run.status} without diagnostics: ${run.stderr.trim()}`);
  }
  return diagnostics;
}

/** Baseline key: error code and first message line, without file, line or elided counts. */
export function tscKey(diagnostic) {
  return `${diagnostic.code}: ${diagnostic.message.replace(ELIDED_COUNT, "... N more ...")}`;
}

function parseDiagnostics(output) {
  const diagnostics = [];
  const globalErrors = [];
  for (const line of output.split(/\r?\n/)) {
    const located = LOCATED_ERROR.exec(line);
    const global = GLOBAL_ERROR.exec(line);
    if (located) {
      const { file, code, message } = located.groups;
      const position = { line: Number(located.groups.line), column: Number(located.groups.column) };
      diagnostics.push({ file, ...position, code, message, details: [] });
    } else if (global) {
      globalErrors.push(`${global.groups.code}: ${global.groups.message}`);
    } else if (CONTINUATION.test(line) && diagnostics.length > 0) {
      diagnostics.at(-1).details.push(line.trim());
    }
  }
  return { diagnostics, globalErrors };
}

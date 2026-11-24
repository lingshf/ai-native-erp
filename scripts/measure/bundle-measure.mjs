// Builds base and head in fresh detached worktrees, prints the build provenance of each side
// (D460 / D487) and compares the two builds with bundle-compare.mjs.
// Usage: node scripts/measure/bundle-measure.mjs --base <sha> --head <sha> --work <new-dir>
//          [--repo <dir>] [budget flags of bundle-compare.mjs]
// The script never deletes anything; it prints the cleanup commands at the end.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { release, type, version } from "node:os";
import { join, resolve } from "node:path";
import {
  compareDists,
  EXIT_CODES,
  measureError,
  parseBudgetArgs,
  usageError,
} from "./bundle-compare.mjs";

export const SHA_LENGTH = 40;
const FULL_SHA = new RegExp(`^[0-9a-f]{${SHA_LENGTH}}$`);
const SIDES = ["base", "head"];
const MEASURE_FLAGS = { "--base": "base", "--head": "head", "--work": "work", "--repo": "repo" };
const REQUIRED_FLAGS = ["--base", "--head", "--work"];
const INSTALL_ARGS = ["ci", "--no-audit", "--no-fund"];
const BUILD_ARGS = ["run", "build", "--workspace", "@erp/web", "--", "--manifest"];
const DIST_PATH = join("packages", "web", "dist");

const provenanceError = (message) => measureError(EXIT_CODES.provenance, message);

function readMeasureFlags(rest) {
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!MEASURE_FLAGS[flag]) throw usageError(`unknown argument "${flag}"`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw usageError(`${flag} needs a value`);
    values[MEASURE_FLAGS[flag]] = value;
  }
  const missing = REQUIRED_FLAGS.filter((flag) => values[MEASURE_FLAGS[flag]] === undefined);
  if (missing.length > 0) throw usageError(`missing ${missing.join(", ")}`);
  return values;
}

// D487: only exact commits are measured, each in a new directory that this script creates.
export function parseMeasureArgs(argv, pathExists = existsSync) {
  const { budgets, rest } = parseBudgetArgs(argv);
  const values = readMeasureFlags(rest);
  for (const side of SIDES) {
    if (!FULL_SHA.test(values[side])) {
      throw provenanceError(
        `--${side} "${values[side]}" is not a full ${SHA_LENGTH}-character lowercase SHA; branch names and short SHAs are refused`,
      );
    }
  }
  const work = resolve(values.work);
  if (pathExists(work))
    throw provenanceError(`--work ${work} already exists; give a new directory`);
  return { base: values.base, head: values.head, work, repo: resolve(values.repo ?? "."), budgets };
}

// Prints "$ command", its raw output and exit code; a failing step stops the measurement.
function run(command, args, cwd) {
  const commandLine = [command, ...args].join(" ");
  console.log(`$ ${commandLine}   (cwd ${cwd})`);
  // On Windows npm is npm.cmd and needs a shell; its arguments are the fixed constants above.
  const needsShell = command === "npm" && process.platform === "win32";
  const result = needsShell
    ? spawnSync(commandLine, { cwd, encoding: "utf8", shell: true })
    : spawnSync(command, args, { cwd, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  console.log(output === "" ? "(no output)" : output);
  console.log(`exit ${result.status}`);
  if (result.status !== 0) throw provenanceError(`"${commandLine}" failed in ${cwd}`);
  return result.stdout.trim();
}

// D460: both sides must build from the same package-lock.json blob.
function checkSameLockfile(options) {
  console.log("## Lockfile");
  const blobs = SIDES.map((side) =>
    run("git", ["rev-parse", `${options[side]}:package-lock.json`], options.repo),
  );
  if (blobs[0] !== blobs[1]) {
    throw provenanceError(`package-lock.json blobs differ: base ${blobs[0]}, head ${blobs[1]}`);
  }
}

// D487: the worktree must be clean before install, after install and after the build.
function assertClean(dir, moment) {
  const status = run("git", ["status", "--porcelain"], dir);
  if (status !== "") throw provenanceError(`${dir} is not clean ${moment}`);
}

// D460 / D487: every "构建来源" field of the task template, printed raw for the PR body.
function buildSide(side, sha, options) {
  const dir = join(options.work, side);
  console.log(`\n## Build provenance: ${side}`);
  run("git", ["worktree", "add", "--detach", dir, sha], options.repo);
  const head = run("git", ["rev-parse", "HEAD"], dir);
  if (head !== sha) throw provenanceError(`${dir} is at ${head}, expected ${sha}`);
  assertClean(dir, "before npm ci");
  run("git", ["rev-parse", "HEAD:package-lock.json"], dir);
  run("node", ["-v"], dir);
  run("npm", ["-v"], dir);
  console.log(`os: ${type()} ${release()} (${version()})`);
  run("npm", INSTALL_ARGS, dir);
  assertClean(dir, "after npm ci");
  run("npm", BUILD_ARGS, dir);
  assertClean(dir, "after the build");
  return join(dir, DIST_PATH);
}

function printCleanup(options) {
  if (!existsSync(options.work)) return;
  console.log("\n## Cleanup (not run by this script)");
  for (const side of SIDES) {
    const dir = join(options.work, side);
    if (existsSync(dir)) console.log(`git -C "${options.repo}" worktree remove --force "${dir}"`);
  }
  console.log(`Remove-Item -Recurse -Force "${options.work}"   # or: rm -rf "${options.work}"`);
}

function measure(options) {
  checkSameLockfile(options);
  const dists = SIDES.map((side) => buildSide(side, options[side], options));
  console.log(`\n## Comparison: base ${options.base} → head ${options.head}`);
  const { lines, exitCode } = compareDists(dists[0], dists[1], options.budgets);
  console.log(lines.join("\n"));
  return exitCode;
}

function main(argv) {
  console.log(`$ node ${process.argv.slice(1).join(" ")}`);
  const options = parseMeasureArgs(argv);
  try {
    return measure(options);
  } finally {
    printCleanup(options);
  }
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`bundle-measure: ${error.message}`);
    process.exitCode = error.exitCode ?? EXIT_CODES.provenance;
  }
  console.log(`exit code ${process.exitCode}`);
}

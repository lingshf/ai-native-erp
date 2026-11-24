// Compares two Vite builds made with `vite build --manifest` by the D432 / D454 rules and checks budgets.
// Usage, budget flags and exit codes: scripts/measure/README.md. Unlisted items must stay ±0.
import { budgetItems, checkBudgets, parseBudgetArgs } from "./bundle-budgets.mjs";
import { d454Verdict } from "./bundle-d454.mjs";
import { EXIT_CODES, usageError } from "./bundle-errors.mjs";
import { loadBuild } from "./bundle-graph.mjs";
import { formatReport } from "./bundle-report.mjs";

export { budgetItems, checkBudgets, parseBudgetArgs, parseLimit } from "./bundle-budgets.mjs";
export { D454_MASKED_TOLERANCE_BYTES, d454Verdict, sortPreloads } from "./bundle-d454.mjs";
export { EXIT_CODES, measureError, usageError } from "./bundle-errors.mjs";
export {
  assetBytes,
  firstScreenClosure,
  GZIP_LEVEL,
  loadBuild,
  maskHashes,
  routeAddedBytes,
  routeAddedKeys,
  routeCss,
  staticClosure,
  unhashedName,
} from "./bundle-graph.mjs";
export { assetDigests, formatReport } from "./bundle-report.mjs";

export function compareDists(baseDir, headDir, budgets) {
  const [base, head] = [baseDir, headDir].map(loadBuild);
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

// I4 fixture check for the TDZ rule (S12 SLOT-02): every scripts/slot/fixtures/tdz-*.ts.txt names the
// bindings it must hit in a "// expect: a, b" (or "// expect: none") line; this prints PASS / FAIL per
// fixture and exits 1 on any FAIL. Run by selftest.ps1, or by hand:  node scripts/slot/tdz-fixtures.mjs
import { parse } from "@babel/parser";
import { globSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { findTdzFindings } from "./preflight/tdz.mjs";

const FIXTURE_PATTERN = join(import.meta.dirname, "fixtures", "tdz-*.ts.txt");
const EXPECT_LINE = /^\/\/ expect: (?<names>.+)$/m;
const NO_FINDING = "none";

function expectedBindings(text, name) {
  const match = EXPECT_LINE.exec(text);
  if (!match) throw new Error(`${name} has no "// expect:" line`);
  const names = match.groups.names.trim();
  return names === NO_FINDING ? [] : names.split(",").map((binding) => binding.trim());
}

function checkFixture(path) {
  const name = basename(path);
  const text = readFileSync(path, "utf8");
  const expected = expectedBindings(text, name).sort();
  const ast = parse(text, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const findings = findTdzFindings(ast);
  const found = [...new Set(findings.map((finding) => finding.binding))].sort();
  const passed = found.join(",") === expected.join(",");
  const detail =
    findings.map((finding) => `${finding.key}@${finding.line}`).join("; ") || NO_FINDING;
  console.log(
    `${passed ? "PASS" : "FAIL"} TDZ-FIXTURE ${name} expected=[${expected}] found=[${detail}]`,
  );
  return passed;
}

const fixtures = globSync(FIXTURE_PATTERN).sort();
const failed = fixtures.map(checkFixture).filter((passed) => !passed).length;
console.log(`tdz fixtures: ${fixtures.length} checked, ${failed} FAIL`);
process.exitCode = failed > 0 || fixtures.length === 0 ? 1 : 0;

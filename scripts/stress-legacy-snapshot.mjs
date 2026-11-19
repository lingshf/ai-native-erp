import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { iterations: { type: "string", default: "50" } },
});
const iterations = Number(values.iterations);
if (!Number.isSafeInteger(iterations) || iterations < 1 || String(iterations) !== values.iterations)
  throw new Error("--iterations must be a positive safe integer.");

const root = fileURLToPath(new URL("../", import.meta.url));
const runner = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
console.log(
  JSON.stringify({
    node: process.version,
    sqlite: process.versions.sqlite,
    platform: process.platform,
    arch: process.arch,
    iterations,
  }),
);
let failed = 0;
for (let iteration = 1; iteration <= iterations; iteration++) {
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "run",
      "packages/infra/test/legacy-teaching.test.ts",
      "packages/infra/test/legacy-opener.test.ts",
      "packages/infra/test/legacy-snapshot-diagnostics.test.ts",
      "--reporter=dot",
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    failed++;
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.signal) console.error(`Child terminated by ${result.signal}`);
  }
  console.log(`Iteration ${iteration}/${iterations}: ${result.status === 0 ? "PASS" : "FAIL"}`);
}
console.log(`Snapshot stress: ${iterations - failed}/${iterations} passed, ${failed} failed`);
if (failed) process.exitCode = 1;

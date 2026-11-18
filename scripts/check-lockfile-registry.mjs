import { readFileSync } from "node:fs";

const lockfile = process.argv[2] ?? "package-lock.json";
const { packages } = JSON.parse(readFileSync(lockfile, "utf8"));
let tarballs = 0;
for (const [name, entry] of Object.entries(packages)) {
  if (entry.link || !entry.resolved) continue;
  tarballs++;
  if (!entry.resolved.startsWith("https://registry.npmjs.org/")) {
    console.error(`Non-public registry tarball: ${name}`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) {
  console.log(`Public npm registry check passed: ${tarballs} tarballs; workspace links excluded.`);
}

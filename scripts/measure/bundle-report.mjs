// Report: the comparison text (first screen, route CSS, budget table) and the D487 asset digests.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { firstScreenClosure, routeCss, routeKeys, sha256, sorted } from "./bundle-graph.mjs";

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// D487: every file of the build with its full SHA-256, sorted by path.
export function assetDigests(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => `${sha256(readFileSync(file))}  ${relative(dir, file).replaceAll("\\", "/")}`)
    .sort((a, b) => a.slice(66).localeCompare(b.slice(66)));
}
function routeCssLines(base, head) {
  const summary = (files) => files.map((file) => `${file.key} ${file.raw}/${file.gzip}`).join(", ");
  const show = (build, route) => (build.chunks.has(route) ? summary(routeCss(build, route)) : "—");
  const routes = sorted(new Set([...routeKeys(base), ...routeKeys(head)]));
  return routes.map((route) => `${route}: ${show(base, route)} → ${show(head, route)}`);
}
const budgetRow = (r) =>
  `| ${r.kind} | ${r.key} | ${r.rawBase} | ${r.rawHead} | ${r.base} | ${r.head} | ${signed(r.delta)} | ${r.limit} | ${r.pass ? "PASS" : "FAIL"} |`;

export function formatReport(base, head, rows, d454) {
  const firstScreen = { base: firstScreenClosure(base), head: firstScreenClosure(head) };
  const lines = [
    "## First screen (D432 / D454)",
    `JS base: ${sorted(firstScreen.base).join(", ")}`,
    `JS head: ${sorted(firstScreen.head).join(", ")}`,
    ...d454.rules.map(({ rule, pass }) => `D454 ${rule}: ${pass}`),
    "",
    "## Route CSS (raw B / masked gzip-9 B, base → head)",
    ...routeCssLines(base, head),
    "",
    "## Budgets (decided on masked gzip-9 B; raw B for reference)",
    "| kind | key | raw base | raw head | gzip base | gzip head | Δ gzip | limit | result |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(budgetRow),
  ];
  for (const [side, build] of Object.entries({ base, head })) {
    lines.push("", `## Asset SHA-256 (${side}: ${build.dir})`, ...assetDigests(build.dir));
  }
  return lines;
}

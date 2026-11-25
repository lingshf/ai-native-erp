#!/usr/bin/env node
// Regenerates the table body of design/decisions.md (D562, MCF-14).
// Usage: node scripts/gen-decisions-index.mjs [--check] [maxN]
//   maxN defaults to the highest decision number that has a table row or entry.
//   --check exits 1 if design/decisions.md differs from the generated result.
// Any other argument, or a maxN below the last row already in the index, exits 2
// without touching the file.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "design/decisions.md";
const SEP = "| --- | --- | --- | --- |\n";
// Decisions whose rule text lives only in prose: summary location listed first.
const SOURCE = {
  20: [
    "docs/release/README.md",
    3,
    "SemVer，tag 写作 `vX.Y.Z`，修复用 Z 位；“按里程碑划分 Sprint”已由 D555 取代（同页第 5 行）",
  ],
  21: ["docs/release/README.md", 3, "tag 打在发布 PR 合并后的 squash 提交上"],
};
// S12 local acceptance labels D1-D6 are not decisions.
const SKIP = new Set([224, 225, 226, 227, 228, 229].map((n) => `design/tasks/S12.md:${n}`));

const ROW = /^\|\s*\*{0,2}D(\d{1,3})(?!\d)((?:\\\||[^|])*)\|((?:\\\||[^|])*)\|/u;
const LEAD = /^\s*(?:[-*]|\d+\.)\s*\*\*([^*]+)\*\*(（[^）]*）)?\s*[：:]\s*(.*)/u;
const DN = /(?<![A-Za-z0-9_\-#/.])D(\d{1,3})(?!\d)/gu;

function fail(msg) {
  console.error(`${msg}\nUsage: node scripts/gen-decisions-index.mjs [--check] [maxN]`);
  process.exit(2);
}
const args = process.argv.slice(2);
const check = args.includes("--check");
const nums = args.filter((a) => a !== "--check");
const unknown = nums.find((a) => a.startsWith("-"));
if (unknown) fail(`Unknown option: ${unknown}`);
if (args.filter((a) => a === "--check").length > 1 || nums.length > 1)
  fail(`Too many arguments: ${args.join(" ")}`);
if (nums.length === 1 && !/^[1-9]\d{0,2}$/.test(nums[0]))
  fail(`Invalid argument: ${nums[0]} (expected --check or a decision number 1-999)`);
const maxArg = nums[0];

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--", "design/*.md", "docs/*.md", "CHANGELOG.md"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((f) => f && f !== OUT)
  .sort();

const chars = (s) => Array.from(s);
const backticksOdd = (s) => (s.split("`").length - 1) % 2 === 1;
function clip(text, n = 60) {
  let s = text.replace(/\s+/gu, " ").trim().replaceAll("\\|", "|");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1");
  const cs = chars(s);
  if (cs.length <= n) return s.replaceAll("|", "\\|");
  for (const sep of ["；", "。"]) {
    const i = cs.indexOf(sep);
    if (i > 0 && i <= n && !backticksOdd(cs.slice(0, i).join("")))
      return cs.slice(0, i).join("").replaceAll("|", "\\|");
  }
  const head = cs.slice(0, n).join("");
  return (head + (backticksOdd(head) ? "`" : "") + "…").replaceAll("|", "\\|");
}
const stripChars = (s, set) => s.replace(new RegExp(`^[${set}]+|[${set}]+$`, "gu"), "");

const TABLE = 0;
const ENTRY = 1;
const rec = new Map();
const men = new Map();
const push = (map, k, v) => (map.get(k) ?? map.set(k, []).get(k)).push(v);
for (const rel of files) {
  const lines = readFileSync(rel, "utf8").split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "") lines.pop();
  lines.forEach((line, idx) => {
    const i = idx + 1;
    if (SKIP.has(`${rel}:${i}`)) return;
    let m = ROW.exec(line);
    if (m && line.includes("下一个可用编号")) return;
    if (m) {
      const title = stripChars(m[2], " *") || m[3];
      push(rec, Number(m[1]), { kind: TABLE, rel, line: i, summary: clip(title) });
      return;
    }
    m = LEAD.exec(line);
    if (m) {
      const ids = [...(m[1] + (m[2] ?? "")).matchAll(DN)].map((x) => Number(x[1]));
      if (ids.length) {
        for (const n of new Set(ids)) push(rec, n, { kind: ENTRY, rel, line: i, summary: "" });
        return;
      }
    }
    for (const x of line.matchAll(DN)) push(men, Number(x[1]), { rel, line: i });
  });
}

const cmp =
  (...keys) =>
  (a, b) => {
    for (const k of keys) {
      const x = k(a);
      const y = k(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };
const link = (rel, i) =>
  `[${rel}:${i}](${rel.startsWith("design/") ? rel.slice("design/".length) : `../${rel}`})`;
const locs = (list) =>
  list
    .slice(0, 3)
    .map((loc) => link(loc.rel, loc.line))
    .join("；") + (list.length > 3 ? ` 等 ${list.length} 处` : "");

const current = readFileSync(OUT, "utf8");
const at = current.indexOf(SEP);
if (at < 0) fail(`${OUT}: table separator not found`);
const lastRow = Math.max(
  0,
  ...[...current.slice(at + SEP.length).matchAll(/^\| D(\d+) \|/gmu)].map((x) => Number(x[1])),
);
const maxN = maxArg ? Number(maxArg) : Math.max(...rec.keys());
if (maxN < lastRow)
  fail(`Refusing to shrink ${OUT}: it ends at D${lastRow}, but this run would stop at D${maxN}.`);
const rows = [];
for (let n = 1; n <= maxN; n++) {
  if (rec.has(n)) {
    const r = [...rec.get(n)].sort(
      cmp(
        (t) => t.kind,
        (t) => (t.rel.startsWith("design/") ? 0 : 1),
        (t) => t.rel,
        (t) => t.line,
      ),
    );
    const summ = r.find((t) => t.summary)?.summary ?? "";
    rows.push(`| D${n} | ${r[0].kind === TABLE ? "表" : "条目"} | ${summ} | ${locs(r)} |`);
  } else if (men.has(n) && n >= 12) {
    const seen = new Map(men.get(n).map((t) => [`${t.rel}:${t.line}`, t]));
    let m = [...seen.values()].sort(
      cmp(
        (t) => (t.rel.startsWith("design/") ? 0 : 1),
        (t) => t.rel,
        (t) => t.line,
      ),
    );
    let summ = "";
    if (SOURCE[n]) {
      const [f, ln, s] = SOURCE[n];
      summ = s;
      m = [{ rel: f, line: ln }, ...m.filter((t) => !(t.rel === f && t.line === ln))];
    }
    rows.push(`| D${n} | 提及 |${summ ? ` ${summ} ` : " "}| ${locs(m)} |`);
  } else {
    rows.push(`| D${n} | 无 | | |`);
  }
}

const next = current.slice(0, at + SEP.length) + rows.join("\n") + "\n";
if (check) {
  if (next !== current) {
    console.error(`${OUT} is out of date; run: node scripts/gen-decisions-index.mjs`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (D1–D${maxN}).`);
} else {
  writeFileSync(OUT, next);
  console.log(`${OUT}: wrote D1–D${maxN}.`);
}

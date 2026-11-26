#!/usr/bin/env node
// Regenerates the table body of design/decisions.md (D562, MCF-14, MCF-21).
// Usage: node scripts/gen-decisions-index.mjs [--check] [maxN]
//   maxN defaults to the highest decision number that has a table row or entry.
//   --check exits 1 if design/decisions.md differs from the generated result.
// Exits 2 without touching the file on a bad argument, on a maxN below the last
// row already in the index, or when a source line looks like a decision record
// but does not match the exact format (each offending file:line is printed).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = "design/decisions.md";
const SEP = "| --- | --- | --- | --- |\n";
const USAGE = "Usage: node scripts/gen-decisions-index.mjs [--check] [maxN]";
// Decisions whose rule text lives only in prose: summary file listed first.
const SOURCE = {
  20: [
    "docs/release/README.md",
    "SemVer，tag 写作 `vX.Y.Z`，修复用 Z 位；“按里程碑划分 Sprint”已由 D555 取代（同页第 5 行）",
  ],
  21: ["docs/release/README.md", "tag 打在发布 PR 合并后的 squash 提交上"],
};
// S12 local acceptance labels D1-D6 are not decisions.
const SKIP = new Set([224, 225, 226, 227, 228, 229].map((n) => `design/tasks/S12.md:${n}`));

// Numbering pointer row, e.g. `| D525 | （下一个可用编号，尚未分配…） | — | — |`.
const POINTER = /^\| D\d{1,3}(?: 起)? \| [^|]*下一个可用编号[^|]* \| — \| — \|$/u;
const POINTER_WORD = "下一个可用编号";
const ROW_START = /^\|\s*\*{0,2}D\d/u;
const ROW = /^\|\s*\*{0,2}D(\d{1,3})(?!\d)((?:\\\||[^|])*)\|((?:\\\||[^|])*)\|/u;
// A list item with a bold lead cites a decision when its bold text, or the
// parenthetical right after it, contains a decision number. Such an item is either
// a decision entry, `**…**（…）：` (ENTRY_TAIL), or prose whose numbers are mentions:
// the bold text, or its closed parenthetical, is followed by punctuation or the end of
// the line (PROSE_NEXT). Anything else is a broken entry: an unclosed bold or
// parenthetical, a missing colon, or bold text that starts with a decision number.
const BOLD_START = /^\s*(?:[-*]|\d+\.)\s*\*\*/u;
const BOLD_ITEM = /^\s*(?:[-*]|\d+\.)\s*\*\*((?:[^*]|\*(?!\*))+)\*\*(.*)$/u;
const ENTRY_TAIL = /^(?:（([^）]*)）)?\s*[：:]/u;
const AFTER_BOLD = /^(?:（([^）]*)）)?\s*(.*)$/u;
const PROSE_NEXT = /^(?:$|[。，；、！？,.;!?）)])/u;
const EXPLICIT = /^\s*D\d{1,3}(?!\d)/u;
const DN = /(?<![A-Za-z0-9_\-#/.])D(\d{1,3})(?!\d)/gu;
// In a parenthetical, each decision number must be a whole item: `（SEC-02，D568）`,
// `（追加：D451）`, a range `D465–D467` or a supersede chain `D131 → D133`.
const PAREN_SPLIT = /[，、；,;/：:]/u;
const PAREN_ITEM = /^D\d{1,3}(?:\s*[–\-→]\s*D\d{1,3})?$/u;

const TABLE = 0;
const ENTRY = 1;

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const usageError = (msg) => fail(`${msg}\n${USAGE}`);

function parseArgs(args) {
  const check = args.includes("--check");
  const nums = args.filter((a) => a !== "--check");
  const unknown = nums.find((a) => a.startsWith("-"));
  if (unknown) usageError(`Unknown option: ${unknown}`);
  if (args.filter((a) => a === "--check").length > 1 || nums.length > 1)
    usageError(`Too many arguments: ${args.join(" ")}`);
  if (nums.length === 1 && !/^[1-9]\d{0,2}$/.test(nums[0]))
    usageError(`Invalid argument: ${nums[0]} (expected --check or a decision number 1-999)`);
  return { check, maxArg: nums[0] };
}

function sourceFiles() {
  return execFileSync("git", ["ls-files", "-z", "--", "design/*.md", "docs/*.md", "CHANGELOG.md"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((f) => f && f !== OUT)
    .sort();
}

const chars = (s) => Array.from(s);
const backticksOdd = (s) => (s.split("`").length - 1) % 2 === 1;
const stripChars = (s, set) => s.replace(new RegExp(`^[${set}]+|[${set}]+$`, "gu"), "");
const ids = (s) => [...s.matchAll(DN)].map((x) => Number(x[1]));

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

// Classifies one source line as a pointer, a table record, entry records, an error,
// or null (plain text, whose decision numbers are mentions). Entries are decision
// records only under design/; elsewhere (release notes, Demo pages, user docs,
// CHANGELOG) a bold-lead list item citing a decision is a mention.
export function classify(line, entriesAllowed) {
  if (POINTER.test(line)) return { pointer: true };
  if (ROW_START.test(line)) {
    const m = ROW.exec(line);
    if (!m) return { error: "looks like a decision table row but has fewer than two cells" };
    if (line.includes(POINTER_WORD))
      return {
        error: `decision table row contains “${POINTER_WORD}” but is not a pointer row \`| Dn | …${POINTER_WORD}… | — | — |\`; reword it (e.g. “编号指针”)`,
      };
    return { table: Number(m[1]), summary: clip(stripChars(m[2], " *") || m[3]) };
  }
  return entriesAllowed ? classifyEntry(line) : null;
}

const MALFORMED = {
  error:
    "list item looks like a decision entry but is not `**…**（…）：`; close the bold or the parenthetical, add the missing colon, or end the prose with punctuation",
};

// Checks the shape first, so a broken entry is an error instead of silently becoming a
// mention; then checks every decision number in the parenthetical, whether or not the
// bold text already names one.
function classifyEntry(line) {
  if (!BOLD_START.test(line)) return null;
  const m = BOLD_ITEM.exec(line);
  if (!m) return ids(line).length ? MALFORMED : null;
  const [, bold, tail] = m;
  const shape = ENTRY_TAIL.exec(tail);
  if (!shape) return isProse(bold, tail) ? null : MALFORMED;
  const paren = shape[1] ?? "";
  if (!ids(bold).length && !ids(paren).length) return null;
  const items = paren
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .split(PAREN_SPLIT)
    .map((s) => s.trim())
    .filter((s) => ids(s).length);
  if (!items.every((s) => PAREN_ITEM.test(s)))
    return {
      error:
        "list item with a bold lead and a parenthetical looks like a decision entry, but the decision number is inside prose; make it a whole item (`（…，D12）`, `（追加：D12）`) or move it out of the parenthetical",
    };
  return { entries: [...ids(bold), ...ids(paren)] };
}

// A bold lead without the entry colon is prose when it cites no decision, or when its
// bold text does not start with a decision number and it is followed by punctuation
// or the end of the line. A parenthetical that is never closed is never prose.
function isProse(bold, tail) {
  const [, paren = "", rest] = AFTER_BOLD.exec(tail);
  if (rest.startsWith("（")) return !ids(bold + rest).length;
  if (!ids(bold + paren).length) return true;
  return !EXPLICIT.test(bold) && PROSE_NEXT.test(rest);
}

function scan(files) {
  const records = new Map();
  const mentions = new Map();
  const errors = [];
  const push = (map, k, v) => (map.get(k) ?? map.set(k, []).get(k)).push(v);
  for (const rel of files) {
    const lines = readFileSync(rel, "utf8").split(/\r\n|\n|\r/u);
    if (lines.at(-1) === "") lines.pop();
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (SKIP.has(`${rel}:${lineNo}`)) return;
      const c = classify(line, rel.startsWith("design/"));
      if (c?.pointer) return;
      if (c?.error) errors.push(`${rel}:${lineNo}: ${c.error}`);
      else if (c?.table)
        push(records, c.table, { kind: TABLE, rel, line: lineNo, summary: c.summary });
      else if (c?.entries)
        for (const n of new Set(c.entries))
          push(records, n, { kind: ENTRY, rel, line: lineNo, summary: "" });
      else for (const n of ids(line)) push(mentions, n, rel);
    });
  }
  return { records, mentions, errors };
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
const docsLast = (rel) => (rel.startsWith("design/") ? 0 : 1);
const href = (rel) => (rel.startsWith("design/") ? rel.slice("design/".length) : `../${rel}`);
const list = (links) =>
  links.slice(0, 3).join("；") + (links.length > 3 ? ` 等 ${links.length} 处` : "");

function recordRow(n, recs) {
  const r = [...recs].sort(
    cmp(
      (t) => t.kind,
      (t) => docsLast(t.rel),
      (t) => t.rel,
      (t) => t.line,
    ),
  );
  const summary = r.find((t) => t.summary)?.summary ?? "";
  const where = list(r.map((t) => `[${t.rel}:${t.line}](${href(t.rel)})`));
  return `| D${n} | ${r[0].kind === TABLE ? "表" : "条目"} | ${summary} | ${where} |`;
}

// Mentions list files only, so moving text within a file does not change the index.
function mentionRow(n, rels) {
  let files = [...new Set(rels)].sort(cmp(docsLast, (rel) => rel));
  const [source, summary = ""] = SOURCE[n] ?? [];
  if (source) files = [source, ...files.filter((rel) => rel !== source)];
  const where = list(files.map((rel) => `[${rel}](${href(rel)})`));
  return `| D${n} | 提及 |${summary ? ` ${summary} ` : " "}| ${where} |`;
}

function main() {
  const { check, maxArg } = parseArgs(process.argv.slice(2));
  const { records, mentions, errors } = scan(sourceFiles());
  if (errors.length)
    fail(`${errors.join("\n")}\n${errors.length} line(s) could not be parsed; ${OUT} not written.`);

  const current = readFileSync(OUT, "utf8");
  const at = current.indexOf(SEP);
  if (at < 0) fail(`${OUT}: table separator not found`);
  const lastRow = Math.max(
    0,
    ...[...current.slice(at + SEP.length).matchAll(/^\| D(\d+) \|/gmu)].map((x) => Number(x[1])),
  );
  const maxN = maxArg ? Number(maxArg) : Math.max(...records.keys());
  if (maxN < lastRow)
    fail(`Refusing to shrink ${OUT}: it ends at D${lastRow}, but this run would stop at D${maxN}.`);

  const rows = [];
  for (let n = 1; n <= maxN; n++) {
    if (records.has(n)) rows.push(recordRow(n, records.get(n)));
    else if (mentions.has(n) && n >= 12) rows.push(mentionRow(n, mentions.get(n)));
    else rows.push(`| D${n} | 无 | | |`);
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
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

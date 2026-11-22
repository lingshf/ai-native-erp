#!/usr/bin/env node
// SLOT-01 manifest check: every decision exit of the slot sampler (procs.ps1) carries a rule id from the
// roadmap §5 "进程采样规则" table, no id outside the table appears in the sampler, every table id has at least one
// exit, and the rule version in the code equals the table's. Static text parsing only; runs on any OS.
//   node scripts/slot/check-manifest.mjs [--roadmap design/roadmap.md] [--code scripts/slot/procs.ps1] [--also FILE]...
// Exits 0 when everything matches, 1 on any mismatch, 2 on unusable input (missing file, no rule table).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const args = process.argv.slice(2);
const opts = {
  roadmap: join(repo, "design", "roadmap.md"),
  code: join(here, "procs.ps1"),
  also: [],
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const v = args[i + 1];
  if ((a === "--roadmap" || a === "--code" || a === "--also") && v !== undefined) {
    if (a === "--also") opts.also.push(resolve(v));
    else opts[a.slice(2)] = resolve(v);
    i++;
  } else {
    console.error(`unknown argument ${a}`);
    process.exit(2);
  }
}
if (!opts.also.length && opts.code === join(here, "procs.ps1"))
  opts.also.push(join(here, "slot-run.ps1"));

function fatal(msg) {
  console.error(`check-manifest: ${msg}`);
  process.exit(2);
}
for (const f of [opts.roadmap, opts.code, ...opts.also])
  if (!existsSync(f)) fatal(`file not found: ${f}`);

// ---- Roadmap: the rule table that follows the "进程采样规则" bullet, and its version.
const roadmap = readFileSync(opts.roadmap, "utf8").split(/\r?\n/);
const start = roadmap.findIndex((l) => l.includes("进程采样规则"));
if (start < 0) fatal(`no "进程采样规则" section in ${opts.roadmap}`);
const version = /当前版本\s*\*\*(R\d+)\*\*/.exec(roadmap[start])?.[1];
if (!version) fatal(`no "当前版本 **R…**" on the 进程采样规则 line of ${opts.roadmap}`);
const table = new Set();
let inTable = false;
for (let i = start + 1; i < roadmap.length; i++) {
  const l = roadmap[i].trim();
  const m = /^\|\s*(SR-[A-Z]+\d+)\s*\|/.exec(l);
  if (m) {
    table.add(m[1]);
    inTable = true;
  } else if (inTable && !l.startsWith("|")) break;
  else if (!inTable && /^- \*\*/.test(l)) break;
}
if (!table.size) fatal(`no SR-… rows in the 进程采样规则 table of ${opts.roadmap}`);

// ---- Code: decision exits, found by structure (not by their tags), in the three decision functions.
const code = readFileSync(opts.code, "utf8").split(/\r?\n/);
const idRe = /\bSR-[A-Z]+\d+\b/g;
const exits = [];
let fn = null;
code.forEach((line, i) => {
  const f = /^function\s+([\w-]+)/.exec(line);
  if (f) fn = f[1];
  else if (/^\S/.test(line) && !line.startsWith("}")) fn = null;
  if (!["Get-Owner", "Get-SystemExclusion", "Counted"].includes(fn)) return;
  const body = line.replace(/#.*$/, "");
  let kind = null;
  if (fn !== "Counted" && /\breturn\b(?!\s*(\$null\b|$|;|\}))/.test(body)) kind = "return";
  else if (fn === "Counted") {
    if (/\bcontinue\b/.test(body)) kind = "continue";
    else if (/@\{\s*Kind\s*=/.test(body)) kind = "verdict";
    else if (/\$mine\[.+?\]\s*=\s*\$true/.test(body)) kind = "runner-tree";
    else if (/lastExcluded\.Add\(/.test(body)) kind = "sink";
  }
  if (!kind) return;
  const prev = i > 0 && /^\s*#/.test(code[i - 1]) ? code[i - 1] : "";
  const ids = [...new Set([...(line.match(idRe) ?? []), ...(prev.match(idRe) ?? [])])];
  exits.push({ line: i + 1, fn, kind, ids, text: line.trim() });
});

const problems = [];
const rel = (f) =>
  f.replace(repo + (process.platform === "win32" ? "\\" : "/"), "").replace(/\\/g, "/");
const codeName = rel(opts.code);
const codeVersion = /\$script:SlotRuleVersion\s*=\s*'(R\d+)'/.exec(code.join("\n"))?.[1];
if (!codeVersion)
  problems.push(`${codeName}: no $script:SlotRuleVersion (roadmap table is ${version})`);
else if (codeVersion !== version)
  problems.push(`${codeName}: rule version ${codeVersion}, roadmap table is ${version}`);

for (const e of exits) {
  if (!e.ids.length)
    problems.push(
      `${codeName}:${e.line} ${e.fn} ${e.kind} exit has no rule id: ${e.text.slice(0, 140)}`,
    );
}
for (const f of [opts.code, ...opts.also]) {
  readFileSync(f, "utf8")
    .split(/\r?\n/)
    .forEach((l, i) => {
      for (const id of new Set(l.match(idRe) ?? []))
        if (!table.has(id))
          problems.push(`${rel(f)}:${i + 1} ${id} is not in the roadmap ${version} table`);
    });
}
// Coverage counts decision exits only; the sink just dispatches verdicts made earlier.
const covered = new Set(exits.filter((e) => e.kind !== "sink").flatMap((e) => e.ids));
for (const id of table)
  if (!covered.has(id))
    problems.push(`${id} (roadmap ${version}) has no decision exit in ${codeName}`);

console.log(`roadmap ${rel(opts.roadmap)}: version ${version}, rules ${[...table].join(" ")}`);
console.log(`code ${codeName}: version ${codeVersion ?? "(none)"}, ${exits.length} exits`);
for (const e of exits)
  console.log(`  ${codeName}:${e.line} ${e.fn} ${e.kind} -> ${e.ids.join(" ") || "(no rule id)"}`);
if (problems.length) {
  console.log(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("OK: every exit has a rule id, every id is in the table, every table id has an exit");

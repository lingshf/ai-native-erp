// M2-05a migration-chain Bench (D417: fictional ledgers only). Each step runs in a fresh child
// process (`--step NAME WORK_DIR`) so its peak RSS is its own, not the fixture build's.
// Snapshot timing stays in the Windows nightly `bench-legacy-snapshot.mjs` (≤ 60s).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { legacyFixture, openingItemsFile } from "../packages/infra/test/support/legacy-fixture.mjs";
import {
  MILLION_GL_LINES,
  writeMillionLineSnapshot,
} from "../packages/infra/test/support/legacy-million-fixture.mjs";
import { runStorageAdmin } from "./storage-admin-main.mjs";

const OPENING_ITEMS = 100_000;
// With trade advances every AP/AR control account needs a detail or empty declaration.
const TRADE_CONTROL_ACCOUNTS = ["1300", "1400", "2100", "2300"];
const DRY_RUN_BUDGET_SECONDS = 120;
const IMPORT_BUDGET_SECONDS = 600;
const CONFIRM_BUDGET_SECONDS = 120;
const PEAK_RSS_BUDGET_MIB = 512;
/**
 * Known gaps (D434): budgets still reported with their limit but not failing the job.
 * Delete an entry when its gap closes to restore the hard gate.
 */
const KNOWN_GAPS = {
  "import.peakRssMiB":
    "KG (D434): the opening plan of 100k items stays resident through the import (373 MiB with 0 items, 668 MiB with 100k); fix by writing opening items in batches or streaming",
};
const STEP_TIMEOUT_MS = 30 * 60 * 1000;
const STEP_OUTPUT_BYTES = 64 * 1024 * 1024;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "artifacts", "ci", "migration-rehearsal.json");
const decisionC = [
  ["--drafts", "import-as-draft"],
  ["--receipts", "archive-only"],
  ["--source-events", "archive-only"],
  ["--transfer-queue", "archive-only"],
  ["--seals", "archive-only"],
  ["--audit", "archive-only"],
].flat();

/** `hard` budgets fail the job unless listed in KNOWN_GAPS; anything else is record-only. */
const steps = [
  {
    name: "dry-run",
    hard: { seconds: DRY_RUN_BUDGET_SECONDS, peakRssMiB: PEAK_RSS_BUDGET_MIB },
    run: dryRunStep,
  },
  {
    name: "import",
    hard: { seconds: IMPORT_BUDGET_SECONDS, peakRssMiB: PEAK_RSS_BUDGET_MIB },
    run: importStep,
  },
  { name: "confirm", hard: { seconds: CONFIRM_BUDGET_SECONDS }, run: confirmStep },
  { name: "backup-verify", hard: {}, run: backupVerifyStep },
];

const paths = (work) => ({
  snapshot: join(work, "snapshot"),
  openingItems: join(work, "opening-items.json"),
  target: join(work, "target.sqlite"),
  confirmation: join(work, "confirmation.json"),
  backup: join(work, "target-backup.sqlite"),
});

/** Same CLI code path as `node scripts/storage-admin.mjs`, kept in-process for RSS. */
async function storageAdmin(...args) {
  const lines = { stdout: [], stderr: [] };
  const exitCode = await runStorageAdmin(args, {
    stdout: (line) => lines.stdout.push(line),
    stderr: (line) => lines.stderr.push(line),
  });
  assert.equal(exitCode, 0, lines.stderr.join("\n"));
  return JSON.parse(lines.stdout.join("\n"));
}

async function dryRunStep(work) {
  const plan = await storageAdmin(
    "legacy-import",
    "--snapshot-dir",
    paths(work).snapshot,
    "--dry-run",
    ...decisionC,
  );
  assert.equal(plan.executable, true);
  assert.equal(plan.counts["teaching.lines"].mapped, MILLION_GL_LINES + 2);
  return {};
}

// The import report has no phase split, so batch-commit hooks bracket the final transaction:
// last GL batch + 100k opening items + opening recheck (record-only, M2-03b).
async function importStep(work) {
  const { LegacyImportSnapshot } = await import("../packages/infra/src/legacy/import-plan.ts");
  const { executeLegacyImport } = await import("../packages/infra/src/storage/legacy-import.ts");
  const { snapshot, target, openingItems } = paths(work);
  const manifest = JSON.parse(readFileSync(join(snapshot, "manifest.json"), "utf8"));
  const source = new LegacyImportSnapshot(snapshot, manifest);
  let previousCommitAt = performance.now();
  let finalTransactionSeconds;
  try {
    const result = await executeLegacyImport(
      source,
      {
        target,
        choices: choicesFrom(decisionC),
        openingItems: { bytes: readFileSync(openingItems) },
      },
      {
        beforeBatchCommit: () => {
          previousCommitAt = performance.now();
        },
        beforeReconcile: () => {
          finalTransactionSeconds = (performance.now() - previousCommitAt) / 1000;
        },
      },
    );
    assert.equal(result.status, "imported");
  } finally {
    source.close();
  }
  return { recorded: { lastBatchWithOpeningItemsSeconds: finalTransactionSeconds } };
}

function choicesFrom(options) {
  const choices = {};
  for (let index = 0; index < options.length; index += 2)
    choices[options[index].slice(2)] = options[index + 1];
  return choices;
}

async function confirmStep(work) {
  const { snapshot, target, confirmation } = paths(work);
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(target, { readOnly: true });
  try {
    const report = JSON.parse(db.prepare("SELECT report FROM legacy_reconciliations").get().report);
    writeFileSync(
      confirmation,
      JSON.stringify({ knownDifferencesSha256: report.knownDifferencesSha256 }),
    );
  } finally {
    db.close();
  }
  const confirmed = await storageAdmin(
    "legacy-reconcile",
    "--snapshot-dir",
    snapshot,
    "--target",
    target,
    "--confirm",
    confirmation,
  );
  assert.equal(confirmed.verdict, "pass");
  return {};
}

async function backupVerifyStep(work) {
  const { target, backup } = paths(work);
  await storageAdmin("backup", target, backup);
  await storageAdmin("verify", "--provider", "sqlite", "--file", backup);
  return { recorded: { backupBytes: statSync(backup).size } };
}

async function runStep(name, work) {
  const step = steps.find((candidate) => candidate.name === name);
  const start = performance.now();
  const result = await step.run(work);
  const seconds = (performance.now() - start) / 1000;
  const peakRssMiB = process.resourceUsage().maxRSS / 1024;
  console.log(JSON.stringify({ seconds, peakRssMiB, ...result }));
}

const OPENING_JOURNAL = "FICT-BENCH-OPENING";

/** One fictional F journal (Dr 1300 / Cr 4000) that the opening items explain cent by cent. */
async function addOpeningJournal(enterprise, amountMinor) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(enterprise);
  const date = "2026-01-15";
  const lineData = (account, debit, credit) =>
    JSON.stringify({
      account,
      debit,
      credit,
      transactionDebit: debit,
      transactionCredit: credit,
      accountingCurrency: "EUR",
      currency: "EUR",
      reportingCurrency: "EUR",
      reportingDebit: debit,
      reportingCredit: credit,
      rateRefs: { accounting: null, reporting: null },
      dimensions: {},
      dimensionOrigins: {},
      metadata: {},
    });
  try {
    db.prepare("INSERT INTO source_events VALUES('F',?,'journal',?,'{}')").run(
      OPENING_JOURNAL,
      date,
    );
    const journal = db
      .prepare(`INSERT INTO journals(company,reference,accounting_date,document_date,tax_date,kind,operation,memo,details)
        VALUES('F',?,?,?,?,'normal','journal','Fictional bench opening','{}')`)
      .run(OPENING_JOURNAL, date, date, date).lastInsertRowid;
    const line = db.prepare(
      "INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES('F',?,?,?,?,?,?)",
    );
    line.run(journal, 1, "1300", amountMinor, 0, lineData("1300", amountMinor, 0));
    line.run(journal, 2, "4000", 0, amountMinor, lineData("4000", 0, amountMinor));
  } finally {
    db.close();
  }
}

/** Fictional 1M GL lines plus 100k one-cent AR invoices that explain the F/1300 balance. */
async function prepareFixture(work, cleanups) {
  const fixture = legacyFixture(
    { onTestFinished: (fn) => cleanups.push(fn) },
    { tradeAdvances: true },
  );
  await addOpeningJournal(fixture.enterprise, OPENING_ITEMS);
  const { snapshot, openingItems } = paths(work);
  mkdirSync(snapshot);
  const { manifest } = writeMillionLineSnapshot(snapshot, {
    executable: true,
    enterpriseSource: fixture.enterprise,
  });
  writeFileSync(join(snapshot, "manifest.json"), JSON.stringify(manifest));
  const items = Array.from({ length: OPENING_ITEMS }, () => 1);
  const file = openingItemsFile({ accounts: TRADE_CONTROL_ACCOUNTS, items: { 1300: items } });
  writeFileSync(openingItems, file.bytes);
}

function spawnStep(step, work) {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--step", step.name, work],
    { cwd: root, encoding: "utf8", timeout: STEP_TIMEOUT_MS, maxBuffer: STEP_OUTPUT_BYTES },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, `${step.name} failed:\n${child.stderr}`);
  const { recorded = {}, ...measured } = JSON.parse(child.stdout.trim().split("\n").pop());
  console.error(
    `${step.name}: ${measured.seconds.toFixed(1)}s ${measured.peakRssMiB.toFixed(0)} MiB`,
  );
  return { step: step.name, metrics: labelMetrics(step, { ...measured, ...recorded }) };
}

function labelMetrics(step, values) {
  const label = (metric, value) => {
    if (!(metric in step.hard)) return { value, gate: "record-only" };
    const limit = step.hard[metric];
    const knownGap = KNOWN_GAPS[`${step.name}.${metric}`];
    if (knownGap) return { value, gate: "known-gap", limit, overBudget: value > limit, knownGap };
    return { value, gate: "hard", limit, exceeded: value > limit };
  };
  return Object.fromEntries(
    Object.entries(values).map(([metric, value]) => [metric, label(metric, value)]),
  );
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "erp-migration-rehearsal-bench-"));
  const cleanups = [() => rmSync(work, { recursive: true, force: true })];
  try {
    await prepareFixture(work, cleanups);
    const results = steps.map((step) => spawnStep(step, work));
    const report = {
      fictional: true,
      glLines: MILLION_GL_LINES,
      openingItems: OPENING_ITEMS,
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      steps: results,
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    const failed = results.filter((result) =>
      Object.values(result.metrics).some((metric) => metric.exceeded),
    );
    if (failed.length)
      throw new Error(`Migration rehearsal exceeded hard budgets: ${JSON.stringify(failed)}`);
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
}

const stepIndex = process.argv.indexOf("--step");
if (stepIndex > 0) await runStep(process.argv[stepIndex + 1], process.argv[stepIndex + 2]);
else await main();

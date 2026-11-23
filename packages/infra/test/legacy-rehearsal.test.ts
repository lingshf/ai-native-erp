// M2-05a (D417): fictional end-to-end migration rehearsal. Every step spawns the real storage
// admin CLI with the same arguments as docs/migration-runbook.md; no real legacy data is read.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { captureDirectory, legacyFixture, openingItemsFile } from "./support/legacy-fixture.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const storageAdminScript = resolve(root, "scripts", "storage-admin.mjs");
const CLI_TIMEOUT_MS = 30_000;
const realSnapshotCapture =
  process.platform === "win32" && process.env.ERP_WINDOWS_SNAPSHOT_HANDLES === "1";
const decisionC = [
  ["--drafts", "import-as-draft"],
  ["--receipts", "archive-only"],
  ["--source-events", "archive-only"],
  ["--transfer-queue", "archive-only"],
  ["--seals", "archive-only"],
  ["--audit", "archive-only"],
].flat();

type CliResult = { exitCode: number | null; json: ReturnType<typeof JSON.parse> };

function storageAdmin(...args: string[]): CliResult {
  const result = spawnSync(process.execPath, [storageAdminScript, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
  });
  assert.ifError(result.error);
  return { exitCode: result.status, json: JSON.parse(result.stdout || result.stderr) };
}

function succeeded(result: CliResult) {
  assert.equal(result.exitCode, 0, JSON.stringify(result.json));
  return result.json;
}

function sha256(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readTarget<T>(target: string, query: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(target, { readOnly: true });
  try {
    return query(db);
  } finally {
    db.close();
  }
}

const runStatus = (target: string) =>
  readTarget(target, (db) => db.prepare("SELECT status FROM legacy_import_runs").get()?.status);

/** Fictional ledgers, a verified snapshot and an empty work directory for targets. */
function rehearsalFixture(t, { captureWithCli = false } = {}) {
  const fixture = legacyFixture(t);
  const work = mkdtempSync(join(tmpdir(), "erp-legacy-rehearsal-"));
  t.onTestFinished(() => rmSync(work, { recursive: true, force: true }));
  const snapshot = captureWithCli ? captureSnapshot(fixture) : fixture.target;
  const openingItems = join(work, "opening-items.json");
  writeFileSync(openingItems, openingItemsFile().bytes);
  return {
    fixture,
    snapshot,
    openingItems,
    target: join(work, "target.sqlite"),
    backup: join(work, "target-backup.sqlite"),
    confirmation: join(work, "confirmation.json"),
    work,
  };
}

/** Windows only (D10): copies the fictional ledgers into a stopped source and snapshots it. */
function captureSnapshot(fixture) {
  const source = join(fixture.directory, "stopped-source");
  const captured = join(fixture.directory, "captured");
  mkdirSync(source);
  copyFileSync(fixture.teaching, join(source, "teaching.sqlite"));
  copyFileSync(fixture.enterprise, join(source, "erp.sqlite"));
  succeeded(storageAdmin("legacy-snapshot", "--source-dir", source, "--out-dir", captured));
  return captured;
}

function importTarget(rehearsal, openingItems = rehearsal.openingItems) {
  return storageAdmin(
    "legacy-import",
    "--snapshot-dir",
    rehearsal.snapshot,
    "--target",
    rehearsal.target,
    ...decisionC,
    "--opening-items",
    openingItems,
  );
}

const reconcile = (rehearsal, ...mode: string[]) =>
  storageAdmin(
    "legacy-reconcile",
    "--snapshot-dir",
    rehearsal.snapshot,
    "--target",
    rehearsal.target,
    ...mode,
  );

/** The operator confirms exactly the known-difference list the import report saved. */
function writeConfirmation(rehearsal) {
  const report = readTarget(rehearsal.target, (db) =>
    JSON.parse(db.prepare("SELECT report FROM legacy_reconciliations").get()?.report as string),
  );
  writeFileSync(
    rehearsal.confirmation,
    JSON.stringify({ knownDifferencesSha256: report.knownDifferencesSha256 }),
  );
}

function snapshotCompanies(snapshot: string) {
  const enterprise = readTarget(join(snapshot, "erp.sqlite"), (db) =>
    db.prepare("SELECT DISTINCT company FROM accounts").all(),
  );
  return ["TEACHING", ...enterprise.map((row) => String(row.company))].sort();
}

function assertTradeSubledgerBalanced(report) {
  const rows = report.checks.find((check) => check.section === "trade-reconciliation").actual;
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.tradeDifferenceMinor, "0");
    assert.equal(row.otherSourceMinor, "0");
  }
}

/** J4b: before confirmation a check is read-only and not a pass while known differences exist. */
function assertCheckBeforeConfirmationIsReadOnly(rehearsal) {
  const bytesBefore = sha256(rehearsal.target);
  const checked = reconcile(rehearsal, "--check");
  assert.equal(checked.exitCode, 1);
  assert.notEqual(checked.json.verdict, "pass");
  assert.ok(checked.json.knownDifferences.length > 0);
  assert.equal(sha256(rehearsal.target), bytesBefore);
  assert.equal(runStatus(rehearsal.target), "imported");
}

function rehearse(rehearsal) {
  const { snapshot, target } = rehearsal;
  const untouched = captureDirectory(rehearsal.fixture.directory, { mtime: true });
  const listed = succeeded(storageAdmin("legacy-import", "--snapshot-dir", snapshot, "--dry-run"));
  assert.equal(listed.choices.length, 6);
  assert.equal(
    succeeded(storageAdmin("legacy-import", "--snapshot-dir", snapshot, "--dry-run", ...decisionC))
      .executable,
    true,
  );
  assert.equal(succeeded(importTarget(rehearsal)).status, "imported");
  assertCheckBeforeConfirmationIsReadOnly(rehearsal);
  writeConfirmation(rehearsal);
  assert.equal(
    succeeded(reconcile(rehearsal, "--confirm", rehearsal.confirmation)).verdict,
    "pass",
  );
  assert.equal(runStatus(target), "reconciled");
  succeeded(storageAdmin("backup", target, rehearsal.backup));
  succeeded(storageAdmin("verify", "--provider", "sqlite", "--file", rehearsal.backup));
  const checked = succeeded(reconcile(rehearsal, "--check"));
  assert.equal(checked.verdict, "pass");
  assertTradeSubledgerBalanced(checked);
  assert.deepEqual(captureDirectory(rehearsal.fixture.directory, { mtime: true }), untouched);
  const targetCompanies = readTarget(target, (db) =>
    db.prepare("SELECT company_id FROM companies ORDER BY company_id").all(),
  ).map((row) => String(row.company_id));
  assert.deepEqual(targetCompanies, snapshotCompanies(snapshot));
}

test.skipIf(realSnapshotCapture)(
  "J2/J3/J4b rehearsal from a fictional snapshot: dry-run, import, check, confirm, backup, verify, check",
  (t) => rehearse(rehearsalFixture(t)),
);

test.skipIf(!realSnapshotCapture)(
  "J2/J3/J4b/J5 rehearsal from a real Windows legacy-snapshot of fictional ledgers",
  (t) => rehearse(rehearsalFixture(t, { captureWithCli: true })),
);

test("J4a an opening-items total that differs from the control balance leaves no usable target", (t) => {
  const rehearsal = rehearsalFixture(t);
  const mismatched = join(rehearsal.work, "opening-items-mismatch.json");
  writeFileSync(mismatched, openingItemsFile({ items: { "1300": [100] } }).bytes);
  const refused = importTarget(rehearsal, mismatched);
  assert.equal(refused.exitCode, 1);
  assert.equal(refused.json.error.code, "INVALID_INPUT");
  assert.match(refused.json.error.message, /rule 2 F\/1300/u);
  // Rule 2 is checked before any write, so not even a failed run exists to be opened later.
  assert.equal(existsSync(rehearsal.target), false);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { backupSqlite, createSqliteStorage } from "../src/storage/index.ts";
import { legacyFixture, captureDirectory, openingItemsFile } from "./support/legacy-fixture.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const script = resolve(root, "scripts", "storage-admin.mjs");
function run(args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  return result;
}
function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "erp-storage-cli-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test("legacy-import refuses a corrupt snapshot before creating a target", (t) => {
  const f = legacyFixture(t),
    target = resolve(f.directory, "refused.sqlite");
  f.manifest.ledgers.teaching.sha256 = "0".repeat(64);
  writeFileSync(resolve(f.target, "manifest.json"), JSON.stringify(f.manifest));
  const before = captureDirectory(f.target, { mtime: true });
  const result = run([
    "legacy-import",
    "--snapshot-dir",
    f.target,
    "--target",
    target,
    "--drafts",
    "skip",
    "--receipts",
    "archive-only",
    "--source-events",
    "archive-only",
    "--transfer-queue",
    "archive-only",
    "--seals",
    "archive-only",
    "--audit",
    "archive-only",
  ]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, "INVALID_SNAPSHOT");
  assert.equal(readdirSync(f.directory).includes("refused.sqlite"), false);
  assert.deepEqual(captureDirectory(f.target, { mtime: true }), before);
});
test("legacy-import CLI requires six explicit decisions, imports only a new target and leaves source snapshots untouched", (t) => {
  const f = legacyFixture(t),
    target = resolve(f.directory, "target.sqlite");
  const options = ["legacy-import", "--snapshot-dir", f.target, "--target", target];
  const explicit = [
    "--drafts",
    "skip",
    "--receipts",
    "archive-only",
    "--source-events",
    "archive-only",
    "--transfer-queue",
    "archive-only",
    "--seals",
    "archive-only",
    "--audit",
    "archive-only",
  ];
  const before = captureDirectory(f.target, { mtime: true });
  const missing = run(options);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).error.code, "INVALID_INPUT");
  const opening = resolve(f.directory, "opening-items.json");
  writeFileSync(opening, openingItemsFile().bytes);
  explicit.push("--opening-items", opening);
  const imported = run([...options, ...explicit]);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).status, "imported");
  const check = new DatabaseSync(target, { readOnly: true });
  try {
    assert.equal(check.prepare("SELECT count(*) n FROM journal_drafts").get().n, 0);
    assert.equal(
      check.prepare("SELECT count(*) n FROM legacy_refs WHERE object_type='journals'").get().n,
      3,
    );
  } finally {
    check.close();
  }
  const bytes = readFileSync(target);
  const repeated = run([...options, ...explicit]);
  assert.equal(repeated.status, 1);
  assert.equal(JSON.parse(repeated.stderr).error.code, "CONFLICT");
  assert.deepEqual(readFileSync(target), bytes);
  assert.deepEqual(captureDirectory(f.target, { mtime: true }), before);
});
test("legacy-import CLI requires a readable opening-items file when AP/AR controls are in scope", (t) => {
  const f = legacyFixture(t),
    target = resolve(f.directory, "target.sqlite");
  const options = [
    "legacy-import",
    "--snapshot-dir",
    f.target,
    "--target",
    target,
    "--drafts",
    "skip",
    "--receipts",
    "archive-only",
    "--source-events",
    "archive-only",
    "--transfer-queue",
    "archive-only",
    "--seals",
    "archive-only",
    "--audit",
    "archive-only",
  ];
  const withoutOpening = run(options);
  assert.equal(withoutOpening.status, 1);
  const refused = JSON.parse(withoutOpening.stderr).error;
  assert.equal(refused.code, "INVALID_INPUT");
  assert.match(refused.message, /rule 1/u);
  const absentFile = run([...options, "--opening-items", resolve(f.directory, "absent.json")]);
  assert.equal(absentFile.status, 1);
  assert.equal(JSON.parse(absentFile.stderr).error.code, "INVALID_INPUT");
  assert.equal(readdirSync(f.directory).includes("target.sqlite"), false);
});

test("storage CLI help and invalid configuration never choose an implicit target", (t) => {
  const directory = fixture(t);
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(JSON.parse(help.stdout).usage, /--provider sqlite --file FILE/u);
  for (const args of [
    ["migrate"],
    ["migrate", "--provider", "sqlite"],
    ["migrate", "--provider", "unsupported"],
    ["backup"],
    ["restore", resolve(directory, "missing.sqlite")],
    ["backup", resolve(directory, "missing.sqlite"), "--out"],
    [
      "migrate",
      "--provider",
      "sqlite",
      "--file",
      resolve(directory, "missing.sqlite"),
      "--tenant",
      "T1",
    ],
    [
      "migrate",
      "--provider",
      "sqlite",
      "--file",
      resolve(directory, "missing.sqlite"),
      "--unexpected",
    ],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error.code, "INVALID_INPUT");
  }
  assert.deepEqual(readdirSync(directory), []);
});

// Each CLI spawn cold-loads core and storage, so every case below spawns the CLI once and
// prepares its precondition in-process with the same storage API the CLI calls.
function sqliteTarget(t) {
  const directory = fixture(t);
  const filename = resolve(directory, "target.sqlite");
  return { directory, filename, target: ["--provider", "sqlite", "--file", filename] };
}
async function withStorage(filename, use) {
  const store = createSqliteStorage({ filename });
  try {
    return await use(store);
  } finally {
    await store.close();
  }
}
function assertAction(result, action) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).action, action);
}

test("storage CLI backs up a migrated target to an explicit snapshot path", async (t) => {
  const { directory, filename } = sqliteTarget(t);
  const snapshot = resolve(directory, "snapshot.sqlite");
  await withStorage(filename, (store) => store.migrate());
  assertAction(run(["backup", filename, snapshot]), "backup");
  await withStorage(snapshot, (store) => store.verifySchema());
});

test("storage CLI restores an explicit snapshot and reports the rollback copy", async (t) => {
  const { directory, filename } = sqliteTarget(t);
  const snapshot = resolve(directory, "snapshot.sqlite");
  await withStorage(filename, (store) => store.migrate());
  await backupSqlite(filename, snapshot);
  const database = new DatabaseSync(filename);
  database.exec("INSERT INTO tenants VALUES('SYNTHETIC',0)");
  database.close();
  const restored = run(["restore", filename, snapshot]);
  assertAction(restored, "restore");
  assert.ok(statSync(JSON.parse(restored.stdout).backup).size > 0);
  const check = new DatabaseSync(filename);
  try {
    assert.equal(check.prepare("SELECT count(*) AS n FROM tenants").get().n, 0);
  } finally {
    check.close();
  }
});

test("storage CLI verify refuses an absent target without creating it", (t) => {
  const { directory, target } = sqliteTarget(t);
  const absent = run(["verify", ...target]);
  assert.equal(absent.status, 1);
  assert.deepEqual(readdirSync(directory), []);
});

test("storage CLI explicitly migrates a new independent target", async (t) => {
  const { filename, target } = sqliteTarget(t);
  assertAction(run(["migrate", ...target]), "migrate");
  assert.ok(statSync(filename).size > 0);
  await withStorage(filename, (store) => store.verifySchema());
});

test("storage CLI migrate is repeatable on an already migrated target", async (t) => {
  const { filename, target } = sqliteTarget(t);
  await withStorage(filename, (store) => store.migrate());
  assertAction(run(["migrate", ...target]), "migrate");
  await withStorage(filename, (store) => store.verifySchema());
});

test("storage CLI verifies a migrated target", async (t) => {
  const { filename, target } = sqliteTarget(t);
  await withStorage(filename, (store) => store.migrate());
  assertAction(run(["verify", ...target]), "verify");
});

test("storage CLI provisions an explicit scope on a migrated target", async (t) => {
  const { filename, target } = sqliteTarget(t);
  await withStorage(filename, (store) => store.migrate());
  assertAction(
    run(["provision", ...target, "--tenant", "T1", "--book", "B1", "--company", "C1"]),
    "provision",
  );
  await withStorage(filename, async (store) => {
    await store.verifySchema();
    const scope = { level: "company", tenantId: "T1", bookId: "B1", companyId: "C1" };
    assert.equal(await store.read(scope, (session) => session.revisions.get(scope)), 0);
  });
});

test("storage CLI refuses an existing foreign database without changing its bytes", (t) => {
  const directory = fixture(t);
  const filename = resolve(directory, "foreign.sqlite");
  const database = new DatabaseSync(filename);
  database.exec(
    "CREATE TABLE protected_value (value TEXT); INSERT INTO protected_value VALUES ('preserve')",
  );
  database.close();
  const before = readFileSync(filename);
  const names = readdirSync(directory);
  const result = run(["migrate", "--provider", "sqlite", "--file", filename]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, "SCHEMA_MISMATCH");
  assert.ok(!result.stderr.includes(filename));
  assert.deepEqual(readFileSync(filename), before);
  assert.deepEqual(readdirSync(directory), names);
});

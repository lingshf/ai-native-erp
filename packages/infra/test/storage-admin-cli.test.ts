import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";

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

test("storage CLI backup and restore require explicit paths and report the rollback copy", (t) => {
  const directory = fixture(t);
  const filename = resolve(directory, "target.sqlite");
  const snapshot = resolve(directory, "snapshot.sqlite");
  assert.equal(run(["migrate", "--provider", "sqlite", "--file", filename]).status, 0);
  const backup = run(["backup", filename, snapshot]);
  assert.equal(backup.status, 0, backup.stderr);
  const database = new DatabaseSync(filename);
  database.exec("INSERT INTO tenants VALUES('SYNTHETIC',0)");
  database.close();
  const restored = run(["restore", filename, snapshot]);
  assert.equal(restored.status, 0, restored.stderr);
  const result = JSON.parse(restored.stdout);
  assert.equal(result.action, "restore");
  assert.ok(statSync(result.backup).size > 0);
  const check = new DatabaseSync(filename);
  try {
    assert.equal(check.prepare("SELECT count(*) AS n FROM tenants").get().n, 0);
  } finally {
    check.close();
  }
});

test("storage CLI explicitly migrates, verifies and provisions an independent target", async (t) => {
  const directory = fixture(t);
  const filename = resolve(directory, "target.sqlite");
  const target = ["--provider", "sqlite", "--file", filename];
  const absent = run(["verify", ...target]);
  assert.equal(absent.status, 1);
  assert.deepEqual(readdirSync(directory), []);
  for (const action of ["migrate", "migrate", "verify"]) {
    const result = run([action, ...target]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).action, action);
  }
  assert.ok(statSync(filename).size > 0);
  const provision = run([
    "provision",
    ...target,
    "--tenant",
    "T1",
    "--book",
    "B1",
    "--company",
    "C1",
  ]);
  assert.equal(provision.status, 0, provision.stderr);
  const { createSqliteStorage } = await import("../src/storage/index.ts");
  const store = createSqliteStorage({ filename });
  try {
    await store.verifySchema();
    const scope = { level: "company", tenantId: "T1", bookId: "B1", companyId: "C1" };
    assert.equal(await store.read(scope, (session) => session.revisions.get(scope)), 0);
  } finally {
    await store.close();
  }
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

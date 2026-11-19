import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { test, vi } from "vitest";
import { backupSqlite, createSqliteStorage, restoreSqlite } from "../src/storage/index.ts";
import { acquireMaintenance } from "../src/storage/maintenance.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "erp-backup-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "target.sqlite");
  const input = join(directory, "snapshot.sqlite");
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const db = new Database(filename);
  db.exec("INSERT INTO tenants VALUES('SYNTHETIC', 1)");
  db.close();
  await backupSqlite(filename, input);
  const checkpoint = new Database(filename);
  checkpoint.pragma("wal_checkpoint(TRUNCATE)");
  checkpoint.close();
  return { directory, filename, input };
}

function revision(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    return db.prepare("SELECT revision FROM tenants WHERE tenant_id='SYNTHETIC'").get().revision;
  } finally {
    db.close();
  }
}

function crashWithCommittedWal(filename) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import Database from 'better-sqlite3';
       const db = new Database(process.argv[1]);
       db.pragma('journal_mode=WAL');
       db.pragma('wal_autocheckpoint=0');
       db.exec("UPDATE tenants SET revision=7 WHERE tenant_id='SYNTHETIC'");
       process.exit(0);`,
      filename,
    ],
    { cwd: root, encoding: "utf8", timeout: 10_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(`${filename}-wal`));
  // The committed value really is absent from the main file alone.
  const isolated = `${filename}.isolated`;
  writeFileSync(isolated, readFileSync(filename));
  assert.equal(revision(isolated), 1);
}

test("online backup is a standalone consistent snapshot during concurrent committed writes", async (t) => {
  const { directory, filename } = await fixture(t);
  const writer = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import Database from 'better-sqlite3';
       const db = new Database(process.argv[1]);
       db.pragma('journal_mode=WAL');
       db.exec("INSERT INTO tenants VALUES('PAIRED',1)");
       const write = db.transaction(() => db.exec("UPDATE tenants SET revision=revision+1"));
       write(); process.stdout.write('ready\\n');
       setInterval(write, 2);`,
      filename,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  const exit = once(writer, "exit");
  t.onTestFinished(async () => {
    if (writer.exitCode === null && writer.signalCode === null) writer.kill();
    await exit;
  });
  await once(writer.stdout, "data");
  const output = join(directory, "online.sqlite");
  await backupSqlite(filename, output);
  const db = new Database(output, { readonly: true });
  try {
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    const rows = db.prepare("SELECT revision FROM tenants ORDER BY tenant_id").all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].revision, rows[1].revision);
    assert.ok(rows[0].revision >= 2);
    assert.equal(db.pragma("journal_mode", { simple: true }), "delete");
  } finally {
    db.close();
  }
  assert.ok(!existsSync(`${output}-wal`));
  assert.ok(!existsSync(`${output}-shm`));
  await assert.rejects(backupSqlite(filename, output));
});

test("restore checkpoints crash WAL into a complete .bak before restoring the snapshot", async (t) => {
  const { filename, input } = await fixture(t);
  crashWithCommittedWal(filename);
  const { backup } = await restoreSqlite(filename, input);
  assert.equal(revision(filename), 1);
  assert.equal(revision(backup), 7);
  assert.ok(!existsSync(`${backup}-wal`));
  assert.ok(!existsSync(`${backup}-shm`));
  assert.ok(!existsSync(`${filename}.maintenance-lock`));
});

test("restore refuses a running storage user and an external SQLite exclusive lock", async (t) => {
  const { filename, input } = await fixture(t);
  const storage = createSqliteStorage({ filename });
  try {
    await storage.verifySchema();
    await assert.rejects(restoreSqlite(filename, input), { code: "BUSY" });
    assert.equal(revision(filename), 1);
  } finally {
    await storage.close();
  }
  const db = new Database(filename);
  try {
    db.exec("BEGIN IMMEDIATE");
    await assert.rejects(restoreSqlite(filename, input), { code: "BUSY" });
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }
  assert.equal(revision(filename), 1);
});

test("restore refuses corrupt and mismatched migration snapshots without replacing the target", async (t) => {
  const { filename, input } = await fixture(t);
  const validSnapshot = readFileSync(input);
  const db = new Database(input);
  db.exec("UPDATE schema_migrations SET checksum=printf('%064d',0) WHERE version=1");
  db.close();
  const before = readFileSync(filename);
  await assert.rejects(restoreSqlite(filename, input), { code: "SCHEMA_MISMATCH" });
  assert.deepEqual(readFileSync(filename), before);
  writeFileSync(input, validSnapshot);
  const outdated = new Database(input);
  outdated.exec(
    "DELETE FROM schema_migrations WHERE version=(SELECT max(version) FROM schema_migrations)",
  );
  outdated.close();
  await assert.rejects(restoreSqlite(filename, input), { code: "SCHEMA_MISMATCH" });
  assert.deepEqual(readFileSync(filename), before);
  writeFileSync(input, "not a SQLite database");
  await assert.rejects(restoreSqlite(filename, input));
  assert.deepEqual(readFileSync(filename), before);
  assert.ok(!existsSync(`${filename}.maintenance-lock`));
});

test("backup refuses target aliases and reserved SQLite or maintenance paths", async (t) => {
  const { filename } = await fixture(t);
  const before = readFileSync(filename);
  for (const suffix of ["", "-wal", "-shm", "-journal", ".maintenance-lock", ".users"]) {
    await assert.rejects(backupSqlite(filename, `${filename}${suffix}`), { code: "INVALID_INPUT" });
  }
  assert.deepEqual(readFileSync(filename), before);
});

test("restore reclaims crashed-process leases without ignoring live users", async (t) => {
  const { filename, input } = await fixture(t);
  const crashed = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {createSqliteStorage} from '@erp/infra/storage';
     const storage=createSqliteStorage({filename:process.argv[1]});
     await storage.verifySchema(); process.exit(0);`,
      filename,
    ],
    { cwd: root, encoding: "utf8", timeout: 10_000 },
  );
  assert.ifError(crashed.error);
  assert.equal(crashed.status, 0, crashed.stderr);
  assert.equal(readdirSync(`${filename}.users`).length, 1);
  await restoreSqlite(filename, input);
  assert.deepEqual(readdirSync(`${filename}.users`), []);
  assert.equal(revision(filename), 1);
});

test("failure after checkpoint but before replacement preserves committed WAL data", async (t) => {
  const { filename, input } = await fixture(t);
  crashWithCommittedWal(filename);
  const original = Database.prototype.pragma;
  const spy = vi.spyOn(Database.prototype, "pragma").mockImplementation(function (sql, options) {
    const value = original.call(this, sql, options);
    if (this.name === filename && sql === "wal_checkpoint(TRUNCATE)") {
      assert.ok(existsSync(`${filename}.maintenance-lock`));
      throw new Error("Injected post-checkpoint failure");
    }
    return value;
  });
  try {
    await assert.rejects(restoreSqlite(filename, input));
  } finally {
    spy.mockRestore();
  }
  assert.equal(revision(filename), 7);
  assert.ok(!existsSync(`${filename}.maintenance-lock`));
});

test("residual sidecars after closing the target refuse replacement and are never deleted", async (t) => {
  const { directory, filename, input } = await fixture(t);
  crashWithCommittedWal(filename);
  const original = Database.prototype.close;
  const spy = vi.spyOn(Database.prototype, "close").mockImplementation(function () {
    const result = original.call(this);
    if (this.name === filename) {
      assert.ok(existsSync(`${filename}.maintenance-lock`));
      writeFileSync(`${filename}-wal`, "residual WAL");
      writeFileSync(`${filename}-shm`, "residual SHM");
    }
    return result;
  });
  try {
    await assert.rejects(restoreSqlite(filename, input), { code: "BUSY" });
  } finally {
    spy.mockRestore();
  }
  assert.equal(readFileSync(`${filename}-wal`, "utf8"), "residual WAL");
  assert.equal(readFileSync(`${filename}-shm`, "utf8"), "residual SHM");
  assert.ok(!readdirSync(directory).some((name) => name.endsWith(".bak")));
  const isolated = join(directory, "checkpointed.sqlite");
  writeFileSync(isolated, readFileSync(filename));
  assert.equal(revision(isolated), 7);
});

test("replacement validation failure rolls back committed WAL data under the same maintenance lock", async (t) => {
  const { directory, filename, input } = await fixture(t);
  crashWithCommittedWal(filename);
  const original = Database.prototype.pragma;
  let checks = 0;
  const spy = vi.spyOn(Database.prototype, "pragma").mockImplementation(function (sql, options) {
    if (this.name === filename && sql === "integrity_check") {
      assert.ok(existsSync(`${filename}.maintenance-lock`));
      if (++checks === 2) throw new Error("Injected replacement verification failure");
    }
    return original.call(this, sql, options);
  });
  try {
    await assert.rejects(restoreSqlite(filename, input));
    assert.equal(checks, 3, "rollback itself is verified before releasing maintenance");
  } finally {
    spy.mockRestore();
  }
  assert.equal(revision(filename), 7);
  const backup = readdirSync(directory).find((name) => name.endsWith(".bak"));
  assert.ok(backup);
  assert.equal(revision(join(directory, backup)), 7);
  assert.ok(!existsSync(`${filename}.maintenance-lock`));
});

test("service startup is refused while maintenance is held, before SQLite is opened", async (t) => {
  const { filename } = await fixture(t);
  const release = acquireMaintenance(filename);
  const before = readFileSync(filename);
  try {
    const result = spawnSync(
      process.execPath,
      [join(root, "packages", "infra", "src", "main.ts")],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          ERP_PROFILE: "local",
          ERP_HOST: "127.0.0.1",
          ERP_PORT: "4199",
          ERP_SQLITE_FILE: filename,
        },
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /StartupError/u);
    assert.deepEqual(readFileSync(filename), before);
    assert.ok(!existsSync(`${filename}-wal`));
    assert.ok(!existsSync(`${filename}-shm`));
  } finally {
    release();
  }
});

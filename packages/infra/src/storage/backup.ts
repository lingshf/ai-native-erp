import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, win32 } from "node:path";
import Database from "better-sqlite3";
import { StorageError } from "@erp/core/application";
import { storageError } from "./errors.ts";
import { acquireDatabaseLease, acquireMaintenance } from "./maintenance.ts";
import { inspectSchema } from "./migrations.ts";
import { APPLICATION_ID } from "./sqlite.ts";
import type { Row } from "./types.ts";

async function explicitFile(filename: string): Promise<string> {
  if (
    typeof filename !== "string" ||
    !isAbsolute(filename) ||
    filename.includes("\u0000") ||
    win32.normalize(filename).startsWith("\\\\") ||
    win32.normalize(filename).startsWith("\\??\\") ||
    filename.endsWith(":memory:")
  )
    throw new StorageError("INVALID_INPUT");
  return join(await realpath(dirname(filename)), basename(filename));
}

async function regularFile(filename: string): Promise<void> {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new StorageError("INVALID_INPUT");
}

async function noSidecars(filename: string): Promise<void> {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(`${filename}${suffix}`);
    } catch (error) {
      if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT")
        continue;
      throw error;
    }
    const error = new StorageError("BUSY");
    error.message =
      "SQLite sidecars remain. Stop all database users and investigate before retrying; do not delete sidecar files.";
    throw error;
  }
}

async function verify(database: Database.Database): Promise<void> {
  if (
    database.pragma("application_id", { simple: true }) !== APPLICATION_ID ||
    database.pragma("integrity_check", { simple: true }) !== "ok"
  )
    throw new StorageError("SCHEMA_MISMATCH");
  await inspectSchema(
    { query: async (sql, parameters = []) => database.prepare(sql).all(...parameters) as Row[] },
    false,
  );
}

async function verifyFile(filename: string, standalone = false): Promise<void> {
  const database = new Database(filename, {
    readonly: !standalone,
    fileMustExist: true,
    timeout: 0,
  });
  try {
    if (standalone && database.pragma("journal_mode = DELETE", { simple: true }) !== "delete")
      throw new StorageError("BUSY");
    await verify(database);
  } finally {
    database.close();
  }
  await noSidecars(filename);
}

function temporary(filename: string): string {
  return join(dirname(filename), `.${basename(filename)}.${randomUUID()}.tmp`);
}

function independentPath(filename: string, transfer: string): void {
  const normalize = (value: string) => (process.platform === "win32" ? value.toLowerCase() : value);
  const target = normalize(filename);
  const other = normalize(transfer);
  if (
    ["", "-wal", "-shm", "-journal", ".maintenance-lock", ".users"].some(
      (suffix) => other === `${target}${suffix}`,
    ) ||
    other.startsWith(`${target}.users/`) ||
    other.startsWith(`${target}.users\\`)
  )
    throw new StorageError("INVALID_INPUT");
}

export async function backupSqlite(filename: string, output: string): Promise<void> {
  let release: (() => void) | undefined;
  let stage: string | undefined;
  try {
    filename = await explicitFile(filename);
    output = await explicitFile(output);
    independentPath(filename, output);
    await regularFile(filename);
    release = await acquireDatabaseLease(filename);
    stage = temporary(output);
    const database = new Database(filename, { readonly: true, fileMustExist: true, timeout: 5000 });
    try {
      await verify(database);
      await database.backup(stage);
    } finally {
      database.close();
    }
    await verifyFile(stage, true);
    // COPYFILE_EXCL refuses both existing backups and aliases of the live target.
    await copyFile(stage, output, constants.COPYFILE_EXCL);
  } catch (error) {
    throw storageError(error);
  } finally {
    try {
      if (stage)
        await unlink(stage).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
    } finally {
      release?.();
    }
  }
}

export async function restoreSqlite(filename: string, input: string): Promise<{ backup: string }> {
  let release: (() => void) | undefined;
  let stage: string | undefined;
  let backup: string | undefined;
  let replaced = false;
  try {
    filename = await explicitFile(filename);
    input = await explicitFile(input);
    independentPath(filename, input);
    await regularFile(filename);
    release = acquireMaintenance(filename);
    const database = new Database(filename, { fileMustExist: true, timeout: 0 });
    try {
      // Attach crash-WAL shared memory in NORMAL mode so SQLite owns its cleanup.
      database.pragma("schema_version");
      database.pragma("locking_mode = EXCLUSIVE");
      database.exec("BEGIN EXCLUSIVE; ROLLBACK");
      await regularFile(input);
      await noSidecars(input);
      stage = temporary(filename);
      await copyFile(input, stage, constants.COPYFILE_EXCL);
      await verifyFile(stage, true);
      await verify(database);
      const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[];
      if (checkpoint[0]?.busy !== 0) throw new StorageError("BUSY");
    } finally {
      database.close();
    }
    await noSidecars(filename);
    backup = `${filename}.${new Date().toISOString().replaceAll(/[:.]/gu, "-")}.${randomUUID()}.bak`;
    await copyFile(filename, backup, constants.COPYFILE_EXCL);
    await verifyFile(backup, true);
    await noSidecars(filename);
    await rename(stage, filename);
    stage = undefined;
    replaced = true;
    await verifyFile(filename);
    return { backup };
  } catch (error) {
    if (replaced && backup) {
      // Keep the checkpointed .bak even if rollback itself encounters an I/O failure.
      await noSidecars(filename);
      const rollback = temporary(filename);
      try {
        await copyFile(backup, rollback, constants.COPYFILE_EXCL);
        await rename(rollback, filename);
        await verifyFile(filename);
      } finally {
        await unlink(rollback).catch((failure: NodeJS.ErrnoException) => {
          if (failure.code !== "ENOENT") throw failure;
        });
      }
    }
    throw storageError(error);
  } finally {
    try {
      if (stage)
        await unlink(stage).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
    } finally {
      release?.();
    }
  }
}

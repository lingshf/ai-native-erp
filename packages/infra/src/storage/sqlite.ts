import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, resolve, win32 } from "node:path";
import Database from "better-sqlite3";
import {
  CompiledQuery,
  Kysely,
  SqliteAdapter,
  SqliteDriver,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { DatabaseConnection } from "kysely";
import { StorageError } from "@erp/core/application";
import { inspectSchema } from "./migrations.ts";
import { acquireDatabaseLease } from "./maintenance.ts";
import { advanceWriteSequence, assertReconciledImport } from "./write-sequence.ts";
import type { Backend, Connection, Parameters, Row, SqliteStorageConfig } from "./types.ts";
import { APPLICATION_ID } from "./application-id.ts";

export { APPLICATION_ID };
const initializing = new Set<string>();

class ImmediateDriver extends SqliteDriver {
  override async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("BEGIN IMMEDIATE"));
  }
}

function adapter(database: Database.Database, writable: boolean): Kysely<Record<string, never>> {
  return new Kysely({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () =>
        writable ? new ImmediateDriver({ database }) : new SqliteDriver({ database }),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  });
}

async function checkFile(filename: string, create: boolean): Promise<void> {
  let created = false;
  if (create) {
    try {
      const handle = await open(
        filename,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
        0o600,
      );
      await handle.close();
      created = true;
    } catch (error) {
      if (
        !(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
      )
        throw error;
    }
  }
  const stat = await lstat(filename).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new StorageError("SCHEMA_MISMATCH");
    }
    throw error;
  });
  if (!stat.isFile() || stat.isSymbolicLink()) throw new StorageError("SCHEMA_MISMATCH");
  if (created) {
    const marker = new Database(filename, { fileMustExist: true, timeout: 0 });
    try {
      marker.pragma("journal_mode = DELETE");
      marker.pragma(`application_id = ${APPLICATION_ID}`);
    } finally {
      marker.close();
    }
  }
  const handle = await open(filename, "r");
  try {
    const header = Buffer.alloc(100);
    const { bytesRead } = await handle.read(header, 0, 100, 0);
    if (
      bytesRead !== 100 ||
      header.subarray(0, 16).toString("binary") !== "SQLite format 3\u0000" ||
      header.readUInt32BE(68) !== APPLICATION_ID
    )
      throw new StorageError("SCHEMA_MISMATCH");
  } finally {
    await handle.close();
  }
}

async function knownFile(filename: string, create: boolean): Promise<void> {
  const key = process.platform === "win32" ? filename.toLowerCase() : filename;
  if (initializing.has(key)) throw new StorageError("BUSY");
  if (!create) return checkFile(filename, false);
  initializing.add(key);
  try {
    await checkFile(filename, true);
  } finally {
    initializing.delete(key);
  }
}

export function sqliteBackend(config: SqliteStorageConfig): Backend {
  if (
    !config ||
    typeof config.filename !== "string" ||
    !isAbsolute(config.filename) ||
    config.filename.startsWith("\\\\") ||
    config.filename.includes("\u0000") ||
    config.filename.endsWith(":memory:")
  )
    throw new StorageError("INVALID_INPUT");
  const filename = resolve(config.filename);
  const namespace = win32.normalize(config.filename);
  if (
    filename.startsWith("\\\\") ||
    namespace.startsWith("\\\\") ||
    namespace.startsWith("\\??\\")
  ) {
    throw new StorageError("INVALID_INPUT");
  }
  const resources: Kysely<Record<string, never>>[] = [];
  let writer: { database: Database.Database; db: Kysely<Record<string, never>> } | undefined;
  let reader: { database: Database.Database; db: Kysely<Record<string, never>> } | undefined;
  let closed = false;
  let lease: Promise<() => void> | undefined;

  return {
    async acquire(readOnly, migrating) {
      if (closed) throw new StorageError("CLOSED");
      if (config.readonly && !readOnly) throw new StorageError("STORAGE_FAILURE");
      if (!lease)
        lease = acquireDatabaseLease(filename, () => knownFile(filename, migrating)).catch(
          (error) => {
            lease = undefined;
            throw error;
          },
        );
      else await knownFile(filename, migrating);
      await lease;
      let resource = readOnly ? reader : writer;
      if (!resource) {
        const database = new Database(filename, {
          readonly: readOnly,
          fileMustExist: true,
          timeout: 5000,
        });
        database.defaultSafeIntegers(true);
        const db = adapter(database, !readOnly);
        resource = { database, db };
        resources.push(db);
        if (readOnly) reader = resource;
        else writer = resource;
      }
      const { database, db } = resource;
      let transaction:
        | Awaited<ReturnType<ReturnType<typeof db.startTransaction>["execute"]>>
        | undefined;
      const connection: Connection = {
        async query(text: string, parameters: Parameters = []): Promise<readonly Row[]> {
          const result = await (transaction ?? db).executeQuery<Row>(
            CompiledQuery.raw(text, [...parameters]),
          );
          return result.rows;
        },
        async script(text) {
          database.exec(text);
        },
        async begin() {
          transaction = await db.startTransaction().execute();
        },
        async commit() {
          if (transaction) {
            if (!readOnly && !migrating) await advanceWriteSequence(connection);
            await transaction.commit().execute();
            transaction = undefined;
          }
        },
        async rollback() {
          if (transaction) {
            await transaction.rollback().execute();
            transaction = undefined;
          }
        },
        async release(destroy = false) {
          if (destroy) {
            await db.destroy();
            if (readOnly) reader = undefined;
            else writer = undefined;
          }
        },
      };
      await assertReconciledImport(connection);
      if (!readOnly) {
        // Validate existing targets before any writable PRAGMA.
        await inspectSchema(connection, migrating);
        database.pragma("journal_mode = WAL");
      } else {
        database.pragma("query_only = ON");
      }
      database.pragma("synchronous = NORMAL");
      database.pragma("foreign_keys = ON");
      return connection;
    },
    async close() {
      if (closed) return;
      closed = true;
      const results = await Promise.allSettled(resources.map((resource) => resource.destroy()));
      if (results.some((result) => result.status === "rejected"))
        throw new StorageError("STORAGE_FAILURE");
      if (lease) (await lease)();
    },
  };
}

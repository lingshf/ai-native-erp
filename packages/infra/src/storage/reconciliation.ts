import { lstatSync } from "node:fs";
import { isAbsolute, win32 } from "node:path";
import Database from "better-sqlite3";
import { StorageError } from "@erp/core/application";
import { migrationStatusSchema, type MigrationStatus } from "@erp/core/contracts";
import { APPLICATION_ID } from "./application-id.ts";
export type ReconciliationConnection = Database.Database;

export function openReconciliationTarget(target: string, readonly = true): Database.Database {
  if (
    !isAbsolute(target) ||
    win32.normalize(target).startsWith("\\\\") ||
    win32.normalize(target).startsWith("\\??\\") ||
    target.includes("\0")
  )
    throw new StorageError("INVALID_INPUT");
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new StorageError("CONFLICT");
  const db = new Database(target, { readonly, fileMustExist: true });
  db.defaultSafeIntegers(true);
  db.pragma("temp_store=FILE");
  if (Number(db.pragma("application_id", { simple: true })) !== APPLICATION_ID) {
    db.close();
    throw new StorageError("SCHEMA_MISMATCH");
  }
  return db;
}

export function readMigrationStatus(target: string): MigrationStatus {
  const db = openReconciliationTarget(target);
  try {
    db.exec("PRAGMA query_only=ON; BEGIN");
    if (
      !db
        .prepare("SELECT 1 FROM sqlite_schema WHERE name='legacy_import_runs' AND type='table'")
        .get()
    )
      return { run: null };
    const hasReports = Boolean(
      db
        .prepare("SELECT 1 FROM sqlite_schema WHERE name='legacy_reconciliations' AND type='table'")
        .get(),
    );
    const run = db
      .prepare(`SELECT r.id,r.status,r.created_at createdAt,
      ${
        hasReports
          ? "c.baseline,c.report_sha reportSha256,c.confirmation_sha confirmationSha256,c.report"
          : "NULL baseline,NULL reportSha256,NULL confirmationSha256,NULL report"
      }
      FROM legacy_import_runs r ${hasReports ? "LEFT JOIN legacy_reconciliations c ON c.run_id=r.id" : ""}
      ORDER BY r.created_at DESC,r.id DESC LIMIT 1`)
      .get() as
      | {
          id: string;
          status: string;
          createdAt: string;
          baseline: bigint | null;
          reportSha256: string | null;
          confirmationSha256: string | null;
          report: string | null;
        }
      | undefined;
    return migrationStatusSchema.parse({
      run: run
        ? {
            ...run,
            baseline: run.baseline === null ? null : String(run.baseline),
            report: run.report === null ? null : JSON.parse(run.report),
          }
        : null,
    });
  } finally {
    db.close();
  }
}

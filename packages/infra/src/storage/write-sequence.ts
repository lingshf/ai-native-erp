import { StorageError } from "@erp/core/application";
import type { Connection } from "./types.ts";

export async function advanceWriteSequence(db: Pick<Connection, "query">): Promise<void> {
  const rows = await db.query("UPDATE write_seq SET value=value+1 WHERE id=1 RETURNING value");
  if (rows.length !== 1) throw new StorageError("STORAGE_FAILURE");
}

export async function assertReconciledImport(db: Pick<Connection, "query">): Promise<void> {
  const tables = await db.query(
    "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='legacy_import_runs'",
  );
  if (
    tables.length &&
    (await db.query("SELECT 1 FROM legacy_import_runs WHERE status<>'reconciled' LIMIT 1")).length
  )
    throw new StorageError("CONFLICT");
}

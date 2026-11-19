import { targetStorage } from "./core.ts";
import { sqliteBackend } from "./sqlite.ts";
import type { SqliteStorageConfig, TargetStorage } from "./types.ts";

export type { SqliteStorageConfig, TargetStorage } from "./types.ts";
export { backupSqlite, restoreSqlite } from "./backup.ts";

export function createSqliteStorage(config: SqliteStorageConfig): TargetStorage {
  return targetStorage(sqliteBackend(config));
}

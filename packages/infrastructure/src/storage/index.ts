import { targetStorage } from './core.js';
import { sqliteBackend } from './sqlite.js';
import type { SqliteStorageConfig, TargetStorage } from './types.js';

export type { SqliteStorageConfig, TargetStorage } from './types.js';

export function createSqliteStorage(config: SqliteStorageConfig): TargetStorage {
  return targetStorage(sqliteBackend(config));
}

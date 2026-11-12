import { targetStorage } from './core.js';
import { postgresBackend } from './postgres.js';
import { sqliteBackend } from './sqlite.js';
import type { PostgresStorageConfig, SqliteStorageConfig, TargetStorage } from './types.js';

export type { PostgresStorageConfig, SqliteStorageConfig, TargetStorage } from './types.js';

export function createSqliteStorage(config: SqliteStorageConfig): TargetStorage {
  return targetStorage(sqliteBackend(config));
}

export function createPostgresStorage(config: PostgresStorageConfig): TargetStorage {
  return targetStorage(postgresBackend(config));
}

import { createHash } from 'node:crypto';
import { StorageError } from '@erp/core/application';
import type { Connection, Row } from './types.ts';

function stable(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return { bigint: value.toString() };
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(Reflect.get(value, key))]));
  }
  throw new StorageError('SCHEMA_MISMATCH');
}

function ordered(rows: readonly Row[]): readonly string[] {
  return rows.map((row) => JSON.stringify(stable(row))).sort();
}

export async function schemaFingerprint(connection: Connection): Promise<string> {
  const groups = {
    definitions: ordered(await connection.query(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
    )),
  };
  return createHash('sha256').update(JSON.stringify(stable(groups)), 'utf8').digest('hex');
}

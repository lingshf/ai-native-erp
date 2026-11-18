import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { StorageError } from '@erp/application';
import type { Connection } from './types.js';
import { schemaFingerprint } from './schema.js';

const tables = ['audit', 'books', 'companies', 'receipts', 'schema_migrations', 'tenants'];
const triggers = ['audit_no_delete', 'audit_no_update', 'receipts_no_delete', 'receipts_no_update'];

export function normalizeMigration(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n');
  if (normalized.includes('\r') || normalized.includes('\uFEFF')) throw new StorageError('SCHEMA_MISMATCH');
  return normalized;
}

async function migration(): Promise<{ sql: string; checksum: string }> {
  let sql: string;
  try {
    const bytes = await readFile(new URL('../../migrations/sqlite/001-storage.sql', import.meta.url));
    sql = normalizeMigration(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch { throw new StorageError('SCHEMA_MISMATCH'); }
  return { sql, checksum: createHash('sha256').update(sql, 'utf8').digest('hex') };
}

function same(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export async function inspectSchema(connection: Connection, allowEmpty: boolean): Promise<boolean> {
  const rows = await connection.query("SELECT name,type FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'");
  const names = rows.map((row) => `${row.type}:${row.name}`);
  if (names.length === 0 && allowEmpty) return false;
  if (!same(names, [...tables.map((name) => `table:${name}`), ...triggers.map((name) => `trigger:${name}`)])) {
    throw new StorageError('SCHEMA_MISMATCH');
  }
  const versions = await connection.query('SELECT * FROM schema_migrations');
  const { checksum } = await migration();
  if (versions.length !== 1 || (versions[0].version !== 1n && versions[0].version !== 1) ||
    versions[0].dialect !== 'sqlite' || versions[0].checksum !== checksum ||
    versions[0].schema_fingerprint !== await schemaFingerprint(connection)) throw new StorageError('SCHEMA_MISMATCH');
  return true;
}

export async function migrateConnection(connection: Connection): Promise<void> {
  if (await inspectSchema(connection, true)) return;
  const current = await migration();
  await connection.script(current.sql);
  const fingerprint = await schemaFingerprint(connection);
  await connection.query('INSERT INTO schema_migrations(version,dialect,checksum,schema_fingerprint) VALUES(?,?,?,?)',
    [1, 'sqlite', current.checksum, fingerprint]);
  await inspectSchema(connection, false);
}

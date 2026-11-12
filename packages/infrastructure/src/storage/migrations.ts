import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { StorageError } from '@erp/application';
import type { Backend, Connection } from './types.js';
import { schemaFingerprint } from './schema.js';

const tables = ['audit', 'books', 'companies', 'receipts', 'schema_migrations', 'tenants'];
const sqliteTriggers = ['audit_no_delete', 'audit_no_update', 'receipts_no_delete', 'receipts_no_update'];
const postgresTriggers = [...sqliteTriggers, 'audit_no_truncate', 'receipts_no_truncate'];

export function normalizeMigration(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n');
  if (normalized.includes('\r') || normalized.includes('\uFEFF')) throw new StorageError('SCHEMA_MISMATCH');
  return normalized;
}

async function migration(dialect: Backend['dialect']): Promise<{ sql: string; checksum: string }> {
  let sql: string;
  try {
    const bytes = await readFile(new URL(`../../migrations/${dialect}/001-storage.sql`, import.meta.url));
    sql = normalizeMigration(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch { throw new StorageError('SCHEMA_MISMATCH'); }
  return { sql, checksum: createHash('sha256').update(sql, 'utf8').digest('hex') };
}

function same(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

async function objects(connection: Connection, dialect: Backend['dialect']): Promise<string[]> {
  if (dialect === 'sqlite') {
    const rows = await connection.query("SELECT name,type FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'");
    return rows.map((row) => `${row.type}:${row.name}`);
  }
  const schemas = await connection.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'");
  if (!same(schemas.map((row) => String(row.nspname)), ['public'])) throw new StorageError('SCHEMA_MISMATCH');
  const extensions = await connection.query("SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'");
  if (extensions.length) throw new StorageError('SCHEMA_MISMATCH');
  const unexpected = await connection.query(`SELECT 'collation' AS kind FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'conversion' FROM pg_conversion c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
    UNION ALL SELECT 'operator' FROM pg_operator c JOIN pg_namespace n ON n.oid=c.oprnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'operator class' FROM pg_opclass c JOIN pg_namespace n ON n.oid=c.opcnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'operator family' FROM pg_opfamily c JOIN pg_namespace n ON n.oid=c.opfnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'text configuration' FROM pg_ts_config c JOIN pg_namespace n ON n.oid=c.cfgnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'text dictionary' FROM pg_ts_dict c JOIN pg_namespace n ON n.oid=c.dictnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'text parser' FROM pg_ts_parser c JOIN pg_namespace n ON n.oid=c.prsnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'text template' FROM pg_ts_template c JOIN pg_namespace n ON n.oid=c.tmplnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'statistics' FROM pg_statistic_ext c JOIN pg_namespace n ON n.oid=c.stxnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'event trigger' FROM pg_event_trigger
    UNION ALL SELECT 'publication' FROM pg_publication`);
  if (unexpected.length) throw new StorageError('SCHEMA_MISMATCH');
  const classes = await connection.query("SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
  const triggers = await connection.query("SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal");
  const functions = await connection.query("SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'");
  const types = await connection.query("SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typrelid=0 AND t.typelem=0");
  return [
    ...classes.map((row) => `${row.relkind}:${row.relname}`),
    ...triggers.map((row) => `trigger:${row.tgname}`),
    ...functions.map((row) => `function:${row.proname}(${row.arguments})`),
    ...types.map((row) => `type:${row.typname}`),
  ];
}

function expectedObjects(dialect: Backend['dialect']): string[] {
  if (dialect === 'sqlite') return [...tables.map((name) => `table:${name}`), ...sqliteTriggers.map((name) => `trigger:${name}`)];
  return [...tables.map((name) => `r:${name}`), ...tables.map((name) => `i:${name}_pkey`),
    ...postgresTriggers.map((name) => `trigger:${name}`), 'function:reject_evidence_change()'];
}

export async function inspectSchema(connection: Connection, dialect: Backend['dialect'], allowEmpty: boolean): Promise<boolean> {
  const names = await objects(connection, dialect);
  if (names.length === 0 && allowEmpty) return false;
  if (!same(names, expectedObjects(dialect))) throw new StorageError('SCHEMA_MISMATCH');
  const rows = await connection.query(`SELECT * FROM ${dialect === 'postgres' ? 'public.' : ''}schema_migrations`);
  const { checksum } = await migration(dialect);
  if (rows.length !== 1 || (rows[0].version !== 1n && rows[0].version !== 1) ||
    rows[0].dialect !== dialect || rows[0].checksum !== checksum ||
    rows[0].schema_fingerprint !== await schemaFingerprint(connection, dialect)) throw new StorageError('SCHEMA_MISMATCH');
  return true;
}

export async function migrateConnection(connection: Connection, dialect: Backend['dialect']): Promise<void> {
  const installed = await inspectSchema(connection, dialect, true);
  if (installed) return;
  const current = await migration(dialect);
  await connection.script(current.sql);
  const fingerprint = await schemaFingerprint(connection, dialect);
  await connection.query(`INSERT INTO ${dialect === 'postgres' ? 'public.' : ''}schema_migrations(version,dialect,checksum,schema_fingerprint) VALUES(?,?,?,?)`,
    [1, dialect, current.checksum, fingerprint]);
  await inspectSchema(connection, dialect, false);
}

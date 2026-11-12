import { createHash } from 'node:crypto';
import { StorageError } from '@erp/application';
import type { Backend, Connection, Row } from './types.js';

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

export async function schemaFingerprint(connection: Connection, dialect: Backend['dialect']): Promise<string> {
  const groups: Record<string, readonly string[]> = {};
  if (dialect === 'sqlite') {
    groups.definitions = ordered(await connection.query(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
    ));
  } else {
    groups.relations = ordered(await connection.query(`SELECT c.relname,c.relkind,c.relpersistence,
      c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.relispartition,c.reloptions,
      am.amname AS access_method
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_catalog.pg_am am ON am.oid=c.relam WHERE n.nspname='public'`));
    groups.columns = ordered(await connection.query(`SELECT c.relname,a.attnum,a.attname,
      pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,
      a.attisdropped,a.attstorage,a.attcompression,a.attoptions,
      cn.nspname AS collation_schema,co.collname AS collation,
      pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) AS default_expression
      FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
      LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
      WHERE n.nspname='public' AND a.attnum>0`));
    groups.constraints = ordered(await connection.query(`SELECT r.relname,c.conname,c.contype,
      c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,
      pg_catalog.to_jsonb(c)->>'conenforced' AS enforced,
      pg_catalog.pg_get_constraintdef(c.oid,false) AS definition
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public'`));
    groups.indexes = ordered(await connection.query(`SELECT c.relname,i.indisunique,i.indisprimary,
      i.indimmediate,i.indisvalid,i.indisready,i.indislive,i.indisreplident,i.indnullsnotdistinct,
      pg_catalog.pg_get_indexdef(c.oid,0,false) AS definition
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`));
    groups.triggers = ordered(await connection.query(`SELECT c.relname,t.tgisinternal,t.tgtype,t.tgenabled,
      t.tgdeferrable,t.tginitdeferred,t.tgattr::text AS columns,
      pg_catalog.encode(t.tgargs,'hex') AS arguments,
      CASE WHEN t.tgisinternal THEN NULL ELSE t.tgname END AS name,
      CASE WHEN t.tgisinternal THEN NULL ELSE pg_catalog.pg_get_triggerdef(t.oid,false) END AS definition,
      con.conname AS constraint_name,fn.nspname AS function_schema,p.proname AS function_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS function_arguments
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      JOIN pg_catalog.pg_namespace fn ON fn.oid=p.pronamespace
      LEFT JOIN pg_catalog.pg_constraint con ON con.oid=t.tgconstraint WHERE n.nspname='public'`));
    groups.functions = ordered(await connection.query(`SELECT p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_catalog.format_type(p.prorettype,NULL) AS result_type,l.lanname,p.prosrc,p.probin,
      p.prokind,p.provolatile,p.proisstrict,p.prosecdef,p.proleakproof,p.proparallel,p.proconfig
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='public'`));
    groups.rules = ordered(await connection.query(`SELECT c.relname,r.rulename,r.ev_enabled,
      pg_catalog.pg_get_ruledef(r.oid,false) AS definition
      FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`));
    groups.policies = ordered(await connection.query(`SELECT c.relname,p.polname,p.polcmd,p.polpermissive,
      ARRAY(SELECT role_name FROM (
        SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_id)::text END AS role_name
        FROM pg_catalog.unnest(p.polroles) AS role_ids(role_id)
      ) AS names ORDER BY role_name COLLATE "C") AS roles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) AS using_expression,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false) AS check_expression
      FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`));
    groups.inheritance = ordered(await connection.query(`SELECT c.relname,p.relname AS parent,pn.nspname AS parent_schema,i.inhseqno
      FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class c ON c.oid=i.inhrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_class p ON p.oid=i.inhparent
      JOIN pg_catalog.pg_namespace pn ON pn.oid=p.relnamespace WHERE n.nspname='public'`));
  }
  return createHash('sha256').update(JSON.stringify(stable(groups)), 'utf8').digest('hex');
}

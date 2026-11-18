import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { StorageError } from "@erp/core/application";
import type { Connection } from "./types.ts";
import { schemaFingerprint } from "./schema.ts";

const baseNames = [
  ...["audit", "books", "companies", "receipts", "schema_migrations", "tenants"].map(
    (name) => `table:${name}`,
  ),
  ...["audit_no_delete", "audit_no_update", "receipts_no_delete", "receipts_no_update"].map(
    (name) => `trigger:${name}`,
  ),
];
const masterNames = [
  ...["ledger_companies", "accounts", "periods", "config_history"].map((name) => `table:${name}`),
  "index:config_history_at",
  "trigger:config_history_no_update",
  "trigger:config_history_no_delete",
];
const dimensionNames = [
  ...[
    "dimensions",
    "dimension_values",
    "dimension_defaults",
    "dimension_derivations",
    "dimension_structures",
    "dimension_balances",
    "dimension_history",
  ].map((name) => `table:${name}`),
  "trigger:dimension_history_no_update",
  "trigger:dimension_history_no_delete",
];
const filenames = ["001-storage.sql", "002-master-data.sql", "003-dimensions.sql"];

export function normalizeMigration(text: string): string {
  const normalized = text.replaceAll("\r\n", "\n");
  if (normalized.includes("\r") || normalized.includes("\uFEFF"))
    throw new StorageError("SCHEMA_MISMATCH");
  return normalized;
}

async function migration(filename: string): Promise<{ sql: string; checksum: string }> {
  let sql: string;
  try {
    const bytes = await readFile(new URL(`../../migrations/sqlite/${filename}`, import.meta.url));
    sql = normalizeMigration(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    );
  } catch {
    throw new StorageError("SCHEMA_MISMATCH");
  }
  return { sql, checksum: createHash("sha256").update(sql, "utf8").digest("hex") };
}

function same(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export async function inspectSchema(
  connection: Connection,
  allowOutdated: boolean,
): Promise<number> {
  const rows = await connection.query(
    "SELECT name,type FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
  );
  const names = rows.map((row) => `${row.type}:${row.name}`);
  if (names.length === 0 && allowOutdated) return 0;
  if (!names.includes("table:schema_migrations")) {
    throw new StorageError("SCHEMA_MISMATCH");
  }
  const versions = await connection.query("SELECT * FROM schema_migrations ORDER BY version");
  const latest = versions.length;
  if (
    latest < 1 ||
    latest > filenames.length ||
    (!allowOutdated && latest !== filenames.length) ||
    !same(names, [
      ...baseNames,
      ...(latest >= 2 ? masterNames : []),
      ...(latest >= 3 ? dimensionNames : []),
    ])
  )
    throw new StorageError("SCHEMA_MISMATCH");
  for (const [index, version] of versions.entries()) {
    const { checksum } = await migration(filenames[index]);
    if (
      (version.version !== index + 1 && version.version !== BigInt(index + 1)) ||
      version.dialect !== "sqlite" ||
      version.checksum !== checksum
    )
      throw new StorageError("SCHEMA_MISMATCH");
  }
  if (versions[latest - 1].schema_fingerprint !== (await schemaFingerprint(connection)))
    throw new StorageError("SCHEMA_MISMATCH");
  return latest;
}

export async function migrateConnection(connection: Connection): Promise<void> {
  const applied = await inspectSchema(connection, true);
  for (let index = applied; index < filenames.length; index++) {
    const current = await migration(filenames[index]);
    await connection.script(current.sql);
    const fingerprint = await schemaFingerprint(connection);
    await connection.query(
      "INSERT INTO schema_migrations(version,dialect,checksum,schema_fingerprint) VALUES(?,?,?,?)",
      [index + 1, "sqlite", current.checksum, fingerprint],
    );
  }
  await inspectSchema(connection, false);
}

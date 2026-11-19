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
const journalNames = [
  ...[
    "journal_drafts",
    "journal_entries",
    "journal_lines",
    "journal_seals",
    "journal_corrections",
  ].map((name) => `table:${name}`),
  ...[
    "receipts_idempotency",
    "receipts_source",
    "receipts_journal_company",
    "journal_lines_period_account",
    "journal_entries_page",
    "journal_entries_recent",
  ].map((name) => `index:${name}`),
  "view:audit_log",
  "trigger:journal_seal_balance",
  "trigger:journal_lines_sealed",
  ...["journal_entries", "journal_lines", "journal_seals", "journal_corrections"].flatMap(
    (name) => [`trigger:${name}_no_update`, `trigger:${name}_no_delete`],
  ),
];
const businessNames = [
  ...[
    "business_services",
    "business_parties",
    "posting_rules",
    "business_config_history",
    "business_events",
    "business_event_journals",
    "statistics_facts",
    "business_clearing_links",
    "transfer_queue",
  ].map((name) => `table:${name}`),
  ...["business_event_cancel", "journal_lines_open_items", "transfer_queue_status_created"].map(
    (name) => `index:${name}`,
  ),
  ...["transfer_queue_source", "transfer_queue_transition", "transfer_queue_no_delete"].map(
    (name) => `trigger:${name}`,
  ),
  ...[
    "business_config_history",
    "business_events",
    "business_event_journals",
    "statistics_facts",
    "business_clearing_links",
  ].flatMap((name) => [`trigger:${name}_no_update`, `trigger:${name}_no_delete`]),
];
const filenames = [
  "001-storage.sql",
  "002-master-data.sql",
  "003-dimensions.sql",
  "004-journals.sql",
  "005-business-events.sql",
  "006-reports.sql",
  "007-period-close.sql",
  "008-journal-dates.sql",
  "009-trade-master.sql",
  "010-trade-documents.sql",
];

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
  connection: Pick<Connection, "query">,
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
      ...(latest >= 4 ? journalNames : []),
      ...(latest >= 5 ? businessNames : []),
      ...(latest >= 6
        ? [
            "index:journal_lines_ledger_account",
            "index:journal_entries_ledger_date",
            "index:journal_lines_report_totals",
          ]
        : []),
      ...(latest >= 7
        ? [
            "table:period_closes",
            "table:period_closing_journals",
            "trigger:period_closes_no_update",
            "trigger:period_closes_no_delete",
            "trigger:period_closing_journals_no_update",
            "trigger:period_closing_journals_no_delete",
            "trigger:period_closing_journals_source",
            "trigger:period_close_seal",
          ]
        : []),
      ...(latest >= 8 ? ["trigger:journal_entries_dates"] : []),
      ...(latest >= 9
        ? [
            ...[
              "trade_terms",
              "trade_profiles",
              "trade_tax_codes",
              "trade_parties",
              "trade_products",
              "trade_config_history",
            ].map((name) => `table:${name}`),
            ...[
              "trade_terms_name",
              "trade_profiles_name",
              "trade_tax_codes_name",
              "trade_parties_name",
              "trade_products_name",
              "trade_config_history_at",
            ].map((name) => `index:${name}`),
            "trigger:trade_config_history_no_update",
            "trigger:trade_config_history_no_delete",
          ]
        : []),
      ...(latest >= 10
        ? [
            ...[
              "trade_orders",
              "trade_order_lines",
              "trade_documents",
              "trade_document_lines",
              "open_items",
              "settlements",
            ].map((name) => `table:${name}`),
            ...[
              "trade_documents_external",
              "trade_documents_company",
              "trade_document_lines_order",
              "open_items_party_due",
              "settlements_item",
            ].map((name) => `index:${name}`),
            "trigger:open_items_no_delete",
            "trigger:open_items_balance_only",
            ...[
              "trade_orders",
              "trade_order_lines",
              "trade_documents",
              "trade_document_lines",
              "settlements",
            ].flatMap((name) => [`trigger:${name}_no_update`, `trigger:${name}_no_delete`]),
          ]
        : []),
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

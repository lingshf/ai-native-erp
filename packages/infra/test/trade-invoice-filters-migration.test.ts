// TINV-05: migration 018 adds exactly one index, trade_documents_party, and nothing else. The
// populated 017 → 018 upgrade (posted invoices, lines and open items) is in
// application/trade-documents.test.ts, which has the posting fixture.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, test } from "vitest";
import { createSqliteStorage } from "../src/storage/index.ts";
import { sqliteBackend } from "../src/storage/sqlite.ts";
import { latestMigrationVersion, migrateConnection } from "../src/storage/migrations.ts";
import { ledgerAt017, ledgerAt018 } from "./support/trade-invoice-list-fixture.ts";

const definition =
  "CREATE INDEX trade_documents_party ON trade_documents(company_id, party_id, sequence)";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-tinv05-migration-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const schemaObjects = (filename: string) => {
  const db = new Database(filename, { readonly: true });
  try {
    return db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type,name",
      )
      .all() as { type: string; name: string; tbl_name: string; sql: string | null }[];
  } finally {
    db.close();
  }
};
const versions = (filename: string) => {
  const db = new Database(filename, { readonly: true });
  try {
    return db.prepare("SELECT * FROM schema_migrations ORDER BY version").all();
  } finally {
    db.close();
  }
};
async function migrate(filename: string) {
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
    await storage.verifySchema();
  } finally {
    await storage.close();
  }
}

test("018 is one comment line and one CREATE INDEX; a new ledger adds only that index to 017", async () => {
  const sql = await readFile(
    new URL("../migrations/sqlite/018-trade-invoice-filters.sql", import.meta.url),
    "utf8",
  );
  const lines = sql.split("\n").filter((line) => line.trim());
  assert.equal(lines.length, 2);
  assert.equal(lines.filter((line) => line.startsWith("--")).length, 1);
  assert.deepEqual(
    lines.filter((line) => !line.startsWith("--")),
    [`${definition};`],
  );
  assert.ok(latestMigrationVersion >= 18);

  // TORD-06: 019 follows; the 018 state is reached by stopping before 019 (D307).
  const fresh = join(directory, "fresh.sqlite"),
    old = join(directory, "017.sqlite");
  await ledgerAt018(fresh);
  await ledgerAt017(old);
  const before = schemaObjects(old);
  assert.deepEqual(
    schemaObjects(fresh).filter((object) => !before.some((item) => item.name === object.name)),
    [
      {
        type: "index",
        name: "trade_documents_party",
        tbl_name: "trade_documents",
        sql: definition,
      },
    ],
  );
  // Nothing else changes: every 017 object keeps its exact definition.
  assert.deepEqual(
    schemaObjects(fresh).filter((object) => object.name !== "trade_documents_party"),
    before,
  );
  const db = new Database(fresh, { readonly: true });
  try {
    assert.equal(
      db.prepare("SELECT max(version) AS version FROM schema_migrations").get()?.version,
      18,
    );
  } finally {
    db.close();
  }
});

test("an empty 017 ledger upgrades to 018 keeping its 017 version rows", async () => {
  const filename = join(directory, "upgrade.sqlite");
  await ledgerAt017(filename);
  const before = versions(filename);
  assert.equal(before.length, 17);
  await ledgerAt018(filename);
  const after = versions(filename);
  assert.equal(after.length, 18);
  assert.deepEqual(after.slice(0, 17), before);
  assert.equal(
    schemaObjects(filename).find((object) => object.name === "trade_documents_party")?.sql,
    definition,
  );
});

test("reopening a fully migrated ledger runs no migration script and keeps its version rows", async () => {
  const filename = join(directory, "reopen.sqlite");
  await migrate(filename);
  const before = versions(filename);
  const backend = sqliteBackend({ filename });
  const db = await backend.acquire(false, true);
  let scripts = 0;
  try {
    await db.begin();
    await migrateConnection({
      ...db,
      async script(sql) {
        scripts++;
        await db.script(sql);
      },
    });
    await db.commit();
  } finally {
    await db.release();
    await backend.close();
  }
  assert.equal(scripts, 0);
  await migrate(filename);
  assert.deepEqual(versions(filename), before);
});

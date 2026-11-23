// TORD-06: migration 019 adds trade_order_invoicing (one stored invoicing status per order), its
// status index and three triggers, and nothing else. The populated 018 → 019 backfill (posted and
// cancelled invoices) is in application/trade-documents.test.ts, which has the posting fixture.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, test } from "vitest";
import { createSqliteStorage } from "../src/storage/index.ts";
import { latestMigrationVersion } from "../src/storage/migrations.ts";
import { ledgerAt018 } from "./support/trade-invoice-list-fixture.ts";

const added = [
  "index:trade_order_invoicing_status",
  "table:trade_order_invoicing",
  "trigger:trade_order_invoicing_no_delete",
  "trigger:trade_order_invoicing_status_only",
  "trigger:trade_orders_invoicing_seed",
];
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-tord06-migration-"));
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

test("019 adds only trade_order_invoicing, its status index and three triggers to an 018 ledger", async () => {
  assert.equal(latestMigrationVersion, 19);
  const fresh = join(directory, "fresh.sqlite"),
    old = join(directory, "018.sqlite");
  await migrate(fresh);
  await ledgerAt018(old);
  const before = schemaObjects(old);
  const after = schemaObjects(fresh);
  assert.deepEqual(
    after
      .filter((object) => !before.some((item) => item.name === object.name))
      .map((object) => `${object.type}:${object.name}`),
    added,
  );
  // Every 018 object keeps its exact definition.
  assert.deepEqual(
    after.filter((object) => before.some((item) => item.name === object.name)),
    before,
  );
  assert.match(
    after.find((object) => object.name === "trade_order_invoicing_status")?.sql ?? "",
    /ON trade_order_invoicing\(company_id,status,order_id\)$/u,
  );
});

test("an 018 ledger is refused until migrated, then upgrades to 019 keeping its 018 version rows", async () => {
  const filename = join(directory, "upgrade.sqlite");
  await ledgerAt018(filename);
  const before = versions(filename);
  assert.equal(before.length, 18);
  const storage = createSqliteStorage({ filename });
  try {
    await assert.rejects(storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
  } finally {
    await storage.close();
  }
  await migrate(filename);
  const after = versions(filename);
  assert.equal(after.length, 19);
  assert.deepEqual(after.slice(0, 18), before);
  const db = new Database(filename, { readonly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) FROM trade_order_invoicing").pluck().get(), 0);
  } finally {
    db.close();
  }
});

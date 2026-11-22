// TORD-05: migration 017 adds exactly one index, trade_orders_party, and never touches order rows.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, test } from "vitest";
import { createSqliteStorage } from "../src/storage/index.ts";
import { sqliteBackend } from "../src/storage/sqlite.ts";
import { inspectSchema, migrateConnection } from "../src/storage/migrations.ts";
import type { Row } from "../src/storage/types.ts";

const definition =
  "CREATE INDEX trade_orders_party ON trade_orders(company_id, party_id, order_id)";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-tord05-migration-"));
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
const orderRows = (db: Database.Database) => ({
  orders: db.prepare("SELECT * FROM trade_orders ORDER BY company_id,order_id").all(),
  lines: db.prepare("SELECT * FROM trade_order_lines ORDER BY company_id,order_id,line_id").all(),
});

/** Runs the real migrations and stops just before 017, optionally seeding orders at 016. */
async function ledgerAt016(filename: string, seed: boolean): Promise<readonly Row[]> {
  const backend = sqliteBackend({ filename });
  const db = await backend.acquire(false, true),
    stop = Error("stop before 017");
  try {
    await db.begin();
    await assert.rejects(
      migrateConnection({
        ...db,
        async script(sql) {
          if (sql.includes("trade_orders_party")) throw stop;
          await db.script(sql);
        },
      }),
      (error) => error === stop,
    );
    const versions = await db.query("SELECT * FROM schema_migrations ORDER BY version");
    assert.equal(versions.length, 16);
    if (seed) {
      await db.script(`INSERT INTO tenants(tenant_id) VALUES('LOCAL');
      INSERT INTO books(tenant_id,book_id) VALUES('LOCAL','LOCAL');
      INSERT INTO companies(tenant_id,book_id,company_id) VALUES('LOCAL','LOCAL','F');
      INSERT INTO ledger_companies(company_id,name,currency,scale,year,close_mode,revision) VALUES('F','Fictional','CNY',2,2026,'annual',1);
      INSERT INTO accounts VALUES('F','2100','Payables','LIABILITY','payables','CREDIT','control','AP',NULL,0,1,0,1);
      INSERT INTO accounts VALUES('F','1000','Cash','ASSET','cash','DEBIT','general',NULL,NULL,1,1,0,1);
      INSERT INTO accounts VALUES('F','5000','Expense','EXPENSE','operatingExpense','DEBIT','general',NULL,NULL,1,1,0,1);
      INSERT INTO trade_terms VALUES('F','N30','Net 30',1,1,'2026-01-01','2026-12-31',30,0,'0',0);
      INSERT INTO trade_profiles VALUES('F','APP','AP profile',1,1,'2026-01-01','2026-12-31','AP','2100','1000','1000','5000');
      INSERT INTO trade_tax_codes VALUES('F','EX','Exempt',1,1,'2026-01-01','2026-12-31','exempt','[]','0',NULL,NULL);
      INSERT INTO trade_products VALUES('F','RENT','Rent',1,1,'2026-01-01','2026-12-31','expense','5000',NULL,'["EX"]','{}');`);
      for (const party of ["V1", "V2"])
        await db.query(
          "INSERT INTO trade_parties VALUES('F',?,?,1,1,'2026-01-01','2026-12-31','vendor','APP',NULL,'N30','[\"EX\"]','{}')",
          [party, `Vendor ${party}`],
        );
      for (const [party, n] of [
        ["V1", 1],
        ["V2", 2],
        ["V1", 3],
      ] as const) {
        await db.query(
          `INSERT INTO trade_orders VALUES('F',?,'AP',?,'CNY',?,0,'line',?,'2026-01-0${n}T08:00:00.000Z')`,
          [`PO-${n}`, party, `2026-0${n}-15`, String(n).repeat(64)],
        );
        for (let line = 1; line <= n; line++)
          await db.query(
            "INSERT INTO trade_order_lines VALUES('F',?,?,?,'RENT','EX','1','1.00','0','0',?,0,?)",
            [`PO-${n}`, `L${line}`, line, 100 * line, 100 * line],
          );
      }
      const [count] = await db.query("SELECT count(*) AS n FROM trade_orders");
      assert.equal(Number(count?.n), 3);
    }
    await db.commit();
    return versions;
  } finally {
    await db.release();
    await backend.close();
  }
}

/** D307: runs the real migrations up to and including 017 and stops before 018. */
async function ledgerAt017(filename: string): Promise<void> {
  const backend = sqliteBackend({ filename });
  const db = await backend.acquire(false, true),
    stop = Error("stop before 018");
  try {
    await db.begin();
    await assert.rejects(
      migrateConnection({
        ...db,
        async script(sql) {
          if (sql.includes("trade_documents_party")) throw stop;
          await db.script(sql);
        },
      }),
      (error) => error === stop,
    );
    await db.commit();
    assert.equal(await inspectSchema(db, true), 17);
  } finally {
    await db.release();
    await backend.close();
  }
}

test("017 is one CREATE INDEX statement; a new ledger has exactly that index on top of 016", async () => {
  const sql = await readFile(
    new URL("../migrations/sqlite/017-trade-order-filters.sql", import.meta.url),
    "utf8",
  );
  const statements = sql.split("\n").filter((line) => line.trim() && !line.startsWith("--"));
  assert.deepEqual(statements, [`${definition};`]);
  assert.equal(sql.split("\n").filter((line) => line.startsWith("--")).length, 1);

  const fresh = join(directory, "fresh.sqlite"),
    old = join(directory, "016.sqlite");
  await ledgerAt017(fresh);
  await ledgerAt016(old, false);
  const added = schemaObjects(fresh).filter(
    (object) => !schemaObjects(old).some((before) => before.name === object.name),
  );
  assert.deepEqual(added, [
    { type: "index", name: "trade_orders_party", tbl_name: "trade_orders", sql: definition },
  ]);
  const db = new Database(fresh, { readonly: true });
  try {
    assert.equal(
      db.prepare("SELECT max(version) AS version FROM schema_migrations").get()?.version,
      17,
    );
  } finally {
    db.close();
  }
});

test("a populated 016 ledger upgrades to 017 with every order and order-line column unchanged", async () => {
  const filename = join(directory, "upgrade.sqlite");
  const before16 = await ledgerAt016(filename, true);
  const source = new Database(filename, { readonly: true });
  const before = orderRows(source);
  source.close();
  assert.equal(before.orders.length, 3);
  assert.equal(before.lines.length, 6);
  await ledgerAt017(filename);
  const result = new Database(filename, { readonly: true });
  try {
    assert.deepEqual(orderRows(result), before);
    result.defaultSafeIntegers(true);
    assert.deepEqual(
      result.prepare("SELECT * FROM schema_migrations WHERE version<=16 ORDER BY version").all(),
      before16,
    );
    result.defaultSafeIntegers(false);
    assert.equal(
      result.prepare("SELECT max(version) AS version FROM schema_migrations").get()?.version,
      17,
    );
    assert.equal(
      result.prepare("SELECT sql FROM sqlite_schema WHERE name='trade_orders_party'").get()?.sql,
      definition,
    );
    assert.deepEqual(result.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    result.close();
  }
});

test("reopening a 017 ledger runs no migration script and keeps its version rows", async () => {
  const filename = join(directory, "reopen.sqlite");
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const snapshot = () => {
    const db = new Database(filename, { readonly: true });
    try {
      return db.prepare("SELECT * FROM schema_migrations ORDER BY version").all();
    } finally {
      db.close();
    }
  };
  const versions = snapshot();
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
  const reopened = createSqliteStorage({ filename });
  try {
    await reopened.migrate();
    await reopened.verifySchema();
  } finally {
    await reopened.close();
  }
  assert.deepEqual(snapshot(), versions);
});

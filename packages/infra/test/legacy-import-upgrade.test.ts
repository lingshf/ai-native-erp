import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";
import { createSqliteStorage } from "../src/storage/index.ts";
import { sqliteBackend } from "../src/storage/sqlite.ts";
import { latestMigrationVersion, migrateConnection } from "../src/storage/migrations.ts";
import { legacyFixture } from "./support/legacy-fixture.mjs";
import type { Row } from "../src/storage/types.ts";

test.for(["007", "013"])(
  "014 upgrades populated %s without rewriting historical migration prefix, GL or receipts",
  async (version, t) => {
    const f = legacyFixture(t),
      filename = join(f.directory, "upgrade.sqlite"),
      backend = sqliteBackend({ filename });
    const db = await backend.acquire(false, true),
      stop = Error("stop at upgrade baseline");
    let before: readonly Row[] = [];
    try {
      await db.begin();
      await assert.rejects(
        migrateConnection({
          ...db,
          async script(sql) {
            if (
              sql.includes(
                version === "007" ? "ADD COLUMN document_date" : "CREATE TABLE legacy_import_runs",
              )
            )
              throw stop;
            await db.script(sql);
          },
        }),
        (error) => error === stop,
      );
      before = await db.query("SELECT * FROM schema_migrations ORDER BY version");
      assert.equal(before.length, Number(version));
      const fingerprint = createHash("sha256").update("Synthetic pre-import journal").digest("hex");
      const id = "00000000-0000-4000-8000-000000000001",
        key = "00000000-0000-4000-8000-000000000002";
      await db.script(`INSERT INTO tenants(tenant_id) VALUES('LOCAL');
      INSERT INTO books(tenant_id,book_id) VALUES('LOCAL','LOCAL');
      INSERT INTO companies(tenant_id,book_id,company_id) VALUES('LOCAL','LOCAL','F');
      INSERT INTO ledger_companies(company_id,name,currency,scale,year,close_mode,revision) VALUES('F','Fictional','CNY',2,2026,'annual',1);
      INSERT INTO accounts VALUES('F','1000','Cash','ASSET','cash','DEBIT','general',NULL,NULL,1,1,0,1);
      INSERT INTO accounts VALUES('F','3000','Capital','EQUITY','capital','CREDIT','general',NULL,NULL,1,1,0,1);
      INSERT INTO periods(company_id,month,status,revision) VALUES('F','2026-01','open',1);`);
      await db.query(
        "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version,idempotency_key,source_ref) VALUES('LOCAL','LOCAL','F','journal.confirm',?,'LOCAL',?,'{}',1,?,'FICT')",
        [key, fingerprint, key],
      );
      await db.query(
        `INSERT INTO journal_entries(company_id,id,receipt_key,source_ref,accounting_date,period,memo,kind,operation,role,posted_at,fingerprint${version === "007" ? "" : ",document_date,tax_date"})
      VALUES('F',?,?,'FICT','2026-01-15','2026-01','Fictional','normal','journal','normal','2026-01-15T00:00:00.000Z',?${version === "007" ? "" : ",'2026-01-14','2026-01-13'"})`,
        [id, key, fingerprint],
      );
      await db.query("INSERT INTO journal_lines VALUES('F',?,1,'2026-01','1000',100,0,'{}','{}')", [
        id,
      ]);
      await db.query("INSERT INTO journal_lines VALUES('F',?,2,'2026-01','3000',0,100,'{}','{}')", [
        id,
      ]);
      await db.query("INSERT INTO journal_seals VALUES('F',?,100)", [id]);
      await db.commit();
    } finally {
      await db.release();
      await backend.close();
    }
    const source = new Database(filename, { readonly: true });
    const immutable = Object.fromEntries(
      ["receipts", "journal_lines", "journal_seals"].map((table) => [
        table,
        source.prepare(`SELECT * FROM ${table}`).all(),
      ]),
    );
    source.close();
    const storage = createSqliteStorage({ filename });
    try {
      await storage.migrate();
      await storage.verifySchema();
    } finally {
      await storage.close();
    }
    const result = new Database(filename, { readonly: true });
    result.defaultSafeIntegers(true);
    try {
      assert.deepEqual(
        result
          .prepare("SELECT * FROM schema_migrations WHERE version<=? ORDER BY version")
          .all(before.length),
        before,
      );
      assert.equal(
        result.prepare("SELECT max(version) version FROM schema_migrations").get().version,
        BigInt(latestMigrationVersion),
      );
      assert.equal(result.prepare("SELECT value FROM write_seq").get().value, 0n);
      assert.deepEqual(result.prepare("PRAGMA foreign_key_check").all(), []);
      result.defaultSafeIntegers(false);
      for (const [table, rows] of Object.entries(immutable))
        assert.deepEqual(result.prepare(`SELECT * FROM ${table}`).all(), rows);
      assert.equal(result.prepare("SELECT import_run FROM journal_entries").get().import_run, null);
      assert.equal(
        result.prepare("SELECT document_date FROM journal_entries").get().document_date,
        version === "007" ? "2026-01-15" : "2026-01-14",
      );
    } finally {
      result.close();
    }
  },
);

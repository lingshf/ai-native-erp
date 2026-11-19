import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { normalizeMigration, migrateConnection } from "../../src/storage/migrations.ts";
import { plan, receipt, receiptBinding, scope } from "./storage-contract.mjs";

export function rawContract(fixture) {
  test("same-name structural drift is rejected, not mistaken for verified migration history", async () => {
    const changes = [
      [
        "DROP TRIGGER audit_no_delete",
        "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT 1; END",
      ],
      ["ALTER TABLE companies ADD COLUMN unexpected TEXT DEFAULT 'changed'"],
    ];
    for (const statements of changes) {
      const f = await fixture();
      try {
        await f.storage.migrate();
        for (const sql of statements) await f.raw(sql);
        const before = await f.bytes();
        await assert.rejects(
          f.storage.verifySchema(),
          { code: "SCHEMA_MISMATCH" },
          statements.join(";"),
        );
        await assert.rejects(f.storage.migrate(), { code: "SCHEMA_MISMATCH" });
        assert.deepEqual(
          await f.bytes(),
          before,
          "Rejected structural drift must not change database or WAL bytes",
        );
      } finally {
        await f.close();
      }
    }
  });

  test("persisted noncanonical JSON and impossible calendar timestamp fail with safe storage error", async () => {
    for (const corrupt of ["receipt-json", "receipt-unsafe", "audit-json", "audit-date"]) {
      const f = await fixture();
      try {
        await f.storage.migrate();
        await f.storage.provision(scope);
        if (corrupt.startsWith("receipt")) {
          await f.raw(
            "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version) VALUES(?,?,?,?,?,?,?,?,?)",
            [
              scope.tenantId,
              scope.bookId,
              scope.companyId,
              receipt.operation,
              receipt.key,
              receipt.principal,
              receipt.fingerprint,
              corrupt === "receipt-unsafe" ? "1.5" : '{ "z":null,"a":[true,1]}',
              1,
            ],
          );
        } else {
          await f.raw(
            "INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)",
            [
              scope.tenantId,
              scope.bookId,
              scope.companyId,
              1,
              receipt.operation,
              receipt.key,
              receipt.principal,
              corrupt === "audit-json" ? '{"z":null, "a":1}' : "{}",
              corrupt === "audit-date" ? "2026-02-31T12:00:00.000Z" : "2026-02-28T12:00:00.000Z",
            ],
          );
        }
        await assert.rejects(
          f.storage.read(scope, (s) =>
            corrupt.startsWith("receipt")
              ? s.receipts.get(receiptBinding())
              : s.audit.list({ scope, afterSequence: 0, limit: 1 }),
          ),
          (error) => {
            assert.equal(error.code, "STORAGE_FAILURE");
            assert.equal(error.message, "The storage operation failed.");
            assert.ok(!JSON.stringify(error).includes("2026-02-31"));
            assert.equal(error.cause, undefined);
            return true;
          },
        );
      } finally {
        await f.close();
      }
    }
  });

  test("actual independent SQL constraints, full-scope FKs and immutable evidence", async () => {
    const f = await fixture();
    try {
      await f.storage.migrate();
      await f.storage.provision(scope);
      await f.storage.write(plan, async (s) => {
        await s.receipts.save(receipt);
        await s.audit.append({
          scope,
          operation: receipt.operation,
          reference: receipt.key,
          principal: receipt.principal,
          details: null,
        });
      });
      for (const statement of [
        "UPDATE receipts SET principal='changed'",
        "DELETE FROM receipts",
        "UPDATE audit SET principal='changed'",
        "DELETE FROM audit",
        "DELETE FROM companies",
        "DELETE FROM books",
        "DELETE FROM tenants",
        "INSERT INTO tenants(tenant_id) VALUES('lower')",
        "INSERT INTO books(tenant_id,book_id) VALUES('MISSING','B1')",
        "INSERT INTO companies(tenant_id,book_id,company_id) VALUES('T1','MISSING','C1')",
        "UPDATE companies SET revision=-1",
        "UPDATE companies SET revision=9007199254740992",
        "INSERT INTO receipts SELECT tenant_id,'MISSING',company_id,operation,receipt_key,principal,fingerprint,result,version FROM receipts",
        "INSERT INTO receipts SELECT tenant_id,book_id,company_id,operation,'bad-json',principal,fingerprint,'not-json',version FROM receipts",
        "INSERT INTO receipts SELECT tenant_id,book_id,company_id,operation,'bad-principal',char(1),fingerprint,result,version FROM receipts",
        "INSERT INTO receipts SELECT tenant_id,book_id,company_id,operation,'bad-fingerprint',principal,'NO',result,version FROM receipts",
      ])
        await assert.rejects(f.raw(statement), undefined, statement);
      const rows = await f.raw("SELECT result FROM receipts");
      assert.equal(rows[0].result, '{"a":[true,1],"z":null}');
      assert.equal((await f.raw("SELECT sequence FROM audit")).length, 1);
      await f.storage.verifySchema();
    } finally {
      await f.close();
    }
  });

  test("actual configured drivers round trip full signed int64, no business SQL backdoor", async () => {
    const f = await fixture();
    let connection;
    try {
      await f.storage.migrate();
      connection = await f.backend.acquire(false, false);
      await connection.begin();
      await connection.query("CREATE TEMP TABLE driver_int64_probe(value BIGINT NOT NULL)");
      await connection.query("INSERT INTO driver_int64_probe(value) VALUES(?),(?)", [
        -9223372036854775808n,
        9223372036854775807n,
      ]);
      const rows = await connection.query("SELECT value FROM driver_int64_probe ORDER BY value");
      assert.deepEqual(
        rows.map((row) => row.value),
        [-9223372036854775808n, 9223372036854775807n],
      );
      await connection.rollback();
      await f.storage.provision(scope);
      await f.raw("UPDATE companies SET revision=?", [9007199254740991n]);
      assert.equal(
        await f.storage.read(scope, (s) => s.revisions.get(scope)),
        Number.MAX_SAFE_INTEGER,
      );
      await assert.rejects(
        f.storage.write(plan, (s) => s.revisions.advance(scope, Number.MAX_SAFE_INTEGER)),
        { code: "OVERFLOW" },
      );
    } finally {
      await connection?.release();
      await f.close();
    }
  });

  test("migration DDL, triggers and version rows roll back together on actual SQL failure", async () => {
    const f = await fixture();
    let connection;
    try {
      connection = await f.backend.acquire(false, true);
      await connection.begin();
      const fault = {
        ...connection,
        async script(sql) {
          await connection.script(sql);
          if (sql.includes("CREATE TABLE") && sql.includes("tenants")) {
            await connection.query("SELECT * FROM deliberately_missing_migration_failure");
          }
        },
      };
      await assert.rejects(migrateConnection(fault));
      await connection.rollback();
      await connection.release();
      connection = undefined;
      const rows = await f.raw("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'");
      assert.deepEqual(rows, []);
      await assert.rejects(f.storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
      await f.storage.migrate();
      await f.storage.verifySchema();
    } finally {
      await connection?.release();
      await f.close();
    }
  });

  test("unknown schema, missing objects, future/gapped/mixed/edited migration history rejected", async () => {
    for (const statement of [
      "CREATE TABLE unrelated_user_data(id INTEGER)",
      "DROP TRIGGER audit_no_delete",
      "UPDATE schema_migrations SET version=8 WHERE version=7",
      "DELETE FROM schema_migrations WHERE version=2",
      "UPDATE schema_migrations SET checksum='0000000000000000000000000000000000000000000000000000000000000000'",
      // The immutable 001 CHECK allows this historical value; runtime verification must reject it.
      "UPDATE schema_migrations SET dialect='postgres'",
      "DELETE FROM schema_migrations",
    ]) {
      const f = await fixture();
      try {
        await f.storage.migrate();
        await f.raw(statement);
        await assert.rejects(f.storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
        await assert.rejects(f.storage.migrate(), { code: "SCHEMA_MISMATCH" });
      } finally {
        await f.close();
      }
    }
  });

  test("migration checksum normalization is exact LF, rejects BOM and lone CR", () => {
    const sha = (text) =>
      createHash("sha256").update(normalizeMigration(text), "utf8").digest("hex");
    assert.equal(sha("SELECT 1;\r\n"), sha("SELECT 1;\n"));
    assert.notEqual(sha("SELECT 1;\n"), sha("SELECT 1;"));
    assert.notEqual(sha(" SELECT 1;\n"), sha("SELECT 1;\n"));
    assert.throws(() => normalizeMigration("\uFEFFSELECT 1;\n"), { code: "SCHEMA_MISMATCH" });
    assert.throws(() => normalizeMigration("SELECT 1;\r"), { code: "SCHEMA_MISMATCH" });
  });
}

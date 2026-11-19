import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { normalizeMigration, migrateConnection } from "../../src/storage/migrations.ts";
import { plan, receipt, receiptBinding, scope } from "./storage-contract.mjs";
import { defaultAccounts } from "@erp/core/domain";
import { journalRepository } from "../../src/storage/journals.ts";
import { businessRepository } from "../../src/storage/business-events.ts";

export function rawContract(fixture) {
  test("008 backfills posted dates from 007 without changing receipts, GL or immutable business and queue evidence", async () => {
    const f = await fixture();
    let connection;
    try {
      connection = await f.backend.acquire(false, true);
      await connection.begin();
      const stop = new Error("Stop before unpublished 008");
      await assert.rejects(
        migrateConnection({
          ...connection,
          async script(sql) {
            if (sql.includes("ADD COLUMN document_date")) throw stop;
            await connection.script(sql);
          },
        }),
        (error) => error === stop,
      );
      await connection.commit();
      await connection.release();
      connection = undefined;
      const id = "00000001-0000-4000-8000-000000000001";
      const key = "00000002-0000-4000-8000-000000000002";
      const date = "2026-01-15",
        fingerprint = "a".repeat(64),
        postedAt = "2026-01-15T10:00:00.000Z";
      const lines = ["1000", "3000"].map((account, index) => ({
        account,
        debit: index ? 0 : 100,
        credit: index ? 100 : 0,
        dimensions: {},
        dimensionOrigins: {},
        role: "business",
        suspense: null,
        balancing: null,
        historical: null,
        group: null,
      }));
      const oldDraft = {
        id,
        revision: 1,
        sourceRef: "PRE008",
        date,
        memo: "Old evidence",
        kind: "normal",
        operation: "journal",
        originalId: null,
        headerDimensions: {},
        lines: lines.map((line) => ({
          account: line.account,
          debit: line.debit ? "1" : "",
          credit: line.credit ? "1" : "",
          dimensions: {},
          suspense: null,
        })),
      };
      const oldPlan = {
        version: 1,
        company: "LOCAL",
        currency: "CNY",
        scale: 2,
        draftId: id,
        draftRevision: 1,
        sourceRef: "PRE008",
        date,
        memo: oldDraft.memo,
        operation: "journal",
        originalId: null,
        journals: [{ kind: "normal", role: "normal", lines, debit: 100, credit: 100 }],
      };
      const oldReceipt = {
        company: "LOCAL",
        sourceRef: "PRE008",
        idempotencyKey: key,
        draftId: id,
        draftRevision: 1,
        fingerprint,
        operation: "journal",
        journalIds: [id],
        postedAt,
      };
      const oldPreview = {
        fingerprint,
        plan: oldPlan,
        statistics: null,
        matches: [],
        clearing: [],
      };
      await f.raw("BEGIN");
      for (const sql of [
        "INSERT INTO tenants(tenant_id) VALUES('LOCAL')",
        "INSERT INTO books(tenant_id,book_id) VALUES('LOCAL','LOCAL')",
        "INSERT INTO companies(tenant_id,book_id,company_id) VALUES('LOCAL','LOCAL','LOCAL')",
        "INSERT INTO ledger_companies(company_id,name,currency,scale,year,close_mode,revision) VALUES('LOCAL','Old','CNY',2,2026,'annual',1)",
        "INSERT INTO periods VALUES('LOCAL','2026-01','open',1)",
      ])
        await f.raw(sql);
      for (const account of defaultAccounts().filter((row) => ["1000", "3000"].includes(row.code)))
        await f.raw("INSERT INTO accounts VALUES('LOCAL',?,?,?,?,?,?,?,?,?,?,?,?)", [
          account.code,
          account.name,
          account.category,
          account.reportGroup,
          account.normalSide,
          account.purpose,
          account.controlModule,
          account.contraOf,
          +account.manualAllowed,
          +account.active,
          +account.builtin,
          account.revision,
        ]);
      await f.raw(
        "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version,idempotency_key,source_ref) VALUES('LOCAL','LOCAL','LOCAL','journal.confirm',?,'LOCAL',?,?,1,?,'PRE008')",
        [key, fingerprint, JSON.stringify(oldReceipt), key],
      );
      await f.raw(
        "INSERT INTO journal_entries(company_id,id,receipt_key,source_ref,accounting_date,period,memo,kind,operation,role,posted_at,fingerprint) VALUES('LOCAL',?,?,'PRE008',?,'2026-01',?,'normal','journal','normal',?,?)",
        [id, key, date, oldDraft.memo, postedAt, fingerprint],
      );
      for (const [index, { account, debit, credit, dimensions, ...evidence }] of lines.entries())
        await f.raw("INSERT INTO journal_lines VALUES('LOCAL',?,?,'2026-01',?,?,?,?,?)", [
          id,
          index + 1,
          account,
          debit,
          credit,
          JSON.stringify(dimensions),
          JSON.stringify(evidence),
        ]);
      await f.raw("INSERT INTO journal_seals VALUES('LOCAL',?,100)", [id]);
      await f.raw(
        "INSERT INTO business_events(company_id,id,source_ref,accounting_date,memo,operation,input,preview,receipt_key,created_at) VALUES('LOCAL',?,'PRE008',?,?,'journal',?,?,?,?)",
        [
          id,
          date,
          oldDraft.memo,
          JSON.stringify(oldDraft),
          JSON.stringify(oldPreview),
          key,
          postedAt,
        ],
      );
      await f.raw(
        "INSERT INTO transfer_queue(company_id,id,created_at,status,revision,journal_ids,transfer_fingerprint,transfer_plan) VALUES('LOCAL',?,?,'transferred',2,?,?,?)",
        [id, postedAt, JSON.stringify([id]), fingerprint, JSON.stringify(oldPlan)],
      );
      await f.raw("COMMIT");
      const evidence = async () =>
        Promise.all([
          f.raw("SELECT * FROM receipts"),
          f.raw("SELECT * FROM journal_lines"),
          f.raw("SELECT * FROM journal_seals"),
          f.raw("SELECT * FROM business_events"),
          f.raw("SELECT * FROM transfer_queue"),
        ]);
      const before = await evidence();
      await assert.rejects(f.storage.verifySchema(), { code: "SCHEMA_MISMATCH" });
      connection = await f.backend.acquire(false, true);
      await connection.begin();
      await assert.rejects(
        migrateConnection({
          ...connection,
          async script(sql) {
            await connection.script(sql);
            if (sql.includes("ADD COLUMN document_date"))
              await connection.query("SELECT * FROM deliberately_missing_after_date_backfill");
          },
        }),
      );
      await connection.rollback();
      await connection.release();
      connection = undefined;
      assert.equal(
        (await f.raw("PRAGMA table_info(journal_entries)")).some(
          (column) => column.name === "document_date",
        ),
        false,
      );
      assert.deepEqual(await evidence(), before);
      await f.storage.migrate();
      await f.storage.verifySchema();
      assert.deepEqual(await evidence(), before);
      assert.deepEqual(
        await f.raw("SELECT accounting_date,document_date,tax_date FROM journal_entries"),
        [{ accounting_date: date, document_date: date, tax_date: date }],
      );
      await assert.rejects(f.raw("UPDATE journal_entries SET tax_date='2026-02-01'"));
      await assert.rejects(f.raw("DELETE FROM journal_entries"));
      connection = await f.backend.acquire(false, false);
      const entries = journalRepository(connection),
        events = businessRepository(connection);
      assert.equal((await entries.journalEntry("LOCAL", id)).documentDate, date);
      assert.equal((await entries.journalReceipt("LOCAL", key)).module, null);
      assert.equal((await events.businessEvent("LOCAL", id)).preview.plan.taxDate, date);
      assert.equal((await events.queueItem("LOCAL", id)).plan.documentDate, date);
      assert.deepEqual(await evidence(), before);
    } finally {
      await connection?.release();
      await f.close();
    }
  });

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
      "UPDATE schema_migrations SET version=(SELECT MAX(version)+1 FROM schema_migrations) WHERE version=(SELECT MAX(version) FROM schema_migrations)",
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

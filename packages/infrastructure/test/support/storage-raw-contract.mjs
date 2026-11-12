import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeMigration, migrateConnection } from '../../dist/storage/migrations.js';
import { plan, receipt, receiptBinding, scope } from './storage-contract.mjs';

export async function rawContract(t, fixture) {
  await t.test('same-name structural drift is rejected, not mistaken for verified migration history', async () => {
    const sample = await fixture();
    const dialect = sample.dialect;
    await sample.close();
    const changes = dialect === 'sqlite' ? [
      ['DROP TRIGGER audit_no_delete', "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT 1; END"],
      ['ALTER TABLE companies ADD COLUMN unexpected TEXT DEFAULT \'changed\''],
    ] : [
      ['ALTER TABLE public.audit DISABLE TRIGGER audit_no_delete'],
      ['ALTER TABLE public.companies DROP CONSTRAINT companies_tenant_id_book_id_fkey'],
      ['ALTER TABLE public.companies DROP CONSTRAINT companies_revision_check'],
      ['ALTER TABLE public.companies ADD COLUMN unexpected TEXT'],
      ['ALTER TABLE public.companies ALTER COLUMN revision SET DEFAULT 17'],
      ['CREATE RULE unexpected_rule AS ON INSERT TO public.companies DO INSTEAD NOTHING'],
      ['CREATE POLICY unexpected_policy ON public.companies USING (true)'],
      ['ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY'],
      ["CREATE OR REPLACE FUNCTION public.reject_evidence_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$"],
    ];
    for (const statements of changes) {
      const f = await fixture();
      try {
        await f.storage.migrate();
        for (const sql of statements) await f.raw(sql);
        await assert.rejects(f.storage.verifySchema(), { code: 'SCHEMA_MISMATCH' }, statements.join(';'));
        await assert.rejects(f.storage.migrate(), { code: 'SCHEMA_MISMATCH' });
      } finally { await f.close(); }
    }
  });

  await t.test('persisted noncanonical JSON and impossible calendar timestamp fail with safe storage error', async () => {
    for (const corrupt of ['receipt-json', 'receipt-unsafe', 'audit-json', 'audit-date']) {
      const f = await fixture();
      try {
        await f.storage.migrate(); await f.storage.provision(scope);
        if (corrupt.startsWith('receipt')) {
          await f.raw('INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version) VALUES(?,?,?,?,?,?,?,?,?)',
            [scope.tenantId, scope.bookId, scope.companyId, receipt.operation, receipt.key, receipt.principal, receipt.fingerprint,
              corrupt === 'receipt-unsafe' ? '1.5' : '{ "z":null,"a":[true,1]}', 1]);
        } else {
          await f.raw('INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)',
            [scope.tenantId, scope.bookId, scope.companyId, 1, receipt.operation, receipt.key, receipt.principal,
              corrupt === 'audit-json' ? '{"z":null, "a":1}' : '{}',
              corrupt === 'audit-date' ? '2026-02-31T12:00:00.000Z' : '2026-02-28T12:00:00.000Z']);
        }
        await assert.rejects(f.storage.read(scope, (s) => corrupt.startsWith('receipt')
          ? s.receipts.get(receiptBinding())
          : s.audit.list({ scope, afterSequence: 0, limit: 1 })), (error) => {
          assert.equal(error.code, 'STORAGE_FAILURE');
          assert.equal(error.message, 'The storage operation failed.');
          assert.ok(!JSON.stringify(error).includes('2026-02-31'));
          assert.equal(error.cause, undefined);
          return true;
        });
      } finally { await f.close(); }
    }
  });

  await t.test('actual independent SQL constraints, full-scope FKs and immutable evidence', async () => {
    const f = await fixture();
    try {
      await f.storage.migrate();
      await f.storage.provision(scope);
      await f.storage.write(plan, async (s) => {
        await s.receipts.save(receipt);
        await s.audit.append({ scope, operation: receipt.operation, reference: receipt.key,
          principal: receipt.principal, details: null });
      });
      for (const statement of [
        "UPDATE receipts SET principal='changed'",
        'DELETE FROM receipts',
        "UPDATE audit SET principal='changed'",
        'DELETE FROM audit',
        'DELETE FROM companies',
        'DELETE FROM books',
        'DELETE FROM tenants',
        "INSERT INTO tenants(tenant_id) VALUES('lower')",
        "INSERT INTO books(tenant_id,book_id) VALUES('MISSING','B1')",
        "INSERT INTO companies(tenant_id,book_id,company_id) VALUES('T1','MISSING','C1')",
        "UPDATE companies SET revision=-1",
        'UPDATE companies SET revision=9007199254740992',
        "INSERT INTO receipts SELECT tenant_id,'MISSING',company_id,operation,receipt_key,principal,fingerprint,result,version FROM receipts",
        "INSERT INTO receipts SELECT tenant_id,book_id,company_id,operation,'bad-json',principal,fingerprint,'not-json',version FROM receipts",
        "INSERT INTO receipts SELECT tenant_id,book_id,company_id,operation,'bad-principal',char(1),fingerprint,result,version FROM receipts",
        "INSERT INTO receipts SELECT tenant_id,book_id,company_id,operation,'bad-fingerprint',principal,'NO',result,version FROM receipts",
      ]) await assert.rejects(f.raw(f.dialect === 'postgres' ? statement.replaceAll('char(', 'chr(') : statement), undefined, statement);
      if (f.dialect === 'postgres') {
        await assert.rejects(f.raw('TRUNCATE receipts'));
        await assert.rejects(f.raw('TRUNCATE audit'));
        await assert.rejects(f.raw('TRUNCATE tenants CASCADE'));
      }
      const rows = await f.raw('SELECT result FROM receipts');
      assert.equal(rows[0].result, '{"a":[true,1],"z":null}');
      assert.equal((await f.raw('SELECT sequence FROM audit')).length, 1);
      await f.storage.verifySchema();
    } finally { await f.close(); }
  });

  await t.test('actual configured drivers round trip full signed int64, no business SQL backdoor', async () => {
    const f = await fixture();
    let connection;
    try {
      await f.storage.migrate();
      connection = await f.backend.acquire(false, false);
      await connection.begin(false);
      await connection.query('CREATE TEMP TABLE driver_int64_probe(value BIGINT NOT NULL)');
      await connection.query('INSERT INTO driver_int64_probe(value) VALUES(?),(?)',
        [-9223372036854775808n, 9223372036854775807n]);
      const rows = await connection.query('SELECT value FROM driver_int64_probe ORDER BY value');
      assert.deepEqual(rows.map((row) => row.value), [-9223372036854775808n, 9223372036854775807n]);
      await connection.rollback();
      await f.storage.provision(scope);
      await f.raw('UPDATE companies SET revision=?', [9007199254740991n]);
      assert.equal(await f.storage.read(scope, (s) => s.revisions.get(scope)), Number.MAX_SAFE_INTEGER);
      await assert.rejects(f.storage.write(plan, (s) => s.revisions.advance(scope, Number.MAX_SAFE_INTEGER)), { code: 'OVERFLOW' });
    } finally {
      await connection?.release();
      await f.close();
    }
  });

  await t.test('migration DDL, triggers and version rows roll back together on actual SQL failure', async () => {
    const f = await fixture();
    let connection;
    try {
      connection = await f.backend.acquire(false, true);
      await connection.begin(false);
      if (f.dialect === 'postgres') await connection.query('SELECT pg_advisory_xact_lock(1163022386,2)');
      const fault = { ...connection, async script(sql) {
        await connection.script(sql);
        if (sql.includes('CREATE TABLE') && sql.includes('tenants')) {
          await connection.query('SELECT * FROM deliberately_missing_migration_failure');
        }
      } };
      await assert.rejects(migrateConnection(fault, f.dialect));
      await connection.rollback();
      await connection.release();
      connection = undefined;
      const rows = f.dialect === 'sqlite'
        ? await f.raw("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
        : await f.raw("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
      assert.deepEqual(rows, []);
      await assert.rejects(f.storage.verifySchema(), { code: 'SCHEMA_MISMATCH' });
      await f.storage.migrate();
      await f.storage.verifySchema();
    } finally {
      await connection?.release();
      await f.close();
    }
  });

  await t.test('unknown schema, missing objects, future/gapped/mixed/edited migration history rejected', async () => {
    for (const statement of [
      'CREATE TABLE unrelated_user_data(id INTEGER)',
      'DROP TRIGGER audit_no_delete ON audit',
      'UPDATE schema_migrations SET version=2',
      'INSERT INTO schema_migrations(version,dialect,checksum,schema_fingerprint) SELECT version+2,dialect,checksum,schema_fingerprint FROM schema_migrations',
      "UPDATE schema_migrations SET checksum='0000000000000000000000000000000000000000000000000000000000000000'",
      "UPDATE schema_migrations SET dialect='OTHER'",
      'DELETE FROM schema_migrations',
    ]) {
      const f = await fixture();
      try {
        await f.storage.migrate();
        let sql = statement;
        if (f.dialect === 'sqlite') sql = sql.replace('DROP TRIGGER audit_no_delete ON audit', 'DROP TRIGGER audit_no_delete');
        if (statement.includes("dialect='OTHER'")) {
          sql = `UPDATE schema_migrations SET dialect='${f.dialect === 'sqlite' ? 'postgres' : 'sqlite'}'`;
        }
        await f.raw(sql);
        await assert.rejects(f.storage.verifySchema(), { code: 'SCHEMA_MISMATCH' });
        await assert.rejects(f.storage.migrate(), { code: 'SCHEMA_MISMATCH' });
      } finally { await f.close(); }
    }
    const f = await fixture();
    try {
      if (f.dialect === 'postgres') {
        await f.raw('CREATE SCHEMA unexpected');
        await assert.rejects(f.storage.migrate(), { code: 'SCHEMA_MISMATCH' });
      }
    } finally { await f.close(); }
  });

  await t.test('migration checksum normalization is exact LF, rejects BOM and lone CR', () => {
    const sha = (text) => createHash('sha256').update(normalizeMigration(text), 'utf8').digest('hex');
    assert.equal(sha('SELECT 1;\r\n'), sha('SELECT 1;\n'));
    assert.notEqual(sha('SELECT 1;\n'), sha('SELECT 1;'));
    assert.notEqual(sha(' SELECT 1;\n'), sha('SELECT 1;\n'));
    assert.throws(() => normalizeMigration('\uFEFFSELECT 1;\n'), { code: 'SCHEMA_MISMATCH' });
    assert.throws(() => normalizeMigration('SELECT 1;\r'), { code: 'SCHEMA_MISMATCH' });
  });
}

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { postgresBackend } from '../../dist/storage/postgres.js';
import { targetStorage } from '../../dist/storage/core.js';
import { databaseCode, isCommitNotSent } from '../../dist/storage/errors.js';
import { barrier, plan, receipt, scope } from './storage-contract.mjs';

const other = Object.freeze({ ...scope, companyId: 'C2' });
const book = Object.freeze({ level: 'book', tenantId: scope.tenantId, bookId: scope.bookId });
const tenant = Object.freeze({ level: 'tenant', tenantId: scope.tenantId });

async function setup(fixture) {
  const f = await fixture();
  await f.storage.migrate();
  await f.storage.provision(scope);
  await f.storage.provision(other);
  return f;
}

function scoped(scope) { return { level: scope.level, scopes: [scope] }; }

export async function postgresCases(t, fixture) {
  await t.test('inherited nonzero transaction timer is rearmed for migration and business UoWs', async () => {
    const f = await fixture();
    const backend = postgresBackend(f.config);
    const inherited = []; const budgets = [];
    const secondsSql = "SELECT EXTRACT(EPOCH FROM current_setting('transaction_timeout')::interval)::integer AS seconds";
    const storage = targetStorage({ ...backend, async acquire(readOnly, migrating) {
      const connection = await backend.acquire(readOnly, migrating);
      const [initial] = await connection.query(secondsSql);
      inherited.push(initial.seconds);
      return { ...connection, async begin(mode) {
        await connection.begin(mode);
        const [budget] = await connection.query(secondsSql);
        budgets.push({ readOnly: mode, migrating, seconds: budget.seconds });
        if (migrating) {
          await delay(1200);
          await connection.query('SELECT 1');
        }
      } };
    } });
    try {
      // Only this disposable database changes; subsequent fresh pool sessions inherit 1s.
      await f.raw(`ALTER DATABASE "${f.config.database}" SET transaction_timeout='1s'`);
      await storage.migrate();
      await storage.provision(scope);
      await storage.write(plan, async (s) => {
        await delay(1200);
        await s.revisions.advance(scope, 0);
      });
      const revision = await storage.read(scope, async (s) => {
        await delay(1200);
        return s.revisions.get(scope);
      });
      assert.equal(revision, 1);
      assert.deepEqual(inherited, [1, 1, 1, 1]);
      assert.deepEqual(budgets, [
        { readOnly: false, migrating: true, seconds: 120 },
        { readOnly: false, migrating: false, seconds: 10 },
        { readOnly: false, migrating: false, seconds: 10 },
        { readOnly: true, migrating: false, seconds: 10 },
      ]);
    } finally { await storage.close(); await f.close(); }
  });

  await t.test('implicit pg_catalog precedes public shadows while public remains the CREATE namespace', async () => {
    const f = await setup(fixture);
    let connection;
    try {
      await f.raw("CREATE VIEW public.pg_namespace AS SELECT 'shadow'::text AS nspname");
      connection = await f.backend.acquire(false, false);
      const [settings] = await connection.query(`SELECT current_schema() AS target,
        current_schemas(true)::text[] AS path,
        (SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.oid='pg_namespace'::regclass) AS catalog`);
      assert.equal(settings.target, 'public');
      assert.deepEqual(settings.path, ['pg_catalog', 'public']);
      assert.equal(settings.catalog, 'pg_catalog');
      await connection.query('CREATE TABLE search_path_probe(value INTEGER)');
      const rows = await connection.query(`SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relname='search_path_probe'`);
      assert.deepEqual(rows, [{ nspname: 'public' }]);
      await assert.rejects(f.storage.verifySchema(), { code: 'SCHEMA_MISMATCH' });
    } finally { await connection?.release(); await f.close(); }
  });

  await t.test('independent pools: same-book companies parallel, high-level writers exclude descendants', async () => {
    const f = await setup(fixture);
    const sibling = f.sibling();
    try {
      const entered = barrier(); const exit = barrier();
      const held = f.storage.write(plan, async () => { entered.release(); await exit.promise; });
      await entered.promise;
      try {
        await sibling.write(scoped(other), (s) => s.revisions.advance(other, 0));
      } finally { exit.release(); await held; }
      for (const [first, second] of [[scope, scope], [book, scope], [scope, book], [tenant, book], [book, tenant]]) {
        const locked = barrier(); const unlock = barrier();
        const writer = f.storage.write(scoped(first), async () => { locked.release(); await unlock.promise; });
        await locked.promise;
        const start = performance.now();
        try {
          await assert.rejects(sibling.write(scoped(second), () => assert.fail('exclusive lock was bypassed')), { code: 'BUSY' });
          t.diagnostic(JSON.stringify({ first: first.level, second: second.level, lockWaitMs: performance.now() - start }));
        } finally { unlock.release(); await writer; }
      }
    } finally { await f.close(); }
  });

  await t.test('reverse caller plans use fixed ASCII tier and one-row lock SQL order', async () => {
    const f = await setup(fixture);
    const secondBook = { ...scope, bookId: 'B2', companyId: 'C3' };
    const secondTenant = { ...scope, tenantId: 'T2', bookId: 'B0', companyId: 'C0' };
    await f.storage.provision(secondBook); await f.storage.provision(secondTenant);
    const backend = postgresBackend(f.config);
    const locks = [];
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      return { ...connection, async query(sql, values) {
        if (sql.endsWith('FOR SHARE') || sql.endsWith('FOR UPDATE')) locks.push([sql, values]);
        return connection.query(sql, values);
      } };
    } });
    try {
      const scopes = [secondTenant, other, secondBook, scope];
      await storage.write({ level: 'company', scopes }, () => undefined);
      assert.deepEqual(locks.map(([sql, values]) => [sql.match(/FROM (\w+)/)[1], values, sql.endsWith('FOR SHARE') ? 'SHARE' : 'UPDATE']), [
        ['tenants', ['T1'], 'SHARE'], ['tenants', ['T2'], 'SHARE'],
        ['books', ['T1', 'B1'], 'SHARE'], ['books', ['T1', 'B2'], 'SHARE'], ['books', ['T2', 'B0'], 'SHARE'],
        ['companies', ['T1', 'B1', 'C1'], 'UPDATE'], ['companies', ['T1', 'B1', 'C2'], 'UPDATE'],
        ['companies', ['T1', 'B2', 'C3'], 'UPDATE'], ['companies', ['T2', 'B0', 'C0'], 'UPDATE'],
      ]);
      const work = async (s) => {
        for (const company of s.scopes) {
          const revision = await s.revisions.get(company);
          await s.revisions.advance(company, revision);
        }
      };
      await Promise.all([
        f.storage.write({ level: 'company', scopes: [scope, other] }, work),
        f.sibling().write({ level: 'company', scopes: [other, scope] }, work),
      ]);
      assert.equal(await f.storage.read(scope, (s) => s.revisions.get(scope)), 2);
    } finally { await storage.close(); await f.close(); }
  });

  await t.test('migrations serialize on advisory lock before first schema inspection, then reselect', async () => {
    const f = await fixture();
    const backend = postgresBackend(f.config);
    const observed = barrier();
    let inspected = false;
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      return { ...connection, async query(sql, values) {
        if (sql.includes('pg_advisory_xact_lock')) observed.release();
        if (sql.includes('pg_namespace')) inspected = true;
        return connection.query(sql, values);
      } };
    } });
    try {
      await f.raw('BEGIN');
      await f.raw('SELECT pg_advisory_xact_lock(1163022386,2)');
      const migration = storage.migrate();
      await observed.promise;
      assert.equal(inspected, false);
      await f.raw('COMMIT');
      await migration;
      await Promise.all([f.storage.migrate(), f.sibling().migrate()]);
      assert.equal((await f.raw('SELECT version FROM schema_migrations')).length, 1);
    } finally { await storage.close(); await f.close(); }
  });

  for (const state of ['40001', '40P01']) {
    for (const retry of [false, true]) {
      await t.test(`actual server-raised aborted SQLSTATE ${state}, explicit retry=${retry}, maximum three attempts`, async () => {
        const f = await setup(fixture);
        let attempts = 0;
        try {
          await f.raw(`CREATE FUNCTION pg_temp.inject_abort() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'injected contract abort' USING ERRCODE='${state}'; END; $$`);
          const write = f.storage.write(plan, async (s) => {
            attempts++;
            // Introduce the real SQL fault after schema verification, and remove it before a retry.
            await f.raw('CREATE TRIGGER contract_abort BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_abort()');
            try {
              await assert.rejects(s.revisions.advance(scope, 0), { code: 'TRANSACTION_ABORTED' });
            } finally { await f.raw('DROP TRIGGER contract_abort ON companies'); }
          }, { retry });
          await assert.rejects(write, { code: 'TRANSACTION_ABORTED' });
          assert.equal(attempts, retry ? 3 : 1);
          assert.equal(await f.storage.read(scope, (s) => s.revisions.get(scope)), 0);
        } finally { await f.close(); }
      });
    }
  }

  await t.test('known abort can retry then commit once, rereading the whole callback', async () => {
    const f = await setup(fixture);
    let attempts = 0;
    try {
      await f.raw(`CREATE FUNCTION pg_temp.abort_once() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected contract abort' USING ERRCODE='40001'; END; $$`);
      await f.storage.write(plan, async (s) => {
        attempts++;
        if (attempts === 1) {
          await f.raw('CREATE TRIGGER contract_abort BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION pg_temp.abort_once()');
          try { await assert.rejects(s.revisions.advance(scope, 0), { code: 'TRANSACTION_ABORTED' }); }
          finally { await f.raw('DROP TRIGGER contract_abort ON companies'); }
        } else {
          const revision = await s.revisions.get(scope);
          await s.revisions.advance(scope, revision);
          await s.receipts.save(receipt);
        }
      }, { retry: true });
      assert.equal(attempts, 2);
      assert.equal(await f.storage.read(scope, (s) => s.revisions.get(scope)), 1);
    } finally { await f.close(); }
  });

  await t.test('real deadlock against an adversarial external lock order aborts and retries the entire transaction', async () => {
    const f = await setup(fixture);
    const backend = postgresBackend(f.config);
    const beforeSecond = barrier(); const continueSecond = barrier();
    let pause = true; let begins = 0; let callbacks = 0;
    const states = [];
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      return { ...connection,
        async begin(readOnly) {
          begins++;
          await connection.begin(readOnly);
          await connection.query("SET LOCAL deadlock_timeout='50ms'");
        },
        async query(sql, values) {
          if (pause && sql.includes('FROM companies') && sql.endsWith('FOR UPDATE') && values?.[2] === 'C2') {
            pause = false; beforeSecond.release(); await continueSecond.promise;
          }
          try { return await connection.query(sql, values); }
          catch (error) { states.push(error.code); throw error; }
        },
      };
    } });
    try {
      await f.raw('BEGIN');
      await f.raw("SET LOCAL deadlock_timeout='10s'");
      await f.raw("SET LOCAL statement_timeout='5s'");
      await f.raw("UPDATE companies SET revision=revision WHERE tenant_id='T1' AND book_id='B1' AND company_id='C2'");
      const result = storage.write({ level: 'company', scopes: [scope, other] }, async (s) => {
        callbacks++;
        await s.revisions.advance(scope, 0);
      }, { retry: true });
      const completed = assert.doesNotReject(result);
      await beforeSecond.promise;
      const externalWait = f.raw("SELECT revision FROM companies WHERE tenant_id='T1' AND book_id='B1' AND company_id='C1' FOR UPDATE");
      continueSecond.release();
      await externalWait;
      await f.raw('COMMIT');
      await completed;
      assert.deepEqual(states, ['40P01']);
      assert.equal(begins, 2);
      assert.equal(callbacks, 1);
      assert.equal(await f.storage.read(scope, (s) => s.revisions.get(scope)), 1);
    } finally { continueSecond.release(); await storage.close(); await f.close(); }
  });

  await t.test('real concurrent-update serialization abort (test-isolated SERIALIZABLE attempt) retries at ordinary RC', async () => {
    const f = await setup(fixture);
    const backend = postgresBackend(f.config);
    const snapshotReady = barrier(); const updated = barrier();
    let begins = 0; let callbacks = 0; let pause = true;
    const states = [];
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      return { ...connection,
        async begin(readOnly) {
          begins++;
          if (begins === 1) {
            // Only this fault-injection attempt differs from production READ COMMITTED.
            await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
            await connection.query("SET LOCAL lock_timeout='1s'");
            await connection.query("SET LOCAL statement_timeout='5s'");
            await connection.query("SET LOCAL transaction_timeout='10s'");
          } else await connection.begin(readOnly);
        },
        async query(sql, values) {
          if (pause && sql.includes('FROM companies') && sql.endsWith('FOR UPDATE')) {
            pause = false; snapshotReady.release(); await updated.promise;
          }
          try { return await connection.query(sql, values); }
          catch (error) { states.push(error.code); throw error; }
        },
      };
    } });
    try {
      const result = storage.write(plan, async (s) => {
        callbacks++;
        assert.equal(await s.revisions.get(scope), 1);
        await s.revisions.advance(scope, 1);
      }, { retry: true });
      const completed = assert.doesNotReject(result);
      await snapshotReady.promise;
      await f.raw("UPDATE companies SET revision=1 WHERE tenant_id='T1' AND book_id='B1' AND company_id='C1'");
      updated.release();
      await completed;
      assert.deepEqual(states, ['40001']);
      assert.equal(begins, 2);
      assert.equal(callbacks, 1);
      assert.equal(await f.storage.read(scope, (s) => s.revisions.get(scope)), 2);
    } finally { updated.release(); await storage.close(); await f.close(); }
  });

  await t.test('actual disconnection at COMMIT is unknown, never replayed, broken client discarded', async () => {
    const f = await setup(fixture);
    const backend = postgresBackend(f.config);
    let attempts = 0; let first = true; let destroyed = false;
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      const [{ pid }] = await connection.query('SELECT pg_backend_pid() AS pid');
      return { ...connection,
        async commit() {
          if (first) { first = false; await f.raw('SELECT pg_terminate_backend(?)', [pid]); }
          await connection.commit();
        },
        async release(destroy) { destroyed ||= destroy; await connection.release(destroy); },
      };
    } });
    try {
      await assert.rejects(storage.write(plan, async (s) => {
        attempts++;
        await s.revisions.advance(scope, 0);
      }, { retry: true }), { code: 'COMMIT_UNKNOWN' });
      assert.equal(attempts, 1);
      assert.equal(destroyed, true);
      assert.equal(await storage.read(scope, (s) => s.revisions.get(scope)), 0);
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
    } finally { await storage.close(); await f.close(); }
  });

  await t.test('rollback after terminated backend destroys client and next pool connection is healthy', async () => {
    const f = await setup(fixture);
    const backend = postgresBackend(f.config);
    let destroyed = false; let attempts = 0; let pid;
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      [{ pid }] = await connection.query('SELECT pg_backend_pid() AS pid');
      return { ...connection, async release(destroy) { destroyed ||= destroy; await connection.release(destroy); } };
    } });
    try {
      await assert.rejects(storage.write(plan, async () => {
        attempts++;
        await f.raw('SELECT pg_terminate_backend(?)', [pid]);
        throw new Error('rollback fault fixture');
      }, { retry: true }), { code: 'STORAGE_FAILURE' });
      assert.equal(destroyed, true);
      assert.equal(attempts, 1);
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
    } finally { await storage.close(); await f.close(); }
  });

  await t.test('core observes transaction_timeout FATAL before COMMIT, destroys client, never replays and recovers', async () => {
    const f = await setup(fixture);
    const backend = postgresBackend(f.config);
    let first = true; let attempts = 0;
    let activeConnection;
    const released = []; const pids = [];
    const probes = [];
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      activeConnection = connection;
      const [{ pid }] = await connection.query('SELECT pg_backend_pid() AS pid');
      pids.push(pid);
      return { ...connection,
        async begin(readOnly) {
          await connection.begin(readOnly);
          if (first) {
            first = false;
            // PostgreSQL does not reschedule an already active transaction timer.
            await connection.query("SET LOCAL transaction_timeout='0'");
            await connection.query("SET LOCAL transaction_timeout='1s'");
          }
        },
        async release(destroy) { released.push(destroy === true); await connection.release(destroy); },
      };
    } });
    try {
      const failure = await storage.write(plan, async (s) => {
        attempts++;
        await s.receipts.save(receipt);
        await s.revisions.advance(scope, 0);
        // The server kills the connection before core asks the backend to COMMIT.
        await delay(1200);
        for (let probe = 0; probe < 2; probe++) {
          try {
            await activeConnection.query('SELECT 1');
            probes.push({ code: 'SUCCESS', state: '' });
          } catch (error) {
            probes.push({ code: error.code, state: databaseCode(error) });
          }
        }
      }, { retry: true }).then(() => null, (error) => error);
      assert.deepEqual(probes, [
        { code: 'TRANSACTION_TIMEOUT', state: '25P04' },
        { code: 'TRANSACTION_TIMEOUT', state: '25P04' },
      ]);
      assert.equal(failure?.code, 'TRANSACTION_TIMEOUT');
      assert.equal(databaseCode(failure), '25P04');
      assert.equal(isCommitNotSent(failure), true);
      assert.equal(attempts, 1);
      assert.deepEqual(released, [true]);
      await storage.read(scope, async (s) => {
        assert.equal(await s.revisions.get(scope), 0);
        const { result: _result, ...binding } = receipt;
        assert.equal(await s.receipts.get(binding), null);
      });
      assert.notEqual(pids[0], pids[1]);
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
    } finally { await storage.close(); await f.close(); }
  });

  await t.test('backend actual COMMIT reply ROLLBACK becomes core TRANSACTION_ABORTED without replay', async () => {
    const f = await setup(fixture);
    const backend = postgresBackend(f.config);
    let inject = true; let attempts = 0;
    const storage = targetStorage({ ...backend, async acquire(...args) {
      const connection = await backend.acquire(...args);
      return { ...connection, async commit() {
        if (inject) {
          inject = false;
          await assert.rejects(connection.query('SELECT 1/0'), { code: '22012' });
        }
        await connection.commit();
      } };
    } });
    try {
      await assert.rejects(storage.write(plan, async (s) => {
        attempts++;
        await s.receipts.save(receipt);
        await s.revisions.advance(scope, 0);
      }, { retry: true }), { code: 'TRANSACTION_ABORTED' });
      assert.equal(attempts, 1);
      await storage.read(scope, async (s) => {
        assert.equal(await s.revisions.get(scope), 0);
        const { result: _result, ...binding } = receipt;
        assert.equal(await s.receipts.get(binding), null);
      });
      await storage.write(plan, (s) => s.revisions.advance(scope, 0));
    } finally { await storage.close(); await f.close(); }
  });

  await t.test('real statement budget and PostgreSQL18 transaction_timeout FATAL, no pooled state leakage', async () => {
    const f = await setup(fixture);
    let connection;
    try {
      connection = await f.backend.acquire(false, false);
      await connection.begin(false);
      const start = performance.now();
      await assert.rejects(connection.query('SELECT pg_sleep(6)'), { code: '57014' });
      t.diagnostic(JSON.stringify({ statementTimeoutElapsedMs: performance.now() - start }));
      await connection.rollback(); await connection.release(); connection = undefined;
      connection = await f.backend.acquire(false, false);
      await connection.begin(false);
      const fatalStart = performance.now();
      await delay(10500);
      await assert.rejects(connection.query('SELECT 1'), (error) => {
        assert.equal(error.code, 'TRANSACTION_TIMEOUT');
        assert.equal(databaseCode(error), '25P04');
        return true;
      });
      t.diagnostic(JSON.stringify({ fatalTransactionElapsedMs: performance.now() - fatalStart }));
      await connection.release(true); connection = undefined;
      await f.storage.write(plan, (s) => s.revisions.advance(scope, 0));
      connection = await f.backend.acquire(true, false);
      const rows = await connection.query("SELECT current_setting('statement_timeout') AS statement,current_setting('transaction_timeout') AS transaction");
      assert.deepEqual(rows[0], { statement: '0', transaction: '0' });
    } finally { await connection?.release(true); await f.close(); }
  });
}

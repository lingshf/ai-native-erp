import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { createPostgresStorage } from '../../dist/storage/index.js';

test('mandatory real PostgreSQL lifecycle CLI uses a separate disposable database', async () => {
  let url;
  try {
    url = new URL(process.env.ERP_TEST_DATABASE_URL);
  } catch {
    throw new Error('ERP_TEST_DATABASE_URL is required for the real PostgreSQL CLI suite.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'A PostgreSQL test URI is required.');
  assert.ok(['127.0.0.1', '::1'].includes(host), 'CLI test runtime must use a literal loopback host.');
  const base = {
    host, port: Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)), ssl: false,
  };
  assert.ok([base.user, base.password, base.database].every((value) => value && !value.includes('\0')),
    'Explicit test user, password and database are required.');
  const pool = new pg.Pool({ ...base, max: 1, connectionTimeoutMillis: 5000 });
  const database = `erp_cli_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let storage;
  try {
    const identity = await pool.query("SELECT current_setting('server_version_num')::integer AS version, host(inet_server_addr()) AS host");
    assert.ok(identity.rows[0].version >= 180000 && identity.rows[0].version < 190000);
    assert.equal(identity.rows[0].host, host);
    await pool.query(`CREATE DATABASE "${database}"`);
    created = true;
    const target = new URL(url);
    target.pathname = `/${database}`;
    target.search = '';
    target.hash = '';
    const script = resolve(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'storage-admin.mjs');
    for (const action of ['migrate', 'migrate', 'verify', 'provision']) {
      const args = [script, action, '--provider', 'postgres', '--no-tls-loopback'];
      if (action === 'provision') args.push('--tenant', 'T1', '--book', 'B1', '--company', 'C1');
      const result = spawnSync(process.execPath, args, {
        env: { ...process.env, ERP_TARGET_DATABASE_URL: target.href },
        encoding: 'utf8',
        timeout: 130_000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.action, action);
      assert.equal(output.provider, 'postgres');
    }
    storage = createPostgresStorage({ ...base, database });
    await storage.verifySchema();
    const scope = { level: 'company', tenantId: 'T1', bookId: 'B1', companyId: 'C1' };
    assert.equal(await storage.read(scope, (session) => session.revisions.get(scope)), 0);
  } finally {
    try {
      if (storage) await storage.close();
      if (created) await pool.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      await pool.end();
    }
  }
});

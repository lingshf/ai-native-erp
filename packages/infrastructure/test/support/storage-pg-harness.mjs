import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPostgresStorage } from '../../dist/storage/index.js';
import { postgresBackend } from '../../dist/storage/postgres.js';

export function postgresTestConfig() {
  const explicit = process.env.ERP_TEST_DATABASE_URL;
  if (typeof explicit !== 'string' || explicit.length === 0) {
    throw new Error('Mandatory real PostgreSQL test configuration is absent. Use the managed database runner.');
  }
  try {
    const url = new URL(explicit);
    const port = Number(url.port);
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      !url.port || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !user || !password || !database || database.includes('/') || url.hash ||
      [...url.searchParams].some(([name, value]) => name !== 'sslmode' || value !== 'disable')) throw new Error();
    return { host: url.hostname, port, user, password, database, ssl: false };
  } catch {
    throw new Error('Invalid explicit loopback PostgreSQL test configuration.');
  }
}

export async function pgHarness() {
  const config = postgresTestConfig();
  const admin = new Client({ ...config, connectionTimeoutMillis: 1000 });
  try { await admin.connect(); } catch {
    try { await admin.end(); } finally { throw new Error('Mandatory real PostgreSQL preflight or cleanup failed.'); }
  }
  const fixtures = new Set();
  try {
    const { rows } = await admin.query("SELECT current_setting('server_version_num') AS version,host(inet_server_addr()) AS address");
    const version = Number(rows[0].version);
    assert.ok(version >= 180000 && version < 190000, 'PostgreSQL 18 is mandatory');
    assert.equal(rows[0].address, '127.0.0.1');
  } catch (error) { await admin.end(); throw error; }
  return {
    async fixture() {
      const name = `erp_m02_${process.pid}_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
      const connection = { ...config, database: name };
      const storage = createPostgresStorage(connection);
      const backend = postgresBackend(connection);
      let raw;
      let ended = false;
      const extra = [];
      const f = {
        storage, backend, config: connection, dialect: 'postgres',
        async raw(text, parameters = []) {
          if (!raw) {
            raw = new Client({ ...connection, connectionTimeoutMillis: 1000 });
            try { await raw.connect(); }
            catch { throw new Error('Dedicated PostgreSQL fixture connection failed.'); }
          }
          let index = 0;
          try { return (await raw.query(text.replaceAll('?', () => `$${++index}`), parameters)).rows; }
          catch (error) {
            const safe = new Error('Dedicated PostgreSQL fixture statement failed.');
            if (typeof error?.code === 'string' && /^[A-Z0-9]{5}$/u.test(error.code)) safe.code = error.code;
            throw safe;
          }
        },
        sibling() {
          const other = createPostgresStorage(connection);
          extra.push(other);
          return other;
        },
        async close() {
          if (ended) return;
          ended = true;
          let failed = false;
          try {
            const results = await Promise.allSettled([
              ...extra.map((s) => s.close()), backend.close(), storage.close(), raw?.end(),
            ]);
            failed = results.some((result) => result.status === 'rejected');
          } finally {
            try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
            catch { failed = true; }
            fixtures.delete(f);
          }
          if (failed) throw new Error('Dedicated PostgreSQL fixture cleanup failed.');
        },
      };
      fixtures.add(f);
      return f;
    },
    async close() {
      let failed = false;
      try {
        const results = await Promise.allSettled([...fixtures].map((f) => f.close()));
        failed = results.some((result) => result.status === 'rejected');
      } finally { await admin.end(); }
      if (failed) throw new Error('Dedicated PostgreSQL harness cleanup failed.');
    },
  };
}

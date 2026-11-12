import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPostgresStorage } from '../../dist/storage/index.js';
import { postgresBackend } from '../../dist/storage/postgres.js';

function safeFailure(role, phase, error) {
  const safe = new Error(`Dedicated PostgreSQL ${role} ${phase} failed.`);
  const code = error?.code;
  if (typeof code === 'string' &&
    (/^[A-Z0-9]{5}$/u.test(code) || ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT'].includes(code))) {
    safe.code = code;
  }
  return safe;
}

export function guardedPgClient(config, role) {
  if (!['admin', 'fixture'].includes(role)) throw new Error('Invalid PostgreSQL harness role.');
  const client = new Client({ ...config, connectionTimeoutMillis: 1000 });
  let phase = 'connect';
  let closing = false;
  let failure;
  let disconnected;
  const failed = new Promise((resolve) => { disconnected = resolve; });
  const remember = (error) => {
    failure ??= safeFailure(role, phase, error);
    disconnected(failure);
  };
  // Keep these listeners through socket shutdown: pg may emit an error and a
  // later unexpected-end error even when no query promise is outstanding.
  client.on('error', remember);
  client.on('end', () => { if (!closing) remember(); });
  return {
    failed,
    async connect() {
      try {
        await client.connect();
        if (failure) throw failure;
        phase = 'idle';
      } catch (error) {
        remember(error);
        throw failure;
      }
    },
    async query(text, parameters = []) {
      if (failure) throw failure;
      phase = 'query';
      try {
        const result = await client.query(text, parameters);
        if (failure) throw failure;
        return result;
      } catch (error) {
        throw failure ?? safeFailure(role, phase, error);
      } finally { phase = 'idle'; }
    },
    async end() {
      closing = true;
      phase = 'close';
      try { await client.end(); } catch (error) { remember(error); }
      if (failure) throw failure;
    },
  };
}

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
  const admin = guardedPgClient(config, 'admin');
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
            raw = guardedPgClient(connection, 'fixture');
            await raw.connect();
          }
          let index = 0;
          return (await raw.query(text.replaceAll('?', () => `$${++index}`), parameters)).rows;
        },
        rawFailure() {
          if (!raw) throw new Error('Dedicated PostgreSQL fixture connection is not open.');
          return raw.failed;
        },
        sibling() {
          const other = createPostgresStorage(connection);
          extra.push(other);
          return other;
        },
        async close() {
          if (ended) return;
          ended = true;
          let failure;
          try {
            const results = await Promise.allSettled([
              ...extra.map((s) => s.close()), backend.close(), storage.close(), raw?.end(),
            ]);
            failure = results.find((result) => result.status === 'rejected')?.reason;
          } finally {
            try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
            catch (error) { failure ??= error; }
            fixtures.delete(f);
          }
          if (failure) throw failure;
        },
      };
      fixtures.add(f);
      return f;
    },
    async close() {
      let failure;
      try {
        const results = await Promise.allSettled([...fixtures].map((f) => f.close()));
        failure = results.find((result) => result.status === 'rejected')?.reason;
      } finally {
        try { await admin.end(); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
    },
  };
}

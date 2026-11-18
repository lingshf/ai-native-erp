import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { extendedContract, plan, scope, storageContract } from './support/storage-contract.mjs';
import { createSqliteStorage } from '../dist/storage/index.js';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { sqliteBackend } from '../dist/storage/sqlite.js';
import { rawContract } from './support/storage-raw-contract.mjs';
import { sqliteCases } from './support/storage-sqlite-cases.mjs';

test('SQLite real target contract', async (t) => {
  const directory = resolve('.storage-test-fixtures', `sqlite-${process.pid}`);
  await mkdir(directory, { recursive: true });
  let serial = 0;
  try {
    const create = async () => createSqliteStorage({
      filename: resolve(directory, `target-${serial++}.sqlite`),
    });
    await storageContract(t, create);
    await extendedContract(t, create);
    await rawContract(t, async () => {
      const config = { filename: resolve(directory, `raw-${serial++}.sqlite`) };
      const storage = createSqliteStorage(config);
      const backend = sqliteBackend(config);
      let raw;
      return {
        storage, backend,
        bytes: () => Promise.all([readFile(config.filename), readFile(`${config.filename}-wal`)]),
        async raw(text, parameters = []) {
          raw ??= new Database(config.filename);
          raw.defaultSafeIntegers(true);
          raw.pragma('foreign_keys=ON');
          const query = raw.prepare(text);
          return query.reader ? query.all(...parameters) : (query.run(...parameters), []);
        },
        async close() { raw?.close(); await backend.close(); await storage.close(); },
      };
    });
    await sqliteCases(t, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing DELETE target waits for a short reader before its first WAL switch', { timeout: 10000 }, async () => {
  const directory = resolve('.storage-test-fixtures', `sqlite-wal-switch-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const config = { filename: resolve(directory, 'target.sqlite') };
  const storage = createSqliteStorage(config);
  let child;
  let exited;
  let stderr = '';
  try {
    const seed = createSqliteStorage(config);
    try { await seed.migrate(); await seed.provision(scope); } finally { await seed.close(); }
    const raw = new Database(config.filename);
    try { assert.equal(raw.pragma('journal_mode=DELETE', { simple: true }), 'delete'); }
    finally { raw.close(); }
    // A separate process can release the read lock during the parent's synchronous busy wait.
    child = spawn(process.execPath, ['--input-type=module', '-e', `
      import Database from 'better-sqlite3';
      const database = new Database(process.argv[1], { readonly: true });
      database.exec('BEGIN');
      database.prepare('SELECT revision FROM companies').all();
      process.once('message', () => setTimeout(() => {
        database.exec('ROLLBACK');
        database.close();
        process.disconnect();
      }, 300));
      process.send('locked');
    `, config.filename], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    exited = once(child, 'exit');
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    assert.equal((await once(child, 'message', { signal: AbortSignal.timeout(5000) }))[0], 'locked');
    child.send('release');
    let callbacks = 0;
    await storage.write(plan, (session) => {
      callbacks++;
      return session.revisions.advance(scope, 0);
    });
    assert.deepEqual(await exited, [0, null], stderr);
    assert.equal(callbacks, 1);
    assert.equal(await storage.read(scope, (session) => session.revisions.get(scope)), 1);
    const check = new Database(config.filename, { readonly: true });
    try { assert.equal(check.pragma('journal_mode', { simple: true }), 'wal'); }
    finally { check.close(); }
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (exited) await exited;
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import { extendedContract, storageContract } from './support/storage-contract.mjs';
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

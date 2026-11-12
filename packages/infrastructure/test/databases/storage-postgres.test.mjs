import { test } from 'node:test';
import { storageContract, extendedContract } from '../support/storage-contract.mjs';
import { rawContract } from '../support/storage-raw-contract.mjs';
import { pgHarness } from '../support/storage-pg-harness.mjs';
import { postgresCases } from '../support/storage-postgres-cases.mjs';

test('mandatory real PostgreSQL 18 target contract', async (t) => {
  const harness = await pgHarness();
  const fixture = () => harness.fixture();
  const create = async () => (await fixture()).storage;
  try {
    await storageContract(t, create);
    await extendedContract(t, create);
    await rawContract(t, fixture);
    await postgresCases(t, fixture);
  } finally { await harness.close(); }
});

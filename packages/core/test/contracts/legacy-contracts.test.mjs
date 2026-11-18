import test from 'node:test';
import assert from 'node:assert/strict';
import {
  legacyContextSchema, legacyTrialSchema, legacyLedgerSchema,
  legacyTrialQuerySchema, legacyLedgerQuerySchema, openApiDocument,
} from '../../src/contracts/index.ts';

const source = { sourceKind: 'verified-teaching-snapshot', baseline: 'M00-verified-snapshot',
  live: false, snapshotSha256: 'a'.repeat(64), snapshotBytes: 4096, scale: 2 };
const query = { snapshot: source.snapshotSha256, month: '2026-01' };
const balance = { rows: [{ code: '1000', name: 'Fictional account', category: 'ASSET',
  debit: Number.MAX_SAFE_INTEGER, credit: 0 }], debit: Number.MAX_SAFE_INTEGER, credit: 0 };
const trial = { contractVersion: '1', source, month: query.month,
  trialBalances: { unadjusted: balance, adjusted: balance, postClosing: balance } };
const ledger = { contractVersion: '1', source, month: query.month, account: '1000',
  opening: -Number.MAX_SAFE_INTEGER, closing: -1, debit: Number.MAX_SAFE_INTEGER, credit: 1,
  totalEntries: 1, entries: [{ id: 1, lineId: 2, date: '2026-01-15', memo: 'Fictional entry',
    kind: 'normal', reversal_of: null, source_kind: null, account: '1000',
    debit: Number.MAX_SAFE_INTEGER, credit: 1, balance: -1, dimensions: { TEAM: 'A' } }] };

test('legacy query contracts reject unknown, duplicate and noncanonical inputs before conversion', () => {
  for (const month of ['1900-01', '2026-01', '9998-12']) {
    assert.equal(legacyTrialQuerySchema.parse({ ...query, month }).month, month);
  }
  for (const limit of ['1', '100']) {
    assert.equal(legacyLedgerQuerySchema.parse({ ...query, account: '1000', limit }).limit, limit);
  }
  for (const invalid of [
    { ...query, stage: 'adjusted' }, { ...query, month: ['2026-01', '2026-02'] },
    { ...query, month: '1899-12' }, { ...query, month: '9999-01' },
    { ...query, month: '2026-13' }, { ...query, snapshot: 'A'.repeat(64) },
  ]) assert.equal(legacyTrialQuerySchema.safeParse(invalid).success, false);
  for (const invalid of [
    { ...query, account: '0000' }, { ...query, account: '10000' },
    ...['0', '101', '01', '1.0', '1e2', '+1', ' 1', '1\n', '1\r\n', '1\u2028']
      .map(limit => ({ ...query, account: '1000', limit })),
    { ...query, account: '1000', limit: 1 }, { ...query, account: '1000', stage: 'adjusted' },
    { ...query, account: '1000', cursor: '' }, { ...query, account: '1000', cursor: 'a'.repeat(1025) },
    { ...query, account: '1000', cursor: 'YQ\n' }, { ...query, account: '1000', cursor: 'YQ\u2028' },
  ]) assert.equal(legacyLedgerQuerySchema.safeParse(invalid).success, false);
});

test('legacy DTOs preserve exact signed minor amounts and reject invented scope or malformed nested data', () => {
  const context = { contractVersion: '1', source, periods: [{ month: '2026-01', status: 'closed' }] };
  assert.deepEqual(legacyContextSchema.parse(context), context);
  assert.deepEqual(legacyTrialSchema.parse(trial), trial);
  assert.deepEqual(legacyLedgerSchema.parse(ledger), ledger);
  assert.equal(legacyContextSchema.safeParse({ ...context, companyId: 'invented' }).success, false);
  assert.equal(legacyContextSchema.safeParse({ ...context, periods: [{ month: '2026-01', status: 'pending' }] }).success, false);
  assert.equal(legacyTrialSchema.safeParse({ ...trial, source: { ...source, live: true } }).success, false);
  assert.equal(legacyLedgerSchema.safeParse({ ...ledger, entries: [{ ...ledger.entries[0], internal: 'extra' }] }).success, false);
  for (const invalid of [0.01, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(legacyLedgerSchema.safeParse({ ...ledger, closing: invalid }).success, false);
  }
  assert.equal(legacyLedgerSchema.safeParse({ ...ledger, entries: [{ ...ledger.entries[0], lineId: 0 }] }).success, false);
});

test('legacy OpenAPI publishes strict query parameters and all explicit financial response statuses', () => {
  for (const operation of ['context', 'trial', 'ledger']) {
    const get = openApiDocument.paths[`/api/v1/legacy/${operation}`].get;
    for (const status of [200, 400, 403, 404, 405, 409, 415, 500, 503]) {
      assert.ok(get.responses[status], `${operation} ${status}`);
    }
    const parameters = get.parameters ?? [];
    assert.deepEqual(parameters.filter(value => value.required).map(value => value.name),
      operation === 'context' ? [] : operation === 'trial' ? ['snapshot', 'month'] : ['snapshot', 'month', 'account']);
    assert.equal(parameters.some(value => value.name === 'stage' || value.name === 'directory'), false);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LegacyTeachingQueryService } from '@erp/core/application';
import { legacyContextSchema, legacyTrialSchema, legacyLedgerSchema } from '../../core/src/contracts/index.ts';
import { openLegacyTeachingSnapshot } from '../src/legacy/teaching.ts';
import { legacyFixture, captureDirectory, metadataFor } from './support/legacy-fixture.mjs';

test('real snapshot periods retain closed history, sorted months and exact bytes', t => {
  const f = legacyFixture(t, { history: true });
  const before = captureDirectory(f.directory);
  const reader = openLegacyTeachingSnapshot(f.config);
  f.readers.push(reader);
  assert.deepEqual(reader.periods(), [
    { month: '2026-01', status: 'closed' },
    { month: '2026-02', status: 'closed' },
    { month: '2026-03', status: 'open' },
  ]);
  reader.close();
  assert.throws(() => reader.periods(), { code: 'CLOSED' });
  assert.deepEqual(captureDirectory(f.directory), before);
});

test('invalid persisted period is a snapshot failure rather than a guessed current month', t => {
  const f = legacyFixture(t);
  const db = new DatabaseSync(f.snapshot);
  try { db.prepare('UPDATE periods SET month=?').run('invalid'); } finally { db.close(); }
  const before = captureDirectory(f.directory);
  const reader = openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target));
  f.readers.push(reader);
  assert.throws(() => reader.periods(), { code: 'INVALID_SNAPSHOT' });
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test('real application projections satisfy every HTTP schema across an exact 100-row page boundary', t => {
  const f = legacyFixture(t, { many: true });
  const before = captureDirectory(f.directory);
  const reader = openLegacyTeachingSnapshot(f.config);
  f.readers.push(reader);
  const service = new LegacyTeachingQueryService(reader);
  const sha = reader.info.snapshotSha256;
  const context = legacyContextSchema.parse({ contractVersion: '1', ...service.context() });
  assert.equal(context.source.snapshotSha256, sha);
  assert.deepEqual(context.periods, [{ month: '2026-01', status: 'open' }]);
  const trial = legacyTrialSchema.parse({ contractVersion: '1', ...service.trial(sha, f.month) });
  assert.deepEqual(trial.trialBalances, f.book.reports(f.month).trialBalances);
  const first = legacyLedgerSchema.parse({ contractVersion: '1',
    ...service.ledger(sha, { month: f.month, account: '1000', limit: 100 }) });
  assert.equal(first.entries.length, 100);
  assert.ok(first.nextCursor);
  const second = legacyLedgerSchema.parse({ contractVersion: '1',
    ...service.ledger(sha, { month: f.month, account: '1000', limit: 100, cursor: first.nextCursor }) });
  assert.equal(first.entries.length + second.entries.length, first.totalEntries);
  assert.equal(second.nextCursor, undefined);
  assert.equal(second.closing, first.closing);
  assert.equal(second.debit, first.debit);
  assert.equal(second.credit, first.credit);
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { verifyLedgerSnapshot } from '../../../scripts/ledger-snapshot.mjs';
import { openLegacyTeachingSnapshot } from '../dist/legacy-teaching.js';
import * as legacyBridge from '../dist/legacy-teaching.js';
import { checkedMinor, DomainError, projectTrialBalances, projectTeachingLedger } from '@erp/domain';
import { legacyFixture, captureDirectory, metadataFor } from './support/legacy-fixture.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  assert.equal(error.name, 'StorageError');
  assert.ok(!error.message.includes('.sqlite') && !error.message.includes('SELECT'));
  return true;
};
const open = fixture => {
  const reader = openLegacyTeachingSnapshot(fixture.config);
  fixture.readers.push(reader);
  return reader;
};

test('bridge rejects absent/unverified/empty/directory inputs instead of creating or seeding', t => {
  const f = legacyFixture(t);
  for (const config of [undefined, {}, { directory: f.target }, { ...f.config, verifiedManifest: {} },
    { ...f.config, directory: join(f.directory, 'absent') }]) {
    assert.throws(() => openLegacyTeachingSnapshot(config), code('INVALID_SNAPSHOT'));
  }
  fs.writeFileSync(join(f.directory, 'empty'), '');
  assert.throws(() => openLegacyTeachingSnapshot({ ...f.config, directory: join(f.directory, 'empty') }),
    code('INVALID_SNAPSHOT'));
  assert.equal(fs.existsSync(join(f.directory, 'absent')), false);
});

test('real M00 WAL snapshot preserves committed data, all hashes/names and draft ID3', t => {
  const f = legacyFixture(t, { wal: true });
  assert.deepEqual([...fs.readFileSync(f.teaching).subarray(18, 20)], [2, 2]);
  const before = captureDirectory(f.directory);
  const reader = open(f);
  assert.equal(reader.info.sourceKind, 'verified-teaching-snapshot');
  assert.equal(reader.info.live, false);
  assert.equal(reader.info.snapshotSha256, f.manifest.ledgers.teaching.sha256);
  assert.deepEqual(reader.trialBalances(f.month).trialBalances, f.book.reports(f.month).trialBalances);
  assert.deepEqual(f.manifest.ledgers.teaching.journals.find(row => row.id === 3),
    { id: 3, status: 'draft' });
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test('explicit verifier then bridge consumption preserves source WAL/SHM and snapshot bytes after setup', t => {
  const f = legacyFixture(t, { wal: true });
  // M00 creation and its bounded, pinned-source setup are finished before this baseline.
  const before = captureDirectory(f.directory);
  const manifest = verifyLedgerSnapshot(f.target);
  assert.deepEqual(captureDirectory(f.directory), before);
  const reader = openLegacyTeachingSnapshot({ directory: f.target, verifiedManifest: manifest });
  f.readers.push(reader);
  assert.equal(reader.info.snapshotSha256, manifest.ledgers.teaching.sha256);
  assert.equal(reader.trialBalances(f.month).month, f.month);
  assert.ok(reader.ledger({ month: f.month, account: '1000' }).entries.length > 0);
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test('non-SQL preflight validates both fixed M00 snapshot files without creating sidecars', t => {
  const f = legacyFixture(t);
  const preflight = legacyBridge.preflightLegacySnapshotPair;
  assert.equal(typeof preflight, 'function');
  const pristine = captureDirectory(f.directory);
  assert.equal(preflight(f.target), undefined);
  assert.deepEqual(captureDirectory(f.directory), pristine);
  for (const filename of ['teaching.sqlite', 'erp.sqlite']) {
    const file = join(f.target, filename), original = fs.readFileSync(file);
    const walHeader = Buffer.from(original); walHeader[18] = 2; walHeader[19] = 2;
    fs.writeFileSync(file, walHeader);
    const before = captureDirectory(f.directory);
    assert.throws(() => preflight(f.target), code('INVALID_SNAPSHOT'));
    assert.deepEqual(captureDirectory(f.directory), before);
    fs.writeFileSync(file, original);
    for (const suffix of ['-wal', '-shm', '-journal']) {
      fs.writeFileSync(file + suffix, '');
      const withSidecar = captureDirectory(f.directory);
      assert.throws(() => preflight(f.target), code('INVALID_SNAPSHOT'));
      assert.deepEqual(captureDirectory(f.directory), withSidecar);
      fs.unlinkSync(file + suffix);
    }
    fs.writeFileSync(file, '');
    assert.throws(() => preflight(f.target), code('INVALID_SNAPSHOT'));
    fs.unlinkSync(file);
    assert.throws(() => preflight(f.target), code('INVALID_SNAPSHOT'));
    fs.mkdirSync(file);
    assert.throws(() => preflight(f.target), code('INVALID_SNAPSHOT'));
    fs.rmdirSync(file);
    fs.writeFileSync(file, original);
  }
  const alias = join(f.directory, 'preflight-alias');
  fs.symlinkSync(f.target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => preflight(alias), code('INVALID_SNAPSHOT'));
  fs.unlinkSync(alias);
  assert.throws(() => preflight(join(f.directory, 'missing')), code('INVALID_SNAPSHOT'));
  assert.deepEqual(captureDirectory(f.directory), pristine);
});

test('all three TB stages and whole-month ledger match old oracle across closing and reversals', t => {
  const f = legacyFixture(t, { history: true });
  const before = captureDirectory(f.directory);
  const reader = open(f);
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    assert.deepEqual(reader.trialBalances(month), { month, trialBalances: f.book.reports(month).trialBalances });
    for (const account of f.book.accounts()) {
      const actual = reader.ledger({ month, account: account.code, limit: 100 });
      assert.deepEqual({ account: actual.account, month: actual.month, opening: actual.opening,
        closing: actual.closing, entries: actual.entries.map(({ lineId, ...row }) => row) },
      f.book.ledger(account.code, month));
    }
  }
  const feb = reader.trialBalances('2026-02').trialBalances;
  assert.notDeepEqual(feb.unadjusted, feb.adjusted);
  assert.notDeepEqual(feb.adjusted, feb.postClosing);
  const disabled = reader.ledger({ month: '2026-02', account: '1100' });
  assert.equal(disabled.entries[0].dimensions.TEAM, 'A');
  assert.equal(disabled.closing, 725);
  const complete = reader.ledger({ month: '2026-02', account: '1000', limit: 100 });
  const entries = [];
  let cursor;
  do {
    const page = reader.ledger({ month: '2026-02', account: '1000', limit: 1, cursor });
    assert.equal(page.opening, complete.opening);
    assert.equal(page.closing, complete.closing);
    assert.equal(page.debit, complete.debit);
    assert.equal(page.credit, complete.credit);
    assert.equal(page.totalEntries, complete.totalEntries);
    entries.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(entries, complete.entries);
  assert.ok(reader.ledger({ month: f.month, account: '4000' }).entries.some(row => row.kind === 'closing'));
  assert.ok(entries.some(row => row.kind === 'reversal' && row.source_kind === 'adjusting'));
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test('strict cursors bind digest/account/month and a real stable position; requests reject unknowns', t => {
  const f = legacyFixture(t, { history: true }), reader = open(f);
  const first = reader.ledger({ month: f.month, account: '1000', limit: 1 });
  assert.ok(first.nextCursor);
  const parsed = JSON.parse(Buffer.from(first.nextCursor, 'base64url'));
  for (const cursor of ['', '!', 'x'.repeat(1025), first.nextCursor + '=',
    Buffer.from(JSON.stringify({ ...parsed, lineId: 999999 })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...parsed, extra: true })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...parsed, date: '2026-02-31' })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...parsed, journalId: Number.MAX_SAFE_INTEGER + 1 })).toString('base64url'),
    Buffer.from(JSON.stringify(parsed).replace('"lineId":', '"lineId":1,"lineId":')).toString('base64url')]) {
    assert.throws(() => reader.ledger({ month: f.month, account: '1000', cursor }), code('INVALID_CURSOR'));
  }
  assert.throws(() => reader.ledger({ month: f.month, account: '1100', cursor: first.nextCursor }),
    code('INVALID_CURSOR'));
  assert.throws(() => reader.ledger({ month: '2026-03', account: '1000', cursor: first.nextCursor }),
    code('INVALID_CURSOR'));
  const other = legacyFixture(t);
  assert.throws(() => open(other).ledger({ month: '2026-01', account: '1000', cursor: first.nextCursor }),
    code('INVALID_CURSOR'));
  for (const month of ['2026-00', '2026-13', '1899-12', '2026-01\n', null]) {
    assert.throws(() => reader.trialBalances(month), code('INVALID_INPUT'));
  }
  assert.throws(() => reader.trialBalances('2027-01'), code('NOT_FOUND'));
  assert.throws(() => reader.ledger({ month: f.month, account: '9999' }), code('NOT_FOUND'));
  for (const limit of [0, 101, 1.1, '1']) {
    assert.throws(() => reader.ledger({ month: f.month, account: '1000', limit }), code('INVALID_INPUT'));
  }
  reader.close(); reader.close();
  assert.throws(() => reader.trialBalances(f.month), code('CLOSED'));
  assert.throws(() => reader.ledger({ month: f.month, account: '1000' }), code('CLOSED'));
});

test('changed verified bytes, WAL headers/sidecars and symlink ancestors fail without writes', t => {
  const f = legacyFixture(t);
  const original = fs.readFileSync(f.snapshot);
  fs.appendFileSync(f.snapshot, 'changed after verify');
  assert.throws(() => open(f), code('INVALID_SNAPSHOT'));
  fs.writeFileSync(f.snapshot, original);
  const active = legacyFixture(t, { wal: true });
  assert.throws(() => openLegacyTeachingSnapshot({ directory: active.directory,
    verifiedManifest: { ...active.manifest, ledgers: { teaching: { ...active.manifest.ledgers.teaching,
      file: 'source-teaching.sqlite' } } } }), code('INVALID_SNAPSHOT'));
  const walHeader = Buffer.from(original); walHeader[18] = 2; walHeader[19] = 2;
  fs.writeFileSync(f.snapshot, walHeader);
  const beforeHeaderRejection = captureDirectory(f.directory);
  assert.throws(() => openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target)), code('INVALID_SNAPSHOT'));
  assert.deepEqual(captureDirectory(f.directory), beforeHeaderRejection);
  fs.writeFileSync(f.snapshot, original);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.writeFileSync(f.snapshot + suffix, '');
    const before = captureDirectory(f.directory);
    assert.throws(() => open(f), code('INVALID_SNAPSHOT'));
    assert.deepEqual(captureDirectory(f.directory), before);
    fs.unlinkSync(f.snapshot + suffix);
  }
  const alias = join(f.directory, 'alias');
  fs.symlinkSync(f.target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => openLegacyTeachingSnapshot({ ...f.config, directory: alias }), code('INVALID_SNAPSHOT'));
  fs.unlinkSync(alias);
  fs.unlinkSync(f.snapshot);
  fs.mkdirSync(f.snapshot);
  assert.throws(() => open(f), code('INVALID_SNAPSHOT'));
  fs.rmdirSync(f.snapshot);
  fs.writeFileSync(f.snapshot, '');
  assert.throws(() => open(f), code('INVALID_SNAPSHOT'));
  fs.writeFileSync(f.snapshot, original);
});

test('schema and foreign-key corruption are classified, not empty-data reports', t => {
  const f = legacyFixture(t);
  const original = fs.readFileSync(f.snapshot);
  let db = new DatabaseSync(f.snapshot);
  db.exec('DROP TABLE line_dimensions'); db.close();
  assert.throws(() => openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target)), code('SCHEMA_MISMATCH'));
  for (const columns of [
    'line_id TEXT,dimension TEXT,value TEXT,PRIMARY KEY(line_id,dimension)',
    'line_id INTEGER,dimension TEXT,value TEXT',
    'line_id INTEGER,dimension TEXT,value TEXT,PRIMARY KEY(line_id,dimension)',
  ]) {
    fs.writeFileSync(f.snapshot, original);
    db = new DatabaseSync(f.snapshot);
    db.exec(`DROP TABLE line_dimensions; CREATE TABLE line_dimensions(${columns})`); db.close();
    assert.throws(() => openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target)), code('SCHEMA_MISMATCH'));
  }
  const g = legacyFixture(t);
  db = new DatabaseSync(g.snapshot);
  db.exec("PRAGMA foreign_keys=OFF; DROP TRIGGER immutable_line_insert; INSERT INTO lines VALUES(99999,99999,'1000',1,0)");
  db.close();
  assert.throws(() => openLegacyTeachingSnapshot(metadataFor(g.snapshot, g.target)), code('INVALID_SNAPSHOT'));
});

test('bridge maps exact safe-integer limits and cumulative overflows without rounding', t => {
  const f = legacyFixture(t);
  const db = new DatabaseSync(f.snapshot);
  db.exec(`DROP TRIGGER immutable_line_update;
    UPDATE lines SET debit=9007199254740991 WHERE id=1;
    UPDATE lines SET credit=9007199254740991 WHERE id=2`);
  db.close();
  const reader = openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target));
  f.readers.push(reader);
  assert.throws(() => reader.trialBalances(f.month), code('OVERFLOW'));
  assert.throws(() => reader.ledger({ month: f.month, account: '1000' }), code('OVERFLOW'));
  reader.close();
  const again = new DatabaseSync(f.snapshot);
  again.exec('UPDATE lines SET debit=9007199254740992 WHERE id=1');
  again.close();
  const unsafe = openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target));
  f.readers.push(unsafe);
  assert.throws(() => unsafe.trialBalances(f.month), code('OVERFLOW'));
});

test('corrupt stored projections report INVALID_SNAPSHOT, not caller INVALID_INPUT or NOT_FOUND', t => {
  const f = legacyFixture(t);
  const original = fs.readFileSync(f.snapshot);
  for (const fault of ['movement', 'account']) {
    fs.writeFileSync(f.snapshot, original);
    const db = new DatabaseSync(f.snapshot);
    db.exec('PRAGMA foreign_keys=OFF');
    if (fault === 'movement') {
      db.exec(`DROP TRIGGER immutable_dimension_insert;
        DROP TRIGGER immutable_dimension_delete;
        DROP TRIGGER immutable_dimension_update;
        CREATE TABLE replacement_lines (
        id INTEGER PRIMARY KEY, journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        account TEXT NOT NULL REFERENCES accounts(code),
        debit INTEGER NOT NULL CHECK(typeof(debit)='integer' AND debit>=0),
        credit INTEGER NOT NULL CHECK(typeof(credit)='integer' AND credit>=0));
        INSERT INTO replacement_lines SELECT * FROM lines;
        DROP TABLE lines;
        ALTER TABLE replacement_lines RENAME TO lines;
        UPDATE lines SET credit=1 WHERE id=1`);
    } else {
      db.exec(`CREATE TABLE replacement_accounts (
        code TEXT COLLATE NOCASE PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL
          CHECK(category IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')));
        INSERT INTO replacement_accounts SELECT * FROM accounts;
        DROP TABLE accounts;
        ALTER TABLE replacement_accounts RENAME TO accounts;
        DROP TRIGGER immutable_line_update;
        INSERT INTO accounts VALUES('AbCd','Corrupt account case alias','ASSET');
        UPDATE lines SET account='ABCD' WHERE id=1`);
    }
    db.close();
    const reader = openLegacyTeachingSnapshot(metadataFor(f.snapshot, f.target));
    f.readers.push(reader);
    assert.throws(() => reader.trialBalances(f.month), code('INVALID_SNAPSHOT'));
    if (fault === 'movement') {
      assert.throws(() => reader.ledger({ month: f.month, account: '1000' }), code('INVALID_SNAPSHOT'));
    }
    assert.throws(() => reader.trialBalances('2026-13'), code('INVALID_INPUT'));
    assert.throws(() => reader.trialBalances('2027-01'), code('NOT_FOUND'));
    reader.close();
  }
});

test('100-row ledger page retains totals and resumes with original IDs', t => {
  const f = legacyFixture(t, { many: true }), reader = open(f);
  const first = reader.ledger({ month: f.month, account: '1000', limit: 100 });
  assert.equal(first.entries.length, 100);
  assert.ok(first.totalEntries > 100 && first.nextCursor);
  const last = reader.ledger({ month: f.month, account: '1000', limit: 100, cursor: first.nextCursor });
  assert.equal(last.nextCursor, undefined);
  assert.equal(last.closing, first.closing);
  assert.equal(last.debit, first.debit);
  assert.equal(last.credit, first.credit);
  assert.deepEqual([...first.entries, ...last.entries].map(({ lineId, ...row }) => row),
    f.book.ledger('1000', f.month).entries);
});

test('held shared snapshot blocks an explicit child writer, retains read version and releases on close', t => {
  const f = legacyFixture(t);
  // Hashing opens/closes the same file and would drop the reader's POSIX locks.
  const hashes = captureDirectory(f.directory);
  const reader = open(f);
  const before = reader.trialBalances(f.month);
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL('./support/legacy-writer.mjs', import.meta.url)), f.snapshot], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), 'BUSY');
  assert.deepEqual(reader.trialBalances(f.month), before);
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), hashes);
  const db = new DatabaseSync(f.snapshot);
  db.exec("UPDATE accounts SET name='Changed after close' WHERE code='1000'"); db.close();
  assert.throws(() => open(f), code('INVALID_SNAPSHOT'));
});

test('pure domain uses checked exact minor units and rejects unsafe intermediate balances and totals', () => {
  for (const scale of [0, 1, 2, 3, 4]) assert.equal(checkedMinor(9007199254740991n, scale), Number.MAX_SAFE_INTEGER);
  for (const value of [9007199254740992n, -9007199254740992n, 1.1, NaN, Infinity, '1']) {
    assert.throws(() => checkedMinor(value, 2), DomainError);
  }
  for (const scale of [-1, 5, 1.5]) assert.throws(() => checkedMinor(0, scale), DomainError);
  const accounts = [{ code: '1000', name: 'Fictional cash', category: 'ASSET' },
    { code: '1100', name: 'Fictional second asset', category: 'ASSET' }];
  const line = (account, debit, credit = 0) => ({ id: 1, lineId: 1, date: '2026-01-01', memo: 'F',
    kind: 'normal', reversal_of: null, source_kind: null, account, debit, credit });
  assert.throws(() => projectTrialBalances(accounts,
    [line('1000', Number.MAX_SAFE_INTEGER), line('1000', 1)], '2026-01'), DomainError);
  assert.throws(() => projectTrialBalances(accounts,
    [line('1000', Number.MAX_SAFE_INTEGER), line('1100', 1)], '2026-01'), DomainError);
  const limit = projectTeachingLedger([line('1000', Number.MAX_SAFE_INTEGER)], '1000', '2026-01');
  assert.equal(limit.closing, Number.MAX_SAFE_INTEGER);
  assert.equal(limit.debit, Number.MAX_SAFE_INTEGER);
  const negative = projectTeachingLedger([line('1000', 0, Number.MAX_SAFE_INTEGER)], '1000', '2026-01');
  assert.equal(negative.closing, -Number.MAX_SAFE_INTEGER);
  const cancellation = [line('1000', Number.MAX_SAFE_INTEGER),
    { ...line('1000', 0, Number.MAX_SAFE_INTEGER), lineId: 2 },
    { ...line('1000', 1), lineId: 3 }];
  assert.throws(() => projectTeachingLedger(cancellation, '1000', '2026-01'), DomainError);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Book } from '../src/book.mjs';
import { EnterpriseBook } from '../src/enterprise.mjs';
import { snapshotLedgers, verifyLedgerSnapshot, inspectLedger } from '../scripts/ledger-snapshot.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'ledger-pair-'));
  const teaching = join(dir, 'teaching.sqlite'), enterprise = join(dir, 'erp.sqlite');
  const old = new Book(teaching, { today: '2026-01-15' });
  old.save({ date: '2026-01-15', memo: 'Protected fictional draft', kind: 'normal',
    lines: [{ account: '1000', debit: '7.25', credit: '0' }, { account: '4000', debit: '0', credit: '7.25' }] });
  const erp = new EnterpriseBook(enterprise);
  erp.createCompany({ code: 'A', name: 'Fictional snapshot company', year: 2026,
    currency: 'EUR', scale: 2, reportCurrency: 'EUR', reportScale: 2, chartTemplate: 'STANDARD' });
  const command = { company: 'A', operation: 'journal', reference: 'SNAPSHOT',
    accountingDate: '2026-01-15', documentDate: '2026-01-15', taxDate: '2026-01-15', sourceRevision: 0,
    data: { memo: 'Fictional snapshot', kind: 'normal', currency: 'EUR',
      lines: [{ account: '1000', debit: '7.25', credit: '0' }, { account: '3000', debit: '0', credit: '7.25' }] } };
  const envelope = { command, token: erp.preview(command).token, confirmation: 'POST' };
  const accepted = erp.post(envelope);
  const connections = [];
  t.after(() => { for (const db of connections) db.close(); old.close(); erp.close(); fs.rmSync(dir, { recursive: true }); });
  return { dir, teaching, enterprise, old, erp, envelope, accepted, connections, target: join(dir, 'snapshot') };
}

test('pair snapshots preserve exact canonical fixture, draft, source bytes and ERP receipts', t => {
  const f = fixture(t);
  const before = [f.teaching, f.enterprise].map(path => fs.readFileSync(path));
  const sourceTeaching = inspectLedger(f.teaching, 'teaching');
  assert.equal(sourceTeaching.canonicalSha256, '43151F88FE8D1E7D8BD56E1ED3193F55218E5472FD728E8BA51F784D2F632915');
  const manifest = snapshotLedgers(f);
  assert.deepEqual(verifyLedgerSnapshot(f.target), manifest);
  assert.equal(manifest.ledgers.teaching.canonicalSha256, sourceTeaching.canonicalSha256);
  assert.deepEqual(manifest.ledgers.teaching.journals.find(row => row.id === 3), { id: 3, status: 'draft' });
  assert.deepEqual(manifest.ledgers.teaching.postedTotals, { debit: '1400000', credit: '1400000' });
  assert.deepEqual(manifest.ledgers.enterprise.logical, inspectLedger(f.enterprise, 'enterprise').logical);
  const restored = new EnterpriseBook(join(f.target, 'erp.sqlite'));
  try { assert.deepEqual(restored.post(f.envelope), f.accepted); }
  finally { restored.close(); }
  [f.teaching, f.enterprise].forEach((path, i) => assert.deepEqual(fs.readFileSync(path), before[i]));
  assert.equal(fs.existsSync(join(f.target, 'manifest.pending')), false);
});

test('existing output, missing parent, alias inputs and wrong schemas never overwrite', t => {
  const f = fixture(t);
  fs.mkdirSync(f.target); fs.writeFileSync(join(f.target, 'owned'), 'Preserve');
  assert.throws(() => snapshotLedgers(f), /exist/i);
  assert.equal(fs.readFileSync(join(f.target, 'owned'), 'utf8'), 'Preserve');
  assert.throws(() => snapshotLedgers({ ...f, target: join(f.dir, 'missing', 'new') }), /ENOENT/);
  assert.throws(() => snapshotLedgers({ ...f, teaching: f.enterprise, target: join(f.dir, 'bad-type') }));
  assert.throws(() => snapshotLedgers({ ...f, enterprise: f.teaching, target: join(f.dir, 'same-source') }), /distinct/i);
  const invalid = join(f.dir, 'invalid.sqlite'); fs.writeFileSync(invalid, 'Not SQLite');
  assert.throws(() => snapshotLedgers({ ...f, enterprise: invalid, target: join(f.dir, 'invalid-out') }));
  assert.equal(fs.existsSync(join(f.dir, 'invalid-out', 'manifest.json')), false);
});

test('symlink inputs and snapshot members are rejected', t => {
  const f = fixture(t), alias = join(f.dir, 'alias.sqlite');
  try { fs.symlinkSync(f.teaching, alias); }
  catch (error) {
    if (error.code !== 'EPERM') throw error;
    t.diagnostic('File symlinks unavailable; junction directory rejection is checked instead');
    const aliasDir = join(f.dir, 'alias-dir');
    fs.symlinkSync(f.dir, aliasDir, 'junction');
    assert.throws(() => snapshotLedgers({ ...f, teaching: join(aliasDir, 'teaching.sqlite') }), /symlink|symbolic/i);
    return;
  }
  assert.throws(() => snapshotLedgers({ ...f, teaching: alias }), /symlink|symbolic/i);
  snapshotLedgers(f);
  fs.unlinkSync(join(f.target, 'teaching.sqlite'));
  fs.symlinkSync(f.teaching, join(f.target, 'teaching.sqlite'));
  assert.throws(() => verifyLedgerSnapshot(f.target), /symlink|symbolic/i);
});

test('failure after VACUUM and before publication never leaves a success manifest', t => {
  const f = fixture(t);
  const original = fs.linkSync;
  t.mock.method(fs, 'linkSync', () => { throw new Error('Injected publication failure'); });
  try { assert.throws(() => snapshotLedgers(f), /Injected publication failure/); }
  finally { fs.linkSync = original; }
  assert.ok(fs.existsSync(join(f.target, 'teaching.sqlite')));
  assert.equal(fs.existsSync(join(f.target, 'manifest.json')), false);
  assert.throws(() => verifyLedgerSnapshot(f.target));
});

test('consumer rejects changed files, manifest fields and unsupported versions', t => {
  const f = fixture(t), manifest = snapshotLedgers(f), file = join(f.target, 'manifest.json');
  fs.appendFileSync(join(f.target, 'teaching.sqlite'), 'tampered');
  assert.throws(() => verifyLedgerSnapshot(f.target), /hash|digest|byte/i);
  fs.writeFileSync(file, JSON.stringify({ ...manifest, version: 99 }));
  assert.throws(() => verifyLedgerSnapshot(f.target), /manifest|version/i);
  fs.writeFileSync(file, JSON.stringify({ ...manifest, ledgers: { ...manifest.ledgers,
    teaching: { ...manifest.ledgers.teaching, file: '..\\outside.sqlite' } } }));
  assert.throws(() => verifyLedgerSnapshot(f.target), /manifest|file/i);
});

test('verification failure after publication revokes the success manifest', t => {
  const f = fixture(t), original = fs.linkSync;
  t.mock.method(fs, 'linkSync', (...args) => {
    original(...args);
    fs.appendFileSync(join(f.target, 'teaching.sqlite'), 'Injected post-publication corruption');
  });
  try { assert.throws(() => snapshotLedgers(f), /hash|digest|byte/i); }
  finally { fs.linkSync = original; }
  assert.equal(fs.existsSync(join(f.target, 'manifest.json')), false);
  assert.throws(() => verifyLedgerSnapshot(f.target));
});

test('pending-name cleanup failure also revokes the just-published success manifest', t => {
  const f = fixture(t), original = fs.unlinkSync;
  t.mock.method(fs, 'unlinkSync', file => {
    if (file === join(f.target, 'manifest.pending')) throw new Error('Injected pending-name failure');
    return original(file);
  });
  try { assert.throws(() => snapshotLedgers(f), /Injected pending-name failure/); }
  finally { fs.unlinkSync = original; }
  assert.equal(fs.existsSync(join(f.target, 'manifest.json')), false);
  assert.throws(() => verifyLedgerSnapshot(f.target));
});

test('WAL committed data, exact large integers, BLOBs and schema changes affect logical digest', t => {
  const f = fixture(t);
  const db = new DatabaseSync(f.teaching);
  f.connections.push(db);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE precision_test(value INTEGER, data BLOB);');
  const insert = db.prepare('INSERT INTO precision_test VALUES(?,?)');
  insert.run(9007199254740993n, Buffer.from([0, 255, 17]));
  const first = inspectLedger(f.teaching, 'teaching');
  insert.run(-9007199254740993n, Buffer.from([1]));
  const second = inspectLedger(f.teaching, 'teaching');
  assert.notEqual(first.logical.sha256, second.logical.sha256);
  const result = snapshotLedgers(f);
  assert.deepEqual(result.ledgers.teaching.logical, second.logical);
  db.exec('CREATE TRIGGER precision_no_delete BEFORE DELETE ON precision_test BEGIN SELECT RAISE(ABORT,\'immutable\'); END;');
  assert.notEqual(inspectLedger(f.teaching, 'teaching').logical.sha256, second.logical.sha256);
});

test('logical row hashing does not depend on insertion order or round unsafe integers', t => {
  const f = fixture(t), db = new DatabaseSync(f.teaching);
  f.connections.push(db);
  db.exec('CREATE TABLE exact_values(value INTEGER, data BLOB);');
  const insert = db.prepare('INSERT INTO exact_values VALUES(?,?)');
  insert.run(9007199254740993n, Buffer.from([255])); insert.run(12n, Buffer.from([1]));
  const first = inspectLedger(f.teaching, 'teaching').logical.sha256;
  db.exec('DELETE FROM exact_values');
  insert.run(12n, Buffer.from([1])); insert.run(9007199254740993n, Buffer.from([255]));
  assert.equal(inspectLedger(f.teaching, 'teaching').logical.sha256, first);
  db.exec('UPDATE exact_values SET value=9007199254740992 WHERE value=9007199254740993');
  assert.notEqual(inspectLedger(f.teaching, 'teaching').logical.sha256, first);
});

test('snapshot CLI returns only completion and digest, not paths or financial details', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/ledger-snapshot.mjs', import.meta.url)),
    '--teaching', f.teaching, '--enterprise', f.enterprise, '--target', f.target], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'verified');
  assert.match(output.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.stdout.includes(f.dir), false);
  assert.equal(result.stdout.includes('Fictional'), false);
  assert.equal(verifyLedgerSnapshot(f.target).version, 1);
});

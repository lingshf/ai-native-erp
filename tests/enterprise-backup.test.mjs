import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { EnterpriseBook } from '../src/enterprise.mjs';
import { copyEnterpriseBook } from '../scripts/enterprise-backup.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'erp-backup-test-')), source = join(dir, 'source.sqlite');
  const book = new EnterpriseBook(source);
  t.after(() => { book.close(); rmSync(dir, { recursive: true }); });
  const setup = new DatabaseSync(source);
  try { assert.equal(setup.prepare('PRAGMA journal_mode=WAL').get().journal_mode, 'wal'); }
  finally { setup.close(); }
  book.createCompany({ code: 'A', name: 'Isolated backup fixture', year: 2026,
    currency: 'EUR', scale: 2, reportCurrency: 'USD', reportScale: 2, chartTemplate: 'STANDARD' });
  book.configure({ company: 'A', kind: 'dimension', code: 'DEPT', expectedRevision: 0, active: true,
    data: { name: 'Department', from: '1900-01-01', to: '9998-12-31' } });
  book.configure({ company: 'A', kind: 'dimensionValue', code: 'DEPT:OPS', expectedRevision: 0, active: true,
    data: { dimension: 'DEPT', value: 'OPS', name: 'Operations', from: '1900-01-01', to: '9998-12-31' } });
  const command = reference => ({ company: 'A', operation: 'journal', reference,
    accountingDate: '2026-01-15', documentDate: '2026-01-10', taxDate: '2026-01-20', sourceRevision: 0,
    data: { memo: reference, kind: 'normal', currency: 'EUR',
      lines: [{ account: '1000', debit: '53.27', credit: '0', dimensions: { DEPT: 'OPS' } },
        { account: '3000', debit: '0', credit: '53.27', dimensions: { DEPT: 'OPS' } }] } });
  const input = command('ACCEPTED'), preview = book.preview(input);
  const envelope = { command: input, token: preview.token, confirmation: 'POST' };
  const accepted = book.post(envelope);
  assert.ok(statSync(source + '-wal').size > 0, 'Fixture must retain live WAL pages before backup');
  return { dir, source, book, command, envelope, accepted };
}

test('online backup metadata comes from its own snapshot and independent restore preserves receipts and dimensions', async t => {
  const { dir, source, book, command, envelope, accepted } = fixture(t);
  const pending = command('UNFINISHED'), pendingToken = book.preview(pending).token;
  const target = join(dir, 'backup.sqlite'), restoring = join(dir, 'restored.sqlite');
  const expected = book.integrity();
  const copying = copyEnterpriseBook({ source, target });
  const later = command('AFTER-SNAPSHOT');
  book.post({ command: later, token: book.preview(later).token, confirmation: 'POST' });
  const snapshot = await copying;
  assert.deepEqual(snapshot.integrity, expected);
  assert.match(snapshot.sha256, /^[a-f0-9]{64}$/);
  assert.ok(snapshot.bytes > 0);
  assert.equal(book.state('A', '2026-01').journals.total, 2);
  const cli = spawnSync(process.execPath,
    [fileURLToPath(new URL('../scripts/enterprise-backup.mjs', import.meta.url)), 'restore',
      '--source', target, '--target', restoring], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const restoredSummary = JSON.parse(cli.stdout);
  assert.equal(restoredSummary.action, 'restore');
  assert.deepEqual(restoredSummary.integrity, expected);
  const restored = new EnterpriseBook(restoring);
  try {
    assert.equal(restored.state('A', '2026-01').journals.total, 1);
    assert.deepEqual(restored.journal('A', accepted.journalIds[0]).lines,
      book.journal('A', accepted.journalIds[0]).lines);
    assert.deepEqual(restored.post(envelope), accepted);
    assert.throws(() => restored.post({ command: pending, token: pendingToken, confirmation: 'POST' }),
      error => error.status === 409);
    assert.deepEqual(restored.integrity(), expected);
  } finally { restored.close(); }
  assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('.erp-snapshot-')), []);
});

for (const contents of ['', 'Existing file must survive']) {
  test(`backup refuses an existing ${contents ? 'nonempty' : 'empty'} target without changing it`, async t => {
    const { dir, source } = fixture(t);
    const target = join(dir, 'existing.sqlite');
    writeFileSync(target, contents);
    await assert.rejects(copyEnterpriseBook({ source, target }), /already exists/i);
    assert.equal(readFileSync(target, 'utf8'), contents);
    assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('.erp-snapshot-')), []);
  });
}

test('a target created during snapshot verification is not overwritten, and in-place copy is refused', async t => {
  const { dir, source, book } = fixture(t), target = join(dir, 'concurrent.sqlite');
  const before = book.integrity(), copying = copyEnterpriseBook({ source, target });
  writeFileSync(target, 'Concurrent owner');
  await assert.rejects(copying, /exists/i);
  assert.equal(readFileSync(target, 'utf8'), 'Concurrent owner');
  await assert.rejects(copyEnterpriseBook({ source, target: source }), /must differ/i);
  assert.deepEqual(book.integrity(), before);
  assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('.erp-snapshot-')), []);
});

test('invalid SQLite and non-ERP schemas never become advertised backup targets', async t => {
  const { dir } = fixture(t);
  for (const kind of ['invalid', 'other-schema']) {
    const source = join(dir, kind + '.sqlite'), target = join(dir, kind + '-output.sqlite');
    if (kind === 'invalid') writeFileSync(source, 'Not a database');
    else { const db = new DatabaseSync(source); db.exec('CREATE TABLE unrelated(value TEXT)'); db.close(); }
    const before = readFileSync(source);
    await assert.rejects(copyEnterpriseBook({ source, target }));
    assert.deepEqual(readFileSync(source), before);
    assert.equal(readdirSync(dir).includes(kind + '-output.sqlite'), false);
  }
  assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('.erp-snapshot-')), []);
});

test('a physically modified unbalanced ERP ledger fails verification before a target is published', async t => {
  const { dir, source } = fixture(t);
  const db = new DatabaseSync(source);
  try {
    db.exec('PRAGMA foreign_keys=OFF; PRAGMA ignore_check_constraints=ON');
    const quote = name => '"' + name.replaceAll('"', '""') + '"';
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all()) {
      db.exec('DROP TRIGGER ' + quote(name));
    }
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().find(({ name }) => {
      const columns = db.prepare('PRAGMA table_info(' + quote(name) + ')').all().map(row => row.name);
      return columns.includes('debit') && columns.includes('credit');
    });
    assert.ok(table, 'Fixture must contain persisted debit and credit columns');
    db.exec('UPDATE ' + quote(table.name) + ' SET debit=debit+1 WHERE debit>0');
  } finally { db.close(); }
  const target = join(dir, 'unbalanced-output.sqlite');
  await assert.rejects(copyEnterpriseBook({ source, target }));
  assert.equal(readdirSync(dir).includes('unbalanced-output.sqlite'), false);
});

test('backup CLI rejects missing or repeated fields and does not create data from a missing source', async t => {
  const { dir } = fixture(t), script = fileURLToPath(new URL('../scripts/enterprise-backup.mjs', import.meta.url));
  for (const args of [
    [], ['export'], ['backup', '--source', 'missing'],
    ['backup', '--source', 'missing', '--source', 'other', '--target', join(dir, 'unexpected.sqlite')],
    ['backup', '--source', join(dir, 'missing.sqlite'), '--target', join(dir, 'unexpected.sqlite')],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ERP copy failed/);
  }
  assert.equal(readdirSync(dir).includes('unexpected.sqlite'), false);
  assert.equal(readdirSync(dir).includes('missing.sqlite'), false);
});

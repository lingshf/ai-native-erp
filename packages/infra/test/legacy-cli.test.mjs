import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { openLegacyTeachingSnapshot } from '../src/legacy/teaching.ts';
import { captureDirectory, legacyFixture } from './support/legacy-fixture.mjs';

const script = fileURLToPath(new URL('../../../scripts/read-legacy-ledger.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args],
  { encoding: 'utf8', timeout: 30000 });

test('legacy CLI help and invalid arguments never select an implicit database', () => {
  const help = run('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--snapshot-dir/);
  for (const args of [
    [], ['trial'], ['ledger', '--month', '2026-01'],
    ['trial', '--snapshot-dir', 'not-used', '--month', '2026-01', '--stage', '__proto__'],
    ['ledger', '--snapshot-dir', 'not-used', '--month', '2026-01', '--account', '1000', '--limit', '101'],
    ['trial', '--snapshot-dir', 'not-used', '--month', '2026-01', '--stage', 'adjusted', '--account', '1000'],
    ['--unknown'],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_INPUT');
    assert.doesNotMatch(result.stderr, /not-used|node:|sqlite|SELECT|Error:/);
  }
});

test('legacy CLI selects exact stage and ledger page while preserving snapshot and fictional source', (t) => {
  const fixture = legacyFixture(t, { wal: true, history: true });
  const reader = openLegacyTeachingSnapshot(fixture.config);
  const trial = reader.trialBalances(fixture.month).trialBalances.adjusted;
  const ledger = reader.ledger({ month: fixture.month, account: '1000', limit: 1 });
  reader.close();
  const before = captureDirectory(fixture.directory);
  const first = run('trial', '--snapshot-dir', fixture.target, '--month', fixture.month, '--stage', 'adjusted');
  assert.equal(first.status, 0, first.stderr);
  const firstPayload = JSON.parse(first.stdout);
  assert.equal(firstPayload.snapshot.live, false);
  assert.equal(firstPayload.snapshot.snapshotSha256, fixture.manifest.ledgers.teaching.sha256);
  assert.equal(firstPayload.query.stage, 'adjusted');
  assert.deepEqual(firstPayload.result, trial);
  const second = run('ledger', '--snapshot-dir', fixture.target, '--month', fixture.month,
    '--account', '1000', '--limit', '1');
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout).result, ledger);
  assert.equal(ledger.entries.length, 1);
  const third = run('ledger', '--snapshot-dir', fixture.target, '--month', fixture.month,
    '--account', '1000', '--limit', '1', '--cursor', ledger.nextCursor);
  assert.equal(third.status, 0, third.stderr);
  const next = JSON.parse(third.stdout).result;
  assert.notEqual(next.entries[0].lineId, ledger.entries[0].lineId);
  assert.equal(next.debit, ledger.debit);
  assert.equal(next.credit, ledger.credit);
  assert.equal(next.closing, ledger.closing);
  assert.deepEqual(captureDirectory(fixture.directory), before);
});

test('legacy CLI sanitizes verification and cursor failures without successful empty reports', (t) => {
  const fixture = legacyFixture(t);
  const before = captureDirectory(fixture.directory);
  const missing = run('trial', '--snapshot-dir', fixture.teaching, '--month', fixture.month, '--stage', 'adjusted');
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.equal(JSON.parse(missing.stderr).error.code, 'INVALID_SNAPSHOT');
  assert.doesNotMatch(missing.stderr, /source-teaching|\.sqlite|ENOENT|ENOTDIR|node:/);
  const invalid = run('ledger', '--snapshot-dir', fixture.target, '--month', fixture.month,
    '--account', '1000', '--cursor', 'not-a-cursor');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(JSON.parse(invalid.stderr).error.code, 'INVALID_CURSOR');
  assert.deepEqual(captureDirectory(fixture.directory), before);
});

for (const kind of ['teaching', 'enterprise']) {
  test(`legacy CLI rejects a matching-manifest WAL header before opening ${kind}`, (t) => {
    const fixture = legacyFixture(t);
    const manifest = structuredClone(fixture.manifest);
    const filename = join(fixture.target, manifest.ledgers[kind].file);
    const bytes = readFileSync(filename);
    bytes[18] = 2;
    bytes[19] = 2;
    writeFileSync(filename, bytes);
    manifest.ledgers[kind].sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(fixture.target, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const before = captureDirectory(fixture.directory);
    const result = run('trial', '--snapshot-dir', fixture.target, '--month', fixture.month, '--stage', 'adjusted');
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_SNAPSHOT');
    assert.deepEqual(captureDirectory(fixture.directory), before);
  });
}

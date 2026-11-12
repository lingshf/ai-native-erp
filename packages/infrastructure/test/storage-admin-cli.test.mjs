import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { rootCertificates } from 'node:tls';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..', '..', '..');
const script = resolve(root, 'scripts', 'storage-admin.mjs');
function run(args, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, ERP_TARGET_DATABASE_URL: '', ...extraEnvironment },
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.ifError(result.error);
  return result;
}
function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'erp-storage-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('storage CLI help and invalid configuration never choose an implicit target', (t) => {
  const directory = fixture(t);
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(JSON.parse(help.stdout).connectionEnvironment, 'ERP_TARGET_DATABASE_URL');
  for (const args of [
    ['migrate'],
    ['migrate', '--provider', 'sqlite'],
    ['migrate', '--provider', 'postgres'],
    ['migrate', '--provider', 'sqlite', '--file', resolve(directory, 'missing.sqlite'), '--tenant', 'T1'],
    ['migrate', '--provider', 'postgres', '--no-tls-loopback'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_INPUT');
  }
  const secret = randomUUID();
  const remote = new URL('postgresql://example.invalid/fixture');
  remote.username = 'fictional';
  remote.password = secret;
  const unsafe = run(['migrate', '--provider', 'postgres', '--no-tls-loopback'], {
    ERP_TARGET_DATABASE_URL: remote.href,
  });
  assert.equal(unsafe.status, 1);
  assert.equal(JSON.parse(unsafe.stderr).error.code, 'INVALID_INPUT');
  assert.ok(!unsafe.stderr.includes(secret));
  assert.deepEqual(readdirSync(directory), []);
});

test('storage CLI explicitly migrates, verifies and provisions an independent target', async (t) => {
  const directory = fixture(t);
  const filename = resolve(directory, 'target.sqlite');
  const target = ['--provider', 'sqlite', '--file', filename];
  const absent = run(['verify', ...target]);
  assert.equal(absent.status, 1);
  assert.deepEqual(readdirSync(directory), []);
  for (const action of ['migrate', 'migrate', 'verify']) {
    const result = run([action, ...target]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).action, action);
  }
  assert.ok(statSync(filename).size > 0);
  const provision = run(['provision', ...target, '--tenant', 'T1', '--book', 'B1', '--company', 'C1']);
  assert.equal(provision.status, 0, provision.stderr);
  const { createSqliteStorage } = await import('../dist/storage/index.js');
  const store = createSqliteStorage({ filename });
  try {
    await store.verifySchema();
    const scope = { level: 'company', tenantId: 'T1', bookId: 'B1', companyId: 'C1' };
    assert.equal(await store.read(scope, (session) => session.revisions.get(scope)), 0);
  } finally {
    await store.close();
  }
});

test('storage CLI requires an explicit CA and never falls back from TLS to plaintext', async (t) => {
  const directory = fixture(t);
  const ca = resolve(directory, 'ca.crt');
  const invalidCa = resolve(directory, 'invalid.crt');
  writeFileSync(ca, rootCertificates[0]);
  writeFileSync(invalidCa, 'not a certificate');
  const requests = [];
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (input.length >= 8) {
        requests.push(input.subarray(0, 8));
        socket.end('N');
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  const url = new URL(`postgresql://127.0.0.1:${server.address().port}/fixture`);
  url.username = 'fictional';
  url.password = randomUUID();
  const environment = { ERP_TARGET_DATABASE_URL: url.href };
  const target = ['verify', '--provider', 'postgres'];
  for (const flags of [
    [], ['--ca-file', invalidCa], ['--ca-file', resolve(directory, 'missing.crt')],
    ['--ca-file', ca, '--no-tls-loopback'],
  ]) {
    const result = run([...target, ...flags], environment);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_INPUT');
    assert.ok(!result.stderr.includes(directory));
    assert.ok(!result.stderr.includes(url.password));
  }
  assert.deepEqual(requests, [], 'Invalid TLS configuration must not connect.');
  const result = await new Promise((resolve, reject) => execFile(process.execPath,
    [script, ...target, '--ca-file', ca], {
      cwd: root, env: { ...process.env, ...environment }, encoding: 'utf8', timeout: 15_000,
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') reject(error);
      else resolve({ status: error?.code ?? 0, stdout, stderr });
    }));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'STORAGE_FAILURE');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].readInt32BE(0), 8);
  assert.equal(requests[0].readInt32BE(4), 80877103, 'The CLI requests SSL; no plaintext retry.');
});

test('storage CLI refuses an existing foreign database without changing its bytes', (t) => {
  const directory = fixture(t);
  const filename = resolve(directory, 'foreign.sqlite');
  const database = new DatabaseSync(filename);
  database.exec('CREATE TABLE protected_value (value TEXT); INSERT INTO protected_value VALUES (\'preserve\')');
  database.close();
  const before = readFileSync(filename);
  const names = readdirSync(directory);
  const result = run(['migrate', '--provider', 'sqlite', '--file', filename]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'SCHEMA_MISMATCH');
  assert.ok(!result.stderr.includes(filename));
  assert.deepEqual(readFileSync(filename), before);
  assert.deepEqual(readdirSync(directory), names);
});

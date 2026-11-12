import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Book, AppError } from '../src/book.mjs';
import { createApp } from '../src/server.mjs';

async function fixture(t, { enabled = true } = {}) {
  const book = new Book(':memory:', { today: '2026-01-15' }), calls = [];
  const enterprise = Object.fromEntries([
    'createCompany', 'configure', 'setPeriod', 'preview', 'post', 'transfer',
    'withdraw', 'journal', 'ledger', 'audit', 'source',
  ].map(name => [name, (...args) => { calls.push({ name, args }); return { method: name, args }; }]));
  enterprise.state = (...args) => {
    calls.push({ name: 'state', args });
    return { available: true, companies: [], supportedOperations: ['journal', 'cash_service', 'statistics', 'clearing.match', 'reverse', 'replace', 'reclassify', 'cash_service.cancel'], args };
  };
  const server = createApp({ book, ...(enabled ? { enterprise } : {}), ai: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); book.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = (path, data, headers = {}) => fetch(base + path, { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) });
  return { base, book, enterprise, calls, json };
}

test('ERP reads dispatch explicit company/month and opaque pagination without legacy writes', async t => {
  const { base, book, calls } = await fixture(t);
  const before = { journals: book.journals(), periods: book.periods() };
  const initial = await fetch(base + '/api/erp/state');
  assert.equal(initial.status, 200);
  assert.deepEqual((await initial.json()).companies, []);
  await fetch(base + '/api/erp/state?company=A&month=2026-02&cursor=next%3A4&limit=10');
  await fetch(base + '/api/erp/journals/3?company=A');
  await fetch(base + '/api/erp/sources/EVT-3?company=A');
  await fetch(base + '/api/erp/ledger?company=A&month=2026-02&account=1000&dimension=DEPT&value=OPS&limit=20');
  await fetch(base + '/api/erp/audit?company=A&cursor=50&limit=15');
  assert.deepEqual(calls.map(c => c.name), ['state', 'state', 'journal', 'source', 'ledger', 'audit']);
  assert.deepEqual(calls[1].args, ['A', '2026-02', { cursor: 'next:4', limit: 10 }]);
  assert.deepEqual(calls[2].args, ['A', 3]);
  assert.deepEqual(calls[3].args, ['A', 'EVT-3']);
  assert.deepEqual(calls[4].args, [{ company: 'A', month: '2026-02', account: '1000', dimension: 'DEPT', value: 'OPS', limit: 20 }]);
  assert.deepEqual(calls[5].args, ['A', { cursor: '50', limit: 15 }]);
  assert.deepEqual({ journals: book.journals(), periods: book.periods() }, before);
});

test('ERP writes dispatch only fixed methods and public operations, not injected source capabilities', async t => {
  const { json, calls, enterprise } = await fixture(t);
  const command = { company: 'A', operation: 'journal', reference: 'E1' };
  for (const [path, name, input] of [
    ['companies', 'createCompany', { code: 'A' }], ['config', 'configure', { company: 'A' }],
    ['period', 'setPeriod', { company: 'A', month: '2026-01' }],
    ['preview', 'preview', command], ['post', 'post', { command, token: 'opaque', confirmation: 'POST' }],
    ['transfer', 'transfer', { company: 'A', reference: 'E1' }],
    ['withdraw', 'withdraw', { company: 'A', reference: 'E1', reason: 'Wrong amount' }],
  ]) {
    const response = await json('/api/erp/' + path, input);
    assert.equal(response.status, 200, path);
    assert.deepEqual(await response.json(), { method: name, args: [input] });
  }
  const before = calls.filter(c => c.name === 'preview' || c.name === 'post').length;
  for (const operation of ['testOnlyAP', '__proto__', 'registerAdapter', '', null]) {
    assert.equal((await json('/api/erp/preview', { ...command, operation })).status, 400);
    assert.equal((await json('/api/erp/post', { command: { ...command, operation }, confirmation: 'POST' })).status, 400);
  }
  assert.equal(calls.filter(c => c.name === 'preview' || c.name === 'post').length, before);
  enterprise.preview = () => { throw new AppError('Plan changed; preview again.', 409); };
  const error = await json('/api/erp/preview', command);
  assert.equal(error.status, 409);
  assert.deepEqual(await error.json(), { error: 'Plan changed; preview again.' });
  assert.equal((await json('/api/erp/register', { adapters: [] })).status, 404);
});

test('ERP HTTP preserves host, origin, JSON and request-size protection', async t => {
  const { base, json } = await fixture(t);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(base + '/api/erp/state', { headers: { host: 'attacker.invalid' } },
      res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await json('/api/erp/companies', {}, { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await json('/api/erp/companies', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await fetch(base + '/api/erp/companies', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await json('/api/erp/companies', { value: 'x'.repeat(65536) })).status, 413);
  assert.equal((await fetch(base + '/api/erp/state', { method: 'PATCH' })).status, 405);
});

test('ERP read queries reject missing identities and malformed paging instead of falling back', async t => {
  const { base } = await fixture(t);
  for (const path of [
    '/api/erp/state?company=', '/api/erp/state?company=A',
    '/api/erp/state?company=A&month=', '/api/erp/journals/1',
    '/api/erp/journals/9007199254740992?company=A',
    '/api/erp/sources/%ZZ?company=A', '/api/erp/audit',
    '/api/erp/ledger?company=A&account=1000',
    '/api/erp/state?actor=administrator',
    '/api/erp/state?company=A&month=2026-01&limit=0',
    '/api/erp/state?company=A&month=2026-01&limit=201',
    '/api/erp/state?company=A&month=2026-01&limit=1.5',
    '/api/erp/state?company=A&month=2026-01&limit=',
    '/api/erp/state?company=A&company=B&month=2026-01',
    '/api/erp/state?company=A&month=2026-01&limit=1&limit=2',
    '/api/erp/ledger?company=A&month=2026-01&account=1000&dimension=DEPT',
  ]) assert.equal((await fetch(base + path)).status, 400, path);
  assert.equal((await fetch(base + '/api/erp/unimplemented')).status, 404);
});

test('ERP is explicitly unavailable without an injected store and does not initialize another book', async t => {
  const { base, json, book } = await fixture(t, { enabled: false });
  const before = book.journals();
  assert.equal((await fetch(base + '/api/erp/state')).status, 503);
  assert.equal((await json('/api/erp/companies', { code: 'A' })).status, 503);
  assert.equal((await fetch(base + '/api/state?month=2026-01')).status, 200);
  assert.deepEqual(book.journals(), before);
});

test('ERP browser module is an exact static resource under the existing CSP', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/enterprise.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await response.text(), /createEnterpriseWorkspace/);
  assert.equal((await fetch(base + '/enterprise-private.js')).status, 404);
});

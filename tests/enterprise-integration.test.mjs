import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Book } from '../src/book.mjs';
import { EnterpriseBook } from '../src/enterprise.mjs';
import { createApp } from '../src/server.mjs';

async function fixture(t) {
  const book = new Book(':memory:', { today: '2026-01-15' });
  const enterprise = new EnterpriseBook(':memory:');
  const server = createApp({ book, enterprise, ai: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    enterprise.close(); book.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => {
    const response = await fetch(base + path);
    return { status: response.status, value: await response.json() };
  };
  const post = async (path, data) => {
    const response = await fetch(base + '/api/erp/' + path, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    return { status: response.status, value: await response.json() };
  };
  const company = code => post('companies', { code, name: code, year: 2026,
    currency: 'EUR', scale: 2, reportCurrency: 'USD', reportScale: 2, chartTemplate: 'STANDARD' });
  return { book, enterprise, get, post, company };
}

function command(reference, { queued = false, expense = false, month = '01' } = {}) {
  const date = `2026-${month}-15`;
  return { company: 'A', operation: 'journal', reference,
    accountingDate: date, documentDate: date, taxDate: date, sourceRevision: 0,
    data: { memo: reference, kind: expense ? 'adjusting' : 'normal', currency: 'EUR',
      transferMode: queued ? 'queued' : 'sync', headerDimensions: {},
      lines: expense
        ? [{ account: '5000', debit: '2.08', credit: '0', dimensions: {} },
          { account: '1000', debit: '0', credit: '2.08', dimensions: {} }]
        : [{ account: '1000', debit: '53.27', credit: '0', dimensions: {} },
          { account: '3000', debit: '0', credit: '53.27', dimensions: {} }] } };
}

test('real ERP HTTP preview is zero-write, confirmation is idempotent and company queries cannot cross the legacy book', async t => {
  const { book, get, post, company, enterprise } = await fixture(t);
  const legacy = { periods: book.periods(), journals: book.journals() };
  assert.deepEqual((await get('/api/erp/state')).value.companies, []);
  for (const code of ['A', 'B']) assert.equal((await company(code)).status, 200);
  const before = (await get('/api/erp/state?company=A&month=2026-01')).value;
  assert.equal(before.journals.total, 0);
  const input = command('CAPITAL');
  const preview = await post('preview', input);
  assert.equal(preview.status, 200, JSON.stringify(preview.value));
  assert.equal(typeof preview.value.token, 'string');
  assert.deepEqual((await get('/api/erp/state?company=A&month=2026-01')).value, before);
  assert.equal((await post('post', { command: input, token: preview.value.token, confirmation: 'yes' })).status, 400);
  const envelope = { command: input, token: preview.value.token, confirmation: 'POST' };
  const [accepted, ...concurrent] = await Promise.all(
    Array.from({ length: 6 }, () => post('post', envelope)));
  assert.equal(accepted.status, 200, JSON.stringify(accepted.value));
  assert.equal(accepted.value.status, 'posted');
  assert.equal(accepted.value.journalIds.length, 1);
  for (const result of concurrent) assert.deepEqual(result, accepted);
  const replay = await post('post', envelope);
  assert.deepEqual(replay, accepted);
  const saved = await get(`/api/erp/journals/${accepted.value.journalIds[0]}?company=A`);
  assert.equal(saved.status, 200);
  assert.equal(saved.value.lines.length, 2);
  assert.equal(saved.value.lines[0].reportingDebit, null);
  assert.equal((await get(`/api/erp/journals/${accepted.value.journalIds[0]}?company=B`)).status, 404);
  const a = (await get('/api/erp/state?company=A&month=2026-01')).value;
  assert.equal(a.journals.total, 1);
  assert.equal(a.reports.balanceSheet.assets, 5327);
  assert.equal(a.reports.balanceSheet.equity, 5327);
  assert.equal(a.reports.reporting.translated, false);
  const b = (await get('/api/erp/state?company=B&month=2026-01')).value;
  assert.equal(b.journals.total, 0);
  assert.equal(b.reports.balanceSheet.assets, 0);
  assert.deepEqual({ periods: book.periods(), journals: book.journals() }, legacy);
  assert.ok(enterprise.integrity());
});

test('real ERP HTTP queued approval remains out of GL until one explicit transfer, while withdrawal never writes GL', async t => {
  const { post, get, company } = await fixture(t);
  assert.equal((await company('A')).status, 200);
  const approve = async input => {
    const preview = await post('preview', input);
    assert.equal(preview.status, 200, JSON.stringify(preview.value));
    const envelope = { command: input, token: preview.value.token, confirmation: 'POST' };
    const result = await post('post', envelope);
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return { envelope, result: result.value };
  };
  await approve(command('CAPITAL'));
  const queued = await approve(command('EXPENSE', { queued: true, expense: true }));
  assert.equal(queued.result.status, 'pending');
  assert.deepEqual(queued.result.journalIds, []);
  assert.equal((await get('/api/erp/state?company=A&month=2026-01')).value.reports.balanceSheet.assets, 5327);
  const transfer = await post('transfer', { company: 'A', reference: 'EXPENSE' });
  assert.equal(transfer.status, 200, JSON.stringify(transfer.value));
  assert.equal(transfer.value.status, 'transferred');
  assert.deepEqual(await post('transfer', { company: 'A', reference: 'EXPENSE' }), transfer);
  const transferred = await post('post', queued.envelope);
  assert.equal(transferred.value.status, 'transferred');
  const after = (await get('/api/erp/state?company=A&month=2026-01')).value;
  assert.equal(after.journals.total, 2);
  assert.equal(after.reports.income.month.profit, -208);
  assert.equal(after.reports.balanceSheet.assets, 5119);
  const withdrawn = await approve(command('WITHDRAW', { queued: true }));
  assert.equal(withdrawn.result.status, 'pending');
  assert.equal((await post('withdraw', { company: 'A', reference: 'WITHDRAW', reason: 'Wrong source' })).value.status, 'withdrawn');
  assert.equal((await post('post', withdrawn.envelope)).value.status, 'withdrawn');
  assert.equal((await post('transfer', { company: 'A', reference: 'WITHDRAW' })).status, 409);
  assert.equal((await get('/api/erp/state?company=A&month=2026-01')).value.journals.total, 2);
});

test('real ERP HTTP rejects an obsolete approval after a same-value configuration revision without partial writes', async t => {
  const { get, post, company } = await fixture(t);
  assert.equal((await company('A')).status, 200);
  const input = command('VERSIONED');
  const preview = await post('preview', input);
  assert.equal(preview.status, 200);
  const initial = (await get('/api/erp/state?company=A&month=2026-01')).value;
  const account = initial.configs.find(c => c.kind === 'account' && c.code === '1000');
  const update = await post('config', { company: 'A', kind: account.kind, code: account.code,
    expectedRevision: account.revision, active: account.active, data: account.data });
  assert.equal(update.status, 200, JSON.stringify(update.value));
  const current = (await get('/api/erp/state?company=A&month=2026-01')).value;
  assert.ok(current.revision > initial.revision);
  const obsolete = await post('post', { command: input, token: preview.value.token, confirmation: 'POST' });
  assert.equal(obsolete.status, 409);
  assert.deepEqual((await get('/api/erp/state?company=A&month=2026-01')).value, current);
  const fresh = await post('preview', input);
  assert.equal(fresh.status, 200);
  assert.equal((await post('post', { command: input, token: fresh.value.token, confirmation: 'POST' })).status, 200);
  const result = (await get('/api/erp/state?company=A&month=2026-01')).value;
  assert.equal(result.journals.total, 1);
  assert.equal(result.sources.total, 1);
});

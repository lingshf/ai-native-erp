import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { Book } from '../src/book.mjs';
import { createApp, askAI } from '../src/server.mjs';
import { formatMinor } from '../public/money.js';

const proposal = { date: '2026-01-15', memo: 'AI preview', kind: 'normal', rationale: 'Cash revenue',
  lines: [{ account: '1000', debit: '10.00', credit: '0' }, { account: '4000', debit: '0', credit: '10.00' }] };
const envelope = (content) => JSON.stringify({ choices: [{ message: { content } }] });
async function listen(server, t) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, options = {}) {
  const book = new Book(':memory:', { today: '2026-01-15' });
  t.after(() => book.close());
  const server = createApp({ book, ai: {}, ...options });
  return { book, base: await listen(server, t) };
}
const json = (data, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) });
const getJson = async (res) => { const data = await res.json(); return { status: res.status, data }; };
const hostStatus = (base, host) => new Promise((resolve, reject) => {
  const req = request(base + '/api/state', { headers: { host } }, (res) => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject); req.end();
});

test('HTTP reconciliation requires an explicit valid existing month and performs no writes', async (t) => {
  const { base, book } = await fixture(t);
  const state = await (await fetch(base + '/api/state?month=2026-01')).json();
  const reports = t.mock.method(book, 'reports');
  const before = book.db.prepare('SELECT total_changes() AS n').get().n;
  book.db.exec('PRAGMA query_only=ON');
  const result = await getJson(await fetch(base + '/api/reconciliation?month=2026-01'));
  assert.equal(result.status, 200);
  const r = state.reports;
  const values = [
    ['tb.unadjusted', r.trialBalances.unadjusted.debit, r.trialBalances.unadjusted.credit],
    ['tb.adjusted', r.trialBalances.adjusted.debit, r.trialBalances.adjusted.credit],
    ['tb.postClosing', r.trialBalances.postClosing.debit, r.trialBalances.postClosing.credit],
    ['balanceSheet', r.assets, r.liabilities + r.equity],
    ['equitySummary', r.equitySummary.closing, r.equity],
    ['profit', r.revenue - r.expense, r.profit],
  ];
  assert.deepEqual(result.data, { month: '2026-01', checks: values.map(([id, left, right]) =>
    ({ id, left, right, difference: left - right, pass: true })), allPass: true });
  assert.equal(reports.mock.callCount(), 1);
  assert.deepEqual(reports.mock.calls[0].arguments, ['2026-01']);
  for (const query of ['', '?month=', '?month=2026-1', '?month=2026-13', '?month=2026-01-01', '?month=0000-01']) {
    const response = await getJson(await fetch(base + '/api/reconciliation' + query));
    assert.equal(response.status, 400, query);
    assert.equal(typeof response.data.error, 'string');
    assert.equal(response.data.allPass, undefined);
  }
  assert.equal((await fetch(base + '/api/reconciliation?month=2026-02')).status, 404);
  const after = await (await fetch(base + '/api/state?month=2026-01')).json();
  assert.deepEqual(after, state);
  assert.equal(book.db.prepare('SELECT total_changes() AS n').get().n, before);
});

test('HTTP reconciliation returns each controlled snapshot mismatch as a diagnostic, not an error or write', async (t) => {
  const { base, book } = await fixture(t);
  const original = book.reports('2026-01');
  let snapshot;
  const reports = t.mock.method(book, 'reports', () => snapshot);
  const before = book.db.prepare('SELECT total_changes() AS n').get().n;
  book.db.exec('PRAGMA query_only=ON');
  const scenarios = [
    ['tb.unadjusted', (r) => { r.trialBalances.unadjusted.debit += 1; }, 1],
    ['tb.adjusted', (r) => { r.trialBalances.adjusted.credit += 2; }, -2],
    ['tb.postClosing', (r) => { r.trialBalances.postClosing.debit += 3; }, 3],
    ['balanceSheet', (r) => { r.assets -= 4; }, -4],
    ['equitySummary', (r) => { r.equitySummary.closing += 5; }, 5],
    ['profit', (r) => { r.profit += 6; }, -6],
  ];
  for (const [id, change, difference] of scenarios) {
    snapshot = structuredClone(original); change(snapshot);
    const unchanged = structuredClone(snapshot), calls = reports.mock.callCount();
    const { status, data } = await getJson(await fetch(base + '/api/reconciliation?month=2026-01'));
    assert.equal(status, 200); assert.equal(data.month, '2026-01');
    assert.equal(data.allPass, false);
    assert.deepEqual(data.checks.map((row) => row.id), scenarios.map(([id]) => id));
    for (const row of data.checks) {
      assert.equal(row.pass, row.id !== id);
      assert.equal(row.difference, row.id === id ? difference : 0);
      assert.equal(row.difference, row.left - row.right);
    }
    assert.equal(reports.mock.callCount(), calls + 1);
    assert.deepEqual(reports.mock.calls.at(-1).arguments, ['2026-01']);
    assert.deepEqual(snapshot, unchanged);
  }
  assert.equal(book.db.prepare('SELECT total_changes() AS n').get().n, before);
});

test('HTTP journal-to-close workflow and explicit errors', async (t) => {
  const { base } = await fixture(t);
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.periods[0].month, '2026-01');
  assert.equal(state.reports.profit, 200000);
  const saved = await getJson(await fetch(base + '/api/journals', json(proposal)));
  assert.equal(saved.status, 200);
  assert.equal(saved.data.status, 'draft');
  assert.equal((await fetch(base + '/api/close', json({ month: '2026-01' }))).status, 409);
  assert.equal((await fetch(base + `/api/journals/${saved.data.id}/post`, json({}))).status, 200);
  assert.equal((await fetch(base + `/api/journals/${saved.data.id}/post`, json({}))).status, 409);
  assert.equal((await fetch(base + '/api/close', json({ month: '2026-01' }))).status, 200);
  const next = await (await fetch(base + '/api/periods/next', json({}))).json();
  assert.equal(next.month, '2026-02');
  const invalid = await getJson(await fetch(base + '/api/journals', json({ ...proposal, date: '2026-99-99' })));
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(base + '/api/close', json({ month: {} }))).status, 400);
});

test('every POST including AI rejects foreign origins, cross-site metadata and non-JSON', async (t) => {
  let upstreamCalls = 0;
  const upstream = createServer((_req, res) => { upstreamCalls++; res.end(envelope(JSON.stringify(proposal))); });
  const root = await listen(upstream, t);
  const { base, book } = await fixture(t, { ai: { baseUrl: root, key: 'test-key', model: 'test-model' } });
  const id = book.save(proposal).id;
  for (const [path, method, data] of [
    ['/api/journals', 'POST', proposal],
    ['/api/ai/draft', 'POST', { month: '2026-01', prompt: 'Record revenue' }],
    ['/api/ai/teach', 'POST', { month: '2026-01', prompt: 'Explain revenue' }],
    [`/api/journals/${id}`, 'PUT', proposal], [`/api/journals/${id}`, 'DELETE', {}],
    ['/api/accounts', 'POST', { code: '5200', name: 'Expense', category: 'EXPENSE' }],
    ['/api/accounts/5200', 'PUT', { name: 'Expense', active: true, manualAllowed: true, revision: 1 }],
    ['/api/accounts/4000/dimension-structure', 'PUT', { active: true, revision: 0, segments: [], allowed: [] }],
    ['/api/accounts/5200/properties', 'PUT', { normalSide: 'DEBIT', purpose: 'general', relatedAccount: null, revision: 0 }],
    ['/api/dimensions', 'POST', { code: 'DEPT', name: 'Department' }],
    ['/api/dimensions/DEPT', 'PUT', { active: false, revision: 1 }],
    ['/api/dimensions/DEPT/values', 'POST', { code: 'OPS', name: 'Operations' }],
    ['/api/dimensions/DEPT/values/OPS', 'PUT', { active: false, revision: 1 }],
    ['/api/services', 'POST', { code: 'SVC', name: 'Service', group: 'GENERAL' }],
    ['/api/services/SVC', 'PUT', { group: 'GENERAL', active: true, revision: 1 }],
    ['/api/posting-rules', 'POST', { scope: 'all', match: '*', revenueAccount: '4000' }],
    ['/api/posting-rules/1', 'PUT', { scope: 'all', match: '*', revenueAccount: '4000', active: true, revision: 1 }],
    ['/api/events/preview', 'POST', {}], ['/api/events/post', 'POST', {}],
  ]) {
    for (const [headers, expected] of [[{ origin: 'https://evil.example' }, 403], [{ 'sec-fetch-site': 'cross-site' }, 403],
      [{ 'content-type': 'text/plain' }, 415]]) {
      const res = await fetch(base + path, { ...json(data, headers), method });
      assert.equal(res.status, expected, `${method} ${path}`);
    }
  }
  assert.equal(upstreamCalls, 0);
  assert.equal(await hostStatus(base, 'evil.example'), 403);
  assert.equal(await hostStatus(base, '127.0.0.1:1'), 403);
  const accepted = await fetch(base + '/api/journals', json(proposal, { origin: base }));
  assert.equal(accepted.status, 200);
  assert.equal(book.journals().length, 4);
  assert.equal((await fetch(base + '/../../.env')).status, 404);
});

test('request body exact 64 KiB accepted, above rejected, malformed JSON explicit', async (t) => {
  const { base } = await fixture(t);
  const raw = JSON.stringify(proposal);
  const send = (body) => fetch(base + '/api/journals', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal((await send(raw.padEnd(65536, ' '))).status, 200);
  assert.equal((await send(raw.padEnd(65537, ' '))).status, 413);
  assert.equal((await send('{')).status, 400);
});

test('account API config, stale revisions and AI late restrictions stay nonmutating', async (t) => {
  let observed, returnProposal, ready;
  let mode = 'draft';
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    observed = JSON.parse(JSON.parse(raw).messages[1].content);
    if (mode === 'held') { ready(); await new Promise((resolve) => { returnProposal = resolve; }); }
    res.end(envelope(mode === 'teach' ? 'Teaching only' : JSON.stringify({ ...proposal,
      lines: [{ account: '1000', debit: '10', credit: '0' }, { account: '4200', debit: '0', credit: '10' }] })));
  });
  const root = await listen(upstream, t);
  const { base, book } = await fixture(t, { ai: { baseUrl: root, key: 'test-key', model: 'test-model' } });
  const create = await getJson(await fetch(base + '/api/accounts', json({ code: '4200', name: 'Service', category: 'REVENUE' })));
  assert.equal(create.status, 200); assert.equal(create.data.revision, 1);
  const before = JSON.stringify({ journals: book.journals(), periods: book.periods() });
  const update = (data) => fetch(base + '/api/accounts/4200', { ...json(data), method: 'PUT' });
  let a = create.data;
  const flags = () => ({ name: a.name, active: a.active, manualAllowed: a.manualAllowed, revision: a.revision });
  const heldReady = new Promise((resolve) => { ready = resolve; });
  mode = 'held';
  const pending = fetch(base + '/api/ai/draft', json({ month: '2026-01', prompt: 'Fictional revenue' }));
  await heldReady;
  assert.ok(observed.accounts.some((x) => x.code === '4200'));
  a = await (await update({ ...flags(), manualAllowed: false })).json();
  returnProposal();
  assert.equal((await pending).status, 502);
  assert.equal((await update({ ...flags(), revision: 1 })).status, 409);
  mode = 'draft';
  assert.equal((await fetch(base + '/api/ai/draft', json({ month: '2026-01', prompt: 'Fictional revenue' }))).status, 502);
  assert.ok(!observed.accounts.some((x) => x.code === '4200'));
  mode = 'teach';
  assert.equal((await fetch(base + '/api/ai/teach', json({ month: '2026-01', prompt: 'Explain fictional revenue' }))).status, 200);
  assert.ok(observed.accounts.some((x) => x.code === '4200' && !x.manualAllowed));
  for (const data of [{ ...flags(), active: 'false' }, { ...flags(), category: 'ASSET' }]) {
    assert.equal((await update(data)).status, 400);
  }
  for (const data of [{ ...proposal, allowRestricted: true }, { ...proposal, reversal_of: 1 }, { ...proposal, kind: 'reversal' }]) {
    assert.equal((await fetch(base + '/api/journals', json(data))).status, 400);
  }
  assert.equal((await fetch(base + '/api/accounts/1000', { ...json({ name: 'Cash', active: false, manualAllowed: false, revision: 0 }), method: 'PUT' })).status, 409);
  assert.equal((await fetch(base + '/api/accounts', json({ code: '4200', name: 'Duplicate', category: 'ASSET' }))).status, 409);
  assert.equal(JSON.stringify({ journals: book.journals(), periods: book.periods() }), before);
});

test('AI is explicit when unconfigured, and never saves proposed drafts', async (t) => {
  const { base } = await fixture(t, { ai: {} });
  const result = await getJson(await fetch(base + '/api/ai/draft', json({ prompt: 'Record revenue', month: '2026-01' })));
  assert.equal(result.status, 503);
  assert.match(result.data.error, /AI/);
});

test('HTTP account properties expose signed explanation to AI without imposing a posting side', async (t) => {
  let observed, instruction;
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const messages = JSON.parse(raw).messages;
    observed = JSON.parse(messages[1].content); instruction = messages[0].content;
    res.end(envelope(JSON.stringify({ ...proposal,
      lines: [{ account: '1000', debit: '10', credit: '0' }, { account: '1510', debit: '0', credit: '10' }] })));
  });
  const root = await listen(upstream, t);
  const { base, book } = await fixture(t, { ai: { baseUrl: root, key: 'test-key', model: 'test-model' } });
  book.createAccount({ code: '1510', name: 'Contra asset', category: 'ASSET' });
  const before = book.journals();
  const body = { normalSide: 'CREDIT', purpose: 'contra', relatedAccount: '1000', revision: 0 };
  const put = (code, data) => fetch(`${base}/api/accounts/${code}/properties`, { ...json(data), method: 'PUT' });
  assert.equal((await put('1510', body)).status, 200);
  assert.equal((await put('1510', body)).status, 409);
  assert.equal((await put('1000', body)).status, 409);
  assert.equal((await put('9999', body)).status, 404);
  assert.equal((await put('1510', { ...body, normalSide: 0 })).status, 400);
  const result = await getJson(await fetch(base + '/api/ai/draft', json({ month: '2026-01', prompt: 'Fictional adjustment' })));
  assert.equal(result.status, 200);
  assert.ok(observed.accounts.some((a) => a.code === '1510' && a.normalSide === 'CREDIT' && a.purpose === 'contra'));
  assert.equal(observed.report.accountAnalysis.basis, 'current_account_configuration');
  assert.match(instruction, /NOT a debit\/credit posting restriction/);
  assert.deepEqual(book.journals(), before);
  assert.equal((await put('1510', { normalSide: 'DEBIT', purpose: 'general', relatedAccount: null, revision: 1 })).status, 200);
  const saved = await getJson(await fetch(base + '/api/journals', json(result.data.proposal)));
  assert.equal(saved.status, 200);
  assert.equal((await fetch(`${base}/api/journals/${saved.data.id}/post`, json({}))).status, 200);
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.reports.accountAnalysis.rows.find((a) => a.code === '1510').oppositeBalance, true);
});

test('HTTP source event preview and idempotent confirmation preserve exact plan and stale safety', async (t) => {
  const { base, book } = await fixture(t);
  const post = (path, data) => fetch(base + path, json(data));
  assert.equal((await post('/api/services', { code: 'SVC', name: 'Teaching service', group: 'GENERAL' })).status, 200);
  const rule = await (await post('/api/posting-rules', { scope: 'all', match: '*', revenueAccount: '4000' })).json();
  const event = { type: 'cash_service', reference: 'HTTP-001', date: '2026-01-15', service: 'SVC', amount: '10' };
  const before = book.journals();
  const plan = await getJson(await post('/api/events/preview', event));
  assert.equal(plan.status, 200); assert.deepEqual(book.journals(), before);
  assert.equal((await post('/api/events/post', { event: { ...event, reference: 'DIFFERENT' }, token: plan.data.token })).status, 409);
  const body = { event, token: plan.data.token };
  const [a, b] = await Promise.all([post('/api/events/post', body).then(getJson), post('/api/events/post', body).then(getJson)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.data.journalId, b.data.journalId);
  assert.deepEqual([a.data.replayed, b.data.replayed].sort(), [false, true]);
  assert.deepEqual(book.journal(a.data.journalId).lines, plan.data.journal.lines);
  assert.equal(book.journals().length, 3);
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.eventReceipts[0].reference, event.reference);
  assert.equal(state.eventReceipts[0].plan.rule.revision, 1);
  assert.equal(JSON.stringify(state).includes(plan.data.token), false);
  const next = { ...event, reference: 'STALE' }, preview = await (await post('/api/events/preview', next)).json();
  const updated = await fetch(base + `/api/posting-rules/${rule.id}`, { ...json({
    scope: rule.scope, match: rule.match, revenueAccount: rule.revenueAccount, active: true, revision: 1,
  }), method: 'PUT' });
  assert.equal(updated.status, 200);
  assert.equal((await post('/api/events/post', { event: next, token: preview.token })).status, 409);
  assert.equal(state.eventReceipts[0].plan.rule.revision, 1);
  assert.equal(book.eventReceipts()[0].plan.rule.revision, 1);
  assert.equal(book.journals().length, 3);
});

test('HTTP dimension structures revalidate manual posts and held AI output without defaults or writes', async (t) => {
  let captured, release, ready, hold = true, reply = proposal;
  const heldReady = new Promise((resolve) => { ready = resolve; });
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    captured = JSON.parse(JSON.parse(raw).messages[1].content);
    if (hold) { ready(); await new Promise((resolve) => { release = resolve; }); }
    res.end(envelope(JSON.stringify(reply)));
  });
  const root = await listen(upstream, t);
  const { base, book } = await fixture(t, { ai: { baseUrl: root, key: 'test-key', model: 'test-model' } });
  for (const [code, values] of [['DEPT', ['OPS']], ['COST', ['C1', 'C2']]]) {
    book.createDimension({ code, name: code });
    for (const value of values) book.createDimensionValue(code, { code: value, name: value });
  }
  const old = book.save(proposal), before = book.journals();
  const path = '/api/accounts/4000/dimension-structure';
  const config = { active: true, revision: 0, segments: [{ code: 'DEPT', required: true }, { code: 'COST', required: false }],
    allowed: [{ DEPT: 'OPS', COST: 'C1' }] };
  const put = (body) => fetch(base + path, { ...json(body), method: 'PUT' }).then(getJson);
  const ask = () => fetch(base + '/api/ai/draft', json({ month: '2026-01', prompt: 'Record revenue DEPT=OPS COST=C1' })).then(getJson);
  const pending = ask(); await heldReady;
  assert.deepEqual(captured.dimensionStructures, []);
  const saved = await put(config); assert.equal(saved.status, 200); assert.equal(saved.data.revision, 1);
  release(); hold = false;
  const late = await pending; assert.equal(late.status, 502); assert.match(late.data.error, /必填.*DEPT/);
  const manual = await getJson(await fetch(base + `/api/journals/${old.id}/post`, json({})));
  assert.equal(manual.status, 409); assert.match(manual.data.error, /第 2 行.*4000.*版本 1/);
  assert.deepEqual(book.journals(), before);
  assert.equal((await put(config)).status, 409);
  assert.equal((await put({ ...config, revision: 1, allowed: [{ DEPT: 'OPS', COST: '' }] })).status, 400);
  reply = { ...proposal, lines: proposal.lines.map((l) => ({ ...l, dimensions: { DEPT: 'OPS', COST: 'C1' } })) };
  const valid = await ask(); assert.equal(valid.status, 200);
  assert.equal(captured.dimensionStructures[0].revision, 1);
  assert.deepEqual(valid.data.proposal.lines[1].dimensions, { COST: 'C1', DEPT: 'OPS' });
  const noExplicit = await fetch(base + '/api/ai/draft', json({ month: '2026-01', prompt: 'Record revenue' }));
  assert.equal(noExplicit.status, 502);
  let readyAgain;
  const secondReady = new Promise((resolve) => { readyAgain = resolve; });
  ready = readyAgain; hold = true;
  const second = ask(); await secondReady;
  assert.equal((await put({ ...config, revision: 1, allowed: [{ DEPT: 'OPS', COST: 'C2' }] })).status, 200);
  release(); hold = false;
  const rejected = await second; assert.equal(rejected.status, 502); assert.match(rejected.data.error, /组合/);
  assert.deepEqual(book.journals(), before);
  assert.equal((await (await fetch(base + '/api/state')).json()).dimensionStructures[0].revision, 2);
});

test('dimension API and AI retain explicit maps, reject late restrictions and echo ledger filters', async (t) => {
  let observed, held, release, mode = 'draft';
  const attributed = { ...proposal, lines: proposal.lines.map((l) => ({ ...l, dimensions: { DEPT: 'OPS' } })) };
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    observed = JSON.parse(JSON.parse(raw).messages[1].content);
    if (mode === 'held') { held(); await new Promise((resolve) => { release = resolve; }); }
    res.end(envelope(mode === 'teach' ? 'Read-only explanation' : JSON.stringify(attributed)));
  });
  const root = await listen(upstream, t);
  const { base, book } = await fixture(t, { ai: { baseUrl: root, key: 'test-key', model: 'test-model' } });
  const create = (path, data) => fetch(base + path, json(data));
  const update = (path, data) => fetch(base + path, { ...json(data), method: 'PUT' });
  assert.equal((await create('/api/dimensions', { code: 'DEPT', name: 'Department' })).status, 200);
  assert.equal((await create('/api/dimensions/DEPT/values', { code: 'OPS', name: 'Operations' })).status, 200);
  assert.equal((await create('/api/dimensions', { code: 'DEPT', name: 'Duplicate' })).status, 409);
  const before = JSON.stringify({ journals: book.journals(), periods: book.periods() });
  const good = await getJson(await create('/api/ai/draft', { prompt: 'Cash revenue DEPT=OPS', month: '2026-01' }));
  assert.equal(good.status, 200); assert.deepEqual(good.data.proposal.lines[0].dimensions, { DEPT: 'OPS' });
  assert.equal(observed.dimensions[0].values[0].code, 'OPS');
  for (const prompt of ['Cash revenue', 'DEPT=OPS_SUFFIX', 'DEPT=OPS-X']) {
    assert.equal((await create('/api/ai/draft', { prompt, month: '2026-01' })).status, 502);
  }
  mode = 'held';
  const ready = new Promise((resolve) => { held = resolve; });
  const pending = create('/api/ai/draft', { prompt: 'DEPT=OPS', month: '2026-01' });
  await ready;
  assert.equal((await update('/api/dimensions/DEPT/values/OPS', { active: false, revision: 1 })).status, 200);
  release(); assert.equal((await pending).status, 502);
  assert.equal((await update('/api/dimensions/DEPT/values/OPS', { active: true, revision: 1 })).status, 409);
  mode = 'draft';
  assert.equal((await create('/api/ai/draft', { prompt: 'DEPT=OPS', month: '2026-01' })).status, 502);
  assert.deepEqual(observed.dimensions[0].values, []);
  mode = 'teach';
  assert.equal((await create('/api/ai/teach', { prompt: 'Explain', month: '2026-01' })).status, 200);
  assert.equal(observed.dimensions[0].values[0].active, false);
  for (const suffix of ['&dimension=', '&value=OPS', '&dimension=DEPT&value=', '&dimension=NOPE&value=OPS']) {
    assert.ok([400, 404].includes((await fetch(base + '/api/ledger?month=2026-01&account=1000' + suffix)).status));
  }
  const filtered = await getJson(await fetch(base + '/api/ledger?month=2026-01&account=1000&dimension=DEPT&value=OPS'));
  assert.equal(filtered.status, 200); assert.deepEqual(filtered.data.filter, { dimension: 'DEPT', value: 'OPS' });
  assert.equal(filtered.data.closing, 0);
  assert.equal(JSON.stringify({ journals: book.journals(), periods: book.periods() }), before);
});

test('real adapter contract, draft validation, contextual teaching and no key exposure', async (t) => {
  let mode = 'draft', observed, calls = 0;
  const logs = [], originalLog = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  t.after(() => { console.error = originalLog; });
  const upstream = createServer(async (req, res) => {
    calls++;
    let raw = ''; for await (const chunk of req) raw += chunk;
    observed = { url: req.url, authorization: req.headers.authorization, data: JSON.parse(raw) };
    if (mode === 'draft') res.end(envelope(JSON.stringify(proposal)));
    else if (mode === 'invalid') res.end(envelope(JSON.stringify({ ...proposal, kind: 'closing' })));
    else if (mode === 'blank-rationale') res.end(envelope(JSON.stringify({ ...proposal, rationale: '   ' })));
    else if (mode === 'unbalanced') res.end(envelope(JSON.stringify({ ...proposal, lines: [
      { account: '1000', debit: '10', credit: '0' }, { account: '4000', debit: '0', credit: '9' },
    ] })));
    else if (mode === 'unknown-account') res.end(envelope(JSON.stringify({ ...proposal, lines: [
      { account: 'unknown', debit: '10', credit: '0' }, { account: '4000', debit: '0', credit: '10' },
    ] })));
    else if (mode === 'malformed') res.end(envelope('not json'));
    else if (mode === 'upstream-error') { res.statusCode = 401; res.end('secret-test-key'); }
    else res.end(envelope('<script>untrusted teaching text</script>'));
  });
  const root = await listen(upstream, t);
  const { base, book } = await fixture(t, { ai: { baseUrl: root + '/v1', model: 'test-model', key: 'secret-test-key' } });
  const request = (path = 'draft', prompt = 'Record revenue') => fetch(base + '/api/ai/' + path,
    json({ prompt, month: '2026-01' }));
  const good = await getJson(await request());
  assert.equal(good.status, 200);
  assert.equal(good.data.proposal.lines[0].debit, '10.00');
  assert.equal(observed.url, '/v1/chat/completions');
  assert.equal(observed.authorization, 'Bearer secret-test-key');
  assert.ok(observed.data.messages[1].content.includes('2026-01'));
  assert.deepEqual(JSON.parse(observed.data.messages[1].content).period, { month: '2026-01', status: 'open' });
  assert.deepEqual(JSON.parse(observed.data.messages[1].content).money, { unit: '教学单位', minorUnitsPerUnit: 100 });
  assert.match(observed.data.messages[0].content, /integer minor units/);
  assert.ok(!JSON.stringify(good).includes('secret-test-key'));
  assert.equal(book.journals().length, 2);
  for (mode of ['invalid', 'blank-rationale', 'unbalanced', 'unknown-account', 'malformed', 'upstream-error']) {
    const bad = await getJson(await request());
    assert.equal(bad.status, 502);
    assert.ok(!JSON.stringify(bad).includes('secret-test-key'));
    assert.equal(book.journals().length, 2);
  }
  mode = 'teach';
  const teach = await getJson(await request('teach', '解释利润'));
  assert.equal(teach.data.text, '<script>untrusted teaching text</script>');
  assert.equal(JSON.parse(observed.data.messages[1].content).money.minorUnitsPerUnit, 100);
  assert.match(observed.data.messages[0].content, /integer minor units/);
  assert.equal((await request('teach', 'x'.repeat(4000))).status, 200);
  const before = calls;
  assert.equal((await request('teach', 'x'.repeat(4001))).status, 400);
  assert.equal(calls, before);
  assert.ok(!logs.join(' ').includes('secret-test-key'));
});

test('AI streaming response exact limit, excess, invalid envelope and timeout', async (t) => {
  let mode = 'limit';
  const upstream = createServer((_req, res) => {
    if (mode === 'timeout') return;
    if (mode === 'bad-envelope') return res.end('{"choices":[]}');
    const body = envelope('Teaching');
    res.end(body.padEnd(262144 + (mode === 'excess' ? 1 : 0), ' '));
  });

  const root = await listen(upstream, t);
  const config = { baseUrl: root, key: 'test-key', model: 'test-model' };
  const messages = [{ role: 'user', content: 'Explain' }];
  assert.equal(await askAI(config, messages), 'Teaching');
  mode = 'excess'; await assert.rejects(askAI(config, messages), /过大/);
  mode = 'bad-envelope'; await assert.rejects(askAI(config, messages), /格式/);
  mode = 'timeout'; await assert.rejects(askAI(config, messages, { timeoutMs: 30 }), /超时/);
  await assert.rejects(askAI({ ...config, baseUrl: 'http://remote.example/v1' }, messages), /HTTPS/);
});

test('teaching AI receives authoritative closing snapshots without changing records', async (t) => {
    const contexts = [];
    const upstream = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      contexts.push(JSON.parse(JSON.parse(raw).messages[1].content));
      res.end(envelope('Teaching based on the provided snapshot.'));
    });
    const root = await listen(upstream, t);
    const { base, book } = await fixture(t, { ai: { baseUrl: root, key: 'test-key', model: 'test-model' } });
    const teach = async (month) => {
      const snapshot = JSON.stringify({ journals: book.journals(), periods: book.periods() });
      const response = await fetch(base + '/api/ai/teach', json({ month, prompt: '本期能关账吗？是否已经结转？' }));
      assert.equal(response.status, 200);
      await response.json();
      assert.equal(JSON.stringify({ journals: book.journals(), periods: book.periods() }), snapshot);
      return contexts.at(-1);
    };
    const draft = book.save(proposal);
    let context = await teach('2026-01');
    assert.deepEqual(context.period, { month: '2026-01', status: 'open' });
    assert.equal(context.closing.drafts, 1);
    assert.equal(context.closing.canClose, false);
    assert.deepEqual(context.closing.proposedLines, book.previewClose('2026-01').lines);
    assert.equal(context.closing.postedJournal, null);
    assert.ok(!JSON.stringify(context).includes('AI preview'), 'Draft contents must not be sent.');
    book.delete(draft.id);
    context = await teach('2026-01');
    assert.equal(context.closing.drafts, 0);
    assert.equal(context.closing.canClose, true);
    book.closePeriod('2026-01');
    context = await teach('2026-01');
    assert.equal(context.period.status, 'closed');
    assert.equal(context.closing.canClose, false);
    assert.equal(context.closing.proposedLines, null);
    assert.deepEqual(context.closing.postedJournal, book.journals().find((j) => j.kind === 'closing'));
    assert.equal(context.report.profit, 200000);
    const count = contexts.length;
    assert.equal((await fetch(base + '/api/ai/draft', json({ month: '2026-01', prompt: 'Record revenue' }))).status, 409);
    assert.equal(contexts.length, count);
    book.nextPeriod();
    context = await teach('2026-02');
    assert.equal(context.period.status, 'open');
    assert.equal(context.closing.canClose, true);
    assert.equal(context.report.profit, 0);
    assert.deepEqual(context.closing.proposedLines, []);
    book.closePeriod('2026-02');
    context = await teach('2026-02');
    assert.equal(context.period.status, 'closed');
    assert.equal(context.closing.drafts, 0);
    assert.equal(context.closing.canClose, false);
    assert.equal(context.closing.proposedLines, null);
    assert.equal(context.closing.postedJournal, null);
    assert.equal(context.report.profit, 0);
});

test('browser assets served locally with restrictive content policy, no arbitrary files', async (t) => {
  const { base } = await fixture(t);
  for (const [path, contentType] of [['/', 'text/html'], ['/app.js', 'text/javascript'],
    ['/money.js', 'text/javascript'], ['/style.css', 'text/css'], ['/labels.js','text/javascript'],
    ['/labels/zh.js','text/javascript'], ['/labels/en.js','text/javascript']]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').includes(contentType));
    assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.ok((await response.text()).length > 100);
  }
  for (const path of ['/.env', '/data/teaching.sqlite', '/src/book.mjs']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

test('money display preserves exact cents near safe integer boundary and for negatives', () => {
  assert.equal(formatMinor(9007199254738993), '90,071,992,547,389.93');
  assert.equal(formatMinor(Number.MAX_SAFE_INTEGER), '90,071,992,547,409.91');
  assert.equal(formatMinor(-9007199254738993), '-90,071,992,547,389.93');
  assert.equal(formatMinor(0), '0.00');
  assert.equal(formatMinor(1), '0.01');
  assert.throws(() => formatMinor(Number.MAX_SAFE_INTEGER + 1));
});

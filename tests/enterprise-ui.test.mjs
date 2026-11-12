import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLabels, dictionaries } from '../public/labels.js';
import { createEnterpriseWorkspace } from '../public/enterprise.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function state(company = 'A', month = '2026-01') {
  return {
    company: { code: company, name: company, currency: 'EUR', scale: 2, year: 2026 },
    month, companies: [{ code: 'A', name: 'Alpha', year: 2026 }, { code: 'B', name: 'Beta', year: 2026 }],
    chartTemplates: [{ code: 'STANDARD', revision: 1 }], currencies: [{ code: 'EUR', scale: 2 }],
    accounts: [{ code: '1000', name: 'Cash', category: 'ASSET' }, { code: '4000', name: 'Revenue', category: 'REVENUE' }],
    configs: [
      { kind: 'account', code: '1000', revision: 3, active: true, data: { name: 'Cash', category: 'ASSET', reportGroup: 'cash', normalSide: 'DEBIT', purpose: 'general', controlModule: null, contraOf: null, manualAllowed: true } },
      { kind: 'dimension', code: 'DEPT', revision: 1, active: true, data: { name: 'Department', from: '1900-01-01', to: '9998-12-31' } },
      { kind: 'dimensionValue', code: 'DEPT:OPS', revision: 1, active: true, data: { dimension: 'DEPT', value: 'OPS', name: 'Operations' } },
      { kind: 'service', code: 'CONSULT', revision: 1, active: true, data: { name: 'Consulting', group: 'GENERAL', defaultDimensions: {} } },
      { kind: 'party', code: 'P1', revision: 1, active: true, data: { name: 'Party', group: 'GENERAL', defaultDimensions: {} } }
    ],
    periods: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, status: 'open', revision: 1, modules: ['journal', 'cash_service', 'statistics', 'clearing', 'correction'] })),
    journals: { items: [{ id: 1, reference: 'ORIGINAL', accountingDate: '2026-01-01' }], total: 2, nextCursor: 'j2' },
    sources: { items: [{ reference: 'ORIGINAL', status: 'posted', operation: 'journal' }], total: 1, nextCursor: null },
    statistics: [{ code: 'HEADCOUNT', quantity: '3.125', unit: 'persons' }],
    clearing: [], suspense: [], transfers: [{ reference: 'Q1', status: 'pending' }, { reference: 'Q2', status: 'transferred' }],
    reports: {
      currency: 'EUR', scale: 2, reportingCurrency: 'USD', reporting: { translated: false, totals: null },
      trial: { rows: [{ account: '1000', opening: 0, debit: 6241, credit: 0, closing: 6241 }], debit: 6241, credit: 6241 },
      income: { month: { revenue: 914, expense: 0, profit: 914 }, ytd: { revenue: 914, expense: 208, profit: 706 } },
      balanceSheet: { assets: 6033, liabilities: 0, equity: 6033, capitalAndRetained: 5327, currentEarnings: 706 },
      accountAnalysis: { rows: [], contraGroups: [] }
    }
  };
}
function setup(custom) {
  const dom = new JSDOM('<!doctype html><select id="period"></select><span id="status"></span><main></main>');
  const root = dom.window.document.querySelector('main'), labels = createLabels('en'), calls = [], errors = [], notifications = [];
  let active = true;
  const api = async (path, method = 'GET', data) => {
    calls.push({ path, method, data });
    if (custom) { const result = await custom(path, method, data); if (result !== undefined) return result; }
    if (path === '/api/erp/state') return { available: true, companies: state().companies, currencies: [], chartTemplates: [{ code: 'STANDARD' }] };
    if (path.startsWith('/api/erp/state?')) { const p = new URLSearchParams(path.split('?')[1]); return state(p.get('company'), p.get('month')); }
    if (path === '/api/erp/preview') return { command: structuredClone(data), token: 'TOKEN', plan: { lines: [{ account: '1000', debit: 5327, credit: 0, dimensions: { DEPT: 'OPS' }, dimensionOrigins: { DEPT: ['explicit'] } }], explanations: ['RULE-1'], checks: ['balanced'], objectEffects: [] } };
    if (path === '/api/erp/post') return { reference: data.command.reference, status: 'posted', journalIds: [2], receipt: { approved: true } };
    if (path.startsWith('/api/erp/ledger?')) return { account: '1000', opening: 0, debit: 6241, credit: 0, closing: 6241, lines: [], total: 0, nextCursor: null, currency: 'EUR', scale: 2 };
    if (path.startsWith('/api/erp/audit?')) return { items: [{ action: 'post', assurance: 'simulated-local-single-operator' }], total: 1, nextCursor: null };
    if (path.startsWith('/api/erp/journals/')) return { id: 1, reference: 'ORIGINAL', lines: [{ account: '1000', debit: 5327, credit: 0 }] };
    if (path.startsWith('/api/erp/sources/')) return { reference: 'ORIGINAL', receipt: { plan: { lines: [] } }, currentStatus: 'transferred' };
    return { status: 'pending' };
  };
  const workspace = createEnterpriseWorkspace({ root, labels, api, notify: (label, error) => notifications.push({ label, error }), onError: e => errors.push(e), period: dom.window.document.querySelector('#period'), periodStatus: dom.window.document.querySelector('#status'), isActive: () => active });
  const q = selector => root.querySelector(selector);
  const fill = (selector, value, type = 'input') => { const node = q(selector); assert.ok(node, selector); node.value = value; node.dispatchEvent(new dom.window.Event(type, { bubbles: true })); return node; };
  const click = async selector => { const node = q(selector); assert.ok(node, selector); node.click(); await tick(); await tick(); };
  const company = async () => { await workspace.show(); fill('[name="company"]', 'A', 'change'); await tick(); await tick(); };
  return { dom, root, labels, calls, errors, notifications, workspace, q, fill, click, company, deactivate: () => { active = false; workspace.deactivate(); } };
}

test('factory is lazy, standalone and company selection uses only global period', async () => {
  const f = setup();
  assert.equal(f.calls.length, 0);
  await f.company();
  assert.equal(f.root.querySelectorAll('select[name="month"]').length, 0);
  assert.equal(f.dom.window.document.querySelector('#period').options.length, 12);
  assert.ok(f.root.querySelector('[data-erp="essential"]'));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  const second = setup(); await second.workspace.show();
  assert.notEqual(f.root.ownerDocument, second.root.ownerDocument);
  f.dom.window.close(); second.dom.window.close();
});

test('empty ERP immediately clears and disables a legacy global period until a company loads', async () => {
  let releaseIndex;
  const f = setup(path => {
    if (path === '/api/erp/state') return new Promise(resolve => { releaseIndex = resolve; });
  });
  const period = f.dom.window.document.querySelector('#period'), status = f.dom.window.document.querySelector('#status');
  const legacy = f.dom.window.document.createElement('option'); legacy.value = legacy.textContent = '2026-11';
  period.append(legacy); period.value = '2026-11'; period.disabled = false; status.textContent = 'Open legacy period';
  const showing = f.workspace.show();
  assert.equal(period.options.length, 0);
  assert.equal(period.disabled, true);
  assert.match(status.textContent, /No ERP period selected/);
  releaseIndex({ available: true, companies: [], currencies: [], chartTemplates: [{ code: 'STANDARD' }] });
  await showing;
  assert.equal(period.options.length, 0); assert.equal(period.disabled, true);
  await f.workspace.selectMonth('2026-11');
  assert.equal(f.calls.length, 1);
  f.labels.setLanguage('zh'); assert.match(status.textContent, /尚未选择ERP期间/);
  f.dom.window.close();
});

test('ERP company success enables its periods, deselection clears them and pending company replies cannot restore them', async () => {
  let finish;
  const f = setup(path => {
    if (path === '/api/erp/state?company=B&month=2026-01') return new Promise(resolve => { finish = resolve; });
  });
  await f.company();
  const period = f.dom.window.document.querySelector('#period');
  assert.equal(period.disabled, false); assert.equal(period.options.length, 12);
  f.fill('[name="company"]', 'B', 'change');
  assert.equal(period.disabled, true); assert.equal(period.options.length, 0);
  f.fill('[name="company"]', '', 'change');
  finish(state('B')); await tick();
  assert.equal(period.disabled, true); assert.equal(period.options.length, 0);
  assert.match(f.dom.window.document.querySelector('#status').textContent, /No ERP period selected/);
  f.dom.window.close();
});

const action = key => `[data-erp-action="${key}"]`;
const field = name => `[name="${name}"]`;
function journal(f, reference = 'ENTRY-1') {
  f.fill(field('reference'), reference);
  f.fill('[data-erp="line"]:nth-child(1) [name="line.account"]', '1000', 'change');
  f.fill('[data-erp="line"]:nth-child(1) [name="line.debit"]', '53.27');
  f.fill('[data-erp="line"]:nth-child(2) [name="line.account"]', '4000', 'change');
  f.fill('[data-erp="line"]:nth-child(2) [name="line.credit"]', '53.27');
}
async function previewJournal(f) { journal(f); await f.click(action('preview')); }

test('company creation is explicit, typed, empty-book only and failed input is preserved', async () => {
  let fail = true;
  const f = setup((path, method) => {
    if (path === '/api/erp/companies' && method === 'POST' && fail) throw Error('Company conflict');
  });
  await f.workspace.show();
  await f.click(action('create'));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  for (const [name, value] of Object.entries({ code: 'C', name: 'Gamma', year: '2026', currency: 'EUR', scale: '2', reportCurrency: 'USD', reportScale: '2' })) f.fill(field(`create.${name}`), value);
  f.q(field('create.confirm')).click();
  await f.click(action('create'));
  assert.equal(f.q(field('create.name')).value, 'Gamma');
  assert.match(f.q('[role="alert"]').textContent, /ERP operation failed:.*Company conflict/);
  fail = false; await f.click(action('create'));
  const call = f.calls.find(c => c.path === '/api/erp/companies');
  assert.deepEqual(call.data, { code: 'C', name: 'Gamma', year: 2026, currency: 'EUR', scale: 2, reportCurrency: 'USD', reportScale: 2, chartTemplate: 'STANDARD' });
  assert.equal(f.q(field('create.confirm')).checked, false);
  assert.equal(f.calls.filter(c => c.path === '/api/erp/post').length, 0);
  f.dom.window.close();
});

test('configuration CAS loads existing revision and activation; server errors preserve inputs and localize prefix', async () => {
  const f = setup(path => { if (path === '/api/erp/config') throw Error('Revision conflict RAW'); });
  await f.company();
  f.fill(field('config.existing'), '1000', 'change');
  assert.equal(f.q(field('config.name')).value, 'Cash');
  f.fill(field('config.name'), 'Petty cash');
  f.q(field('config.active')).click(); f.q(field('config.confirm')).click();
  await f.click(action('saveConfig'));
  const call = f.calls.find(c => c.path === '/api/erp/config');
  assert.equal(call.data.expectedRevision, 3); assert.equal(call.data.active, false);
  assert.equal(call.data.data.name, 'Petty cash');
  assert.equal(call.data.data.controlModule, null); assert.equal(call.data.data.contraOf, null);
  const node = f.q(field('config.name'));
  f.labels.setLanguage('zh');
  assert.equal(f.q(field('config.name')), node);
  assert.equal(node.value, 'Petty cash');
  assert.match(f.q('[role="alert"]').textContent, /ERP操作失败：Revision conflict RAW/);
  assert.equal(f.errors[0].message, 'Revision conflict RAW');
  f.dom.window.close();
});

test('all ten configuration kinds expose schema fields; advanced JSON rejects malformed maps/lists without writes', async () => {
  const f = setup(); await f.company();
  const required = {
    account: ['category', 'reportGroup', 'normalSide', 'purpose', 'controlModule', 'contraOf', 'manualAllowed'],
    dimension: ['name', 'from', 'to'], dimensionValue: ['dimension', 'value', 'name'],
    defaults: ['account', 'values'], derivation: ['when', 'values', 'mode'],
    structure: ['account', 'required', 'allowed', 'conditionals', 'fixed'],
    balance: ['dimension', 'account'], service: ['name', 'group', 'defaultDimensions'],
    party: ['name', 'group', 'defaultDimensions'], rule: ['event', 'meaning', 'objectScope', 'objectCode', 'partyScope', 'partyCode', 'account', 'dimensions', 'from', 'to']
  };
  for (const [kind, fields] of Object.entries(required)) {
    f.fill(field('config.kind'), kind, 'change');
    fields.forEach(name => assert.ok(f.q(field(`config.${name}`)), `${kind}.${name}`));
  }
  f.fill(field('config.kind'), 'structure', 'change'); f.fill(field('config.code'), '5300');
  f.fill(field('config.account'), '5300'); f.fill(field('config.required'), '{"wrong":"object"}');
  f.q(field('config.confirm')).click(); await f.click(action('saveConfig'));
  assert.equal(f.calls.filter(c => c.path === '/api/erp/config').length, 0);
  assert.match(f.q('[role="alert"]').textContent, /Invalid JSON structure/);
  assert.equal(f.q(field('config.required')).value, '{"wrong":"object"}');
  f.fill(field('config.required'), '["DEPT"]'); await f.click(action('saveConfig'));
  const call = f.calls.find(c => c.path === '/api/erp/config');
  assert.equal(call.data.expectedRevision, 0);
  assert.deepEqual(call.data.data.required, ['DEPT']);
  f.dom.window.close();
});

test('journal rows start blank, exact amounts and dimensions preview final lines; no auto posting', async () => {
  const f = setup(); await f.company();
  assert.equal(f.q(field('line.account')).value, '');
  assert.equal(f.q(field('line.debit')).value, '');
  assert.equal(f.q(field('line.credit')).value, '');
  journal(f);
  f.fill('[data-erp="line"]:nth-child(1) [name="line.dimensions.DEPT"]', 'OPS', 'change');
  f.fill('[data-erp="line"]:nth-child(2) [name="line.dimensions.DEPT"]', '__null', 'change');
  f.fill(field('documentDate'), '2025-12-29'); f.fill(field('taxDate'), '2026-02-02');
  await f.click(action('preview'));
  const call = f.calls.find(c => c.path === '/api/erp/preview');
  assert.deepEqual(Object.keys(call.data).sort(), ['accountingDate', 'company', 'data', 'documentDate', 'operation', 'reference', 'sourceRevision', 'taxDate']);
  assert.equal(call.data.sourceRevision, 0); assert.equal(call.data.documentDate, '2025-12-29'); assert.equal(call.data.taxDate, '2026-02-02');
  assert.equal(call.data.data.lines[0].debit, '53.27');
  assert.deepEqual(call.data.data.lines[0].dimensions, { DEPT: 'OPS' });
  assert.deepEqual(call.data.data.lines[1].dimensions, { DEPT: null });
  assert.match(f.q('[data-erp="preview"]').textContent, /53\.27.*OPS.*explicit.*RULE-1/s);
  assert.equal(f.calls.filter(c => c.path === '/api/erp/post').length, 0);
  assert.equal(f.q(action('post')).disabled, true);
  f.q(field('confirmPost')).click(); await f.click(action('post'));
  const post = f.calls.find(c => c.path === '/api/erp/post');
  assert.deepEqual(post.data, { command: call.data, token: 'TOKEN', confirmation: 'POST' });
  assert.equal(f.q(action('post')).disabled, true);
  f.dom.window.close();
});

test('every command edit, row addition/removal and dimension selection invalidates confirmation', async () => {
  const f = setup(); await f.company(); journal(f);
  for (const [name, value, type] of [
    ['reference', 'ENTRY-2'], ['accountingDate', '2026-01-02'], ['documentDate', '2026-01-03'],
    ['taxDate', '2026-01-04'], ['entry.memo', 'changed'], ['entry.transferMode', 'queued', 'change'],
    ['line.dimensions.DEPT', 'OPS', 'change'], ['entry.headerDimensions.DEPT', '__null', 'change']
  ]) {
    await f.click(action('preview')); f.q(field('confirmPost')).click();
    assert.equal(f.q(action('post')).disabled, false);
    f.fill(field(name), value, type);
    assert.equal(f.q(action('post')).disabled, true, name);
    assert.ok(f.q('[data-erp="stale"]'));
  }
  await f.click(action('preview')); await f.click(action('addLine'));
  assert.equal(f.root.querySelectorAll('[data-erp="line"]').length, 3);
  assert.equal(f.q(action('post')).disabled, true);
  f.root.querySelectorAll('[data-erp="line"]')[2].querySelector(action('removeLine')).click();
  assert.equal(f.root.querySelectorAll('[data-erp="line"]').length, 2);
  f.dom.window.close();
});

test('amount precision errors and imbalance remain visible; failures do not clear entry', async () => {
  const f = setup(path => { if (path === '/api/erp/preview') throw Error('Unbalanced RAW'); });
  await f.company(); journal(f);
  f.fill(field('line.debit'), '53.271'); await f.click(action('preview'));
  assert.equal(f.calls.filter(c => c.path === '/api/erp/preview').length, 0);
  assert.match(f.q('[role="alert"]').textContent, /at most 2 decimal places/);
  f.fill(field('line.debit'), '53.28'); await f.click(action('preview'));
  assert.match(f.q('[data-erp="imbalance"]').textContent, /0\.01 EUR/);
  assert.match(f.q('[role="alert"]').textContent, /Unbalanced RAW/);
  assert.equal(f.q(field('line.debit')).value, '53.28');
  f.dom.window.close();
});

test('all eight finite operation forms construct their exact typed command fields', async () => {
  const f = setup(); await f.company();
  const cases = [
    ['journal', {}, ['currency', 'headerDimensions', 'kind', 'lines', 'memo', 'transferMode']],
    ['cash_service', { service: 'CONSULT', party: 'P1', amount: '9.14' }, ['amount', 'currency', 'dimensions', 'memo', 'party', 'service']],
    ['statistics', { code: 'HEADCOUNT', quantity: '3.125', unit: 'persons' }, ['code', 'dimensions', 'quantity', 'unit']],
    ['clearing.match', { account: '1000', lineIds: '1,2', reason: 'matched' }, ['account', 'lineIds', 'reason']],
    ['reverse', { originalJournalId: '1', memo: 'reversal' }, ['memo', 'originalJournalId']],
    ['replace', { originalJournalId: '1', memo: 'replacement' }, ['headerDimensions', 'lines', 'memo', 'originalJournalId']],
    ['reclassify', { originalJournalId: '1', memo: 'reclassification' }, ['headerDimensions', 'lines', 'memo', 'originalJournalId']],
    ['cash_service.cancel', { originalReference: 'SALE-1', memo: 'source cancel' }, ['memo', 'originalReference']]
  ];
  assert.equal(f.q(field('operation')).options.length, 8);
  for (const [op, values, keys] of cases) {
    f.fill(field('operation'), op, 'change'); f.fill(field('reference'), `REF-${op}`);
    for (const [name, value] of Object.entries(values)) f.fill(field(`entry.${name}`), value, ['service', 'party', 'account'].includes(name) ? 'change' : 'input');
    if (f.q(field('line.account'))) journal(f, `REF-${op}`);
    await f.click(action('preview'));
    const request = f.calls.filter(c => c.path === '/api/erp/preview').at(-1);
    assert.equal(request.data.operation, op);
    assert.deepEqual(Object.keys(request.data.data).sort(), keys);
    if (op === 'clearing.match') assert.deepEqual(request.data.data.lineIds, [1, 2]);
    if (['reverse', 'replace', 'reclassify'].includes(op)) assert.equal(request.data.data.originalJournalId, 1);
  }
  assert.equal(f.calls.filter(c => c.path === '/api/erp/post').length, 0);
  f.dom.window.close();
});

test('queue transfer and withdrawal require explicit guard and reason; transferred is never withdrawable', async () => {
  const f = setup(); await f.company();
  const queue = f.q('[data-section="queue"]'), pending = queue.querySelector('tbody tr');
  const transfer = pending.querySelector(action('transfer')), withdraw = pending.querySelector(action('withdraw'));
  assert.equal(transfer.disabled, true); assert.equal(withdraw.disabled, true);
  pending.querySelector(field('queue.confirm.Q1')).click();
  assert.equal(transfer.disabled, false); assert.equal(withdraw.disabled, true);
  f.fill(field('queue.reason.Q1'), 'No longer needed'); withdraw.click(); await tick(); await tick();
  assert.deepEqual(f.calls.find(c => c.path === '/api/erp/withdraw').data, { company: 'A', reference: 'Q1', reason: 'No longer needed' });
  const transferred = f.q('[data-section="queue"]').querySelectorAll('tbody tr')[1];
  assert.equal(transferred.querySelector(action('withdraw')).disabled, true);
  assert.equal(transferred.querySelector(action('transfer')).disabled, true);
  f.q(field('queue.confirm.Q1')).click(); await f.click(`[data-section="queue"] ${action('transfer')}`);
  assert.deepEqual(f.calls.find(c => c.path === '/api/erp/transfer').data, { company: 'A', reference: 'Q1' });
  f.dom.window.close();
});

test('period CAS preserves API rejection without pretending to freeze', async () => {
  const f = setup(path => { if (path === '/api/erp/period') throw Error('pending transfer blocks hold'); });
  await f.company();
  f.fill(field('period.status'), 'hold', 'change'); f.fill(field('period.reason'), 'review');
  f.q(field('period.confirm')).click(); await f.click(action('savePeriod'));
  const call = f.calls.find(c => c.path === '/api/erp/period');
  assert.deepEqual(call.data, { company: 'A', month: '2026-01', expectedRevision: 1, status: 'hold', modules: ['journal', 'cash_service', 'statistics', 'clearing', 'correction'], reason: 'review', permanentConfirmation: false });
  assert.match(f.dom.window.document.querySelector('#status').textContent, /Open/);
  assert.equal(f.q(field('period.reason')).value, 'review');
  assert.match(f.q('[role="alert"]').textContent, /pending transfer blocks hold/);
  f.dom.window.close();
});

test('reports separate base currency, monthly/YTD and untranslated reporting; trial drilldown preserves company/month', async () => {
  const f = setup(); await f.company();
  const reports = f.q('[data-section="reports"]');
  assert.match(reports.textContent, /EUR.*2 decimal places/s);
  assert.match(reports.textContent, /USD: not translated.*not zero/s);
  assert.match(reports.textContent, /Selected month.*9\.14.*Year to date.*7\.06/s);
  assert.match(reports.textContent, /Unclosed YTD earnings/);
  reports.querySelector('tbody button').click(); await tick();
  const call = f.calls.find(c => c.path.startsWith('/api/erp/ledger?'));
  assert.equal(call.path, '/api/erp/ledger?company=A&month=2026-01&account=1000');
  f.fill(field('ledger.dimension'), 'DEPT'); f.fill(field('ledger.value'), 'OPS'); await f.click(action('loadLedger'));
  assert.match(f.calls.at(-1).path, /dimension=DEPT&value=OPS/);
  assert.match(f.q('[data-section="statistics"]').textContent, /3\.125.*persons/s);
  f.dom.window.close();
});

test('full journals/sources and paged state/audit are reachable with scoped API queries', async () => {
  const f = setup(); await f.company();
  await f.click(`[data-section="journals"] ${action('viewJournal')}`);
  assert.ok(f.calls.find(c => c.path === '/api/erp/journals/1?company=A'));
  await f.click(`[data-erp="detail"] ${action('viewSource')}`);
  assert.ok(f.calls.find(c => c.path === '/api/erp/sources/ORIGINAL?company=A'));
  assert.match(f.q('[data-erp="detail"]').textContent, /Original approval\/receipt is immutable/);
  assert.match(f.q('[data-section="journals"]').textContent, /This page: 1; total: 2/);
  await f.click(`[data-section="journals"] ${action('nextPage')}`);
  assert.ok(f.calls.find(c => c.path === '/api/erp/state?company=A&month=2026-01&cursor=j2'));
  await f.click(action('loadAudit'));
  assert.ok(f.calls.find(c => c.path === '/api/erp/audit?company=A'));
  assert.match(f.q('[data-section="audit"]').textContent, /simulated-local-single-operator/);
  f.dom.window.close();
});

test('language, theme and teaching toggles preserve actual nodes, entry, preview and token', async () => {
  const f = setup(); await f.company(); await previewJournal(f);
  const input = f.q(field('line.debit')), preview = f.q('[data-erp="preview"]'), nodes = [...preview.childNodes];
  const before = f.calls.length;
  f.labels.setLanguage('zh'); f.dom.window.document.documentElement.dataset.theme = 'green';
  f.workspace.setTeaching(true); f.workspace.setTeaching(false);
  assert.equal(f.q(field('line.debit')), input); assert.equal(input.value, '53.27');
  assert.deepEqual([...preview.childNodes], nodes);
  assert.equal(f.calls.length, before);
  assert.match(f.q('[data-erp="essential"]').textContent, /模拟批准.*总账过账/);
  assert.equal(f.q('[data-erp="essential"]').hidden, false);
  f.q(field('confirmPost')).click(); await f.click(action('post'));
  assert.equal(f.calls.find(c => c.path === '/api/erp/post').data.token, 'TOKEN');
  f.dom.window.close();
});

test('late company, month, preview and inactive-container replies cannot overwrite current workspace', async () => {
  const pending = new Map();
  const f = setup((path) => {
    if (path.startsWith('/api/erp/state?') || path === '/api/erp/preview') return new Promise(resolve => pending.set(path, resolve));
  });
  await f.workspace.show();
  f.fill(field('company'), 'A', 'change');
  f.fill(field('company'), 'B', 'change');
  pending.get('/api/erp/state?company=B&month=2026-01')(state('B')); await tick();
  pending.get('/api/erp/state?company=A&month=2026-01')(state('A')); await tick();
  assert.match(f.q('[data-section="reports"]').textContent, /Company B/);
  const feb = f.workspace.selectMonth('2026-02'), march = f.workspace.selectMonth('2026-03');
  pending.get('/api/erp/state?company=B&month=2026-03')(state('B', '2026-03')); await march;
  pending.get('/api/erp/state?company=B&month=2026-02')(state('B', '2026-02')); await feb;
  assert.equal(f.dom.window.document.querySelector('#period').value, '2026-03');
  journal(f); f.q(action('preview')).click(); await tick();
  f.fill(field('reference'), 'CHANGED');
  pending.get('/api/erp/preview')({ command: {}, token: 'OLD', plan: { lines: [] } }); await tick();
  assert.equal(f.q(field('confirmPost')).disabled, true);
  const april = f.workspace.selectMonth('2026-04');
  f.deactivate(); const before = f.root.textContent;
  pending.get('/api/erp/state?company=B&month=2026-04')(state('B', '2026-04')); await april;
  assert.equal(f.root.textContent, before);
  assert.equal(f.dom.window.document.querySelector('#period').value, '2026-03');
  f.dom.window.close();
});

test('a failed month restores the last successful ERP month, not a legacy month', async () => {
  const f = setup(path => { if (path === '/api/erp/state?company=A&month=2026-02') throw Error('month unavailable'); });
  await f.company();
  const input = f.q(field('reference')); f.fill(field('reference'), 'KEEP');
  f.dom.window.document.querySelector('#period').value = '2026-02';
  await f.workspace.selectMonth('2026-02');
  assert.equal(f.dom.window.document.querySelector('#period').value, '2026-01');
  assert.equal(f.q(field('reference')), input); assert.equal(input.value, 'KEEP');
  assert.match(f.q('[data-section="reports"]').textContent, /2026-01/);
  assert.match(f.q('[role="alert"]').textContent, /month unavailable/);
  f.dom.window.close();
});

test('all static factory UI text and option/aria bindings use matching bilingual resources', async () => {
  const f = setup(); await f.company();
  for (const kind of [...f.q(field('config.kind')).options].map(option => option.value)) f.fill(field('config.kind'), kind, 'change');
  for (const op of [...f.q(field('operation')).options].map(option => option.value)) f.fill(field('operation'), op, 'change');
  const walk = f.dom.window.document.createTreeWalker(f.root, f.dom.window.NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walk.nextNode())) {
    if (!node.textContent.trim()) continue;
    assert.ok(node.parentElement.closest('[data-label-bound], [data-ui-data], textarea'), `Unbound static text: ${node.textContent}`);
  }
  for (const control of f.root.querySelectorAll('input, textarea, select')) {
    assert.ok(control.hasAttribute('aria-label'), `Missing accessible label for ${control.name}`);
  }
  const zh = Object.keys(dictionaries.zh).filter(key => key.startsWith('erp.') || key === 'page.enterprise.description').sort();
  const en = Object.keys(dictionaries.en).filter(key => key.startsWith('erp.') || key === 'page.enterprise.description').sort();
  assert.deepEqual(zh, en); assert.ok(zh.length > 200);
  f.dom.window.close();
});

test('successful configuration updates its CAS version and refreshes account/dimension choices without clearing entry', async () => {
  const record = state();
  const f = setup((path, method, data) => {
    if (path.startsWith('/api/erp/state?')) return structuredClone(record);
    if (path === '/api/erp/config') {
      const saved = { kind: data.kind, code: data.code, active: data.active, revision: data.expectedRevision + 1, data: data.data };
      record.configs = record.configs.filter(item => !(item.kind === data.kind && item.code === data.code)); record.configs.push(saved);
      if (data.kind === 'account') record.accounts.push({ code: data.code, ...data.data });
      return saved;
    }
  });
  await f.company(); journal(f);
  const original = f.q(field('line.debit')), dimension = f.q(field('line.dimensions.DEPT'));
  f.fill(field('line.dimensions.DEPT'), 'OPS', 'change');
  f.fill(field('config.kind'), 'dimension', 'change'); f.fill(field('config.code'), 'COST');
  f.fill(field('config.name'), 'Cost center'); f.q(field('config.confirm')).click();
  await f.click(action('saveConfig'));
  assert.equal(f.q('output[name="config.revision"]').value, '1');
  assert.equal(f.q(field('line.debit')), original); assert.equal(original.value, '53.27');
  assert.equal(f.q(field('line.dimensions.DEPT')), dimension); assert.equal(dimension.value, 'OPS');
  assert.ok(f.q(field('line.dimensions.COST')));
  f.fill(field('config.name'), 'Updated cost center'); f.q(field('config.confirm')).click();
  await f.click(action('saveConfig'));
  assert.equal(f.calls.filter(c => c.path === '/api/erp/config').at(-1).data.expectedRevision, 1);
  f.fill(field('config.kind'), 'account', 'change'); f.fill(field('config.code'), '1010'); f.fill(field('config.name'), 'Bank cash');
  f.q(field('config.confirm')).click(); await f.click(action('saveConfig'));
  assert.ok([...f.q(field('line.account')).options].some(option => option.value === '1010'));
  f.dom.window.close();
});

test('post sends the normalized command, error preserves candidate and retry remains explicit', async () => {
  let shouldFail = true, normalized;
  const f = setup((path, method, data) => {
    if (path === '/api/erp/preview') {
      normalized = structuredClone(data); normalized.data.memo = 'server-normalized';
      return { command: normalized, token: 'CANONICAL', plan: { lines: [] } };
    }
    if (path === '/api/erp/post' && shouldFail) throw Error('token expired RAW');
  });
  await f.company(); await previewJournal(f);
  f.q(field('confirmPost')).click(); await f.click(action('post'));
  assert.equal(f.calls.find(c => c.path === '/api/erp/post').data.command.data.memo, 'server-normalized');
  assert.match(f.q('[role="alert"]').textContent, /token expired RAW/);
  assert.equal(f.q(field('line.debit')).value, '53.27');
  assert.equal(f.calls.filter(c => c.path === '/api/erp/post').length, 1);
  shouldFail = false; await f.click(action('post'));
  assert.equal(f.calls.filter(c => c.path === '/api/erp/post').length, 2);
  assert.equal(f.q(action('post')).disabled, true);
  f.dom.window.close();
});

test('leaving and re-entering the parent-owned root restores the same form nodes but requires a fresh preview', async () => {
  const f = setup(); await f.company(); await previewJournal(f);
  const original = f.q(field('line.debit'));
  f.workspace.deactivate(); f.root.replaceChildren();
  await f.workspace.show();
  assert.equal(f.q(field('line.debit')), original);
  assert.equal(original.value, '53.27');
  assert.equal(f.q(field('company')).value, 'A');
  assert.equal(f.dom.window.document.querySelector('#period').value, '2026-01');
  assert.equal(f.q(action('post')).disabled, true);
  assert.ok(f.q('[data-erp="stale"]'));
  f.dom.window.close();
});

test('queue failure is visible, reason and entry persist; explicit refresh reads actual failed state', async () => {
  let failed = false;
  const f = setup(path => {
    if (path.startsWith('/api/erp/state?')) {
      const result = state(); if (failed) result.transfers[0].status = 'failed'; return result;
    }
    if (path === '/api/erp/transfer') { failed = true; throw Error('period no longer open'); }
  });
  await f.company(); journal(f);
  f.fill(field('queue.reason.Q1'), 'Keep my reason');
  f.q(field('queue.confirm.Q1')).click(); await f.click(`[data-section="queue"] ${action('transfer')}`);
  assert.match(f.q('[role="alert"]').textContent, /period no longer open/);
  assert.equal(f.q(field('queue.reason.Q1')).value, 'Keep my reason');
  await f.click(action('refresh'));
  assert.match(f.q('[data-section="queue"]').textContent, /Transfer failed/);
  assert.equal(f.q(field('queue.reason.Q1')).value, 'Keep my reason');
  assert.equal(f.q(field('line.debit')).value, '53.27');
  assert.equal(f.q(field('queue.confirm.Q1')).checked, false);
  f.dom.window.close();
});

test('precision 0 and 4, contra gross/net and unresolved suspense metadata remain observable', async () => {
  for (const scale of [0, 4]) {
    const f = setup(path => {
      if (!path.startsWith('/api/erp/state?')) return;
      const result = state();
      result.company.scale = result.reports.scale = scale;
      result.reports.accountAnalysis = { rows: [{ account: '1000', normalSide: 'DEBIT', closing: -7, abnormal: true }], contraGroups: [{ account: '1200', gross: 830000, contra: 72500, net: 757500 }] };
      result.suspense = [{ id: 8, account: '2900', reference: 'S1', debit: 1200, credit: 0, metadata: { owner: 'Pat', reason: 'Unresolved evidence', reviewDate: '2026-01-02' }, overdue: true }];
      return result;
    });
    await f.company(); journal(f); f.fill(field('line.debit'), scale === 0 ? '53.2' : '53.27123');
    await f.click(action('preview'));
    assert.equal(f.calls.filter(c => c.path === '/api/erp/preview').length, 0);
    assert.match(f.q('[role="alert"]').textContent, new RegExp(`at most ${scale} decimal places`));
    const reports = f.q('[data-section="reports"]').textContent;
    assert.match(reports, /Opposite normal balance.*Yes/s);
    assert.match(reports, scale === 4 ? /83\.0000.*7\.2500.*75\.7500/s : /830000.*72500.*757500/s);
    assert.match(f.q('[data-section="obligations"]').textContent, /Pat.*Unresolved evidence.*2026-01-02.*Yes/s);
    f.dom.window.close();
  }
});

test('container removal alone invalidates late detail and audit requests and no stale error leaks', async () => {
  const pending = new Map(), f = setup(path => {
    if (path.startsWith('/api/erp/journals/') || path.startsWith('/api/erp/audit?')) return new Promise((resolve, reject) => pending.set(path, { resolve, reject }));
  });
  await f.company();
  f.q(`[data-section="journals"] ${action('viewJournal')}`).click();
  f.q(action('loadAudit')).click();
  await tick(); f.root.replaceChildren();
  pending.get('/api/erp/journals/1?company=A').resolve({ id: 1, lines: [] });
  pending.get('/api/erp/audit?company=A').reject(Error('STALE ERROR'));
  await tick(); await tick();
  assert.equal(f.root.textContent, '');
  assert.equal(f.errors.length, 0);
  f.dom.window.close();
});

test('configuration responses cannot overwrite a different kind edited while save is pending', async () => {
  let finish;
  const f = setup(path => { if (path === '/api/erp/config') return new Promise(resolve => { finish = resolve; }); });
  await f.company();
  f.fill(field('config.existing'), '1000', 'change'); f.q(field('config.confirm')).click();
  f.q(action('saveConfig')).click(); await tick();
  f.fill(field('config.kind'), 'service', 'change'); f.fill(field('config.code'), 'NEW-SERVICE'); f.fill(field('config.name'), 'Unsaved service');
  finish({}); await tick(); await tick();
  assert.equal(f.q(field('config.kind')).value, 'service');
  assert.equal(f.q(field('config.code')).value, 'NEW-SERVICE');
  assert.equal(f.q(field('config.name')).value, 'Unsaved service');
  assert.equal(f.q('output[name="config.revision"]').value, '0');
  f.dom.window.close();
});

test('obsolete preview and detail failures are suppressed after a newer edit or detail succeeds', async () => {
  let rejectPreview, rejectJournal;
  const f = setup(path => {
    if (path === '/api/erp/preview') return new Promise((resolve, reject) => { rejectPreview = reject; });
    if (path.startsWith('/api/erp/journals/')) return new Promise((resolve, reject) => { rejectJournal = reject; });
  });
  await f.company(); journal(f);
  f.q(action('preview')).click(); await tick();
  f.fill(field('entry.memo'), 'Edited while calculating');
  rejectPreview(Error('obsolete preview error')); await tick();
  assert.equal(f.errors.length, 0);
  f.q(`[data-section="journals"] ${action('viewJournal')}`).click(); await tick();
  await f.click(`[data-section="sources"] ${action('viewSource')}`);
  rejectJournal(Error('obsolete journal error')); await tick();
  assert.equal(f.errors.length, 0);
  assert.match(f.q('[data-erp="detail"]').textContent, /Original approval/);
  f.dom.window.close();
});

test('late accepted creation after company switch releases Create; explicit refresh and show reconcile index without changing scope', async () => {
  let finishCreate, created = false;
  const f = setup(path => {
    if (path === '/api/erp/companies') return new Promise(resolve => { finishCreate = () => { created = true; resolve({ code: 'C' }); }; });
    if (path === '/api/erp/state') return { available: true, companies: [...state().companies, ...(created ? [{ code: 'C', name: 'Gamma', year: 2026 }] : [])], chartTemplates: [{ code: 'STANDARD' }] };
  });
  await f.workspace.show();
  for (const [name, value] of Object.entries({ code: 'C', name: 'Gamma', year: '2026', currency: 'EUR', scale: '2', reportCurrency: 'USD', reportScale: '2' })) f.fill(field(`create.${name}`), value);
  f.q(field('create.confirm')).click();
  const create = f.q(action('create')); create.click(); await tick();
  assert.equal(create.disabled, true);
  f.fill(field('company'), 'A', 'change'); await tick(); await tick();
  const reference = f.fill(field('reference'), 'KEEP-A'), before = f.calls.length;
  finishCreate(); await tick(); await tick();
  assert.equal(create.disabled, false);
  assert.equal(f.calls.length, before, 'stale creation must not start a scope-changing index request');
  assert.equal(f.notifications.length, 0);
  assert.equal(f.q(field('company')).value, 'A'); assert.equal(f.q(field('reference')), reference);
  await f.click(action('refresh'));
  assert.ok([...f.q(field('company')).options].some(option => option.value === 'C'));
  assert.equal(f.q(field('company')).value, 'A'); assert.equal(reference.value, 'KEEP-A');
  assert.equal(f.dom.window.document.querySelector('#period').value, '2026-01');
  f.workspace.deactivate(); f.root.replaceChildren();
  const indexReads = f.calls.filter(call => call.path === '/api/erp/state').length;
  await f.workspace.show();
  assert.equal(f.calls.filter(call => call.path === '/api/erp/state').length, indexReads + 1);
  assert.equal(f.q(field('company')).value, 'A');
  assert.equal(f.notifications.length, 0);
  f.dom.window.close();
});

test('pending period/config/preview actions release the same connected button after deactivate and re-entry', async () => {
  for (const key of ['savePeriod', 'saveConfig', 'preview']) {
    let finish;
    const path = { savePeriod: '/api/erp/period', saveConfig: '/api/erp/config', preview: '/api/erp/preview' }[key];
    const f = setup(url => { if (url === path) return new Promise(resolve => { finish = resolve; }); });
    await f.company();
    if (key === 'savePeriod') { f.fill(field('period.reason'), 'Period review'); f.q(field('period.confirm')).click(); }
    if (key === 'saveConfig') { f.fill(field('config.existing'), '1000', 'change'); f.q(field('config.confirm')).click(); }
    if (key === 'preview') journal(f);
    const control = f.q(action(key)); control.click(); await tick(); assert.equal(control.disabled, true);
    f.workspace.deactivate(); f.root.replaceChildren(); await f.workspace.show();
    assert.equal(f.q(action(key)), control);
    const before = f.calls.length;
    finish({ command: {}, token: 'STALE', plan: { lines: [] } }); await tick(); await tick();
    assert.equal(control.disabled, false, key);
    assert.equal(f.calls.length, before, 'obsolete completion must not load or notify');
    assert.equal(f.notifications.length, 0);
    assert.equal(f.q(action('post')).disabled, true);
    f.dom.window.close();
  }
});

test('cleanup also releases a detached action before a later re-entry; queue cleanup preserves explicit guards', async () => {
  let rejectPeriod;
  const f = setup(path => { if (path === '/api/erp/period') return new Promise((resolve, reject) => { rejectPeriod = reject; }); });
  await f.company(); f.fill(field('period.reason'), 'Review'); f.q(field('period.confirm')).click();
  const save = f.q(action('savePeriod')); save.click(); await tick();
  f.workspace.deactivate(); f.root.replaceChildren();
  rejectPeriod(Error('obsolete failure')); await tick(); await tick();
  await f.workspace.show();
  assert.equal(f.q(action('savePeriod')), save); assert.equal(save.disabled, false);
  assert.equal(f.errors.length, 0); assert.equal(f.notifications.length, 0);
  f.dom.window.close();

  let finishTransfer;
  const q = setup(path => { if (path === '/api/erp/transfer') return new Promise(resolve => { finishTransfer = resolve; }); });
  await q.company(); q.q(field('queue.confirm.Q1')).click();
  const transfer = q.q(`[data-section="queue"] ${action('transfer')}`), queue = q.q('[data-section="queue"]');
  transfer.click(); await tick(); assert.equal(transfer.disabled, true);
  q.workspace.deactivate();
  finishTransfer({ status: 'transferred' }); await tick(); await tick();
  assert.equal(transfer.disabled, false, 'local queue busy cleanup is independent of request context');
  const writes = q.calls.filter(call => call.method === 'POST').length;
  transfer.click(); await tick();
  assert.equal(q.calls.filter(call => call.method === 'POST').length, writes, 'inactive queue action is not executable');
  assert.equal(q.q('[data-section="queue"]'), queue);
  assert.equal(q.notifications.length, 0);
  q.dom.window.close();
});

test('creation index completion after a company switch cannot notify or overwrite the selected company', async () => {
  let indexReads = 0, finishIndex;
  const f = setup(path => {
    if (path === '/api/erp/state' && ++indexReads === 2) return new Promise(resolve => { finishIndex = resolve; });
  });
  await f.workspace.show();
  for (const [name, value] of Object.entries({ code: 'C', name: 'Gamma', currency: 'EUR', reportCurrency: 'USD' })) f.fill(field(`create.${name}`), value);
  f.q(field('create.confirm')).click();
  const create = f.q(action('create')); create.click(); await tick();
  f.fill(field('company'), 'A', 'change'); await tick(); await tick();
  finishIndex({ companies: [{ code: 'C', name: 'Gamma', year: 2026 }], chartTemplates: [{ code: 'STANDARD' }] });
  await tick(); await tick();
  assert.equal(create.disabled, false);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.q(field('company')).value, 'A');
  assert.match(f.q('[data-section="reports"]').textContent, /Company A/);
  f.dom.window.close();
});

test('a late accepted post stays server-queryable, without restoring stale confirmation or announcing old-company success', async () => {
  let finishPost, accepted;
  const f = setup((path, method, data) => {
    if (path === '/api/erp/post') return new Promise(resolve => {
      finishPost = () => {
        accepted = { reference: data.command.reference, operation: 'journal', status: 'posted', journalIds: [9], receipt: { command: data.command, token: data.token, status: 'posted' } };
        resolve(accepted);
      };
    });
    if (path === '/api/erp/sources/ENTRY-1?company=A') return accepted;
  });
  await f.company(); await previewJournal(f);
  f.q(field('confirmPost')).click();
  const post = f.q(action('post')); post.click(); await tick();
  f.workspace.deactivate(); f.root.replaceChildren(); await f.workspace.show();
  assert.equal(f.q(action('post')), post);
  finishPost(); await tick(); await tick();
  assert.equal(post.disabled, true);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.calls.filter(call => call.path === '/api/erp/post').length, 1);
  f.fill(field('source.lookup'), 'ENTRY-1');
  const find = f.q('[data-section="sources"]').querySelectorAll(action('viewSource'));
  find[find.length - 1].click(); await tick(); await tick();
  assert.match(f.q('[data-erp="detail"]').textContent, /ENTRY-1.*posted/s);
  assert.ok(f.calls.find(call => call.path === '/api/erp/sources/ENTRY-1?company=A'));
  assert.equal(post.disabled, true);
  f.dom.window.close();
});

test('refresh adopts an externally changed current period coherently, clears stale approval and allows a newly confirmed CAS save', async () => {
  const record = state();
  const current = record.periods[0];
  const f = setup((path, method, data) => {
    if (path.startsWith('/api/erp/state?')) return structuredClone(record);
    if (path === '/api/erp/period') {
      if (data.expectedRevision !== current.revision) throw Object.assign(Error('Period revision conflict'), { status: 409 });
      current.status = data.status; current.modules = [...data.modules]; current.revision++;
      return structuredClone(current);
    }
  });
  await f.company(); await previewJournal(f);
  const memo = f.fill(field('entry.memo'), 'Keep unrelated business memo');
  const configName = f.fill(field('config.name'), 'Keep unsaved account name');
  const preview = f.q('[data-erp="preview"]'), previewTable = preview.querySelector('table');
  const status = f.q(field('period.status'));
  f.fill(field('period.reason'), 'Old review');
  f.q(field('period.confirm')).click(); f.q(field('period.permanentConfirmation')).click();
  current.status = 'hold'; current.modules = ['statistics']; current.revision = 2;
  await f.click(action('savePeriod'));
  assert.equal(f.calls.filter(call => call.path === '/api/erp/period').at(-1).data.expectedRevision, 1);
  assert.match(f.q('[role="alert"]').textContent, /Period revision conflict/);
  await f.click(action('refresh'));
  assert.equal(f.q(field('period.status')), status);
  assert.equal(status.value, 'hold');
  for (const module of ['journal', 'cash_service', 'statistics', 'clearing', 'correction']) {
    assert.equal(f.q(field(`period.module.${module}`)).checked, module === 'statistics', module);
  }
  assert.equal(f.q(field('period.confirm')).checked, false);
  assert.equal(f.q(field('period.permanentConfirmation')).checked, false);
  assert.equal(f.q(field('entry.memo')), memo); assert.equal(memo.value, 'Keep unrelated business memo');
  assert.equal(f.q(field('config.name')), configName); assert.equal(configName.value, 'Keep unsaved account name');
  assert.equal(f.q('[data-erp="preview"]'), preview); assert.equal(preview.querySelector('table'), previewTable);
  const writes = f.calls.filter(call => call.path === '/api/erp/period').length;
  await f.click(action('savePeriod'));
  assert.equal(f.calls.filter(call => call.path === '/api/erp/period').length, writes, 'refresh must not rebase stale approval');
  f.fill(field('period.status'), 'open', 'change'); f.q(field('period.module.journal')).click();
  f.fill(field('period.reason'), 'Reviewed external hold and module restrictions');
  f.q(field('period.confirm')).click(); await f.click(action('savePeriod'));
  const saved = f.calls.filter(call => call.path === '/api/erp/period').at(-1).data;
  assert.deepEqual(saved, { company: 'A', month: '2026-01', expectedRevision: 2, status: 'open', modules: ['journal', 'statistics'], reason: 'Reviewed external hold and module restrictions', permanentConfirmation: false });
  assert.equal(current.revision, 3);
  assert.equal(f.q(field('period.confirm')).checked, false);
  assert.equal(f.q(field('period.status')), status);
  assert.equal(memo.value, 'Keep unrelated business memo');
  f.dom.window.close();
});

test('ordinary refresh preserves period edits when its revision is unchanged, including changes to another month only', async () => {
  const record = state();
  const f = setup(path => { if (path.startsWith('/api/erp/state?')) return structuredClone(record); });
  await f.company();
  const status = f.fill(field('period.status'), 'hold', 'change');
  f.q(field('period.module.cash_service')).click();
  f.fill(field('period.reason'), 'Unfinished period review');
  f.q(field('period.confirm')).click(); f.q(field('period.permanentConfirmation')).click();
  record.periods[1] = { ...record.periods[1], revision: 2, status: 'hold', modules: [] };
  await f.click(action('refresh'));
  assert.equal(f.q(field('period.status')), status); assert.equal(status.value, 'hold');
  assert.equal(f.q(field('period.module.cash_service')).checked, false);
  assert.equal(f.q(field('period.reason')).value, 'Unfinished period review');
  assert.equal(f.q(field('period.confirm')).checked, true);
  assert.equal(f.q(field('period.permanentConfirmation')).checked, true);
  assert.equal(f.calls.filter(call => call.path === '/api/erp/period').length, 0);
  f.dom.window.close();
});

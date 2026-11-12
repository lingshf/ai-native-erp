import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Book, money } from '../src/book.mjs';
import { DatabaseSync } from 'node:sqlite';

const today = '2026-01-15';
const book = () => new Book(':memory:', { today });
const draft = (overrides = {}) => ({
  date: today, memo: 'Test transaction', kind: 'normal',
  lines: [{ account: '1000', debit: '100.00', credit: '0' },
    { account: '4000', debit: '0', credit: '100.00' }],
  ...overrides,
});
const post = (b, data) => b.post(b.save(data).id);
const totals = (r) => {
  for (const view of Object.values(r.trialBalances)) assert.equal(view.debit, view.credit);
  assert.equal(r.assets, r.liabilities + r.equity);
  assert.equal(r.equitySummary.closing, r.equity);
};
const eventInput = (overrides = {}) => ({ type: 'cash_service', reference: 'CASH-001',
  date: today, service: 'SVC', amount: '10.00', ...overrides });
const eventSetup = (b) => {
  b.createService({ code: 'SVC', name: '教学服务', group: 'GENERAL' });
  return b.createPostingRule({ scope: 'all', match: '*', revenueAccount: '4000' });
};
const properties = (overrides = {}) => ({ normalSide: 'DEBIT', purpose: 'general',
  relatedAccount: null, revision: 0, ...overrides });
const financial = ({ accountAnalysis, ...report }) => report;

test('account properties enforce strict independent revisions and coherent contra links', (t) => {
  const b = book(); t.after(() => b.close());
  for (const [code, category] of [['1500', 'ASSET'], ['1510', 'ASSET'], ['1520', 'ASSET'], ['4200', 'REVENUE']]) {
    b.createAccount({ code, name: code, category });
  }
  const original = b.accounts(), journals = b.journals();
  const gross = b.setAccountProperties('1500', properties());
  assert.equal(gross.propertyRevision, 1); assert.equal(gross.revision, 1);
  assert.equal(original.find((a) => a.code === '1000').normalSide, 'DEBIT');
  assert.equal(original.find((a) => a.code === '4000').normalSide, 'CREDIT');
  const contra = properties({ normalSide: 'CREDIT', purpose: 'contra', relatedAccount: '1500' });
  assert.equal(b.setAccountProperties('1510', contra).purpose, 'contra');
  b.setAccountProperties('1520', contra);
  for (const data of [{ ...contra, normalSide: 'BAD' }, { ...contra, purpose: 'control' },
    { ...contra, revision: '1' }, { ...contra, revision: -1 }, { ...contra, revision: Number.MAX_SAFE_INTEGER },
    { ...contra, extra: true }, { ...contra, relatedAccount: null }, properties({ relatedAccount: '1500' })]) {
    assert.throws(() => b.setAccountProperties('1510', data), (e) => e.status === 400);
  }
  assert.throws(() => b.setAccountProperties('1510', contra), (e) => e.status === 409);
  for (const relatedAccount of ['1510', '1520', '4200', '9999']) {
    assert.throws(() => b.setAccountProperties('1510', { ...contra, relatedAccount, revision: 1 }), (e) => e.status === 409);
  }
  assert.throws(() => b.setAccountProperties('1510', { ...contra, normalSide: 'DEBIT', revision: 1 }), (e) => e.status === 409);
  assert.throws(() => b.setAccountProperties('1500', properties({ normalSide: 'CREDIT', revision: 1 })), (e) => e.status === 409);
  assert.throws(() => b.setAccountProperties('1500', { ...contra, relatedAccount: '1000', revision: 1 }), (e) => e.status === 409);
  assert.throws(() => b.setAccountProperties('1000', properties()), (e) => e.status === 409);
  assert.throws(() => b.setAccountProperties('9999', properties()), (e) => e.status === 404);
  b.createAccount({ code: '1600', name: 'Unusual gross', category: 'ASSET' });
  b.setAccountProperties('1600', properties({ normalSide: 'CREDIT' }));
  assert.throws(() => b.setAccountProperties('1510', { ...contra, relatedAccount: '1600', revision: 1 }), (e) => e.status === 409);
  const settings = b.updateAccount('1500', { name: '1500', active: false, manualAllowed: false, revision: 1 });
  assert.equal(settings.propertyRevision, 1);
  assert.equal(b.setAccountProperties('1510', { ...contra, revision: 1 }).propertyRevision, 2);
  assert.equal(b.accounts().find((a) => a.code === '1510').revision, 1);
  assert.deepEqual(b.accounts().filter((a) => a.builtin), original.filter((a) => a.builtin));
  assert.deepEqual(b.journals(), journals);
});

test('account properties explain signed balances without restricting posting or changing financial totals', (t) => {
  const b = book(); t.after(() => b.close());
  for (const code of ['1500', '1510', '1520']) b.createAccount({ code, name: code, category: 'ASSET' });
  post(b, draft({ lines: [{ account: '1500', debit: '100', credit: '0' }, { account: '1000', debit: '0', credit: '100' }] }));
  for (const [code, amount] of [['1510', '10'], ['1520', '5']]) {
    post(b, draft({ lines: [{ account: '5000', debit: amount, credit: '0' }, { account: code, debit: '0', credit: amount }] }));
  }
  const original = b.reports('2026-01'), before = b.journals();
  for (const code of ['1510', '1520']) b.setAccountProperties(code, properties({
    normalSide: 'CREDIT', purpose: 'contra', relatedAccount: '1500',
  }));
  const r = b.reports('2026-01');
  assert.deepEqual(financial(r), financial(original)); assert.deepEqual(b.journals(), before);
  assert.equal(r.accountAnalysis.basis, 'current_account_configuration');
  assert.deepEqual(r.accountAnalysis.contraGroups[0], { account: '1500', category: 'ASSET',
    measure: 'closing', gross: 10000, contra: -1500, net: 8500, accounts: ['1510', '1520'] });
  assert.equal(r.accountAnalysis.rows.find((a) => a.code === '1510').normalAmount, 1000);
  const reverseBalance = post(b, draft({ lines: [
    { account: '1510', debit: '20', credit: '0' }, { account: '1000', debit: '0', credit: '20' },
  ] }));
  assert.equal(b.reports('2026-01').accountAnalysis.rows.find((a) => a.code === '1510').normalAmount, -1000);
  assert.equal(b.reports('2026-01').accountAnalysis.rows.find((a) => a.code === '1510').oppositeBalance, true);
  b.post(b.reverse(reverseBalance.id, today).id);
  b.createAccount({ code: '1600', name: 'Reverse balance', category: 'ASSET' });
  const j = post(b, draft({ lines: [{ account: '1000', debit: '1', credit: '0' }, { account: '1600', debit: '0', credit: '1' }] }));
  assert.equal(b.reports('2026-01').accountAnalysis.rows.find((a) => a.code === '1600').oppositeBalance, true);
  b.setAccountProperties('1600', properties({ normalSide: 'CREDIT' }));
  assert.equal(b.reports('2026-01').accountAnalysis.rows.find((a) => a.code === '1600').oppositeBalance, false);
  b.post(b.reverse(j.id, today).id);
  assert.equal(b.reports('2026-01').accountAnalysis.rows.find((a) => a.code === '1600').normalAmount, 0);
  eventSetup(b);
  const event = eventInput(), plan = b.previewEvent(event);
  b.setAccountProperties('1600', properties({ normalSide: 'CREDIT', revision: 1 }));
  assert.throws(() => b.postEvent({ event, token: plan.token }), (e) => e.status === 409);
  const fresh = b.previewEvent(event), receipt = b.postEvent({ event, token: fresh.token });
  const pendingEvent = eventInput({ reference: 'PENDING' }), pending = b.previewEvent(pendingEvent);
  b.setAccountProperties('1600', properties({ normalSide: 'DEBIT', revision: 2 }));
  b.setAccountProperties('1600', properties({ normalSide: 'CREDIT', revision: 3 }));
  assert.throws(() => b.postEvent({ event: pendingEvent, token: pending.token }), (e) => e.status === 409);
  assert.equal(b.postEvent({ event, token: fresh.token }).journalId, receipt.journalId);
  totals(b.reports('2026-01'));
});

test('account property persistence preserves exact reversals and nominal explanations after close', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-properties-')), file = join(dir, 'book.sqlite');
  let b = new Book(file, { today });
  t.after(() => { b.close(); rmSync(dir, { recursive: true, force: true }); });
  for (const code of ['4200', '4900']) b.createAccount({ code, name: code, category: 'REVENUE' });
  b.setAccountProperties('4900', properties({ purpose: 'contra', relatedAccount: '4200' }));
  post(b, draft({ lines: [{ account: '1000', debit: '20', credit: '0' }, { account: '4200', debit: '0', credit: '20' }] }));
  const discount = post(b, draft({ kind: 'adjusting', lines: [
    { account: '4900', debit: '2', credit: '0' }, { account: '1000', debit: '0', credit: '2' },
  ] }));
  const before = b.reports('2026-01').accountAnalysis.contraGroups;
  assert.deepEqual(before[0], { account: '4200', category: 'REVENUE', measure: 'activity',
    gross: 2000, contra: -200, net: 1800, accounts: ['4900'] });
  b.closePeriod('2026-01'); b.nextPeriod(); b.close(); b = new Book(file, { today });
  assert.equal(b.accounts().find((a) => a.code === '4900').purpose, 'contra');
  assert.deepEqual(b.reports('2026-01').accountAnalysis.contraGroups, before);
  const row = b.reports('2026-01').accountAnalysis.rows.find((a) => a.code === '4900');
  assert.equal(row.balance, 0); assert.equal(row.oppositeBalance, false);
  const oldLines = b.journal(discount.id).lines;
  b.setAccountProperties('4900', properties({ normalSide: 'CREDIT', revision: 1 }));
  b.updateAccount('4900', { name: '4900', active: false, manualAllowed: false, revision: 1 });
  b.post(b.reverse(discount.id, '2026-02-01').id);
  assert.deepEqual(b.journal(discount.id).lines, oldLines);
  assert.equal(b.reports('2026-01').profit, 201800);
  assert.deepEqual(b.reports('2026-01').accountAnalysis.contraGroups, []);
  totals(b.reports('2026-02'));
});
const structureSetup = (b) => {
  for (const [code, values] of [['DEPT', ['OPS', 'SALES']], ['COST', ['C1', 'C2']]]) {
    b.createDimension({ code, name: code });
    for (const value of values) b.createDimensionValue(code, { code: value, name: value });
  }
};
const structureInput = (overrides = {}) => ({ active: true, revision: 0,
  segments: [{ code: 'DEPT', required: true }, { code: 'COST', required: false }],
  allowed: [{ DEPT: 'OPS', COST: 'C1' }, { DEPT: 'SALES' }], ...overrides });
const dimensionedDraft = (dimensions, overrides = {}) => ({ ...draft(overrides),
  lines: draft().lines.map((l) => ({ ...l, dimensions })) });

test('dimension structures are explicit, bounded, canonical and revision controlled', (t) => {
  const b = book(); t.after(() => b.close()); structureSetup(b);
  const journals = b.journals(); assert.deepEqual(b.dimensionStructures(), []);
  const inactive = b.setDimensionStructure('4000', structureInput({ active: false }));
  assert.equal(inactive.revision, 1); assert.equal(b.save(draft()).status, 'draft');
  for (const bad of [structureInput({ revision: 1, active: 'true' }), structureInput({ revision: -1 }),
    structureInput({ revision: 1, segments: [] }), structureInput({ revision: 1, segments: [{ code: 'MISSING', required: true }] }),
    structureInput({ revision: 1, segments: [{ code: 'DEPT', required: true }, { code: 'DEPT', required: false }] }),
    structureInput({ revision: 1, allowed: [{ DEPT: '' }] }), structureInput({ revision: 1, allowed: [{ DEPT: null }] }),
    structureInput({ revision: 1, allowed: [{}] }), structureInput({ revision: 1, allowed: [{ DEPT: 'UNKNOWN' }] }),
    structureInput({ revision: 1, allowed: [{ DEPT: 'SALES', EXTRA: 'X' }] }),
    structureInput({ revision: 1, allowed: [{ DEPT: 'OPS', COST: 'C1' }, { COST: 'C1', DEPT: 'OPS' }] }),
    { ...structureInput({ revision: 1 }), override: true }]) assert.throws(() => b.setDimensionStructure('4000', bad), { status: 400 });
  assert.throws(() => b.setDimensionStructure('9999', structureInput()), { status: 404 });
  assert.throws(() => b.setDimensionStructure('4000', structureInput()), { status: 409 });
  const active = b.setDimensionStructure('4000', structureInput({ revision: 1 }));
  assert.deepEqual(active.segments.map((s) => s.code), ['COST', 'DEPT']);
  assert.equal(b.setDimensionStructure('4000', structureInput({ revision: 2 })).revision, 3);
  b.updateDimension('DEPT', { active: false, revision: 1 });
  assert.throws(() => b.setDimensionStructure('4000', structureInput({ revision: 3 })), { status: 409 });
  b.setDimensionStructure('4000', structureInput({ revision: 3, active: false }));
  b.updateDimension('DEPT', { active: true, revision: 2 });
  const optional = { active: true, revision: 4, segments: [{ code: 'DEPT', required: false }], allowed: [{}] };
  b.setDimensionStructure('4000', optional);
  assert.equal(b.save(draft()).status, 'draft');
  assert.throws(() => b.save(dimensionedDraft({ DEPT: 'OPS' })), /组合/);
  for (let i = 0; i < 10; i++) b.createDimension({ code: `D${i}`, name: `D${i}` });
  const segments = Array.from({ length: 10 }, (_, i) => ({ code: `D${i}`, required: false }));
  b.setDimensionStructure('1000', { active: true, revision: 0, segments, allowed: [] });
  assert.throws(() => b.setDimensionStructure('1000', { active: true, revision: 1, segments: [...segments, { code: 'DEPT', required: false }], allowed: [] }), /10/);
  const allowed = Array.from({ length: 51 }, (_, i) => {
    b.createDimensionValue('DEPT', { code: `V${i}`, name: `Value ${i}` }); return { DEPT: `V${i}` };
  });
  const many = { active: true, revision: 0, segments: [{ code: 'DEPT', required: true }], allowed: allowed.slice(0, 50) };
  b.setDimensionStructure('5000', many);
  assert.throws(() => b.setDimensionStructure('5000', { ...many, revision: 1, allowed }), /50/);
  assert.deepEqual(b.journals().filter((j) => j.status === 'posted'), journals);
});

test('dimension structures share save post and event constraints without rewriting drafts', (t) => {
  const b = book(); t.after(() => b.close()); structureSetup(b); eventSetup(b);
  const old = b.save(draft()), before = b.journals();
  b.setDimensionStructure('4000', structureInput());
  assert.throws(() => b.post(old.id), /第 2 行.*4000.*版本 1.*DEPT/);
  assert.deepEqual(b.journals(), before);
  for (const dimensions of [{ DEPT: 'OPS' }, { DEPT: 'OPS', COST: 'C2' }]) {
    assert.throws(() => b.save(dimensionedDraft(dimensions)), /组合/);
  }
  const adjusting = b.save(dimensionedDraft({ DEPT: 'SALES' }, { kind: 'adjusting' }));
  assert.equal(adjusting.kind, 'adjusting'); b.delete(adjusting.id);
  b.createDimension({ code: 'OTHER', name: 'Unconstrained' }); b.createDimensionValue('OTHER', { code: 'X', name: 'X' });
  b.save(dimensionedDraft({ DEPT: 'OPS', COST: 'C1', OTHER: 'X' }), old.id); b.post(old.id);
  assert.throws(() => b.previewEvent(eventInput()), /必填/);
  const input = eventInput({ dimensions: { DEPT: 'OPS', COST: 'C1' } }), preview = b.previewEvent(input);
  assert.equal(preview.dimensionStructures[0].account, '4000');
  b.setDimensionStructure('1000', { active: true, revision: 0, segments: [{ code: 'DEPT', required: true }], allowed: [{ DEPT: 'SALES' }] });
  assert.throws(() => b.previewEvent(input), /第 1 行.*1000.*组合/);
  assert.throws(() => b.previewEvent(eventInput({ dimensions: { DEPT: 'SALES', COST: 'C1' } })), /第 2 行.*4000.*组合/);
  b.setDimensionStructure('1000', { active: false, revision: 1, segments: [{ code: 'DEPT', required: true }], allowed: [{ DEPT: 'SALES' }] });
  assert.throws(() => b.postEvent({ event: input, token: preview.token }), { status: 409 });
  const pending = b.previewEvent(input);
  b.setDimensionStructure('4000', structureInput({ revision: 1, active: false }));
  b.setDimensionStructure('4000', structureInput({ revision: 2 }));
  assert.throws(() => b.postEvent({ event: input, token: pending.token }), { status: 409 });
  const current = b.previewEvent(input), receipt = b.postEvent({ event: input, token: current.token });
  b.setDimensionStructure('4000', structureInput({ revision: 3, allowed: [{ DEPT: 'OPS', COST: 'C2' }] }));
  assert.equal(b.postEvent({ event: input, token: current.token }).journalId, receipt.journalId);
  assert.equal(b.eventReceipts()[0].plan.dimensionStructures[0].revision, 3);
  assert.equal(b.eventReceipts().length, 1);
});

test('dimension structure persistence preserves exact reversals, historical queries and aggregate close', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-structures-')), file = join(dir, 'book.sqlite');
  let b = new Book(file, { today });
  t.after(() => { b.close(); rmSync(dir, { recursive: true, force: true }); });
  structureSetup(b);
  const original = post(b, dimensionedDraft({ DEPT: 'OPS' })), baseline = b.reports('2026-01');
  const structure = b.setDimensionStructure('4000', structureInput());
  assert.deepEqual(b.reports('2026-01'), baseline);
  const correction = b.reverse(original.id, today);
  b.updateDimension('DEPT', { active: false, revision: 1 });
  b.post(correction.id);
  assert.deepEqual(b.journal(correction.id).lines[0].dimensions, original.lines[0].dimensions);
  assert.equal(b.ledger('1000', '2026-01', { dimension: 'DEPT', value: 'OPS' }).closing, 0);
  b.closePeriod('2026-01');
  assert.ok(b.journals().some((j) => j.kind === 'closing' && j.lines.every((l) => !l.dimensions)));
  const records = b.journals(), periods = b.periods();
  b.close(); b = new Book(file, { today });
  assert.deepEqual(b.dimensionStructures(), [structure]);
  assert.deepEqual(b.journals(), records); assert.deepEqual(b.periods(), periods);
  totals(b.reports('2026-01'));
});

test('service and rule catalogs and event syntax reject malformed input without writes', (t) => {
  const b = book(); t.after(() => b.close());
  const before = b.journals();
  for (const bad of [null, [], { code: 'lower', name: 'A', group: 'GENERAL' },
    { code: 'X', name: '\nA', group: 'GENERAL' }, { code: 'X', name: 'A', group: '' },
    { code: 'X', name: 'A', group: 'GENERAL', active: true }]) assert.throws(() => b.createService(bad));
  assert.deepEqual(b.services(), []);
  const rule = eventSetup(b);
  assert.throws(() => eventSetup(b), { status: 409 });
  for (const bad of [
    { group: 'GENERAL', active: 'false', revision: 1 }, { group: 'GENERAL', active: true, revision: 0 },
    { group: 'GENERAL', active: true, revision: 1, name: 'Renamed' },
  ]) assert.throws(() => b.updateService('SVC', bad), { status: 400 });
  for (const bad of [
    { scope: 'unknown', match: '*', revenueAccount: '4000' },
    { scope: 'all', match: 'ANY', revenueAccount: '4000' },
    { scope: 'service', match: 'MISSING', revenueAccount: '4000' },
    { scope: 'all', match: '*', revenueAccount: '9999' },
    { scope: 'all', match: '*', revenueAccount: '4000', active: true },
  ]) assert.throws(() => b.createPostingRule(bad), { status: 400 });
  assert.throws(() => b.updatePostingRule(rule.id, { scope: 'all', match: '*',
    revenueAccount: '4000', active: true, revision: 2 }), { status: 409 });
  const staleGroup = b.createPostingRule({ scope: 'group', match: 'GENERAL', revenueAccount: '4000' });
  b.updateService('SVC', { group: 'MOVED', active: true, revision: 1 });
  b.updatePostingRule(staleGroup.id, { scope: 'group', match: 'GENERAL', revenueAccount: '4000', active: false, revision: 1 });
  assert.throws(() => b.updatePostingRule(staleGroup.id, { scope: 'group', match: 'GENERAL',
    revenueAccount: '4000', active: true, revision: 2 }), { status: 400 });
  for (const bad of [eventInput({ type: 'invoice' }), eventInput({ reference: 'lower' }),
    eventInput({ date: '2026-02-30' }), eventInput({ amount: '0' }), eventInput({ amount: '1.001' }),
    eventInput({ amount: 10 }), eventInput({ dimensions: null }), eventInput({ dimensions: [] }),
    eventInput({ dimensions: { DEPT: '' } }), eventInput({ dimensions: { DEPT: 'UNKNOWN' } }),
    { ...eventInput(), memo: 'Injected' }]) assert.throws(() => b.previewEvent(bad));
  const preview = b.previewEvent(eventInput({ amount: '000000010.0', dimensions: {} }));
  assert.equal(preview.event.amount, '10.00'); assert.equal('dimensions' in preview.event, false);
  const receipt = b.postEvent({ event: eventInput(), token: preview.token });
  assert.equal(b.postEvent({ event: eventInput({ amount: '10', dimensions: {} }), token: preview.token }).replayed, true);
  assert.equal(b.journal(receipt.journalId).memo, '教学现金服务 CASH-001 / SVC');
  assert.equal(b.journals().length, before.length + 1);
});

test('posting rules select service then group then all and reject ties or restricted winner', () => {
  const b = book();
  try {
    const all = eventSetup(b), before = b.journals();
    assert.equal(b.previewEvent(eventInput()).rule.id, all.id);
    const group = b.createPostingRule({ scope: 'group', match: 'GENERAL', revenueAccount: '4000' });
    assert.equal(b.previewEvent(eventInput()).rule.id, group.id);
    b.createAccount({ code: '4100', name: '专项收入', category: 'REVENUE' });
    const specific = b.createPostingRule({ scope: 'service', match: 'SVC', revenueAccount: '4100' });
    const preview = b.previewEvent(eventInput());
    assert.equal(preview.rule.id, specific.id);
    assert.equal(preview.journal.lines[1].account, '4100');
    assert.deepEqual(preview.candidates.map((r) => r.priority), [1, 2, 3]);
    assert.throws(() => b.createPostingRule({ scope: 'all', match: '*', revenueAccount: '1000' }));
    assert.throws(() => b.createPostingRule({ scope: 'group', match: 'UNKNOWN', revenueAccount: '4000' }));
    assert.throws(() => b.updateService('SVC', { group: 'GENERAL', active: true, revision: 2 }), { status: 409 });
    b.updateAccount('4100', { name: '专项收入', active: true, manualAllowed: false, revision: 1 });
    assert.throws(() => b.previewEvent(eventInput()), /禁止手工/);
    b.createPostingRule({ scope: 'service', match: 'SVC', revenueAccount: '4000' });
    assert.throws(() => b.previewEvent(eventInput()), /冲突/);
    assert.deepEqual(b.journals(), before); assert.deepEqual(b.eventReceipts(), []);
  } finally { b.close(); }
});

test('source preview detects changed input and configuration ABA and posts exactly once', () => {
  const b = book();
  try {
    let rule = eventSetup(b);
    let preview = b.previewEvent(eventInput());
    assert.throws(() => b.postEvent({ event: eventInput({ amount: '11' }), token: preview.token }), { status: 409 });
    assert.throws(() => b.postEvent({ event: eventInput(), token: 'forged' }), { status: 409 });
    b.updateService('SVC', { group: 'OTHER', active: true, revision: 1 });
    b.updateService('SVC', { group: 'GENERAL', active: true, revision: 2 });
    assert.throws(() => b.postEvent({ event: eventInput(), token: preview.token }), { status: 409 });
    const account = b.createAccount({ code: '4100', name: 'Other revenue', category: 'REVENUE' });
    preview = b.previewEvent(eventInput());
    b.updateAccount(account.code, { name: account.name, active: false, manualAllowed: true, revision: 1 });
    b.updateAccount(account.code, { name: account.name, active: true, manualAllowed: true, revision: 2 });
    assert.throws(() => b.postEvent({ event: eventInput(), token: preview.token }), { status: 409 });
    preview = b.previewEvent(eventInput());
    rule = b.updatePostingRule(rule.id, { scope: 'all', match: '*', revenueAccount: '4000', active: false, revision: 1 });
    rule = b.updatePostingRule(rule.id, { scope: rule.scope, match: rule.match, revenueAccount: rule.revenueAccount,
      active: true, revision: rule.revision });
    assert.throws(() => b.postEvent({ event: eventInput(), token: preview.token }), { status: 409 });
    b.createDimension({ code: 'DEPT', name: '部门' }); b.createDimensionValue('DEPT', { code: 'OPS', name: '运营' });
    const input = eventInput({ dimensions: { DEPT: 'OPS' } });
    preview = b.previewEvent(input);
    b.updateDimensionValue('DEPT', 'OPS', { active: false, revision: 1 });
    assert.throws(() => b.postEvent({ event: input, token: preview.token }), { status: 409 });
    b.updateDimensionValue('DEPT', 'OPS', { active: true, revision: 2 });
    assert.throws(() => b.postEvent({ event: input, token: preview.token }), { status: 409 });
    preview = b.previewEvent(input);
    const posted = b.postEvent({ event: input, token: preview.token });
    assert.deepEqual(b.journal(posted.journalId).lines, preview.journal.lines);
    assert.equal(b.journal(posted.journalId).status, 'posted');
    assert.equal(b.postEvent({ event: input, token: preview.token }).replayed, true);
    assert.equal(b.eventReceipts().length, 1); assert.equal(b.journals().length, 3);
    assert.throws(() => b.previewEvent(input), { status: 409 });
    b.updateDimension('DEPT', { active: false, revision: 1 });
    const pending = b.previewEvent(eventInput({ reference: 'PERIOD-STALE' }));
    b.closePeriod('2026-01');
    b.nextPeriod();
    assert.throws(() => b.postEvent({ event: pending.event, token: pending.token }), { status: 409 });
    assert.equal(b.postEvent({ event: input, token: preview.token }).journalId, posted.journalId);
    assert.throws(() => b.postEvent({ event: { ...input, amount: '12' }, token: preview.token }), { status: 409 });
  } finally { b.close(); }
});

test('source receipt survives restart, rejects pending old token and rolls back failed aggregate', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-events-')), file = join(dir, 'book.sqlite');
  let b = new Book(file, { today });
  t.after(() => { b.close(); rmSync(dir, { recursive: true, force: true }); });
  eventSetup(b);
  const pending = b.previewEvent(eventInput({ reference: 'PENDING' })), accepted = b.previewEvent(eventInput());
  const receipt = b.postEvent({ event: eventInput(), token: accepted.token });
  b.close(); b = new Book(file, { today });
  assert.equal(b.postEvent({ event: eventInput(), token: accepted.token }).journalId, receipt.journalId);
  assert.throws(() => b.postEvent({ event: eventInput({ reference: 'PENDING' }), token: pending.token }), { status: 409 });
  const next = eventInput({ reference: 'FAIL' }), plan = b.previewEvent(next), before = b.journals();
  const reports = b.reports;
  b.reports = () => { throw new Error('injected aggregate failure'); };
  assert.throws(() => b.postEvent({ event: next, token: plan.token }), /injected/);
  b.reports = reports;
  assert.deepEqual(b.journals(), before); assert.equal(b.eventReceipts().length, 1);
  assert.throws(() => b.db.prepare("UPDATE posting_events SET reference='REWRITE'").run());
  assert.throws(() => b.db.prepare('DELETE FROM posting_events').run());
  const forged = (id) => b.db.prepare("INSERT INTO posting_events VALUES ('FORGED','{}','{}','x',?)").run(id);
  const manual = b.save(draft()); assert.throws(() => forged(manual.id)); b.delete(manual.id);
  const correction = b.reverse(receipt.journalId, today);
  assert.throws(() => forged(correction.id)); b.post(correction.id); assert.throws(() => forged(correction.id));
  assert.equal(b.eventReceipts()[0].journalId, receipt.journalId);
  assert.throws(() => b.previewEvent(eventInput()), { status: 409 });
});

test('dimension catalog is strict, scoped, revisioned and independently active', () => {
  const b = book();
  try {
    const records = b.journals(), reports = b.reports('2026-01');
    assert.deepEqual(b.dimensions(), []);
    assert.equal(b.createDimension({ code: 'DEPT', name: '部门' }).revision, 1);
    b.createDimension({ code: 'COST', name: '成本中心' });
    b.createDimensionValue('DEPT', { code: 'OPS', name: '运营' });
    b.createDimensionValue('COST', { code: 'OPS', name: '独立同码' });
    for (const bad of [{ code: 'dept', name: 'A' }, { code: 'X', name: '\nA' },
      { code: 'X', name: 'A', active: true }, { code: 'DEPT', name: '重复' }]) {
      assert.throws(() => b.createDimension(bad));
    }
    assert.throws(() => b.createDimensionValue('MISSING', { code: 'X', name: 'X' }));
    for (const bad of [{ code: '', name: 'X' }, { code: 'lower', name: 'X' },
      { code: 'X', name: 'a'.repeat(81) }, { code: 'OPS', name: 'Duplicate' }]) {
      assert.throws(() => b.createDimensionValue('DEPT', bad));
    }
    assert.throws(() => b.updateDimension('DEPT', { active: 'false', revision: 1 }));
    assert.throws(() => b.updateDimension('DEPT', { active: false, revision: 0 }), { status: 400 });
    assert.throws(() => b.updateDimension('DEPT', { active: false, revision: 2 }), { status: 409 });
    assert.throws(() => b.updateDimension('DEPT', { active: false, revision: 1, name: '改名' }));
    b.updateDimension('DEPT', { active: false, revision: 1 });
    b.updateDimensionValue('DEPT', 'OPS', { active: false, revision: 1 });
    assert.equal(b.updateDimensionValue('DEPT', 'OPS', { active: true, revision: 2 }).revision, 3);
    assert.equal(b.dimensions()[1].active, false);
    assert.deepEqual(b.journals(), records);
    assert.deepEqual(b.reports('2026-01'), reports);
  } finally { b.close(); }
});

test('dimension lines validate late, stay immutable and reverse with historical filters', () => {
  const b = book();
  try {
    b.createDimension({ code: 'DEPT', name: '部门' });
    b.createDimensionValue('DEPT', { code: 'OPS', name: '运营' });
    b.createDimensionValue('DEPT', { code: 'SALES', name: '销售' });
    b.createDimension({ code: 'COST', name: '成本中心' });
    b.createDimensionValue('COST', { code: 'OPS', name: '运营中心' });
    const data = draft();
    data.lines[0].dimensions = { DEPT: 'OPS', COST: 'OPS' };
    data.lines[1].dimensions = { DEPT: 'SALES' };
    for (const dimensions of [null, [], { DEPT: '' }, { DEPT: 1 }, { UNKNOWN: 'OPS' },
      { DEPT: 'UNKNOWN' }, Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`D${i}`, 'X']))]) {
      assert.throws(() => b.save({ ...data, lines: [{ ...data.lines[0], dimensions }, data.lines[1]] }));
    }
    const saved = b.save(data);
    assert.deepEqual(Object.keys(saved.lines[0].dimensions), ['COST', 'DEPT']);
    assert.deepEqual(b.save({ ...data, memo: 'Edited without dropping dimensions' }, saved.id).lines, saved.lines);
    b.updateDimensionValue('DEPT', 'OPS', { active: false, revision: 1 });
    assert.throws(() => b.post(saved.id), { status: 409 });
    assert.equal(b.journal(saved.id).status, 'draft');
    b.updateDimensionValue('DEPT', 'OPS', { active: true, revision: 2 });
    b.post(saved.id);
    const lineId = b.db.prepare('SELECT id FROM lines WHERE journal_id=? ORDER BY id').get(saved.id).id;
    assert.throws(() => b.db.prepare("UPDATE line_dimensions SET value='SALES' WHERE line_id=?").run(lineId));
    assert.throws(() => b.db.prepare('DELETE FROM line_dimensions WHERE line_id=?').run(lineId));
    assert.throws(() => b.db.prepare("INSERT INTO line_dimensions VALUES (1,'DEPT','OPS')").run());
    assert.throws(() => b.db.prepare('UPDATE line_dimensions SET line_id=1 WHERE line_id=?').run(lineId));
    assert.throws(() => b.ledger('1000', '2026-01', { dimension: 'DEPT', value: '' }));
    assert.throws(() => b.ledger('1000', '2026-01', { dimension: 'DEPT' }));
    assert.equal(b.ledger('1000', '2026-01', { dimension: 'DEPT', value: 'OPS' }).closing, 10000);
    assert.equal(b.ledger('1000', '2026-01').closing, 1410000);
    b.updateDimension('DEPT', { active: false, revision: 1 });
    assert.throws(() => b.save(data), { status: 409 });
    const reversal = b.reverse(saved.id, today);
    assert.deepEqual(reversal.lines[0].dimensions, saved.lines[0].dimensions);
    const reverseLine = b.db.prepare('SELECT id FROM lines WHERE journal_id=? ORDER BY id').get(reversal.id).id;
    b.db.prepare("UPDATE line_dimensions SET value='SALES' WHERE line_id=? AND dimension='DEPT'").run(reverseLine);
    assert.throws(() => b.post(reversal.id), { status: 409 });
    b.db.prepare("UPDATE line_dimensions SET value='OPS' WHERE line_id=? AND dimension='DEPT'").run(reverseLine);
    b.post(reversal.id);
    assert.equal(b.ledger('1000', '2026-01', { dimension: 'DEPT', value: 'OPS' }).closing, 0);
    b.closePeriod('2026-01'); b.nextPeriod();
    assert.equal(b.ledger('4000', '2026-02', { dimension: 'DEPT', value: 'SALES' }).opening, 0);
    totals(b.reports('2026-02'));
  } finally { b.close(); }
});

test('dimension persistence and filtered nominal opening preserve aggregate teaching close', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-dimensions-')), file = join(dir, 'book.sqlite');
  let b = new Book(file, { today });
  t.after(() => { b.close(); rmSync(dir, { recursive: true, force: true }); });
  b.createDimension({ code: 'DEPT', name: '部门' });
  b.createDimensionValue('DEPT', { code: 'OPS', name: '运营' });
  const data = draft({ lines: draft().lines.map((l) => ({ ...l, dimensions: { DEPT: 'OPS' } })) });
  const saved = post(b, data), records = b.journals();
  b.close(); b = new Book(file, { today });
  assert.deepEqual(b.journals(), records);
  const draftWithAttributes = b.save(data);
  const line = b.db.prepare('SELECT id FROM lines WHERE journal_id=? ORDER BY id').get(draftWithAttributes.id).id;
  assert.throws(() => b.db.prepare('UPDATE line_dimensions SET line_id=1 WHERE line_id=?').run(line));
  b.delete(draftWithAttributes.id);
  assert.equal(b.db.prepare('SELECT count(*) AS n FROM line_dimensions WHERE line_id=?').get(line).n, 0);
  b.closePeriod('2026-01'); b.nextPeriod();
  const ledger = b.ledger('4000', '2026-02', { dimension: 'DEPT', value: 'OPS' });
  assert.equal(ledger.opening, -10000); assert.equal(ledger.closing, -10000);
  assert.equal(b.ledger('4000', '2026-02').opening, 0);
  assert.deepEqual(b.journal(saved.id).lines[0].dimensions, { DEPT: 'OPS' });
  totals(b.reports('2026-02'));
});

test('money: exact decimal boundaries, precision, types and size', () => {
  assert.equal(money('0.01'), 1);
  assert.equal(money('999999999.99'), 99999999999);
  for (const value of ['1000000000.00', '1.001', '-1', '1e2', 'NaN', 1, null]) {
    assert.throws(() => money(value));
  }
});

test('seed is labelled, balanced and does not overwrite persisted progress', () => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-book-'));
  try {
    const file = join(dir, 'book.sqlite');
    let b = new Book(file, { today });
    assert.equal(b.journals().length, 2);
    assert.ok(b.journals().every((j) => j.memo.includes('示例')));
    const id = b.save(draft()).id;
    totals(b.reports('2026-01'));
    b.close();
    b = new Book(file, { today: '2027-01-01' });
    assert.equal(b.journals().length, 3);
    assert.equal(b.journal(id).status, 'draft');
    assert.deepEqual(b.periods(), [{ month: '2026-01', status: 'open' }]);
    b.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('draft validation rejects malformed input without partial writes', () => {
  const b = book();
  const before = b.journals().length;
  for (const value of [
    draft({ date: '2026-02-30' }), draft({ date: '2026-02-01' }),
    draft({ memo: '' }), draft({ kind: 'closing' }), draft({ reversalOf: 1 }),
    draft({ lines: [{ account: 'unknown', debit: '1', credit: '0' }, { account: '1000', debit: '0', credit: '1' }] }),
    draft({ lines: [{ account: '1000', debit: '1', credit: '1' }, { account: '4000', debit: '0', credit: '1' }] }),
    draft({ lines: [{ account: '1000', debit: '0', credit: '0' }, { account: '4000', debit: '0', credit: '0' }] }),
    draft({ lines: Array.from({ length: 101 }, () => ({ account: '1000', debit: '1', credit: '0' })) }),
    draft({ lines: [{ account: '1000', debit: '1', credit: '0' }, { account: '4000', debit: '0', credit: '2' }] }),
  ]) assert.throws(() => b.save(value));
  assert.equal(b.journals().length, before);
  const max = b.save(draft({ lines: [
    { account: '1000', debit: '999999999.99', credit: '0' },
    { account: '4000', debit: '0', credit: '999999999.99' },
  ] }));
  assert.equal(max.lines[0].debit, 99999999999);
  b.close();
});

test('posting exactly once and posted records immutable in domain and SQLite', () => {
  const b = book();
  const j = b.save(draft());
  b.post(j.id);
  const expected = b.reports('2026-01');
  assert.throws(() => b.post(j.id));
  assert.throws(() => b.save(draft(), j.id));
  assert.throws(() => b.delete(j.id));
  assert.throws(() => b.db.prepare("UPDATE lines SET debit=1 WHERE journal_id=?").run(j.id));
  assert.throws(() => b.db.prepare("DELETE FROM journals WHERE id=?").run(j.id));
  assert.deepEqual(b.reports('2026-01'), expected);
  b.close();
});

test('reversals are exact, unique, immutable and cannot forge special journals', () => {
  const b = book();
  const original = post(b, draft());
  const r = b.reverse(original.id, today);
  assert.equal(r.lines[0].credit, original.lines[0].debit);
  assert.throws(() => b.reverse(original.id, today));
  assert.throws(() => b.save(draft(), r.id));
  b.delete(r.id);
  const retry = b.reverse(original.id, today);
  b.db.prepare("UPDATE lines SET debit=debit+1 WHERE journal_id=? AND debit>0").run(retry.id);
  assert.throws(() => b.post(retry.id), /冲销凭证不再精确对应原凭证/);
  b.db.prepare("UPDATE lines SET debit=debit-1 WHERE journal_id=? AND debit>0").run(retry.id);
  b.post(retry.id);
  assert.throws(() => b.reverse(retry.id, today));
  assert.equal(b.journal(original.id).status, 'posted');
  assert.equal(b.reports('2026-01').profit, 200000);
  totals(b.reports('2026-01'));
  b.close();
});

test('prepayment, accrual, adjustment, ledger and reports reconcile', () => {
  const b = book();
  post(b, draft({ memo: 'Prepaid rent', lines: [
    { account: '1200', debit: '3000', credit: '0' }, { account: '1000', debit: '0', credit: '3000' },
  ] }));
  post(b, draft({ kind: 'adjusting', memo: 'Rent consumed', lines: [
    { account: '5000', debit: '300', credit: '0' }, { account: '1200', debit: '0', credit: '300' },
  ] }));
  post(b, draft({ kind: 'adjusting', memo: 'Wages accrued', lines: [
    { account: '5100', debit: '500', credit: '0' }, { account: '2000', debit: '0', credit: '500' },
  ] }));
  b.save(draft());
  const r = b.reports('2026-01');
  assert.equal(r.profit, 120000);
  assert.equal(r.assets, 1370000);
  assert.equal(r.liabilities, 50000);
  assert.equal(r.equity, 1320000);
  assert.equal(r.trialBalances.unadjusted.rows.find((a) => a.code === '1200').debit, 300000);
  assert.equal(r.trialBalances.adjusted.rows.find((a) => a.code === '1200').debit, 270000);
  const ledger = b.ledger('1200', '2026-01');
  assert.equal(ledger.entries.at(-1).balance, 270000);
  totals(r);
  b.close();
});

test('close blocks drafts, preserves profit/equity and zeros nominal accounts exactly once', () => {
  const b = book();
  const j = b.save(draft());
  const snapshot = b.reports('2026-01');
  assert.throws(() => b.closePeriod('2026-01'));
  assert.deepEqual(b.reports('2026-01'), snapshot);
  b.delete(j.id);
  const before = b.reports('2026-01');
  const preview = b.previewClose('2026-01');
  assert.equal(preview.profit, 200000);
  b.closePeriod('2026-01');
  const after = b.reports('2026-01');
  assert.equal(after.profit, before.profit);
  assert.deepEqual(after.equitySummary, before.equitySummary);
  assert.equal(after.equity, before.equity);
  assert.ok(after.trialBalances.postClosing.rows.filter((a) => ['REVENUE', 'EXPENSE'].includes(a.category))
    .every((a) => a.debit === 0 && a.credit === 0));
  totals(after);
  assert.throws(() => b.closePeriod('2026-01'));
  assert.throws(() => b.save(draft()));
  const closing = b.journals().find((j) => j.kind === 'closing');
  assert.throws(() => b.reverse(closing.id, today));
  b.close();
});

test('sequential periods preserve closed history and permit prior-period correction', () => {
  const b = book();
  assert.throws(() => b.nextPeriod());
  post(b, draft({ kind: 'adjusting', lines: [
    { account: '5100', debit: '3000', credit: '0' }, { account: '2000', debit: '0', credit: '3000' },
  ] }));
  b.closePeriod('2026-01');
  const snapshot = JSON.stringify(b.reports('2026-01'));
  const priorEquity = b.reports('2026-01').equity;
  assert.equal(b.reports('2026-01').profit, -100000);
  assert.equal(b.reports('2026-01').accounts.find((a) => a.code === '3100').balance, 100000);
  assert.throws(() => b.reports('bogus'));
  assert.equal(b.nextPeriod().month, '2026-02');
  assert.equal(b.reports('2026-02').profit, 0);
  assert.equal(b.reports('2026-02').equitySummary.opening, priorEquity);
  const source = b.journals().find((j) => j.kind === 'adjusting');
  const reverse = b.reverse(source.id, '2026-02-01');
  b.post(reverse.id);
  assert.equal(b.reports('2026-02').trialBalances.unadjusted.rows.find((a) => a.code === '5100').credit, 0);
  assert.equal(b.reports('2026-02').profit, 300000);
  b.closePeriod('2026-02');
  assert.equal(JSON.stringify(b.reports('2026-01')), snapshot);
  totals(b.reports('2026-02'));
  b.close();
});

test('zero-profit close without invalid zero-valued journal and equal-profit transfers', () => {
  const b = book();
  b.closePeriod('2026-01');
  b.nextPeriod();
  const count = b.journals().length;
  b.closePeriod('2026-02');
  assert.equal(b.journals().length, count);
  b.nextPeriod();
  post(b, draft({ date: '2026-03-01', lines: [
    { account: '5000', debit: '10', credit: '0' }, { account: '4000', debit: '0', credit: '10' },
  ] }));
  b.closePeriod('2026-03');
  assert.ok(b.journals().find((j) => j.kind === 'closing' && j.date.startsWith('2026-03'))
    .lines.every((l) => l.account !== '3100'));
  totals(b.reports('2026-03'));
  b.close();
});

test('posting rolls back if book-wide safe monetary aggregates would fail', () => {
  const b = book();
  const j = b.save(draft());
  const reports = b.reports.bind(b);
  b.reports = () => { throw new Error('aggregate safety failure'); };
  assert.throws(() => b.post(j.id), /aggregate safety/);
  assert.equal(b.journal(j.id).status, 'draft');
  b.reports = reports;
  assert.equal(b.reports('2026-01').profit, 200000);
  b.close();
});

test('custom chart configuration is strict, revisioned and preserves builtins', (t) => {
  const b = book(); t.after(() => b.close());
  const before = b.accounts();
  for (const data of [
    { code: '52000', name: 'Expense', category: 'EXPENSE' },
    { code: '0999', name: 'Expense', category: 'EXPENSE' },
    { code: '5200', name: ' \n ', category: 'EXPENSE' },
    { code: '5200', name: 'Bad\nname', category: 'EXPENSE' },
    { code: '5200', name: 'x'.repeat(81), category: 'EXPENSE' },
    { code: '5200', name: 'Expense', category: 'OTHER' },
    { code: '5200', name: 'Expense', category: 'EXPENSE', active: true },
  ]) assert.throws(() => b.createAccount(data));
  assert.deepEqual(b.accounts(), before);
  const a = b.createAccount({ code: '5200', name: '  Insurance  ', category: 'EXPENSE' });
  assert.equal(a.name, 'Insurance'); assert.equal(a.active, true);
  assert.equal(a.manualAllowed, true); assert.equal(a.builtin, false); assert.equal(a.revision, 1);
  assert.throws(() => b.createAccount({ code: '5200', name: 'Duplicate', category: 'ASSET' }), /已存在/);
  const update = { name: 'Insurance expense', active: true, manualAllowed: false, revision: a.revision };
  const changed = b.updateAccount(a.code, update);
  assert.equal(changed.revision, 2);
  assert.throws(() => b.updateAccount(a.code, update), /已变更/);
  assert.equal(b.updateAccount(a.code, { ...update, revision: 2 }).revision, 3);
  for (const data of [{ ...update, revision: 2, active: 0 }, { ...update, revision: 2, category: 'ASSET' },
    { ...update, revision: '2' }]) assert.throws(() => b.updateAccount(a.code, data));
  assert.throws(() => b.updateAccount('1000', { ...update, revision: 0 }), /内置/);
  assert.deepEqual(b.accounts().filter((x) => x.builtin), before);
});

test('account flags block drafts and late posts but not exact corrections or system close', (t) => {
  const b = book(); t.after(() => b.close());
  let a = b.createAccount({ code: '4100', name: 'Custom revenue', category: 'REVENUE' });
  const data = draft({ lines: [{ account: '1000', debit: '25', credit: '0' },
    { account: a.code, debit: '0', credit: '25' }] });
  const j = b.save(data);
  const set = (flags) => { a = b.updateAccount(a.code, { name: a.name, active: a.active,
    manualAllowed: a.manualAllowed, revision: a.revision, ...flags }); };
  for (const flags of [{ active: false, manualAllowed: true }, { active: true, manualAllowed: false }]) {
    set(flags); assert.throws(() => b.save(data), /科目/);
    assert.throws(() => b.post(j.id), /科目/);
    assert.equal(b.journal(j.id).status, 'draft');
    assert.throws(() => b.closePeriod('2026-01'), /草稿/);
  }
  b.save(draft(), j.id);
  b.delete(j.id);
  set({ active: true, manualAllowed: true });
  const posted = post(b, data);
  assert.throws(() => b.updateAccount(a.code, { ...a, name: 'Changed' }));
  assert.throws(() => b.updateAccount(a.code, { name: 'Changed', active: true, manualAllowed: true, revision: a.revision }), /名称/);
  const reverse = b.reverse(posted.id, today);
  set({ active: false, manualAllowed: false });
  assert.throws(() => b.save({ ...data, allowRestricted: true }));
  assert.throws(() => b.save({ ...data, kind: 'reversal' }));
  assert.throws(() => b.save({ ...data, reversal_of: posted.id }));
  assert.throws(() => b.save(data, reverse.id));
  b.post(reverse.id);
  set({ active: true, manualAllowed: true }); post(b, data);
  set({ manualAllowed: false });
  const snapshot = b.reports('2026-01');
  assert.equal(snapshot.profit, 202500);
  assert.equal(b.ledger(a.code, '2026-01').closing, -2500);
  assert.ok(b.previewClose('2026-01').lines.some((l) => l.account === a.code && l.debit === 2500));
  b.closePeriod('2026-01');
  assert.equal(b.reports('2026-01').profit, snapshot.profit);
  assert.equal(b.reports('2026-01').accounts.find((x) => x.code === a.code).balance, 0);
  totals(b.reports('2026-01'));
});

test('custom asset and restricted expense flow through reports and monthly teaching close', (t) => {
  const b = book(); t.after(() => b.close());
  b.createAccount({ code: '1500', name: 'Teaching asset', category: 'ASSET' });
  const expense = b.createAccount({ code: '5200', name: 'Teaching expense', category: 'EXPENSE' });
  post(b, draft({ lines: [{ account: '1500', debit: '100', credit: '0' }, { account: '1000', debit: '0', credit: '100' }] }));
  post(b, draft({ kind: 'adjusting', lines: [{ account: '5200', debit: '10', credit: '0' }, { account: '1500', debit: '0', credit: '10' }] }));
  const before = b.reports('2026-01');
  b.updateAccount(expense.code, { name: expense.name, active: false, manualAllowed: true, revision: expense.revision });
  assert.deepEqual(b.reports('2026-01'), before);
  b.closePeriod('2026-01');
  assert.equal(b.reports('2026-01').profit, 199000);
  assert.equal(b.reports('2026-01').accounts.find((a) => a.code === '1500').balance, 9000);
  assert.equal(b.reports('2026-01').accounts.find((a) => a.code === '5200').balance, 0);
  b.nextPeriod(); assert.equal(b.reports('2026-02').profit, 0);
  assert.equal(b.reports('2026-02').assets, before.assets);
});

test('legacy schema and third draft survive additive configuration and restart', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-legacy-'));
  const file = join(dir, 'legacy.sqlite');
  let b = new Book(file, { today });
  t.after(() => { b.close(); rmSync(dir, { recursive: true, force: true }); });
  b.save(draft());
  const journals = b.journals(), periods = b.periods(), profit = b.reports('2026-01').profit;
  b.close();
  const legacy = new DatabaseSync(file);
  legacy.exec('DROP TABLE account_properties; DROP TABLE account_dimension_structures; DROP TABLE posting_events; DROP TABLE posting_rules; DROP TABLE teaching_services; DROP TABLE line_dimensions; DROP TABLE dimension_values; DROP TABLE dimensions; DROP TABLE IF EXISTS account_settings');
  legacy.close();
  b = new Book(file, { today: '2027-06-15' });
  assert.deepEqual(b.journals(), journals); assert.deepEqual(b.periods(), periods);
  assert.equal(b.reports('2026-01').profit, profit);
  assert.equal(b.journal(3).status, 'draft');
  assert.deepEqual(b.dimensions(), []);
  assert.deepEqual(b.services(), []); assert.deepEqual(b.postingRules(), []); assert.deepEqual(b.eventReceipts(), []);
  assert.deepEqual(b.dimensionStructures(), []);
  assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM account_properties').get().n, 0);
  assert.ok(b.accounts().every((a) => a.purpose === 'general' && a.relatedAccount === null && a.propertyRevision === 0));
  assert.ok(b.accounts().every((a) => a.active && a.manualAllowed && a.revision === 0));
  const a = b.createAccount({ code: '5300', name: 'Insurance', category: 'EXPENSE' });
  b.updateAccount(a.code, { name: a.name, active: false, manualAllowed: true, revision: a.revision });
  b.close(); b = new Book(file, { today });
  assert.equal(b.accounts().find((x) => x.code === '5300').active, false);
  assert.deepEqual(b.journals(), journals); assert.deepEqual(b.periods(), periods);
  assert.equal(b.reports('2026-01').profit, profit);
});

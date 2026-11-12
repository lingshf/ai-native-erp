import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EnterpriseBook } from '../src/enterprise.mjs';

const company = (code = 'A', extra = {}) => ({ code, name: `Company ${code}`, year: 2026,
  currency: 'EUR', scale: 2, reportCurrency: 'USD', reportScale: 2, chartTemplate: 'STANDARD', ...extra });
const line = (account, debit, credit = '0', dimensions = {}, metadata) =>
  ({ account, debit, credit, dimensions, ...(metadata ? { metadata } : {}) });
const command = (reference = 'J1', extra = {}) => ({ company: 'A', operation: 'journal', reference,
  accountingDate: '2026-01-15', documentDate: '2025-12-12', taxDate: '2026-02-01', sourceRevision: 0,
  data: { memo: 'Capital', kind: 'normal', currency: 'EUR',
    lines: [line('1000', '53.27'), line('3000', '0', '53.27')], headerDimensions: {}, transferMode: 'sync' }, ...extra });
function accept(b, c) { const p = b.preview(c); return b.post({ command: p.command, token: p.token, confirmation: 'POST' }); }
function config(b, kind, code, data, extra = {}) {
  const old = b.state('A', '2026-01').configs.find(x => x.kind === kind && x.code === code);
  return b.configure({ company: 'A', kind, code, data, expectedRevision: old?.revision ?? 0, active: true, ...extra });
}
function fixture(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'enterprise-owned-'));
  const file = join(dir, 'erp.sqlite');
  const handles = [];
  t.after(() => { handles.forEach(h => h.close()); rmSync(dir, { recursive: true, force: true }); });
  const b = new EnterpriseBook(file, options); handles.push(b);
  b.createCompany(company());
  return { b, file, dir, handles };
}
function period(b, status, extra = {}) {
  const p = b.state('A', '2026-01').periods.find(p => p.month === '2026-01');
  return b.setPeriod({ company: 'A', month: p.month, expectedRevision: p.revision, status,
    modules: ['journal', 'cash_service', 'statistics', 'clearing', 'correction'],
    reason: 'Explicit period decision', permanentConfirmation: false, ...extra });
}
test('TC-C01/C12: isolated empty companies, currencies, slots, restart and readonly replay', t => {
  const { b, file, handles } = fixture(t);
  b.createCompany(company('B'));
  assert.equal(b.state('A', '2026-01').journals.total, 0);
  assert.throws(() => b.createCompany(company('C', { scale: 3 })), /scale|precision/i);
  const c = command(); const p = b.preview(c);
  const r = b.post({ command: p.command, token: p.token, confirmation: 'POST' });
  assert.equal(r.status, 'posted'); assert.equal(b.state('B', '2026-01').journals.total, 0);
  assert.throws(() => b.journal('B', r.journalIds[0]), e => e.status === 404);
  const l = b.journal('A', r.journalIds[0]).lines[0];
  assert.equal(l.transactionDebit, 5327); assert.equal(l.debit, 5327);
  assert.equal(l.reportingDebit, null); assert.deepEqual(l.rateRefs, { accounting: null, reporting: null });
  assert.equal(b.state('A', '2026-01').reports.reporting.totals, null);
  period(b, 'hold'); b.close();
  const ro = new EnterpriseBook(file, { readOnly: true }); handles.push(ro);
  assert.deepEqual(ro.post({ command: p.command, token: p.token, confirmation: 'POST' }), r);
  assert.throws(() => ro.createCompany(company('C')), /read.only/i);
  assert.equal(ro.integrity().ok, true);
});
test('TC-C07/C08: preview pure, strict command, ABA, immutable receipt and conflicting identity', t => {
  const { b } = fixture(t); const before = b.integrity(); const c = command();
  const p = b.preview(c); b.preview(c); assert.deepEqual(b.integrity(), before);
  assert.throws(() => b.preview({ ...c, origin: 'AP' }));
  assert.throws(() => b.preview(command('BAD', { accountingDate: '2026-02-30' })));
  assert.throws(() => b.preview(command('BAD', { data: { ...c.data, lines: [line('1000', 1.5), line('3000', '0', '1.50')] } })));
  const a = b.state('A', '2026-01').configs.find(x => x.kind === 'account' && x.code === '1000');
  config(b, 'account', '1000', { ...a.data, name: 'Cash renamed' });
  config(b, 'account', '1000', a.data);
  assert.throws(() => b.post({ command: p.command, token: p.token, confirmation: 'POST' }), e => e.status === 409);
  const q = b.preview(c);
  assert.throws(() => b.post({ command: q.command, token: q.token, confirmation: 'NO' }));
  const r = b.post({ command: q.command, token: q.token, confirmation: 'POST' });
  assert.deepEqual(b.post({ command: q.command, token: q.token, confirmation: 'POST' }), r);
  assert.throws(() => b.post({ command: { ...q.command, taxDate: '2026-02-02' }, token: q.token, confirmation: 'POST' }), e => e.status === 409);
  assert.throws(() => config(b, 'account', '1000', { ...a.data, purpose: 'control', controlModule: 'AP' }));
});
test('TC-C02: purpose and category restrictions, trusted control adapter, suspense and statistics', t => {
  const adapter = { operation: 'test.ap', testOnly: true, controlModules: ['AP'], module: 'journal',
    plan: (c, context) => {
      assert.equal(Object.isFrozen(c.data), true);
      assert.equal(Object.isFrozen(context.configuration[0].data), true);
      assert.deepEqual(Object.keys(context).sort(), ['company', 'configuration']);
      assert.equal(context.company.code, 'A');
      return { lines: [line('5000', '2.00'), line('2100', '0', '2.00')], facts: [{ type: 'test-control', module: 'AP' }],
        objectEffects: [{ type: 'test-evidence-only' }] };
    } };
  const { b } = fixture(t, { adapters: [adapter] });
  assert.ok(!b.state().supportedOperations.includes('test.ap'));
  assert.throws(() => b.preview(command('CONTROL', { data: { ...command().data, lines: [line('1000', '2.00'), line('2100', '0', '2.00')] } })));
  assert.equal(accept(b, command('TRUSTED', { operation: 'test.ap', data: {} })).status, 'posted');
  assert.throws(() => b.preview(command('SUSP', { data: { ...command().data, lines: [line('2900', '2.00'), line('1000', '0', '2.00')] } })));
  accept(b, command('SUSP', { data: { ...command().data, lines: [
    line('2900', '2.00', '0', {}, { owner: 'Operator', reason: 'Awaiting identification', reviewDate: '2026-01-20' }),
    line('1000', '0', '2.00')] } }));
  const tb = b.state('A', '2026-01').reports.trial;
  accept(b, command('STAT', { operation: 'statistics', data: { code: 'HEADCOUNT', quantity: '3.125', unit: 'units', dimensions: {} } }));
  assert.deepEqual(b.state('A', '2026-01').reports.trial, tb);
  assert.equal(b.state('A', '2026-01').statistics[0].quantity, 3125);
  assert.equal(b.state('A', '2026-01').suspense.length, 1);
});
function dims(b) {
  for (const [d, vals] of [['DEPT', ['A', 'B']], ['COST', ['C1', 'C2']]]) {
    config(b, 'dimension', d, { name: d, from: '2026-01-01', to: '2026-12-31' });
    for (const v of vals) config(b, 'dimensionValue', `${d}:${v}`, { dimension: d, value: v, name: v, from: '2026-01-01', to: '2026-12-31' });
  }
}
test('TC-C03/C04: ordered null, derivation, fixed constraints, validity and dimension balancing', t => {
  const { b } = fixture(t); dims(b);
  config(b, 'defaults', 'LEDGER', { account: null, values: { DEPT: 'A', COST: 'C1' }, from: '2026-01-01', to: '2026-12-31' });
  config(b, 'defaults', '1000', { account: '1000', values: { DEPT: 'B' }, from: '2026-01-01', to: '2026-12-31' });
  config(b, 'derivation', 'D1', { when: { DEPT: 'A' }, values: { COST: 'C2' }, mode: 'replace', from: '2026-01-01', to: '2026-12-31' });
  config(b, 'structure', '1000', { account: '1000', required: ['DEPT'], allowed: [], conditionals: [{ when: { DEPT: 'A' }, required: ['COST'] }], fixed: { COST: 'C1' }, from: '2026-01-01', to: '2026-12-31' });
  let c = command('DIM', { data: { ...command().data, headerDimensions: { DEPT: 'A' } } });
  let p = b.preview(c);
  assert.deepEqual(p.plan.lines[0].dimensions, { DEPT: 'A', COST: 'C1' });
  assert.ok(p.plan.lines[0].dimensionOrigins.COST.length >= 3);
  assert.throws(() => b.preview(command('FIX', { data: { ...c.data, lines: [line('1000', '1', '0', { COST: 'C2' }), line('3000', '0', '1')] } })));
  p = b.preview(command('NULL', { data: { ...command().data, lines: [line('1000', '1', '0', { DEPT: 'A' }), line('3000', '0', '1', { DEPT: null, COST: null })] } }));
  assert.equal(p.plan.lines[1].dimensions.DEPT, null);
  config(b, 'balance', 'LEDGER', { dimension: 'DEPT', account: '2800' });
  c = command('BAL', { data: { ...command().data, lines: [line('1000', '13', '0', { DEPT: 'A' }), line('3000', '0', '13', { DEPT: 'B' })] } });
  p = b.preview(c); assert.equal(p.plan.lines.length, 4);
  const r = accept(b, c);
  assert.equal(b.ledger({ company: 'A', account: '2800', month: '2026-01', dimension: 'DEPT', value: 'A' }).closing, -1300);
  assert.throws(() => b.preview(command('UNBAL', { data: { ...c.data, lines: [line('1000', '13', '0', { DEPT: 'A' }), line('3000', '0', '12', { DEPT: 'B' })] } })));
  const a = b.state('A', '2026-01').configs.find(x => x.kind === 'account' && x.code === '1000');
  config(b, 'account', '1000', a.data, { active: false });
  const rev = accept(b, command('UNDO', { operation: 'reverse', data: { originalJournalId: r.journalIds[0], memo: 'Full reverse' } }));
  assert.equal(b.journal('A', rev.journalIds[0]).lines.length, 4);
});
function service(b) {
  config(b, 'service', 'CONSULT', { name: 'Consulting', group: 'GENERAL', defaultDimensions: {} });
  for (const [meaning, account] of [['cash', '1000'], ['revenue', '4000']])
    config(b, 'rule', meaning.toUpperCase(), { event: 'cash_service', meaning, objectScope: 'all', objectCode: '*', partyScope: 'all', partyCode: '*', account, dimensions: {}, from: '2026-01-01', to: '2026-12-31' });
}
test('TC-C05/C06: meaningful service rules, dominance, cross conflicts and period checks', t => {
  const { b } = fixture(t); service(b);
  const c = command('SALE', { operation: 'cash_service', data: { service: 'CONSULT', party: null, amount: '9.14', currency: 'EUR', memo: 'Cash consulting', dimensions: {} } });
  const r = accept(b, c);
  assert.deepEqual(b.journal('A', r.journalIds[0]).lines.map(l => [l.account, l.debit, l.credit]), [['1000', 914, 0], ['4000', 0, 914]]);
  assert.throws(() => accept(b, command('BADREV', { operation: 'reverse', data: { originalJournalId: r.journalIds[0], memo: 'Not source cancellation' } })));
  config(b, 'party', 'P1', { name: 'Counterparty', group: 'GENERAL', defaultDimensions: {} });
  const base = b.state('A', '2026-01').configs.find(x => x.kind === 'rule' && x.code === 'REVENUE').data;
  config(b, 'rule', 'EXACTOBJECT', { ...base, objectScope: 'exact', objectCode: 'CONSULT' });
  config(b, 'rule', 'EXACTPARTY', { ...base, partyScope: 'exact', partyCode: 'P1' });
  assert.throws(() => b.preview({ ...c, reference: 'CONFLICT', data: { ...c.data, party: 'P1' } }), /conflict|ambiguous/i);
  accept(b, command('CANCEL', { operation: 'cash_service.cancel', data: { originalReference: 'SALE', memo: 'Cancel sale' } }));
  period(b, 'hold');
  assert.throws(() => b.preview(command('CLOSED')), /period|open/i);
  period(b, 'open'); assert.equal(b.preview(command('REOPEN')).plan.lines.length, 2);
  assert.throws(() => period(b, 'permanent', { permanentConfirmation: true }));
});
test('TC-C09: queue immutable acceptance, frozen plan, failed transfer and withdrawal', t => {
  const { b, file } = fixture(t);
  const c = command('QUEUE', { data: { ...command().data, transferMode: 'queued' } });
  const p = b.preview(c); const r = b.post({ command: p.command, token: p.token, confirmation: 'POST' });
  assert.equal(r.status, 'pending'); assert.equal(b.state('A', '2026-01').journals.total, 0);
  assert.throws(() => period(b, 'hold'));
  const a = b.state('A', '2026-01').configs.find(x => x.kind === 'account' && x.code === '1000');
  config(b, 'account', '1000', a.data, { active: false });
  const transferred = b.transfer({ company: 'A', reference: 'QUEUE' });
  assert.equal(transferred.status, 'transferred'); assert.equal(transferred.journalIds.length, 1);
  assert.deepEqual(b.transfer({ company: 'A', reference: 'QUEUE' }), transferred);
  assert.deepEqual(transferred.receipt, r.receipt);
  assert.throws(() => b.withdraw({ company: 'A', reference: 'QUEUE', reason: 'Too late' }));
  config(b, 'account', '1000', a.data);
  const q = b.preview(command('WITHDRAW', { data: c.data }));
  b.post({ command: q.command, token: q.token, confirmation: 'POST' });
  b.withdraw({ company: 'A', reference: 'WITHDRAW', reason: 'Input reconsidered' });
  assert.equal(b.post({ command: q.command, token: q.token, confirmation: 'POST' }).status, 'withdrawn');
  assert.throws(() => b.transfer({ company: 'A', reference: 'WITHDRAW' }));
  const f = b.preview(command('FAILED', { data: c.data })); b.post({ command: f.command, token: f.token, confirmation: 'POST' });
  const db = new DatabaseSync(file);
  db.exec("CREATE TRIGGER inject_line BEFORE INSERT ON lines BEGIN SELECT RAISE(ABORT,'injected line failure'); END");
  assert.throws(() => b.transfer({ company: 'A', reference: 'FAILED' }));
  assert.equal(b.source('A', 'FAILED').status, 'failed');
  db.exec('DROP TRIGGER inject_line'); db.close();
  assert.equal(b.transfer({ company: 'A', reference: 'FAILED' }).status, 'transferred');
});
test('TC-C07/C10: SQL rollback, immutable evidence, replace and reversible reclassification chains', t => {
  const { b, file, handles } = fixture(t);
  const db = new DatabaseSync(file); handles.push(db);
  const p = b.preview(command('FAIL'));
  const before = b.integrity();
  db.exec("CREATE TRIGGER inject_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END");
  assert.throws(() => b.post({ command: p.command, token: p.token, confirmation: 'POST' }));
  assert.deepEqual(b.integrity(), before); db.exec('DROP TRIGGER inject_receipt');
  const original = accept(b, command('ORIGINAL')).journalIds[0];
  const rc = accept(b, command('RECLASS', { operation: 'reclassify', data: { originalJournalId: original, memo: 'New allocation', lines: [line('1100', '53.27'), line('3000', '0', '53.27')], headerDimensions: {} } }));
  assert.equal(b.journal('A', rc.journalIds[0]).lines.length, 4);
  assert.throws(() => b.preview(command('TWICE', { operation: 'reverse', data: { originalJournalId: original, memo: 'Duplicate' } })));
  accept(b, command('UNDO-RC', { operation: 'reverse', data: { originalJournalId: rc.journalIds[0], memo: 'Restore allocation' } }));
  const replacement = accept(b, command('REPLACE', { operation: 'replace', data: { originalJournalId: original, memo: 'Corrected', lines: [line('1000', '50.00'), line('3000', '0', '50.00')], headerDimensions: {} } }));
  assert.equal(replacement.journalIds.length, 2);
  accept(b, command('UNDO-NEW', { operation: 'reverse', data: { originalJournalId: replacement.journalIds[1], memo: 'Undo replacement only' } }));
  assert.throws(() => b.preview(command('OLD', { operation: 'reverse', data: { originalJournalId: original, memo: 'Old remains corrected' } })));
  for (const table of ['journals', 'lines', 'receipts', 'config_versions', 'audit']) {
    assert.throws(() => db.exec(`DELETE FROM ${table}`), /immutable/i);
    assert.throws(() => db.exec(`UPDATE ${table} SET company='B'`), /immutable/i);
  }
  assert.equal(b.integrity().ok, true);
});
test('TC-C02/C08: gross/net, normal flags, actual month/YTD, ledger identity and precision overflow', t => {
  const { b } = fixture(t); service(b); accept(b, command());
  accept(b, command('SALE', { operation: 'cash_service', data: { service: 'CONSULT', party: null, amount: '9.14', currency: 'EUR', memo: 'Consulting', dimensions: {} } }));
  accept(b, command('FEB', { accountingDate: '2026-02-15', data: { ...command().data, lines: [line('5000', '2.08'), line('1000', '0', '2.08')] } }));
  const jan = b.state('A', '2026-01').reports; const feb = b.state('A', '2026-02').reports;
  assert.equal(jan.income.month.profit, 914); assert.equal(feb.income.month.profit, -208);
  assert.equal(feb.income.ytd.profit, 706); assert.equal(feb.balanceSheet.assets, 6033);
  assert.equal(feb.balanceSheet.equity, 6033);
  const l = b.ledger({ company: 'A', account: '1000', month: '2026-02' });
  assert.equal(l.opening, 6241); assert.equal(l.closing, 6033);
  assert.equal(l.opening + l.debit - l.credit, l.closing);
  accept(b, command('FIXED', { data: { ...command().data, lines: [line('1500', '83.00'), line('1590', '0', '7.25'), line('3000', '0', '75.75')] } }));
  const g = b.state('A', '2026-01').reports.accountAnalysis.contraGroups.find(x => x.account === '1500');
  assert.equal(g.gross, 8300); assert.equal(g.contra, 725); assert.equal(g.net, 7575);
  assert.throws(() => b.preview(command('HUGE', { data: { ...command().data, lines: [line('1000', '90071992547409.92'), line('3000', '0', '90071992547409.92')] } })));
  assert.throws(() => b.preview(command('FX', { data: { ...command().data, currency: 'USD' } })));
});
test('TC-C12: unknown nonempty SQLite is not initialized; no teaching data touched', t => {
  const dir = mkdtempSync(join(tmpdir(), 'enterprise-owned-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'unknown.sqlite'); const db = new DatabaseSync(file);
  db.exec('CREATE TABLE legacy(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO legacy VALUES(3,\'unknown draft\')'); db.close();
  const before = readFileSync(file);
  assert.throws(() => new EnterpriseBook(file), /schema|unknown|incompatible/i);
  assert.deepEqual(readFileSync(file), before);
});
test('TC-C01/C05: strict typed boundaries, permanent empty periods and company-scoped APIs', t => {
  const { b } = fixture(t); b.createCompany(company('B', { currency: 'JPY', scale: 0, reportCurrency: 'JPY', reportScale: 0 }));
  assert.equal(b.state('A', '2026-01').periods.length, 12);
  assert.throws(() => b.createCompany(company('A')), e => e.status === 409);
  for (const bad of [1899, 9999, 2026.1, '2026']) assert.throws(() => b.createCompany(company('C', { year: bad })), e => e.status === 400);
  assert.throws(() => b.createCompany(company('C', { chartTemplate: 'UNKNOWN' })), e => e.status === 400);
  assert.throws(() => b.preview(command('YEAR', { accountingDate: '2027-01-01' })), e => e.status === 404);
  for (const d of ['2026-02-29', '2026-04-31', '2026-00-01', '2026-01-00']) assert.throws(() => b.preview(command('DATE', { accountingDate: d })), e => e.status === 400);
  for (const data of [null, [], 4, 'x']) assert.throws(() => b.preview(command('TYPE', { data })), e => e.status === 400);
  assert.throws(() => b.preview(command('PROTO', { data: JSON.parse('{"__proto__":{}}') })), e => e.status === 400);
  assert.throws(() => b.preview(command('OPEN', { data: { ...command().data, kind: 'Opening' } })));
  const result = accept(b, command('SAME'));
  const bp = command('SAME', { company: 'B', data: { ...command().data, currency: 'JPY', lines: [line('1000', '8'), line('3000', '0', '8')] } });
  accept(b, bp);
  assert.equal(b.state('B', '2026-01').reports.reporting.translated, true);
  assert.equal(b.ledger({ company: 'B', account: '1000', month: '2026-01' }).closing, 8);
  assert.throws(() => b.journal('B', result.journalIds[0]), e => e.status === 404);
  assert.throws(() => b.ledger({ company: 'A', account: '1000', month: '2026-01', cursor: '-1' }), e => e.status === 400);
  const p = b.state('A', '2026-02').periods.find(p => p.month === '2026-02');
  b.setPeriod({ company: 'A', month: p.month, expectedRevision: p.revision, status: 'permanent', modules: [], reason: 'Empty month only', permanentConfirmation: true });
  assert.throws(() => b.preview(command('PERM', { accountingDate: '2026-02-15' })), e => e.status === 409);
  assert.throws(() => b.setPeriod({ company: 'A', month: p.month, expectedRevision: p.revision, status: 'open', modules: [], reason: 'Cannot reopen', permanentConfirmation: false }));
});
test('TC-C03: fill vs null, fixed null, conditional final checks, cycles and date bounds', t => {
  const { b } = fixture(t); dims(b);
  config(b, 'derivation', 'FILL', { when: { DEPT: 'A' }, values: { COST: 'C1' }, mode: 'fill', from: '2026-01-01', to: '2026-12-31' });
  let c = command('FILL', { data: { ...command().data, lines: [line('1000', '1', '0', { DEPT: 'A', COST: null }), line('3000', '0', '1')] } });
  assert.equal(b.preview(c).plan.lines[0].dimensions.COST, null);
  config(b, 'structure', '1000', { account: '1000', required: [], allowed: [], conditionals: [{ when: { DEPT: 'B' }, required: ['COST'] }], fixed: { DEPT: 'B' }, from: '2026-01-01', to: '2026-12-31' });
  assert.throws(() => b.preview(command('FINAL', { data: { ...command().data, lines: [line('1000', '1'), line('3000', '0', '1')] } })), /required/i);
  assert.throws(() => config(b, 'derivation', 'CYCLE', { when: { COST: 'C1' }, values: { DEPT: 'A' }, mode: 'replace', from: '2026-01-01', to: '2026-12-31' }), /cycle/i);
  config(b, 'structure', '1000', { account: '1000', required: [], allowed: [{ DEPT: 'A', COST: null }], conditionals: [], fixed: { COST: null }, from: '2026-01-01', to: '2026-12-31' });
  c = command('FIXNULL', { data: { ...command().data, lines: [line('1000', '1', '0', { DEPT: 'A' }), line('3000', '0', '1')] } });
  assert.equal(b.preview(c).plan.lines[0].dimensions.COST, null);
  config(b, 'dimensionValue', 'DEPT:A', { dimension: 'DEPT', value: 'A', name: 'A', from: '2026-01-15', to: '2026-01-16' });
  assert.ok(b.preview(c));
  assert.ok(b.preview({ ...c, accountingDate: '2026-01-16' }));
  assert.throws(() => b.preview({ ...c, accountingDate: '2026-01-14', documentDate: '2026-01-15', taxDate: '2026-01-15' }), /effective/i);
  assert.throws(() => b.preview({ ...c, accountingDate: '2026-01-17' }), /effective/i);
  config(b, 'dimensionValue', 'DEPT:A', { dimension: 'DEPT', value: 'A', name: 'A', from: '2026-01-15', to: '2026-01-16' }, { active: false });
  assert.throws(() => b.preview(c), /inactive/i);
});
test('TC-C06: exact/group/all dominance, effective dates, duplicate winners and invalid strongest cannot fallback', t => {
  const { b } = fixture(t); service(b);
  const c = command('RULE', { operation: 'cash_service', data: { service: 'CONSULT', party: null, amount: '1.00', currency: 'EUR', memo: 'Rule selection', dimensions: {} } });
  const base = b.state('A', '2026-01').configs.find(x => x.kind === 'rule' && x.code === 'REVENUE').data;
  config(b, 'rule', 'GROUP', { ...base, objectScope: 'group', objectCode: 'GENERAL' });
  config(b, 'rule', 'EXACT', { ...base, objectScope: 'exact', objectCode: 'CONSULT', from: '2026-01-15', to: '2026-01-16' });
  const winner = c => b.preview(c).plan.explanations.find(x => x.meaning === 'revenue').winner;
  assert.equal(winner(c), 'EXACT'); assert.equal(winner({ ...c, accountingDate: '2026-01-14' }), 'GROUP');
  assert.equal(winner({ ...c, accountingDate: '2026-01-16', documentDate: '2025-01-01' }), 'EXACT');
  config(b, 'rule', 'INVALID', { ...base, objectScope: 'exact', objectCode: 'CONSULT', account: '5000' });
  assert.throws(() => b.preview(c), /conflict|ambiguous/i);
  const exact = b.state('A', '2026-01').configs.find(x => x.kind === 'rule' && x.code === 'EXACT');
  config(b, 'rule', 'EXACT', exact.data, { active: false });
  assert.throws(() => b.preview(c), /winning|fallback/i);
  const invalid = b.state('A', '2026-01').configs.find(x => x.kind === 'rule' && x.code === 'INVALID');
  config(b, 'rule', 'INVALID', invalid.data, { active: false });
  for (const id of ['REVENUE', 'GROUP']) {
    const r = b.state('A', '2026-01').configs.find(x => x.kind === 'rule' && x.code === id);
    config(b, 'rule', id, r.data, { active: false });
  }
  config(b, 'rule', 'FORECAST', { ...base, meaning: 'forecast' });
  assert.throws(() => b.preview(c), /missing rule/i);
});
test('TC-C02: full source-backed clearing and suspense resolution, no cross-company links', t => {
  const { b } = fixture(t); b.createCompany(company('B'));
  const a = accept(b, command('CLEAR1', { data: { ...command().data, lines: [line('1000', '11'), line('2800', '0', '11')] } }));
  const z = accept(b, command('CLEAR2', { data: { ...command().data, lines: [line('2800', '11'), line('1000', '0', '11')] } }));
  const ids = [b.journal('A', a.journalIds[0]), b.journal('A', z.journalIds[0])].map(j => j.lines.find(l => l.account === '2800').id);
  assert.throws(() => b.preview(command('XCOMP', { company: 'B', operation: 'clearing.match', data: { account: '2800', lineIds: ids, reason: 'Not this company' } })), e => e.status === 404);
  const c = command('MATCH', { operation: 'clearing.match', data: { account: '2800', lineIds: ids, reason: 'Two offsetting sources' } });
  const r = accept(b, c); assert.equal(r.status, 'recorded'); assert.deepEqual(r.journalIds, []);
  assert.equal(b.state('A', '2026-01').clearing.length, 0);
  assert.throws(() => b.preview({ ...c, reference: 'TWICE' }), /already matched/i);
  const metadata = { owner: 'Operator', reason: 'Pending identification', reviewDate: '2026-01-10' };
  const s1 = accept(b, command('S1', { data: { ...command().data, lines: [line('2900', '12', '0', {}, metadata), line('1000', '0', '12')] } }));
  const s2 = accept(b, command('S2', { data: { ...command().data, lines: [line('1000', '12'), line('2900', '0', '12', {}, metadata)] } }));
  const si = [s1, s2].map(r => b.journal('A', r.journalIds[0]).lines.find(l => l.account === '2900').id);
  assert.equal(b.state('A', '2026-01').suspense[0].overdue, true);
  accept(b, command('SMATCH', { operation: 'clearing.match', data: { account: '2900', lineIds: si, reason: 'Identified and offset by source' } }));
  assert.equal(b.state('A', '2026-01').suspense.length, 0);
  assert.equal(b.integrity().ok, true);
});
test('TC-C07: injected failure at each write stage rolls back sequences, GL, effects and acceptance', t => {
  const { b, file, handles } = fixture(t); service(b);
  const db = new DatabaseSync(file); handles.push(db);
  for (const table of ['source_events', 'journals', 'lines', 'adapter_facts', 'receipts', 'audit']) {
    const c = command(`FAIL-${table.toUpperCase()}`, { operation: 'cash_service', data: { service: 'CONSULT', party: null, amount: '1', currency: 'EUR', memo: 'Atomic service', dimensions: {} } });
    const p = b.preview(c), before = b.integrity();
    const sequences = db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all();
    db.exec(`CREATE TRIGGER inject_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
    assert.throws(() => b.post({ command: p.command, token: p.token, confirmation: 'POST' }), e => e.status === 503 && e.retryable);
    assert.deepEqual(b.integrity(), before);
    assert.deepEqual(db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all(), sequences);
    db.exec('DROP TRIGGER inject_write');
  }
});
test('TC-C09: queue module failures and inability to persist failure remain honest and retryable', t => {
  const { b, file, handles } = fixture(t);
  const c = command('PENDING', { data: { ...command().data, transferMode: 'queued' } });
  accept(b, c);
  period(b, 'open', { modules: ['statistics'] });
  assert.throws(() => b.transfer({ company: 'A', reference: 'PENDING' }), /period/i);
  assert.equal(b.source('A', 'PENDING').status, 'failed');
  assert.equal(b.integrity().ok, true);
  b.withdraw({ company: 'A', reference: 'PENDING', reason: 'Module not currently admitted' });
  period(b, 'open');
  accept(b, command('STOREFAIL', { data: c.data }));
  const db = new DatabaseSync(file); handles.push(db);
  db.exec("CREATE TRIGGER fail_gl BEFORE INSERT ON lines BEGIN SELECT RAISE(ABORT,'write failure'); END");
  db.exec("CREATE TRIGGER fail_state BEFORE UPDATE ON transfer_queue BEGIN SELECT RAISE(ABORT,'failure-state write failure'); END");
  assert.throws(() => b.transfer({ company: 'A', reference: 'STOREFAIL' }), e => e.status === 503 && e.retryable && /could not persist/.test(e.message));
  assert.equal(b.source('A', 'STOREFAIL').status, 'pending');
  assert.equal(b.state('A', '2026-01').journals.total, 0);
  assert.equal(b.integrity().ok, true);
  db.exec('DROP TRIGGER fail_gl; DROP TRIGGER fail_state');
  assert.equal(b.transfer({ company: 'A', reference: 'STOREFAIL' }).status, 'transferred');
  assert.equal(b.integrity().ok, true);
});
test('TC-C10: partial reclassification, duplicate cancellation and second replacement journal failure', t => {
  const { b, file, handles } = fixture(t);
  const original = accept(b, command()).journalIds[0];
  const correction = command('REPLACE', { operation: 'replace', data: { originalJournalId: original, memo: 'Atomic replacement', lines: [line('1100', '50'), line('3000', '0', '50')], headerDimensions: {} } });
  assert.throws(() => b.preview({ ...correction, operation: 'reclassify' }), /full economic/i);
  const p = b.preview(correction), before = b.integrity();
  const db = new DatabaseSync(file); handles.push(db);
  db.exec(`CREATE TRIGGER fail_second BEFORE INSERT ON journals WHEN NEW.operation='replace' AND json_extract(NEW.details,'$.role')='normal'
    BEGIN SELECT RAISE(ABORT,'second journal failure'); END`);
  assert.throws(() => b.post({ command: p.command, token: p.token, confirmation: 'POST' }));
  assert.deepEqual(b.integrity(), before); db.exec('DROP TRIGGER fail_second');
  const replace = b.post({ command: p.command, token: p.token, confirmation: 'POST' });
  assert.equal(replace.journalIds.length, 2);
  service(b);
  accept(b, command('SERVICE', { operation: 'cash_service', data: { service: 'CONSULT', party: null, amount: '1', currency: 'EUR', memo: 'Service', dimensions: {} } }));
  accept(b, command('CANCEL1', { operation: 'cash_service.cancel', data: { originalReference: 'SERVICE', memo: 'Cancelled' } }));
  assert.throws(() => b.preview(command('CANCEL2', { operation: 'cash_service.cancel', data: { originalReference: 'SERVICE', memo: 'Again' } })), /effective correction/i);
  assert.equal(b.integrity().ok, true);
});
test('TC-C01/C02/C08: aggregate overflow, reverse normal flags and deterministic pagination', t => {
  const { b } = fixture(t);
  accept(b, command('MAX', { data: { ...command().data, lines: [line('1000', '90071992547409.91'), line('3000', '0', '90071992547409.91')] } }));
  assert.throws(() => b.preview(command('OVER', { data: { ...command().data, lines: [line('1000', '0.01'), line('3000', '0', '0.01')] } })), /safe integer precision/i);
  assert.equal(b.integrity().ok, true);
  const other = new EnterpriseBook(':memory:'); t.after(() => other.close()); other.createCompany(company());
  for (const [ref, day] of [['LATE', '2026-01-20'], ['EARLY', '2026-01-02'], ['SAME', '2026-01-02']])
    accept(other, command(ref, { accountingDate: day, data: { ...command().data, lines: [line('3000', '1'), line('1000', '0', '1')] } }));
  const full = other.ledger({ company: 'A', account: '1000', month: '2026-01' });
  assert.deepEqual(full.lines.map(l => l.reference), ['EARLY', 'SAME', 'LATE']);
  const first = other.ledger({ company: 'A', account: '1000', month: '2026-01', limit: 1 });
  const second = other.ledger({ company: 'A', account: '1000', month: '2026-01', limit: 1, cursor: first.nextCursor });
  assert.equal(first.total, 3); assert.equal(second.lines[0].reference, 'SAME');
  assert.equal(other.state('A', '2026-01').reports.accountAnalysis.rows.find(a => a.account === '1000').abnormal, true);
});
test('TC-C08/C12: readonly is byte-preserving, stale previews do not survive restart, source links detect corruption', t => {
  const { b, file, handles } = fixture(t);
  const pending = b.preview(command('UNFINISHED')); const done = b.preview(command('DONE'));
  const accepted = b.post({ command: done.command, token: done.token, confirmation: 'POST' }); b.close();
  const restart = new EnterpriseBook(file); handles.push(restart);
  assert.throws(() => restart.post({ command: pending.command, token: pending.token, confirmation: 'POST' }), e => e.status === 409);
  assert.deepEqual(restart.post({ command: done.command, token: done.token, confirmation: 'POST' }), accepted);
  restart.close();
  const before = readFileSync(file);
  const ro = new EnterpriseBook(file, { readOnly: true }); handles.push(ro);
  assert.equal(ro.integrity().ok, true); ro.state('A', '2026-01'); ro.audit('A');
  assert.deepEqual(ro.post({ command: done.command, token: done.token, confirmation: 'POST' }), accepted);
  ro.close(); assert.deepEqual(readFileSync(file), before);
  const db = new DatabaseSync(file); handles.push(db);
  db.exec(`DROP TRIGGER immutable_receipts_UPDATE; UPDATE receipts SET evidence=json_set(evidence,'$.journalIds',json('[]'));
    CREATE TRIGGER immutable_receipts_UPDATE BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'immutable receipts'); END`);
  const damaged = new EnterpriseBook(file, { readOnly: true });
  handles.push(damaged);
  assert.throws(() => damaged.integrity(), /mapping|schema|immutable/i);
});
test('TC-C08/C09/C12: durable pending plan, second connection replay and frozen transfer after restart', t => {
  const { b, file, handles } = fixture(t);
  const p = b.preview(command('DURABLE', { data: { ...command().data, transferMode: 'queued' } }));
  const accepted = b.post({ command: p.command, token: p.token, confirmation: 'POST' });
  const second = new EnterpriseBook(file); handles.push(second);
  assert.deepEqual(second.post({ command: p.command, token: p.token, confirmation: 'POST' }), accepted);
  second.close(); b.close();
  const restart = new EnterpriseBook(file); handles.push(restart);
  assert.equal(restart.source('A', 'DURABLE').status, 'pending');
  const cash = restart.state('A', '2026-01').configs.find(x => x.kind === 'account' && x.code === '1000');
  config(restart, 'account', '1000', cash.data, { active: false });
  const transferred = restart.transfer({ company: 'A', reference: 'DURABLE' });
  assert.equal(transferred.status, 'transferred');
  assert.deepEqual(transferred.receipt, accepted.receipt);
  assert.deepEqual(restart.journal('A', transferred.journalIds[0]).lines.map(({ id, lineNo, journalId, ...l }) => l), p.plan.lines);
  assert.equal(restart.integrity().ok, true);
});
test('TC-C02/C07: SQL composite foreign keys, sealed-line insertion and immutable historical policy evidence', t => {
  const { b, file, handles } = fixture(t); b.createCompany(company('B'));
  const j = accept(b, command()).journalIds[0];
  const db = new DatabaseSync(file); handles.push(db); db.exec('PRAGMA foreign_keys=ON');
  const saved = db.prepare('SELECT * FROM lines WHERE journal_id=? LIMIT 1').get(j);
  assert.throws(() => db.prepare('INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES(?,?,?,?,?,?,?)')
    .run('A', j, 99, saved.account, saved.debit, saved.credit, saved.data), /immutable/i);
  assert.throws(() => db.prepare('INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES(?,?,?,?,?,?,?)')
    .run('B', j, 99, saved.account, saved.debit, saved.credit, saved.data), /FOREIGN KEY/i);
  assert.throws(() => db.exec("UPDATE accounts SET purpose='control' WHERE company='A' AND code='1000'"), /immutable/i);
  assert.throws(() => db.exec("UPDATE currencies SET scale=3 WHERE code='EUR'"), /immutable/i);
  const original = b.journal('A', j);
  const cash = b.state('A', '2026-01').configs.find(x => x.kind === 'account' && x.code === '1000');
  config(b, 'account', '1000', { ...cash.data, name: 'Cash revised' });
  assert.deepEqual(b.journal('A', j), original);
  const change = b.audit('A', { limit: 200 }).items.findLast(x => x.action === 'config.save');
  assert.equal(change.before.data.name, 'Cash'); assert.equal(change.after.data.name, 'Cash revised');
});
test('TC-C12: a nonempty empty-schema SQLite file is not silently claimed as enterprise data', t => {
  const dir = mkdtempSync(join(tmpdir(), 'enterprise-owned-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'unowned.sqlite'); const db = new DatabaseSync(file); db.exec('VACUUM'); db.close();
  const before = readFileSync(file); assert.ok(before.length > 0);
  assert.throws(() => new EnterpriseBook(file), /schema|unknown|incompatible/i);
  assert.deepEqual(readFileSync(file), before);
});

test('TC-C10 addendum: all four corrections reject pre-original dates with zero writes and accept same/later days', async t => {
  for (const operation of ['reverse', 'replace', 'reclassify', 'cash_service.cancel']) {
    for (const acceptedDate of ['2026-03-15', '2026-04-01']) await t.test(`${operation} ${acceptedDate}`, st => {
      const { b, file, handles } = fixture(st);
      if (operation === 'cash_service.cancel') service(b);
      const originalCommand = operation === 'cash_service.cancel'
        ? command('ORIGINAL', { accountingDate: '2026-03-15', operation: 'cash_service',
          data: { service: 'CONSULT', party: null, amount: '53.27', currency: 'EUR', memo: 'Original service', dimensions: {} } })
        : command('ORIGINAL', { accountingDate: '2026-03-15' });
      const original = accept(b, originalCommand);
      const data = operation === 'cash_service.cancel' ? { originalReference: 'ORIGINAL', memo: 'Source cancellation' }
        : { originalJournalId: original.journalIds[0], memo: 'Full correction',
          ...(['replace', 'reclassify'].includes(operation) ? {
            lines: [line('1100', '53.27'), line('3000', '0', '53.27')], headerDimensions: {},
          } : {}) };
      const correction = command('CORRECTION', { operation, accountingDate: '2026-03-14', data });
      const db = new DatabaseSync(file); handles.push(db);
      const before = b.integrity(), receipt = b.source('A', 'ORIGINAL');
      const sequences = db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all();
      const allowed = b.preview({ ...correction, accountingDate: acceptedDate });
      assert.throws(() => b.preview(correction), /accounting date.*(original|chain)|not.*before/i);
      assert.throws(() => b.post({ command: correction, token: allowed.token, confirmation: 'POST' }),
        /accounting date.*(original|chain)|not.*before/i);
      assert.deepEqual(b.integrity(), before);
      assert.deepEqual(b.source('A', 'ORIGINAL'), receipt);
      assert.deepEqual(db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all(), sequences);
      assert.throws(() => b.source('A', 'CORRECTION'), e => e.status === 404);
      const accepted = b.post({ command: allowed.command, token: allowed.token, confirmation: 'POST' });
      assert.equal(accepted.status, 'posted');
      assert.equal(accepted.journalIds.length, operation === 'replace' ? 2 : 1);
      const reversed = b.journal('A', accepted.journalIds[0]).lines.slice(0, 2);
      assert.deepEqual(reversed.map(l => [l.account, l.debit, l.credit]),
        b.journal('A', original.journalIds[0]).lines.map(l => [l.account, l.credit, l.debit]));
      assert.equal(b.integrity().ok, true);
    });
  }
});

test('TC-C10 addendum: Jan original, March reclass, June undo forbids April recorrection and permits June reclass', async t => {
  for (const operation of ['reverse', 'replace', 'reclassify']) await t.test(operation, st => {
    const { b, file, handles } = fixture(st);
    const original = accept(b, command('ORIGINAL'));
    const originalId = original.journalIds[0];
    const newLines = [line('1100', '53.27'), line('3000', '0', '53.27')];
    const reclassification = accept(b, command('MARCH-RECLASS', { accountingDate: '2026-03-15',
      operation: 'reclassify', data: { originalJournalId: originalId, memo: 'March allocation', lines: newLines, headerDimensions: {} } }));
    const undoCommand = command('JUNE-UNDO', { accountingDate: '2026-06-15', operation: 'reverse',
      data: { originalJournalId: reclassification.journalIds[0], memo: 'Full undo restoring original allocation' } });
    const undoPreview = b.preview(undoCommand);
    const undo = b.post({ command: undoPreview.command, token: undoPreview.token, confirmation: 'POST' });
    const correction = command('NEW-CORRECTION', { operation, accountingDate: '2026-04-15',
      data: { originalJournalId: originalId, memo: 'Fresh correction after undo',
        ...(operation === 'reverse' ? {} : { lines: newLines, headerDimensions: {} }) } });
    const db = new DatabaseSync(file); handles.push(db);
    const before = b.integrity();
    const sequences = db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all();
    assert.throws(() => b.preview(correction), /accounting date.*(original|chain)|not.*before/i);
    const sameDay = b.preview({ ...correction, accountingDate: '2026-06-15' });
    assert.throws(() => b.post({ command: correction, token: sameDay.token, confirmation: 'POST' }),
      /accounting date.*(original|chain)|not.*before/i);
    assert.deepEqual(b.integrity(), before);
    assert.deepEqual(db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all(), sequences);
    assert.deepEqual(b.source('A', 'ORIGINAL'), original);
    assert.deepEqual(b.source('A', 'JUNE-UNDO'), undo);
    assert.equal(b.ledger({ company: 'A', account: '1000', month: '2026-04' }).closing, 0);
    const corrected = b.post({ command: sameDay.command, token: sameDay.token, confirmation: 'POST' });
    assert.equal(corrected.status, 'posted');
    assert.deepEqual(b.post({ command: undoPreview.command, token: undoPreview.token, confirmation: 'POST' }), undo);
    assert.equal(b.ledger({ company: 'A', account: '1000', month: '2026-04' }).closing, 0);
    assert.equal(b.ledger({ company: 'A', account: '1000', month: '2026-06' }).closing, 0);
    assert.equal(b.integrity().ok, true);
  });
});

test('TC-C02 addendum: clearing and suspense are month-end snapshots despite later immutable matches', async t => {
  for (const [account, list] of [['2800', 'clearing'], ['2900', 'suspense']]) await t.test(list, st => {
    const { b, file, handles } = fixture(st);
    const metadata = account === '2900' ? { owner: 'Operator', reason: 'Unidentified item', reviewDate: '2026-02-01' } : undefined;
    const postPair = (suffix, firstDate, secondDate) => {
      const first = accept(b, command(`FIRST-${suffix}`, { accountingDate: firstDate,
        data: { ...command().data, lines: [line(account, '11', '0', {}, metadata), line('1000', '0', '11')] } }));
      const second = accept(b, command(`SECOND-${suffix}`, { accountingDate: secondDate,
        data: { ...command().data, lines: [line('1000', '11'), line(account, '0', '11', {}, metadata)] } }));
      return [first, second].map(r => b.journal('A', r.journalIds[0]).lines.find(l => l.account === account).id);
    };
    const january = postPair('JAN', '2026-01-15', '2026-01-20');
    const future = postPair('MAY', '2026-05-01', '2026-05-02');
    const januarySnapshot = b.state('A', '2026-01')[list];
    assert.deepEqual(januarySnapshot.map(l => l.id), january);
    assert.equal(b.state('A', '2026-04')[list].length, 2);
    const match = command('APRIL-MATCH', { accountingDate: '2026-04-01', operation: 'clearing.match',
      data: { account, lineIds: january, reason: 'Full source-backed match in April' } });
    const p = b.preview(match);
    const r = b.post({ command: p.command, token: p.token, confirmation: 'POST' });
    assert.equal(r.status, 'recorded'); assert.deepEqual(r.journalIds, []);
    assert.deepEqual(b.state('A', '2026-01')[list], januarySnapshot);
    assert.deepEqual(b.state('A', '2026-03')[list].map(l => l.id), january);
    assert.deepEqual(b.state('A', '2026-04')[list], []);
    assert.deepEqual(b.state('A', '2026-05')[list].map(l => l.id), future);
    assert.deepEqual(b.post({ command: p.command, token: p.token, confirmation: 'POST' }), r);
    const db = new DatabaseSync(file); handles.push(db);
    const links = db.prepare('SELECT * FROM clearing_links ORDER BY line_id').all();
    assert.deepEqual(links.map(l => l.line_id), january);
    const before = b.integrity();
    assert.throws(() => b.preview({ ...match, reference: 'TOO-EARLY', accountingDate: '2026-05-01',
      data: { ...match.data, lineIds: future } }), /accounting date.*(line|match)|not.*before/i);
    assert.throws(() => b.post({ command: { ...match, reference: 'TOO-EARLY', accountingDate: '2026-05-01',
      data: { ...match.data, lineIds: future } }, token: p.token, confirmation: 'POST' }),
    /accounting date.*(line|match)|not.*before/i);
    assert.deepEqual(b.integrity(), before);
    const sameDay = accept(b, { ...match, reference: 'MAY-MATCH', accountingDate: '2026-05-02',
      data: { ...match.data, lineIds: future } });
    assert.equal(sameDay.status, 'recorded');
    assert.deepEqual(b.state('A', '2026-04')[list], []);
    assert.deepEqual(b.state('A', '2026-05')[list], []);
    assert.equal(b.integrity().ok, true);
  });
});

test('TC-C02 addendum: no-GL match still rejects held or clearing-module-blocked periods without writes', async t => {
  for (const blocked of ['hold', 'module']) await t.test(blocked, st => {
    const { b } = fixture(st);
    const first = accept(b, command('FIRST', { data: { ...command().data, lines: [line('2800', '11'), line('1000', '0', '11')] } }));
    const second = accept(b, command('SECOND', { data: { ...command().data, lines: [line('1000', '11'), line('2800', '0', '11')] } }));
    const ids = [first, second].map(r => b.journal('A', r.journalIds[0]).lines.find(l => l.account === '2800').id);
    const match = command('MATCH', { operation: 'clearing.match', data: { account: '2800', lineIds: ids, reason: 'Must respect period admission' } });
    const preview = b.preview(match);
    period(b, blocked === 'hold' ? 'hold' : 'open', blocked === 'module' ? { modules: ['journal'] } : {});
    const before = b.integrity();
    assert.throws(() => b.preview(match), /period.*not open/i);
    assert.throws(() => b.post({ command: preview.command, token: preview.token, confirmation: 'POST' }), /period.*not open/i);
    assert.deepEqual(b.integrity(), before);
    assert.equal(b.state('A', '2026-01').clearing.length, 2);
  });
});

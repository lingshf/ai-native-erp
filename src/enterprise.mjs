import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { AppError } from './book.mjs';

// This module owns only the separate enterprise database. It never constructs Book.
const fail = (message, status = 400) => { throw new AppError(message, status); };
const own = (o, k) => Object.hasOwn(o, k);
const keys = o => o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : [];
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const safe = n => {
  const b = typeof n === 'bigint' ? n : (Number.isSafeInteger(n) ? BigInt(n) : fail('Unsafe integer amount.'));
  if (b > MAX || b < -MAX) fail('Amount aggregate exceeds safe integer precision.');
  return Number(b);
};
const sum = values => safe(values.reduce((a, n) => a + BigInt(n), 0n));
function record(o, allowed, required = allowed) {
  if (!o || typeof o !== 'object' || Array.isArray(o)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(o))
    || Reflect.ownKeys(o).some(k => typeof k !== 'string' || !allowed.includes(k))
    || required.some(k => !own(o, k))) fail('Invalid or unknown fields.');
  return o;
}
function clean(value, depth = 0) {
  if (depth > 20) fail('Input nesting too deep.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('Unsafe number.'); return value; }
  if (Array.isArray(value)) {
    if (value.length > 2000) fail('Too many array items.');
    return value.map(v => clean(v, depth + 1));
  }
  record(value, keys(value));
  for (const k of Object.keys(value)) if (['__proto__', 'prototype', 'constructor'].includes(k)) fail('Unsafe field.');
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, clean(value[k], depth + 1)]));
}
const json = o => JSON.stringify(clean(o));
const parse = s => JSON.parse(s);
const equal = (a, b) => json(a) === json(b);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function text(s, max = 160) {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(s)) fail('Invalid text.');
  return s.trim();
}
function code(s) { if (typeof s !== 'string' || !/^[A-Z0-9][A-Z0-9_.:-]{0,59}$/.test(s)) fail('Invalid code.'); return s; }
function accountCode(s) { if (typeof s !== 'string' || !/^[1-9]\d{3}$/.test(s)) fail('Account must be four digits.'); return s; }
function dimensionCode(s, value = false) {
  if (typeof s !== 'string' || !(value ? /^[A-Z0-9][A-Z0-9_-]{0,39}$/ : /^[A-Z][A-Z0-9_]{0,31}$/).test(s)) fail('Invalid dimension identity.');
  return s;
}
function integer(n, min = 0, max = Number.MAX_SAFE_INTEGER - 1) {
  if (!Number.isSafeInteger(n) || n < min || n > max) fail('Invalid integer.');
  return n;
}
function bool(v) { if (typeof v !== 'boolean') fail('Expected boolean.'); return v; }
function choice(v, values) { if (!values.includes(v)) fail(`Unsupported value: ${String(v)}.`); return v; }
function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < '1900-01-01' || v > '9998-12-31'
    || !Number.isFinite(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) fail('Invalid date.');
  return v;
}
function amount(v, scale, signed = false) {
  if (typeof v !== 'string' || !(signed ? /^-?\d{1,16}(?:\.\d{1,6})?$/ : /^\d{1,16}(?:\.\d{1,6})?$/).test(v)) fail('Amount must be an exact decimal string.');
  const negative = v.startsWith('-'); const [whole, fraction = ''] = (negative ? v.slice(1) : v).split('.');
  if (fraction.length > scale) fail('Amount precision exceeds currency scale.');
  const n = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
  return safe(negative ? -n : n);
}
function dimensions(v) {
  record(v, keys(v));
  if (Object.keys(v).length > 32) fail('Too many dimensions.');
  for (const [k, n] of Object.entries(v)) { dimensionCode(k); if (n !== null) dimensionCode(n, true); }
  return clean(v);
}
function windowFields(d) { date(d.from); date(d.to); if (d.from > d.to) fail('Invalid effective window.'); }
const effective = (c, day) => c.active && (!own(c.data, 'from') || (c.data.from <= day && day <= c.data.to));
const OPS = Object.freeze(['journal', 'cash_service', 'statistics', 'clearing.match', 'reverse', 'replace', 'reclassify', 'cash_service.cancel']);
const MODULES = ['journal', 'cash_service', 'statistics', 'clearing', 'correction'];
const GROUPS = {
  ASSET: ['cash', 'receivables', 'inventory', 'prepayments', 'fixedAssets', 'otherAssets'],
  LIABILITY: ['payables', 'taxLiabilities', 'otherLiabilities'],
  EQUITY: ['capital', 'retainedEarnings', 'otherEquity'],
  REVENUE: ['sales', 'otherRevenue'],
  EXPENSE: ['costOfSales', 'operatingExpense', 'otherExpense'],
};
const NORMAL = category => ['ASSET', 'EXPENSE'].includes(category) ? 'DEBIT' : 'CREDIT';
const TEMPLATE = [
  ['1000', 'Cash', 'ASSET', 'cash'], ['1100', 'Bank', 'ASSET', 'cash'],
  ['1200', 'Prepayments', 'ASSET', 'prepayments'], ['1300', 'Receivables control', 'ASSET', 'receivables', 'control', 'AR'],
  ['1500', 'Fixed assets', 'ASSET', 'fixedAssets'], ['1590', 'Accumulated depreciation', 'ASSET', 'fixedAssets', 'general', null, '1500'],
  ['2000', 'Accruals', 'LIABILITY', 'otherLiabilities'], ['2100', 'Payables control', 'LIABILITY', 'payables', 'control', 'AP'],
  ['2800', 'Clearing', 'LIABILITY', 'otherLiabilities', 'clearing'], ['2900', 'Suspense', 'ASSET', 'otherAssets', 'suspense'],
  ['3000', 'Capital', 'EQUITY', 'capital'], ['3100', 'Retained earnings', 'EQUITY', 'retainedEarnings'],
  ['4000', 'Sales', 'REVENUE', 'sales'], ['5000', 'Expense', 'EXPENSE', 'operatingExpense'], ['5100', 'Wages', 'EXPENSE', 'operatingExpense'],
].map(([code, name, category, reportGroup, purpose = 'general', controlModule = null, contraOf = null]) => ({
  code, data: { name, category, reportGroup, purpose, controlModule, contraOf,
    normalSide: contraOf ? 'CREDIT' : NORMAL(category), manualAllowed: purpose !== 'control' },
}));
const KINDS = ['account', 'dimension', 'dimensionValue', 'defaults', 'derivation', 'structure', 'balance', 'service', 'party', 'rule'];
const SCHEMA = `
CREATE TABLE meta(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0));
INSERT INTO meta VALUES(1,0);
CREATE TABLE currencies(code TEXT PRIMARY KEY CHECK(length(code)=3 AND code GLOB '[A-Z][A-Z][A-Z]'),
 scale INTEGER NOT NULL CHECK(typeof(scale)='integer' AND scale BETWEEN 0 AND 4));
CREATE TABLE chart_templates(code TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(code,revision));
CREATE TABLE companies(code TEXT PRIMARY KEY, name TEXT NOT NULL, year INTEGER NOT NULL CHECK(year BETWEEN 1900 AND 9998),
 currency TEXT NOT NULL REFERENCES currencies(code), scale INTEGER NOT NULL, report_currency TEXT NOT NULL REFERENCES currencies(code),
 report_scale INTEGER NOT NULL, template TEXT NOT NULL, template_revision INTEGER NOT NULL,
 FOREIGN KEY(template,template_revision) REFERENCES chart_templates(code,revision));
CREATE TABLE configs(company TEXT NOT NULL REFERENCES companies(code), kind TEXT NOT NULL, code TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0), active INTEGER NOT NULL CHECK(active IN(0,1)), data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(company,kind,code));
CREATE TABLE config_versions(company TEXT NOT NULL, kind TEXT NOT NULL, code TEXT NOT NULL, revision INTEGER NOT NULL,
 active INTEGER NOT NULL CHECK(active IN(0,1)), data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(company,kind,code,revision),
 FOREIGN KEY(company,kind,code) REFERENCES configs(company,kind,code));
CREATE TABLE accounts(company TEXT NOT NULL REFERENCES companies(code), code TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
 purpose TEXT NOT NULL CHECK(purpose IN('general','control','clearing','suspense')), data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(company,code));
CREATE TABLE periods(company TEXT NOT NULL REFERENCES companies(code), month TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 status TEXT NOT NULL CHECK(status IN('open','hold','permanent')), modules TEXT NOT NULL CHECK(json_valid(modules)), PRIMARY KEY(company,month));
CREATE TABLE source_events(company TEXT NOT NULL REFERENCES companies(code), reference TEXT NOT NULL, operation TEXT NOT NULL,
 accounting_date TEXT NOT NULL, command TEXT NOT NULL CHECK(json_valid(command)), PRIMARY KEY(company,reference));
CREATE TABLE receipts(company TEXT NOT NULL, reference TEXT NOT NULL, evidence TEXT NOT NULL CHECK(json_valid(evidence)),
 PRIMARY KEY(company,reference), FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE journals(id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, reference TEXT NOT NULL,
 accounting_date TEXT NOT NULL, document_date TEXT NOT NULL, tax_date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('normal','adjusting')),
 operation TEXT NOT NULL, memo TEXT NOT NULL, details TEXT NOT NULL CHECK(json_valid(details)),
 substr_month TEXT GENERATED ALWAYS AS (substr(accounting_date,1,7)) STORED, UNIQUE(company,id),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference),
 FOREIGN KEY(company,substr_month) REFERENCES periods(company,month));
CREATE TABLE lines(id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, journal_id INTEGER NOT NULL, line_no INTEGER NOT NULL CHECK(line_no>0),
 account TEXT NOT NULL, debit INTEGER NOT NULL CHECK(typeof(debit)='integer' AND debit BETWEEN 0 AND 9007199254740991),
 credit INTEGER NOT NULL CHECK(typeof(credit)='integer' AND credit BETWEEN 0 AND 9007199254740991),
 data TEXT NOT NULL CHECK(json_valid(data)), CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)),
 UNIQUE(company,id), UNIQUE(company,journal_id,line_no),
 FOREIGN KEY(company,journal_id) REFERENCES journals(company,id), FOREIGN KEY(company,account) REFERENCES accounts(company,code));
CREATE TABLE journal_seals(company TEXT NOT NULL, journal_id INTEGER NOT NULL, PRIMARY KEY(company,journal_id),
 FOREIGN KEY(company,journal_id) REFERENCES journals(company,id));
CREATE TABLE transfer_queue(company TEXT NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','failed','transferred','withdrawn')),
 journal_ids TEXT NOT NULL CHECK(json_valid(journal_ids)), error TEXT, reason TEXT, PRIMARY KEY(company,reference),
 FOREIGN KEY(company,reference) REFERENCES receipts(company,reference));
CREATE TABLE statistics(company TEXT NOT NULL, reference TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(company,reference),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE clearing_links(company TEXT NOT NULL, line_id INTEGER NOT NULL, reference TEXT NOT NULL, PRIMARY KEY(company,line_id),
 FOREIGN KEY(company,line_id) REFERENCES lines(company,id), FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE corrections(company TEXT NOT NULL, original_id INTEGER NOT NULL, output_id INTEGER NOT NULL, reference TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN('reverse','replace','reclassify','cash_service.cancel')), PRIMARY KEY(company,reference),
 FOREIGN KEY(company,original_id) REFERENCES journals(company,id), FOREIGN KEY(company,output_id) REFERENCES journals(company,id),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE adapter_facts(company TEXT NOT NULL, reference TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(company,reference),
 FOREIGN KEY(company,reference) REFERENCES source_events(company,reference));
CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL REFERENCES companies(code), action TEXT NOT NULL,
 reference TEXT, data TEXT NOT NULL CHECK(json_valid(data)), at TEXT NOT NULL);
CREATE TRIGGER seal_balance BEFORE INSERT ON journal_seals BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM lines WHERE company=NEW.company AND journal_id=NEW.journal_id)<2
 OR (SELECT sum(debit)!=sum(credit) OR sum(debit)>9007199254740991 FROM lines WHERE company=NEW.company AND journal_id=NEW.journal_id)
 THEN RAISE(ABORT,'unbalanced journal') END; END;
CREATE TRIGGER sealed_lines BEFORE INSERT ON lines WHEN EXISTS(SELECT 1 FROM journal_seals WHERE company=NEW.company AND journal_id=NEW.journal_id)
 BEGIN SELECT RAISE(ABORT,'immutable posted lines'); END;
CREATE TRIGGER currency_scale BEFORE UPDATE ON currencies BEGIN SELECT RAISE(ABORT,'immutable currency scale'); END;
CREATE TRIGGER currency_delete BEFORE DELETE ON currencies BEGIN SELECT RAISE(ABORT,'immutable currency'); END;
CREATE TRIGGER company_update BEFORE UPDATE ON companies BEGIN SELECT RAISE(ABORT,'immutable company'); END;
CREATE TRIGGER company_delete BEFORE DELETE ON companies BEGIN SELECT RAISE(ABORT,'immutable company'); END;
CREATE TRIGGER company_scales BEFORE INSERT ON companies WHEN
 NEW.scale!=(SELECT scale FROM currencies WHERE code=NEW.currency)
 OR NEW.report_scale!=(SELECT scale FROM currencies WHERE code=NEW.report_currency)
 BEGIN SELECT RAISE(ABORT,'currency scale mismatch'); END;
CREATE TRIGGER used_account_identity BEFORE UPDATE ON accounts WHEN
 EXISTS(SELECT 1 FROM lines WHERE company=OLD.company AND account=OLD.code) AND
 (NEW.company!=OLD.company OR NEW.code!=OLD.code OR NEW.category!=OLD.category OR NEW.purpose!=OLD.purpose
 OR json_extract(NEW.data,'$.controlModule') IS NOT json_extract(OLD.data,'$.controlModule')
 OR json_extract(NEW.data,'$.normalSide') IS NOT json_extract(OLD.data,'$.normalSide')
 OR json_extract(NEW.data,'$.contraOf') IS NOT json_extract(OLD.data,'$.contraOf'))
 BEGIN SELECT RAISE(ABORT,'immutable used account identity'); END;
CREATE TRIGGER line_shape BEFORE INSERT ON lines WHEN
 json_extract(NEW.data,'$.account') IS NOT NEW.account
 OR json_extract(NEW.data,'$.debit') IS NOT NEW.debit OR json_extract(NEW.data,'$.credit') IS NOT NEW.credit
 OR json_extract(NEW.data,'$.transactionDebit') IS NOT NEW.debit OR json_extract(NEW.data,'$.transactionCredit') IS NOT NEW.credit
 OR json_extract(NEW.data,'$.accountingCurrency') IS NOT (SELECT currency FROM companies WHERE code=NEW.company)
 OR json_extract(NEW.data,'$.currency') IS NOT (SELECT currency FROM companies WHERE code=NEW.company)
 OR json_extract(NEW.data,'$.reportingCurrency') IS NOT (SELECT report_currency FROM companies WHERE code=NEW.company)
 OR json_type(NEW.data,'$.debit') IS NOT 'integer' OR json_type(NEW.data,'$.credit') IS NOT 'integer'
 OR json_type(NEW.data,'$.transactionDebit') IS NOT 'integer' OR json_type(NEW.data,'$.transactionCredit') IS NOT 'integer'
 OR ((SELECT currency=report_currency FROM companies WHERE code=NEW.company) AND
 (json_extract(NEW.data,'$.reportingDebit') IS NOT NEW.debit OR json_extract(NEW.data,'$.reportingCredit') IS NOT NEW.credit))
 OR ((SELECT currency!=report_currency FROM companies WHERE code=NEW.company) AND
 (json_type(NEW.data,'$.reportingDebit') IS NOT 'null' OR json_type(NEW.data,'$.reportingCredit') IS NOT 'null'))
 OR json_type(NEW.data,'$.rateRefs.accounting') IS NOT 'null' OR json_type(NEW.data,'$.rateRefs.reporting') IS NOT 'null'
 OR json_type(NEW.data,'$.dimensions') IS NOT 'object'
 OR json_type(NEW.data,'$.dimensionOrigins') IS NOT 'object'
 OR json_type(NEW.data,'$.metadata') IS NOT 'object'
 BEGIN SELECT RAISE(ABORT,'invalid normalized line'); END;
PRAGMA user_version=1;
`;
const IMMUTABLE = ['chart_templates', 'config_versions', 'source_events', 'receipts', 'journals', 'lines', 'journal_seals', 'statistics', 'clearing_links', 'corrections', 'adapter_facts', 'audit'];
const COLUMNS = {
  meta: ['id', 'revision'], currencies: ['code', 'scale'], chart_templates: ['code', 'revision', 'data'],
  companies: ['code', 'name', 'year', 'currency', 'scale', 'report_currency', 'report_scale', 'template', 'template_revision'],
  configs: ['company', 'kind', 'code', 'revision', 'active', 'data'], config_versions: ['company', 'kind', 'code', 'revision', 'active', 'data'],
  accounts: ['company', 'code', 'category', 'purpose', 'data'], periods: ['company', 'month', 'revision', 'status', 'modules'],
  source_events: ['company', 'reference', 'operation', 'accounting_date', 'command'], receipts: ['company', 'reference', 'evidence'],
  journals: ['id', 'company', 'reference', 'accounting_date', 'document_date', 'tax_date', 'kind', 'operation', 'memo', 'details', 'substr_month'],
  lines: ['id', 'company', 'journal_id', 'line_no', 'account', 'debit', 'credit', 'data'], journal_seals: ['company', 'journal_id'],
  transfer_queue: ['company', 'reference', 'status', 'journal_ids', 'error', 'reason'],
  statistics: ['company', 'reference', 'data'], clearing_links: ['company', 'line_id', 'reference'],
  corrections: ['company', 'original_id', 'output_id', 'reference', 'type'], adapter_facts: ['company', 'reference', 'data'],
  audit: ['id', 'company', 'action', 'reference', 'data', 'at'],
};
const FOREIGN_KEYS = {
  companies: ['currency:currencies:code', 'report_currency:currencies:code', 'template,template_revision:chart_templates:code,revision'],
  configs: ['company:companies:code'], config_versions: ['company,kind,code:configs:company,kind,code'],
  accounts: ['company:companies:code'], periods: ['company:companies:code'], source_events: ['company:companies:code'],
  receipts: ['company,reference:source_events:company,reference'],
  journals: ['company,reference:source_events:company,reference', 'company,substr_month:periods:company,month'],
  lines: ['company,journal_id:journals:company,id', 'company,account:accounts:company,code'],
  journal_seals: ['company,journal_id:journals:company,id'],
  transfer_queue: ['company,reference:receipts:company,reference'],
  statistics: ['company,reference:source_events:company,reference'],
  clearing_links: ['company,line_id:lines:company,id', 'company,reference:source_events:company,reference'],
  corrections: ['company,original_id:journals:company,id', 'company,output_id:journals:company,id', 'company,reference:source_events:company,reference'],
  adapter_facts: ['company,reference:source_events:company,reference'], audit: ['company:companies:code'],
};

export class EnterpriseBook {
  #db; #secret = randomBytes(32); #readOnly; #adapters = new Map(); #closed = false;
  /**
   * Trusted, server-constructed adapter (not an HTTP registration contract):
   * { operation, testOnly, controlModules: ['AP'|...], module, plan(command, context) }.
   * module is an existing period module; plan is synchronous, deterministic and pure.
   * command and context={company, configuration:[{kind,code,revision,active,data}]}
   * are deeply frozen company-scoped copies, with no DB, filesystem or write handle.
   * Return {lines, facts, objectEffects?, explanations?}; lines use decimal-string
   * debit/credit and optional dimensions/metadata, not normalized integer GL slots.
   * facts must be a nonempty JSON array; effects/explanations are JSON arrays.
   * Core validates grants, dimensions, periods and money and persists facts/effects
   * in adapter_facts with GL/receipt/audit in one transaction. These are evidence,
   * not a generic mutable subledger or an apply/SQL callback. New real business
   * state, uniqueness, lifecycle and cancellation need separately approved design.
   * testOnly adapters are never listed in supportedOperations; default production
   * registration is exactly OPS. No constructor option is accepted from commands.
   */
  constructor(file, { adapters = [], readOnly = false } = {}) {
    bool(readOnly);
    if (typeof file !== 'string' || !file.length) fail('Enterprise database path is required.');
    const newFile = file === ':memory:' || !existsSync(file) || statSync(file).size === 0;
    if (!Array.isArray(adapters)) fail('Invalid adapters.');
    for (const a of adapters) {
      record(a, ['operation', 'testOnly', 'controlModules', 'module', 'plan'], ['operation', 'testOnly', 'controlModules', 'module', 'plan']);
      if (typeof a.operation !== 'string' || !/^[a-z][a-z0-9_.]{0,59}$/.test(a.operation) || OPS.includes(a.operation)
        || this.#adapters.has(a.operation) || typeof a.plan !== 'function') fail('Invalid trusted adapter.');
      bool(a.testOnly); choice(a.module, MODULES);
      if (!Array.isArray(a.controlModules)) fail('Invalid control grants.');
      a.controlModules.forEach(m => choice(m, ['AP', 'AR', 'INVENTORY', 'ASSET', 'BANK', 'TAX', 'LEASE', 'IC']));
      this.#adapters.set(a.operation, Object.freeze({ ...a, controlModules: [...a.controlModules] }));
    }
    this.#readOnly = readOnly;
    this.#db = new DatabaseSync(file, { readOnly });
    try {
      const version = this.#get('PRAGMA user_version').user_version;
      const tables = this.#all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      if (!version && !tables.length && !readOnly && newFile) {
        this.#db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
        try {
          this.#db.exec(SCHEMA);
          for (const table of IMMUTABLE) for (const action of ['UPDATE', 'DELETE'])
            this.#db.exec(`CREATE TRIGGER immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable ${table}'); END`);
          this.#run('INSERT INTO chart_templates VALUES(?,?,?)', 'STANDARD', 1, json(TEMPLATE));
          this.#db.exec('COMMIT');
        } catch (e) { this.#db.exec('ROLLBACK'); throw e; }
      } else if (version !== 1 || !['companies', 'receipts', 'journal_seals', 'config_versions', 'transfer_queue', 'meta'].every(n => tables.some(t => t.name === n))) {
        fail('Unknown or incompatible enterprise schema; database not initialized.', 409);
      }
      this.#db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
      // Validate every v1 collection without running DDL, seeding or migration on existing files.
      for (const [table, columns] of Object.entries(COLUMNS)) {
        const actual = this.#all(`PRAGMA table_xinfo(${table})`).map(r => r.name);
        if (!equal(actual, columns)) fail(`Incompatible enterprise schema: ${table}.`, 409);
        const groups = new Map();
        for (const fk of this.#all(`PRAGMA foreign_key_list(${table})`)) {
          if (!groups.has(fk.id)) groups.set(fk.id, []);
          groups.get(fk.id).push(fk);
        }
        const actualFK = [...groups.values()].map(g => {
          g.sort((a, b) => a.seq - b.seq);
          return `${g.map(r => r.from).join(',')}:${g[0].table}:${g.map(r => r.to).join(',')}`;
        }).sort();
        if (!equal(actualFK, [...(FOREIGN_KEYS[table] ?? [])].sort())) fail(`Incompatible scoped foreign keys: ${table}.`, 409);
      }
      const triggers = new Set(this.#all("SELECT name FROM sqlite_master WHERE type='trigger'").map(r => r.name));
      for (const table of IMMUTABLE) for (const action of ['UPDATE', 'DELETE'])
        if (!triggers.has(`immutable_${table}_${action}`)) fail('Incomplete immutable enterprise schema.', 409);
      for (const trigger of ['seal_balance', 'sealed_lines', 'currency_scale', 'currency_delete', 'company_update', 'company_delete', 'company_scales', 'used_account_identity', 'line_shape'])
        if (!triggers.has(trigger)) fail('Incomplete enterprise constraints.', 409);
      if (!this.#get('SELECT revision FROM meta WHERE id=1')) fail('Incomplete enterprise schema.', 409);
    } catch (e) { this.#db.close(); throw e; }
  }
  close() { if (!this.#closed) { this.#db.close(); this.#closed = true; } }
  #all(sql, ...args) { return this.#db.prepare(sql).all(...args); }
  #get(sql, ...args) { return this.#db.prepare(sql).get(...args); }
  #run(sql, ...args) { return this.#db.prepare(sql).run(...args); }
  #writable() { if (this.#readOnly) fail('Enterprise database is read-only.', 409); }
  #tx(fn) {
    this.#writable(); let started = false;
    try { this.#db.exec('BEGIN IMMEDIATE'); started = true; const r = fn(); this.#db.exec('COMMIT'); return r; }
    catch (e) {
      if (started) this.#db.exec('ROLLBACK');
      if (e instanceof AppError) throw e;
      const error = new AppError('Enterprise persistence failed; transaction rolled back; retryable.', 503);
      error.retryable = true; throw error;
    }
  }
  #revision() { return this.#get('SELECT revision FROM meta WHERE id=1').revision; }
  #bump() { const n = safe(BigInt(this.#revision()) + 1n); this.#run('UPDATE meta SET revision=? WHERE id=1', n); return n; }
  #company(c) {
    code(c); const r = this.#get('SELECT * FROM companies WHERE code=?', c);
    if (!r) fail('Company not found.', 404);
    return { code: r.code, name: r.name, year: r.year, currency: r.currency, scale: r.scale,
      reportCurrency: r.report_currency, reportScale: r.report_scale, chartTemplate: r.template, templateRevision: r.template_revision };
  }
  #configs(c) { return this.#all('SELECT * FROM configs WHERE company=? ORDER BY kind,code', c).map(r => ({
    kind: r.kind, code: r.code, revision: r.revision, active: !!r.active, data: parse(r.data),
  })); }
  #config(c, kind, key, day) {
    const r = this.#get('SELECT * FROM configs WHERE company=? AND kind=? AND code=?', c, kind, key);
    if (!r) fail(`${kind} ${key} not found.`, 404);
    const out = { kind, code: key, revision: r.revision, active: !!r.active, data: parse(r.data) };
    if (day && !effective(out, day)) fail(`${kind} ${key} inactive or outside effective date.`);
    return out;
  }
  #audit(c, action, reference, data) {
    this.#run('INSERT INTO audit(company,action,reference,data,at) VALUES(?,?,?,?,?)', c, action, reference,
      json({ assurance: 'simulated-local-single-operator', ...data }), new Date().toISOString());
  }
  createCompany(input) {
    record(input, ['code', 'name', 'year', 'currency', 'scale', 'reportCurrency', 'reportScale', 'chartTemplate']);
    const c = code(input.code); text(input.name); integer(input.year, 1900, 9998);
    for (const k of ['currency', 'reportCurrency']) if (!/^[A-Z]{3}$/.test(input[k]) || typeof input[k] !== 'string') fail('Invalid currency.');
    integer(input.scale, 0, 4); integer(input.reportScale, 0, 4); choice(input.chartTemplate, ['STANDARD']);
    return this.#tx(() => {
      if (this.#get('SELECT code FROM companies WHERE code=?', c)) fail('Company already exists.', 409);
      for (const [currency, scale] of [[input.currency, input.scale], [input.reportCurrency, input.reportScale]]) {
        const old = this.#get('SELECT scale FROM currencies WHERE code=?', currency);
        if (old && old.scale !== scale) fail('Global currency scale/precision conflict.', 409);
        if (!old) this.#run('INSERT INTO currencies VALUES(?,?)', currency, scale);
      }
      this.#run('INSERT INTO companies VALUES(?,?,?,?,?,?,?,?,?)', c, input.name.trim(), input.year, input.currency, input.scale,
        input.reportCurrency, input.reportScale, 'STANDARD', 1);
      for (let m = 1; m <= 12; m++) this.#run('INSERT INTO periods VALUES(?,?,1,?,?)', c, `${input.year}-${String(m).padStart(2, '0')}`, 'open', json(MODULES));
      for (const a of TEMPLATE) {
        const revision = this.#bump();
        this.#run('INSERT INTO configs VALUES(?,?,?,?,?,?)', c, 'account', a.code, revision, 1, json(a.data));
        this.#run('INSERT INTO config_versions VALUES(?,?,?,?,?,?)', c, 'account', a.code, revision, 1, json(a.data));
        this.#run('INSERT INTO accounts VALUES(?,?,?,?,?)', c, a.code, a.data.category, a.data.purpose, json(a.data));
      }
      this.#audit(c, 'company.create', null, { template: 'STANDARD', templateRevision: 1 });
      return this.#company(c);
    });
  }
  #validateConfig(c, kind, key, d) {
    code(key); clean(d);
    const dims = value => {
      dimensions(value);
      for (const [k, v] of Object.entries(value)) {
        this.#config(c, 'dimension', k);
        if (v !== null) this.#config(c, 'dimensionValue', `${k}:${v}`);
      }
    };
    const list = a => {
      if (!Array.isArray(a) || a.length > 32 || new Set(a).size !== a.length) fail('Invalid dimension list.');
      a.forEach(k => this.#config(c, 'dimension', code(k)));
    };
    if (kind === 'account') {
      accountCode(key); record(d, ['name', 'category', 'reportGroup', 'normalSide', 'purpose', 'controlModule', 'contraOf', 'manualAllowed']);
      text(d.name); choice(d.category, Object.keys(GROUPS)); choice(d.reportGroup, GROUPS[d.category]);
      choice(d.normalSide, ['DEBIT', 'CREDIT']); choice(d.purpose, ['general', 'control', 'clearing', 'suspense']); bool(d.manualAllowed);
      if (d.purpose === 'control') { choice(d.controlModule, ['AP', 'AR', 'INVENTORY', 'ASSET', 'BANK', 'TAX', 'LEASE', 'IC']); if (d.manualAllowed) fail('Control accounts cannot permit manual posting.'); }
      else if (d.controlModule !== null) fail('Non-control account cannot have a control module.');
      if (d.contraOf !== null) {
        accountCode(d.contraOf);
        if (d.purpose !== 'general' || d.contraOf === key) fail('Invalid contra relationship.');
        const parent = this.#config(c, 'account', d.contraOf).data;
        if (parent.category !== d.category || parent.normalSide === d.normalSide || parent.purpose !== 'general' || parent.contraOf) fail('Invalid contra category, direction or chain.');
      }
      for (const a of this.#configs(c).filter(a => a.kind === 'account' && a.data.contraOf === key)) {
        if (d.contraOf || d.purpose !== 'general' || a.data.category !== d.category || a.data.normalSide === d.normalSide) fail('Invalid existing contra relationship.');
      }
      const used = this.#get('SELECT 1 FROM lines WHERE company=? AND account=? LIMIT 1', c, key)
        || this.#all('SELECT evidence FROM receipts WHERE company=?', c).some(r => parse(r.evidence).plan.lines.some(l => l.account === key));
      const old = this.#get("SELECT data FROM configs WHERE company=? AND kind='account' AND code=?", c, key);
      if (used && old) for (const f of ['category', 'purpose', 'controlModule', 'contraOf', 'normalSide'])
        if (!equal(parse(old.data)[f], d[f])) fail('Used account identity, category, purpose and direction are immutable.', 409);
    } else if (kind === 'dimension') {
      dimensionCode(key); record(d, ['name', 'from', 'to']); text(d.name); windowFields(d);
    } else if (kind === 'dimensionValue') {
      record(d, ['dimension', 'value', 'name', 'from', 'to']); dimensionCode(d.dimension); dimensionCode(d.value, true);
      if (key !== `${d.dimension}:${d.value}`) fail('Dimension value identity mismatch.');
      this.#config(c, 'dimension', d.dimension); text(d.name); windowFields(d);
    } else if (kind === 'defaults') {
      record(d, ['account', 'values', 'from', 'to']); windowFields(d); dims(d.values);
      if (key === 'LEDGER') { if (d.account !== null) fail('Ledger defaults account must be null.'); }
      else { accountCode(key); if (d.account !== key) fail('Defaults account mismatch.'); this.#config(c, 'account', key); }
    } else if (kind === 'derivation') {
      record(d, ['when', 'values', 'mode', 'from', 'to']); dims(d.when); dims(d.values); windowFields(d); choice(d.mode, ['fill', 'replace']);
      if (!Object.keys(d.when).length || !Object.keys(d.values).length) fail('Derivation must have conditions and outputs.');
      const rules = this.#configs(c).filter(r => r.kind === 'derivation' && r.code !== key && r.active).map(r => r.data).concat(d);
      const graph = new Map();
      for (const r of rules) for (const i of Object.keys(r.when)) {
        if (!graph.has(i)) graph.set(i, new Set());
        for (const o of Object.keys(r.values)) graph.get(i).add(o);
      }
      const visit = (n, visiting, done) => {
        if (visiting.has(n)) fail('Derivation dependency cycle.');
        if (done.has(n)) return;
        visiting.add(n); for (const o of graph.get(n) ?? []) visit(o, visiting, done);
        visiting.delete(n); done.add(n);
      };
      const done = new Set(); for (const n of graph.keys()) visit(n, new Set(), done);
    } else if (kind === 'structure') {
      record(d, ['account', 'required', 'allowed', 'conditionals', 'fixed', 'from', 'to']);
      accountCode(key); if (d.account !== key) fail('Structure account mismatch.');
      this.#config(c, 'account', key); list(d.required); dims(d.fixed); windowFields(d);
      if (!Array.isArray(d.allowed) || d.allowed.length > 100 || !Array.isArray(d.conditionals) || d.conditionals.length > 100) fail('Invalid structure constraints.');
      d.allowed.forEach(dims);
      for (const r of d.conditionals) {
        record(r, ['when', 'required', 'fixed'], ['when', 'required']); dims(r.when); list(r.required); if (own(r, 'fixed')) dims(r.fixed);
      }
    } else if (kind === 'balance') {
      record(d, ['dimension', 'account']); if (key !== 'LEDGER') fail('One ledger balancing dimension supported.');
      this.#config(c, 'dimension', code(d.dimension)); const a = this.#config(c, 'account', accountCode(d.account)).data;
      if (a.purpose !== 'clearing') fail('Internal balancing account must be a clearing account.');
    } else if (kind === 'service' || kind === 'party') {
      record(d, ['name', 'group', 'defaultDimensions']); text(d.name); code(d.group); dims(d.defaultDimensions);
    } else if (kind === 'rule') {
      record(d, ['event', 'meaning', 'objectScope', 'objectCode', 'partyScope', 'partyCode', 'account', 'dimensions', 'from', 'to']);
      choice(d.event, ['cash_service']); choice(d.meaning, ['cash', 'revenue', 'forecast']);
      for (const axis of ['object', 'party']) {
        choice(d[`${axis}Scope`], ['exact', 'group', 'all']);
        if (d[`${axis}Scope`] === 'all') { if (d[`${axis}Code`] !== '*') fail('All scope must use *.'); }
        else code(d[`${axis}Code`]);
        if (d[`${axis}Scope`] === 'exact') this.#config(c, axis === 'object' ? 'service' : 'party', d[`${axis}Code`]);
      }
      this.#config(c, 'account', accountCode(d.account)); dims(d.dimensions); windowFields(d);
    }
  }
  configure(input) {
    record(input, ['company', 'kind', 'code', 'expectedRevision', 'active', 'data']);
    const c = this.#company(input.company).code; choice(input.kind, KINDS); code(input.code); integer(input.expectedRevision); bool(input.active);
    return this.#tx(() => {
      const old = this.#get('SELECT revision,data,active FROM configs WHERE company=? AND kind=? AND code=?', c, input.kind, input.code);
      if ((old?.revision ?? 0) !== input.expectedRevision) fail('Configuration revision conflict.', 409);
      this.#validateConfig(c, input.kind, input.code, input.data);
      const revision = this.#bump();
      this.#run('INSERT INTO configs VALUES(?,?,?,?,?,?) ON CONFLICT(company,kind,code) DO UPDATE SET revision=excluded.revision,active=excluded.active,data=excluded.data',
        c, input.kind, input.code, revision, +input.active, json(input.data));
      this.#run('INSERT INTO config_versions VALUES(?,?,?,?,?,?)', c, input.kind, input.code, revision, +input.active, json(input.data));
      if (input.kind === 'account') this.#run('INSERT INTO accounts VALUES(?,?,?,?,?) ON CONFLICT(company,code) DO UPDATE SET category=excluded.category,purpose=excluded.purpose,data=excluded.data',
        c, input.code, input.data.category, input.data.purpose, json(input.data));
      this.#audit(c, 'config.save', null, { kind: input.kind, code: input.code, beforeRevision: old?.revision ?? 0, revision,
        before: old ? { revision: old.revision, active: !!old.active, data: parse(old.data) } : null,
        after: { revision, active: input.active, data: input.data } });
      return this.#config(c, input.kind, input.code);
    });
  }
  #month(c, month) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Invalid month.');
    const p = this.#get('SELECT * FROM periods WHERE company=? AND month=?', c, month);
    if (!p) fail('Accounting period not found.', 404);
    return { month: p.month, revision: p.revision, status: p.status, modules: parse(p.modules) };
  }
  #period(c, day, module) {
    date(day); const p = this.#month(c, day.slice(0, 7));
    if (p.status !== 'open' || !p.modules.includes(module)) fail('Accounting period is not open for this module.', 409);
    return p;
  }
  setPeriod(input) {
    record(input, ['company', 'month', 'expectedRevision', 'status', 'modules', 'reason', 'permanentConfirmation']);
    const c = this.#company(input.company).code; integer(input.expectedRevision, 1); choice(input.status, ['open', 'hold', 'permanent']); text(input.reason);
    bool(input.permanentConfirmation);
    if (!Array.isArray(input.modules) || new Set(input.modules).size !== input.modules.length) fail('Invalid modules.');
    input.modules.forEach(m => choice(m, MODULES));
    return this.#tx(() => {
      const old = this.#month(c, input.month);
      if (old.revision !== input.expectedRevision) fail('Period revision conflict.', 409);
      if (old.status === 'permanent') fail('Permanent period cannot be changed.', 409);
      if (input.status !== 'open') {
        if (this.#get(`SELECT 1 FROM transfer_queue q JOIN source_events s USING(company,reference)
          WHERE q.company=? AND substr(s.accounting_date,1,7)=? AND q.status IN('pending','failed') LIMIT 1`, c, input.month)) fail('Period has pending transfers.', 409);
        if (input.status === 'permanent') {
          if (!input.permanentConfirmation) fail('Permanent close requires explicit confirmation.');
          if (this.#get('SELECT 1 FROM source_events WHERE company=? AND substr(accounting_date,1,7)=? LIMIT 1', c, input.month)) fail('Period has activity; year-close workflow is not available.', 409);
        }
      }
      const revision = this.#bump();
      this.#run('UPDATE periods SET revision=?,status=?,modules=? WHERE company=? AND month=?', revision, input.status, json(input.modules), c, input.month);
      this.#audit(c, 'period.change', null, { before: old, after: { ...input, revision }, reason: input.reason });
      return this.#month(c, input.month);
    });
  }
  #command(input) {
    record(input, ['company', 'operation', 'reference', 'accountingDate', 'documentDate', 'taxDate', 'sourceRevision', 'data']);
    // Schema-only normalization is intentionally independent of current configuration for receipt retries.
    code(input.company); code(input.reference); date(input.accountingDate); date(input.documentDate); date(input.taxDate); integer(input.sourceRevision);
    if (typeof input.operation !== 'string' || !/^[a-z][a-z0-9_.]{0,59}$/.test(input.operation)) fail('Unsupported operation.');
    record(input.data, keys(input.data)); const out = clean(input);
    if (Buffer.byteLength(json(out)) > 65536) fail('Command exceeds size limit.');
    const d = out.data;
    const rawLines = lines => {
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > 500) fail('Journal needs 2-500 lines.');
      for (const l of lines) {
        record(l, ['account', 'debit', 'credit', 'dimensions', 'metadata'], ['account', 'debit', 'credit']);
        accountCode(l.account); if (typeof l.debit !== 'string' || typeof l.credit !== 'string') fail('Money must be decimal strings.');
        if (!own(l, 'dimensions')) l.dimensions = {}; dimensions(l.dimensions);
        if (own(l, 'metadata')) {
          record(l.metadata, ['owner', 'reason', 'reviewDate']);
          text(l.metadata.owner); text(l.metadata.reason); date(l.metadata.reviewDate);
        }
      }
    };
    if (out.operation === 'journal') {
      record(d, ['memo', 'kind', 'currency', 'lines', 'headerDimensions', 'transferMode'], ['memo', 'kind', 'currency', 'lines']);
      text(d.memo); choice(d.kind, ['normal', 'adjusting']); rawLines(d.lines);
      d.headerDimensions ??= {}; dimensions(d.headerDimensions); d.transferMode ??= 'sync'; choice(d.transferMode, ['sync', 'queued']);
    } else if (out.operation === 'cash_service') {
      record(d, ['service', 'party', 'amount', 'currency', 'memo', 'dimensions']); code(d.service); if (d.party !== null) code(d.party);
      text(d.memo); dimensions(d.dimensions);
    } else if (out.operation === 'statistics') {
      record(d, ['code', 'quantity', 'unit', 'dimensions']); code(d.code); text(d.unit, 40); dimensions(d.dimensions);
      amount(d.quantity, 6, true);
    } else if (out.operation === 'clearing.match') {
      record(d, ['account', 'lineIds', 'reason']); accountCode(d.account); text(d.reason);
      if (!Array.isArray(d.lineIds) || d.lineIds.length < 2 || d.lineIds.length > 500 || new Set(d.lineIds).size !== d.lineIds.length) fail('Invalid clearing line IDs.');
      d.lineIds.forEach(n => integer(n, 1));
    } else if (['reverse', 'replace', 'reclassify'].includes(out.operation)) {
      record(d, ['originalJournalId', 'memo', ...(['replace', 'reclassify'].includes(out.operation) ? ['lines', 'headerDimensions'] : [])],
        ['originalJournalId', 'memo', ...(['replace', 'reclassify'].includes(out.operation) ? ['lines'] : [])]);
      integer(d.originalJournalId, 1); text(d.memo);
      if (out.operation !== 'reverse') { rawLines(d.lines); d.headerDimensions ??= {}; dimensions(d.headerDimensions); }
    } else if (out.operation === 'cash_service.cancel') {
      record(d, ['originalReference', 'memo']); code(d.originalReference); text(d.memo);
    }
    return clean(out);
  }
  #resolveDimensions(c, account, day, header, explicit, master = {}) {
    const configs = this.#configs(c); const values = {}; const origins = {};
    const apply = (map, source, mode = 'replace') => {
      for (const [key, value] of Object.entries(map)) {
        if (mode === 'fill' && own(values, key)) continue;
        const previous = own(values, key) ? values[key] : undefined;
        if (!own(origins, key)) origins[key] = [];
        origins[key].push({ source, ...(previous !== undefined ? { previous } : {}), value });
        values[key] = value;
      }
    };
    for (const key of new Set(['LEDGER', account])) {
      const cfg = configs.find(x => x.kind === 'defaults' && x.code === key && effective(x, day));
      if (cfg) apply(cfg.data.values, `defaults:${key}@${cfg.revision}`);
    }
    apply(master, 'master'); apply(header, 'header'); apply(explicit, 'line');
    const rules = configs.filter(x => x.kind === 'derivation' && effective(x, day));
    const done = new Set(); const writes = new Map();
    // Dependencies are acyclic at configuration time. Repeated passes provide topological evaluation independent of IDs.
    const dependencies = (r, other) => Object.keys(r.data.when).some(k => own(other.data.values, k));
    while (done.size < rules.length) {
      const ready = rules.filter(r => !done.has(r.code) && !rules.some(o => o !== r && !done.has(o.code) && dependencies(r, o)));
      if (!ready.length) fail('Derivation dependency cycle.');
      for (const r of ready) {
        if (Object.entries(r.data.when).every(([k, v]) => own(values, k) && values[k] === v)) {
          for (const [k, v] of Object.entries(r.data.values)) {
            if (writes.has(k) && writes.get(k) !== v) fail('Conflicting effective derivations.');
            writes.set(k, v);
          }
          apply(r.data.values, `derivation:${r.code}@${r.revision}:${r.data.mode}`, r.data.mode);
        }
        done.add(r.code);
      }
    }
    const structure = configs.find(x => x.kind === 'structure' && x.code === account && effective(x, day));
    const required = new Set(structure?.data.required ?? []);
    let fixed = { ...(structure?.data.fixed ?? {}) };
    const seenFixed = new Set();
    // Conditional constraints must describe a stable final combination, not a transient pre-fixed value.
    for (;;) {
      const signature = json(fixed);
      if (seenFixed.has(signature) || seenFixed.size > 200) fail('Conditional fixed dimension cycle.');
      seenFixed.add(signature);
      const final = { ...values, ...fixed }, candidate = { ...(structure?.data.fixed ?? {}) };
      const matches = (structure?.data.conditionals ?? []).filter(r => Object.entries(r.when).every(([k, v]) => own(final, k) && final[k] === v));
      for (const r of matches) for (const [k, v] of Object.entries(r.fixed ?? {})) {
        if (own(candidate, k) && candidate[k] !== v) fail('Conflicting fixed dimensions.');
        candidate[k] = v;
      }
      if (equal(candidate, fixed)) { matches.forEach(r => r.required.forEach(k => required.add(k))); break; }
      fixed = candidate;
    }
    for (const [k, v] of Object.entries(fixed)) if (own(explicit, k) && explicit[k] !== v) fail('Explicit line conflicts with fixed dimension.');
    apply(fixed, `fixed:${account}@${structure?.revision ?? 0}`);
    for (const k of required) if (!own(values, k) || values[k] === null) fail(`Required dimension ${k} is missing.`);
    if (structure?.data.allowed.length && !structure.data.allowed.some(combo => Object.entries(combo).every(([k, v]) => own(values, k) && values[k] === v))) fail('Final dimension combination not allowed.');
    for (const [k, v] of Object.entries(values)) {
      this.#config(c, 'dimension', k, day);
      if (v !== null) this.#config(c, 'dimensionValue', `${k}:${v}`, day);
    }
    return { dimensions: clean(values), dimensionOrigins: clean(origins) };
  }
  #line(c, raw, day, header = {}, master = {}, grants = [], internal = false) {
    const a = this.#config(c.code, 'account', raw.account, day);
    if (a.data.purpose === 'control' ? !grants.includes(a.data.controlModule) : (!a.data.manualAllowed && !internal)) fail(`Account ${raw.account} does not permit this source.`);
    const debit = amount(raw.debit, c.scale), credit = amount(raw.credit, c.scale);
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) fail('Each line must have exactly one positive amount.');
    const metadata = raw.metadata ?? {};
    if (a.data.purpose === 'suspense') {
      record(metadata, ['owner', 'reason', 'reviewDate']); text(metadata.owner); text(metadata.reason); date(metadata.reviewDate);
    }
    const resolved = this.#resolveDimensions(c.code, raw.account, day, header, raw.dimensions ?? {}, master);
    return { account: raw.account, currency: c.currency, transactionDebit: debit, transactionCredit: credit,
      accountingCurrency: c.currency, debit, credit, reportingCurrency: c.reportCurrency,
      reportingDebit: c.currency === c.reportCurrency ? debit : null, reportingCredit: c.currency === c.reportCurrency ? credit : null,
      rateRefs: { accounting: null, reporting: null }, ...resolved, metadata: { ...metadata, ...(internal ? { internalBalancing: true } : {}) } };
  }
  #businessLines(c, raws, day, header = {}, master = {}, grants = []) {
    const lines = raws.map((l, i) => {
      try { return this.#line(c, l, day, header, l.masterDimensions ?? master, grants); }
      catch (e) {
        if (e instanceof AppError) { e.message = `Line ${i + 1}: ${e.message}`; e.lineNo = i + 1; }
        throw e;
      }
    });
    const debit = sum(lines.map(l => l.debit)), credit = sum(lines.map(l => l.credit));
    if (debit !== credit) fail('Business journal must be balanced before internal balancing.');
    const balance = this.#configs(c.code).find(x => x.kind === 'balance' && x.active);
    if (balance) {
      const { dimension, account } = balance.data;
      this.#config(c.code, 'dimension', dimension, day); this.#config(c.code, 'account', account, day);
      const groups = new Map();
      for (const l of lines) {
        const v = l.dimensions[dimension]; if (v == null) fail('Balancing dimension missing.');
        groups.set(v, safe(BigInt(groups.get(v) ?? 0) + BigInt(l.debit) - BigInt(l.credit)));
      }
      const decimal = n => {
        const s = String(Math.abs(n)).padStart(c.scale + 1, '0');
        return c.scale ? `${s.slice(0, -c.scale)}.${s.slice(-c.scale)}` : s;
      };
      for (const [value, net] of [...groups.entries()].sort()) if (net) {
        const l = this.#line(c, { account, debit: net < 0 ? decimal(net) : '0', credit: net > 0 ? decimal(net) : '0', dimensions: { [dimension]: value } }, day, {}, {}, grants, true);
        if (l.dimensions[dimension] !== value) fail('Internal balance dimension changed by constraints.');
        l.metadata.balancingSource = { dimension, value, businessNet: net, configurationRevision: balance.revision };
        lines.push(l);
      }
    }
    return lines;
  }
  #rule(c, meaning, service, party, day, explanations) {
    const rank = { exact: 2, group: 1, all: 0 };
    const matches = (scope, value, object) => scope === 'all' || (object && value === (scope === 'exact' ? object.code : object.data.group));
    const rules = this.#configs(c).filter(r => r.kind === 'rule' && effective(r, day) && r.data.event === 'cash_service' && r.data.meaning === meaning
      && matches(r.data.objectScope, r.data.objectCode, service) && matches(r.data.partyScope, r.data.partyCode, party));
    const dominates = (a, b) => rank[a.data.objectScope] >= rank[b.data.objectScope] && rank[a.data.partyScope] >= rank[b.data.partyScope]
      && (rank[a.data.objectScope] > rank[b.data.objectScope] || rank[a.data.partyScope] > rank[b.data.partyScope]);
    const winners = rules.filter(r => !rules.some(o => o !== r && dominates(o, r)));
    if (winners.length !== 1) fail(winners.length ? `Ambiguous rule conflict for ${meaning}.` : `Missing rule for ${meaning}.`);
    const winner = winners[0]; const a = this.#config(c, 'account', winner.data.account, day);
    if (a.data.purpose !== 'general' || (meaning === 'cash' ? a.data.category !== 'ASSET' || a.data.reportGroup !== 'cash' : a.data.category !== 'REVENUE')) fail(`Invalid winning ${meaning} rule account; no fallback.`);
    explanations.push({ meaning, winner: winner.code, revision: winner.revision, account: winner.data.account,
      candidates: rules.map(r => ({ code: r.code, revision: r.revision, objectScope: r.data.objectScope, partyScope: r.data.partyScope,
        result: r === winner ? 'winner' : 'dominated' })) });
    return winner.data;
  }
  #activeCorrection(c, id, seen = new Set()) {
    if (seen.has(id)) fail('Correction cycle.', 409);
    const next = new Set(seen); next.add(id);
    return this.#all('SELECT * FROM corrections WHERE company=? AND original_id=? ORDER BY output_id', c, id).some(r => {
      if (r.type !== 'reclassify') return true;
      return !this.#activeCorrection(c, r.output_id, next);
    });
  }
  #latestCorrectionDate(c, id) {
    // Include every descendant, even an undo that restored the original's eligibility.
    // Looking only at the currently effective correction would allow historical overlap.
    return this.#get(`WITH RECURSIVE chain(id) AS (
      SELECT ? UNION
      SELECT r.output_id FROM corrections r JOIN chain ON r.original_id=chain.id WHERE r.company=?
    ) SELECT max(j.accounting_date) AS latest FROM journals j JOIN chain ON j.id=chain.id WHERE j.company=?`, id, c, c).latest;
  }
  #reverseLines(lines) {
    return lines.map(({ id, lineNo, journalId, ...l }) => ({ ...l,
      debit: l.credit, credit: l.debit, transactionDebit: l.transactionCredit, transactionCredit: l.transactionDebit,
      reportingDebit: l.reportingCredit, reportingCredit: l.reportingDebit,
      metadata: { ...l.metadata, historicalReverse: true, originalLineId: id } }));
  }
  #plan(command) {
    const c = this.#company(command.company), d = command.data, op = command.operation;
    if (!OPS.includes(op) && !this.#adapters.has(op)) fail('Unsupported operation.');
    if (command.sourceRevision !== 0) fail('New event source revision must be zero.', 409);
    const adapter = this.#adapters.get(op);
    const module = adapter?.module ?? (op.startsWith('cash_service') ? 'cash_service' : op === 'clearing.match' ? 'clearing' : ['reverse', 'replace', 'reclassify'].includes(op) ? 'correction' : op);
    const p = this.#period(c.code, command.accountingDate, module);
    const plan = { lines: [], journals: [], objectEffects: [], facts: [], explanations: [], checks: [],
      policySnapshots: this.#configs(c.code), expectedRevisions: { global: this.#revision(), period: p.revision }, module, version: 1 };
    const spec = (lines, kind = 'normal', role = 'normal') => ({ lines, kind, role, memo: d.memo ?? op });
    if (op === 'journal') {
      if (d.currency !== c.currency) fail('Only accounting currency is supported.');
      plan.lines = this.#businessLines(c, d.lines, command.accountingDate, d.headerDimensions);
      plan.journals = [spec(plan.lines, d.kind)]; plan.transferMode = d.transferMode;
    } else if (op === 'cash_service') {
      if (d.currency !== c.currency || amount(d.amount, c.scale) <= 0) fail('Positive accounting currency amount required.');
      const s = this.#config(c.code, 'service', d.service, command.accountingDate);
      const party = d.party === null ? null : this.#config(c.code, 'party', d.party, command.accountingDate);
      const cash = this.#rule(c.code, 'cash', s, party, command.accountingDate, plan.explanations);
      const revenue = this.#rule(c.code, 'revenue', s, party, command.accountingDate, plan.explanations);
      const master = { ...(party?.data.defaultDimensions ?? {}), ...s.data.defaultDimensions };
      plan.lines = this.#businessLines(c, [
        { account: cash.account, debit: d.amount, credit: '0', dimensions: d.dimensions, masterDimensions: { ...master, ...cash.dimensions } },
        { account: revenue.account, debit: '0', credit: d.amount, dimensions: d.dimensions, masterDimensions: { ...master, ...revenue.dimensions } },
      ], command.accountingDate, {}, master);
      plan.journals = [spec(plan.lines)];
      plan.objectEffects = [{ type: 'cash_service', service: d.service, party: d.party, amount: amount(d.amount, c.scale) }];
    } else if (op === 'statistics') {
      const [, fraction = ''] = d.quantity.split('.'); const scale = fraction.length;
      plan.objectEffects = [{ type: 'statistics', code: d.code, quantity: amount(d.quantity, scale, true), scale, unit: d.unit,
        ...this.#resolveDimensions(c.code, 'LEDGER', command.accountingDate, {}, d.dimensions) }];
    } else if (op === 'clearing.match') {
      const a = this.#config(c.code, 'account', d.account, command.accountingDate).data;
      if (!['clearing', 'suspense'].includes(a.purpose)) fail('Account is not a clearing or suspense account.');
      const lines = d.lineIds.map(id => {
        const l = this.#get(`SELECT l.*,j.accounting_date FROM lines l
          JOIN journals j ON j.company=l.company AND j.id=l.journal_id
          WHERE l.company=? AND l.id=? AND l.account=?`, c.code, id, d.account);
        if (!l) fail('Clearing line not found.', 404);
        if (command.accountingDate < l.accounting_date) fail('Match accounting date cannot be before any matched line accounting date.');
        if (parse(l.data).metadata.internalBalancing) fail('Internal balancing lines are not source clearing items.');
        if (this.#get('SELECT 1 FROM clearing_links WHERE company=? AND line_id=?', c.code, id)) fail('Line already matched.', 409);
        return l;
      });
      if (sum(lines.map(l => safe(BigInt(l.debit) - BigInt(l.credit)))) !== 0) fail('Full clearing residuals must sum to zero.');
      plan.objectEffects = [{ type: 'clearing.match', account: d.account, lineIds: d.lineIds, reason: d.reason }];
    } else if (['reverse', 'replace', 'reclassify', 'cash_service.cancel'].includes(op)) {
      let original;
      if (op === 'cash_service.cancel') {
        const src = this.source(c.code, d.originalReference);
        if (src.operation !== 'cash_service' || src.status !== 'posted' || src.journalIds.length !== 1) fail('Source is not a posted cash service.');
        original = this.journal(c.code, src.journalIds[0]);
      } else {
        original = this.journal(c.code, d.originalJournalId);
        if (!['journal', 'replace', 'reclassify'].includes(original.operation) || original.role === 'reversal') fail('General correction is restricted to manual sources.');
        if (original.operation === 'reclassify' && op !== 'reverse') fail('Reclassification output permits only full reverse.');
      }
      const earliestDate = this.#latestCorrectionDate(c.code, original.id);
      if (command.accountingDate < earliestDate) fail(`Correction accounting date cannot be before original/correction chain date ${earliestDate}.`);
      if (this.#activeCorrection(c.code, original.id)) fail('Journal already has an effective correction.', 409);
      const reversed = this.#reverseLines(original.lines);
      plan.correction = { originalId: original.id, type: op };
      if (op === 'reverse' || op === 'cash_service.cancel') { plan.lines = reversed; plan.journals = [spec(reversed, original.kind, 'reversal')]; }
      else {
        const fresh = this.#businessLines(c, d.lines, command.accountingDate, d.headerDimensions);
        if (op === 'replace') { plan.lines = [...reversed, ...fresh]; plan.journals = [spec(reversed, original.kind, 'reversal'), spec(fresh)]; }
        else {
          // Compare economic lines, not the extra internal balancing turnover.
          const economic = ls => sum(ls.filter(l => !l.metadata.internalBalancing).map(l => l.debit));
          if (economic(fresh) !== economic(original.lines)) fail('Reclassification must preserve the full economic amount.');
          plan.lines = [...reversed.map(l => ({ ...l, metadata: { ...l.metadata, reclassificationGroup: 'originalReverse' } })),
            ...fresh.map(l => ({ ...l, metadata: { ...l.metadata, reclassificationGroup: 'newAllocation' } }))];
          plan.journals = [spec(plan.lines, original.kind, 'reclassification')];
        }
      }
      plan.objectEffects = [{ type: 'correction', originalJournalId: original.id, operation: op }];
    } else if (adapter) {
      const raw = adapter.plan(freeze(clean(command)), freeze({
        company: { ...c }, configuration: this.#configs(c.code),
      }));
      record(raw, ['lines', 'facts', 'objectEffects', 'explanations'], ['lines', 'facts']);
      if (!Array.isArray(raw.facts) || !raw.facts.length || !Array.isArray(raw.lines) || raw.lines.length < 2
        || (own(raw, 'objectEffects') && !Array.isArray(raw.objectEffects)) || (own(raw, 'explanations') && !Array.isArray(raw.explanations))) fail('Trusted adapter requires source facts, balanced lines and effect/explanation arrays.');
      clean(raw);
      // The adapter grant is constructor-only; no request field can manufacture one.
      plan.lines = this.#businessLines(c, raw.lines, command.accountingDate, {}, {}, adapter.controlModules);
      plan.journals = [spec(plan.lines)]; plan.facts = raw.facts; plan.objectEffects = raw.objectEffects ?? [];
      plan.explanations = raw.explanations ?? [];
    }
    for (const j of plan.journals) {
      if (sum(j.lines.map(l => l.debit)) !== sum(j.lines.map(l => l.credit))) fail('Unbalanced plan.');
    }
    this.#checkAggregates(c.code, plan.lines);
    plan.checks.push({ code: 'balanced', passed: true }, { code: 'period-module', passed: true, module });
    return clean(plan);
  }
  #checkAggregates(c, prospective) {
    // BigInt is used before SQL SUM so even accumulated turnover cannot silently round.
    const all = this.#all('SELECT debit,credit FROM lines WHERE company=?', c);
    sum([...all, ...prospective].map(l => l.debit)); sum([...all, ...prospective].map(l => l.credit));
  }
  #token(command, plan) { return createHmac('sha256', this.#secret).update(json({ command, plan })).digest('hex'); }
  preview(input) {
    const command = this.#command(input);
    if (this.#get('SELECT 1 FROM source_events WHERE company=? AND reference=?', command.company, command.reference)) fail('Source reference already accepted; use original receipt retry.', 409);
    const plan = this.#plan(command);
    return { command, token: this.#token(command, plan), plan, revision: plan.expectedRevisions.global };
  }
  #result(c, reference) {
    const r = this.#get('SELECT evidence FROM receipts WHERE company=? AND reference=?', c, reference);
    if (!r) fail('Source not found.', 404);
    const receipt = parse(r.evidence); const q = this.#get('SELECT * FROM transfer_queue WHERE company=? AND reference=?', c, reference);
    return { reference, operation: receipt.command.operation, status: q?.status ?? receipt.status,
      journalIds: q ? parse(q.journal_ids) : receipt.journalIds, receipt };
  }
  #existing(command, token) {
    const row = this.#get('SELECT evidence FROM receipts WHERE company=? AND reference=?', command.company, command.reference);
    if (!row) return null;
    const r = parse(row.evidence);
    if (!equal(r.command, command) || r.token !== token) fail('Source identity conflicts with immutable accepted command/token.', 409);
    return this.#result(command.company, command.reference);
  }
  #writeJournals(command, plan) {
    const ids = [];
    for (const j of plan.journals) {
      const r = this.#run('INSERT INTO journals(company,reference,accounting_date,document_date,tax_date,kind,operation,memo,details) VALUES(?,?,?,?,?,?,?,?,?)',
        command.company, command.reference, command.accountingDate, command.documentDate, command.taxDate, j.kind, command.operation, j.memo,
        json({ role: j.role, planVersion: plan.version, policySnapshots: plan.policySnapshots, expectedRevisions: plan.expectedRevisions }));
      const id = safe(r.lastInsertRowid); ids.push(id);
      for (let i = 0; i < j.lines.length; i++) {
        const l = j.lines[i];
        this.#run('INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES(?,?,?,?,?,?,?)',
          command.company, id, i + 1, l.account, l.debit, l.credit, json(l));
      }
      this.#run('INSERT INTO journal_seals VALUES(?,?)', command.company, id);
    }
    return ids;
  }
  post(input) {
    record(input, ['command', 'token', 'confirmation']);
    const command = this.#command(input.command);
    if (typeof input.token !== 'string' || input.token.length > 256) fail('Invalid token.');
    // Completed retry precedes mutable restrictions, HMAC key verification and read-only checks.
    const existing = this.#existing(command, input.token); if (existing) return existing;
    if (input.confirmation !== 'POST') fail('Explicit POST confirmation is required.');
    return this.#tx(() => {
      const duplicate = this.#existing(command, input.token); if (duplicate) return duplicate;
      const plan = this.#plan(command); const expected = this.#token(command, plan);
      if (!/^[a-f0-9]{64}$/.test(input.token) || !timingSafeEqual(Buffer.from(expected), Buffer.from(input.token))) fail('Preview token is stale or invalid; preview again.', 409);
      const c = command.company, reference = command.reference;
      this.#run('INSERT INTO source_events VALUES(?,?,?,?,?)', c, reference, command.operation, command.accountingDate, json(command));
      const queued = command.operation === 'journal' && plan.transferMode === 'queued';
      const journalIds = queued ? [] : this.#writeJournals(command, plan);
      if (command.operation === 'statistics') this.#run('INSERT INTO statistics VALUES(?,?,?)', c, reference, json(plan.objectEffects[0]));
      if (command.operation === 'clearing.match') for (const id of command.data.lineIds) this.#run('INSERT INTO clearing_links VALUES(?,?,?)', c, id, reference);
      if (plan.facts.length || plan.objectEffects.length) this.#run('INSERT INTO adapter_facts VALUES(?,?,?)', c, reference, json({ facts: plan.facts, objectEffects: plan.objectEffects }));
      if (plan.correction) this.#run('INSERT INTO corrections VALUES(?,?,?,?,?)', c, plan.correction.originalId, journalIds[0], reference, plan.correction.type);
      const status = queued ? 'pending' : journalIds.length ? 'posted' : 'recorded';
      const receipt = { command, token: input.token, plan, status, journalIds, assurance: 'simulated-local-single-operator', acceptedAt: new Date().toISOString() };
      this.#run('INSERT INTO receipts VALUES(?,?,?)', c, reference, json(receipt));
      if (queued) this.#run("INSERT INTO transfer_queue VALUES(?,?,'pending','[]',NULL,NULL)", c, reference);
      this.#audit(c, 'source.accept', reference, { operation: command.operation, status, journalIds, approvedRevision: plan.expectedRevisions.global });
      this.#bump();
      return this.#result(c, reference);
    });
  }
  source(company, reference) { this.#company(company); code(reference); return this.#result(company, reference); }
  transfer(input) {
    record(input, ['company', 'reference']); const c = this.#company(input.company).code; code(input.reference);
    const r = this.#result(c, input.reference);
    if (r.status === 'transferred') return r;
    if (!['pending', 'failed'].includes(r.status) || r.operation !== 'journal') fail('Source is not transferable.', 409);
    this.#writable();
    try {
      return this.#tx(() => {
        const current = this.#result(c, input.reference);
        if (current.status === 'transferred') return current;
        if (!['pending', 'failed'].includes(current.status)) fail('Source no longer transferable.', 409);
        const { command, plan } = current.receipt;
        this.#period(c, command.accountingDate, 'journal');
        if (plan.version !== 1 || !equal(plan.lines, plan.journals.flatMap(j => j.lines))) fail('Incompatible frozen transfer plan.', 409);
        for (const j of plan.journals) if (sum(j.lines.map(l => l.debit)) !== sum(j.lines.map(l => l.credit))) fail('Corrupt frozen transfer plan.', 409);
        this.#checkAggregates(c, plan.lines);
        const ids = this.#writeJournals(command, plan);
        this.#run("UPDATE transfer_queue SET status='transferred',journal_ids=?,error=NULL WHERE company=? AND reference=?", json(ids), c, input.reference);
        this.#audit(c, 'transfer.complete', input.reference, { journalIds: ids }); this.#bump();
        return this.#result(c, input.reference);
      });
    } catch (error) {
      try {
        this.#tx(() => {
          const current = this.#result(c, input.reference);
          if (!['pending', 'failed'].includes(current.status)) return;
          this.#run("UPDATE transfer_queue SET status='failed',error=? WHERE company=? AND reference=?", 'transfer-rejected-or-storage-failure', c, input.reference);
          this.#audit(c, 'transfer.failed', input.reference, { error: 'transfer-rejected-or-storage-failure' }); this.#bump();
        });
      } catch {
        const e = new AppError('Transfer failed and failure status could not persist; previous state retained; retryable.', 503);
        e.retryable = true; throw e;
      }
      throw error;
    }
  }
  withdraw(input) {
    record(input, ['company', 'reference', 'reason']); const c = this.#company(input.company).code; code(input.reference); text(input.reason);
    return this.#tx(() => {
      const r = this.#result(c, input.reference);
      if (r.operation !== 'journal' || !['pending', 'failed'].includes(r.status)) fail('Only pending/failed manual sources can be withdrawn.', 409);
      this.#run("UPDATE transfer_queue SET status='withdrawn',reason=?,error=NULL WHERE company=? AND reference=?", input.reason, c, input.reference);
      this.#audit(c, 'transfer.withdraw', input.reference, { reason: input.reason }); this.#bump(); return this.#result(c, input.reference);
    });
  }
  journal(company, id) {
    this.#company(company); integer(id, 1);
    const j = this.#get('SELECT * FROM journals WHERE company=? AND id=?', company, id);
    if (!j) fail('Journal not found.', 404);
    return { id: j.id, company, reference: j.reference, accountingDate: j.accounting_date, documentDate: j.document_date, taxDate: j.tax_date,
      kind: j.kind, operation: j.operation, memo: j.memo, ...parse(j.details),
      lines: this.#all('SELECT * FROM lines WHERE company=? AND journal_id=? ORDER BY line_no', company, id).map(l => ({
        ...parse(l.data), id: l.id, journalId: id, lineNo: l.line_no,
      })) };
  }
  #page(items, { cursor, limit } = {}) {
    const start = cursor === undefined || cursor === null || cursor === '' ? 0 : (typeof cursor === 'string' && /^\d+$/.test(cursor) ? integer(Number(cursor)) : fail('Invalid cursor.'));
    const count = limit === undefined ? 50 : integer(typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : limit, 1, 200);
    return { items: items.slice(start, start + count), total: items.length, nextCursor: start + count < items.length ? String(start + count) : null };
  }
  audit(company, options = {}) {
    this.#company(company); record(options, ['cursor', 'limit'], []);
    return this.#page(this.#all('SELECT * FROM audit WHERE company=? ORDER BY id', company).map(r => ({
      id: r.id, company, action: r.action, reference: r.reference, ...parse(r.data), at: r.at,
    })), options);
  }
  ledger(input) {
    record(input, ['company', 'account', 'month', 'dimension', 'value', 'cursor', 'limit'], ['company', 'account', 'month']);
    const c = this.#company(input.company); this.#month(c.code, input.month); accountCode(input.account);
    this.#config(c.code, 'account', input.account);
    if (own(input, 'dimension')) { this.#config(c.code, 'dimension', code(input.dimension)); if (input.value !== null) this.#config(c.code, 'dimensionValue', `${input.dimension}:${code(input.value)}`); }
    else if (own(input, 'value')) fail('Dimension is required for value filter.');
    const all = this.#all(`SELECT l.*,j.accounting_date,j.reference FROM lines l JOIN journals j ON j.company=l.company AND j.id=l.journal_id
      WHERE l.company=? AND l.account=? AND substr(j.accounting_date,1,4)=? AND substr(j.accounting_date,1,7)<=?
      ORDER BY j.accounting_date,j.id,l.line_no`, c.code, input.account, String(c.year), input.month)
      .filter(l => !own(input, 'dimension') || parse(l.data).dimensions[input.dimension] === input.value);
    const opening = sum(all.filter(l => l.accounting_date.slice(0, 7) < input.month).map(l => safe(BigInt(l.debit) - BigInt(l.credit))));
    const current = all.filter(l => l.accounting_date.slice(0, 7) === input.month);
    const debit = sum(current.map(l => l.debit)), credit = sum(current.map(l => l.credit));
    let running = opening;
    const lines = current.map(l => {
      running = safe(BigInt(running) + BigInt(l.debit) - BigInt(l.credit));
      return { ...parse(l.data), id: l.id, journalId: l.journal_id, lineNo: l.line_no, accountingDate: l.accounting_date, reference: l.reference, balance: running };
    });
    const page = this.#page(lines, input);
    return { company: c.code, month: input.month, account: input.account, opening, debit, credit,
      closing: safe(BigInt(opening) + BigInt(debit) - BigInt(credit)), lines: page.items, total: page.total, nextCursor: page.nextCursor, currency: c.currency, scale: c.scale };
  }
  #reports(c, month) {
    const accounts = this.#configs(c.code).filter(x => x.kind === 'account');
    const history = this.#all(`SELECT l.*,j.accounting_date FROM lines l JOIN journals j ON j.company=l.company AND j.id=l.journal_id
      WHERE l.company=? AND substr(j.accounting_date,1,4)=? AND substr(j.accounting_date,1,7)<=?`, c.code, String(c.year), month);
    const rows = accounts.map(a => {
      const ls = history.filter(l => l.account === a.code);
      const opening = sum(ls.filter(l => l.accounting_date.slice(0, 7) < month).map(l => safe(BigInt(l.debit) - BigInt(l.credit))));
      const current = ls.filter(l => l.accounting_date.slice(0, 7) === month);
      const debit = sum(current.map(l => l.debit)), credit = sum(current.map(l => l.credit));
      const closing = safe(BigInt(opening) + BigInt(debit) - BigInt(credit));
      const normalBalance = a.data.normalSide === 'DEBIT' ? closing : -closing;
      return { account: a.code, name: a.data.name, category: a.data.category, reportGroup: a.data.reportGroup,
        normalSide: a.data.normalSide, contraOf: a.data.contraOf, active: a.active, opening, debit, credit, closing, normalBalance, abnormal: normalBalance < 0 };
    });
    const periodIncome = ls => {
      const category = l => accounts.find(a => a.code === l.account).data.category;
      const revenue = sum(ls.filter(l => category(l) === 'REVENUE').map(l => safe(BigInt(l.credit) - BigInt(l.debit))));
      const expense = sum(ls.filter(l => category(l) === 'EXPENSE').map(l => safe(BigInt(l.debit) - BigInt(l.credit))));
      return { revenue, expense, profit: safe(BigInt(revenue) - BigInt(expense)) };
    };
    const income = { month: periodIncome(history.filter(l => l.accounting_date.slice(0, 7) === month)), ytd: periodIncome(history) };
    const categoryTotal = category => sum(rows.filter(r => r.category === category).map(r => category === 'ASSET' ? r.closing : -r.closing));
    const capitalAndRetained = categoryTotal('EQUITY');
    const balanceSheet = { assets: categoryTotal('ASSET'), liabilities: categoryTotal('LIABILITY'),
      equity: safe(BigInt(capitalAndRetained) + BigInt(income.ytd.profit)), capitalAndRetained, currentEarnings: income.ytd.profit };
    const contraGroups = rows.filter(r => !r.contraOf && rows.some(o => o.contraOf === r.account)).map(r => {
      const children = rows.filter(o => o.contraOf === r.account);
      const gross = r.normalSide === 'DEBIT' ? r.closing : -r.closing;
      const contra = sum(children.map(o => r.normalSide === 'DEBIT' ? -o.closing : o.closing));
      return { account: r.account, gross, contra, net: safe(BigInt(gross) - BigInt(contra)), contraAccounts: children.map(o => o.account) };
    });
    const trial = { rows, debit: sum(rows.map(r => Math.max(0, r.closing))), credit: sum(rows.map(r => Math.max(0, -r.closing))) };
    return { month, currency: c.currency, scale: c.scale, reportingCurrency: c.reportCurrency, reportingScale: c.reportScale,
      reporting: { translated: c.currency === c.reportCurrency, totals: c.currency === c.reportCurrency ? { trial, income, balanceSheet } : null },
      trial, income, balanceSheet, accountAnalysis: { rows, contraGroups } };
  }
  state(company, month, options = {}) {
    record(options, ['cursor', 'limit'], []);
    const companies = this.#all('SELECT code FROM companies ORDER BY code').map(r => this.#company(r.code));
    const base = { available: true, revision: this.#revision(), companies, currencies: this.#all('SELECT * FROM currencies ORDER BY code'),
      chartTemplates: [{ code: 'STANDARD', revision: 1 }], supportedOperations: [...OPS, ...[...this.#adapters.values()].filter(a => !a.testOnly).map(a => a.operation)] };
    if (company === undefined || company === null || company === '') return base;
    const c = this.#company(company); this.#month(company, month);
    const configs = this.#configs(company);
    const journals = this.#all('SELECT id FROM journals WHERE company=? AND substr(accounting_date,1,7)=? ORDER BY accounting_date,id', company, month).map(r => this.journal(company, r.id));
    const sources = this.#all('SELECT reference FROM source_events WHERE company=? AND substr(accounting_date,1,7)=? ORDER BY accounting_date,reference', company, month).map(r => this.source(company, r.reference));
    const unresolved = this.#all(`SELECT l.*,j.accounting_date,j.reference FROM lines l JOIN journals j ON j.company=l.company AND j.id=l.journal_id
      WHERE l.company=? AND substr(j.accounting_date,1,7)<=? AND NOT EXISTS(
        SELECT 1 FROM clearing_links k JOIN source_events s ON s.company=k.company AND s.reference=k.reference
        WHERE k.company=l.company AND k.line_id=l.id AND substr(s.accounting_date,1,7)<=?)
      ORDER BY j.accounting_date,j.id,l.line_no`, company, month, month).map(l => ({ ...parse(l.data), id: l.id, journalId: l.journal_id, reference: l.reference, accountingDate: l.accounting_date }));
    const purpose = l => configs.find(a => a.kind === 'account' && a.code === l.account).data.purpose;
    return { ...base, company: c, month, configs, accounts: configs.filter(a => a.kind === 'account').map(a => ({ code: a.code, revision: a.revision, active: a.active, ...a.data })),
      periods: this.#all('SELECT month FROM periods WHERE company=? ORDER BY month', company).map(p => this.#month(company, p.month)),
      journals: this.#page(journals, options), sources: this.#page(sources, options),
      statistics: this.#all(`SELECT s.reference,s.data FROM statistics s JOIN source_events e USING(company,reference)
        WHERE s.company=? AND substr(e.accounting_date,1,7)<=? ORDER BY e.accounting_date,s.reference`, company, month).map(r => ({ reference: r.reference, ...parse(r.data) })),
      clearing: unresolved.filter(l => purpose(l) === 'clearing' && !l.metadata.internalBalancing),
      suspense: unresolved.filter(l => purpose(l) === 'suspense').map(l => ({ ...l, overdue: l.metadata.reviewDate < new Date().toISOString().slice(0, 10) })),
      transfers: this.#all(`SELECT q.* FROM transfer_queue q JOIN source_events e USING(company,reference) WHERE q.company=? AND substr(e.accounting_date,1,7)<=? ORDER BY e.accounting_date,q.reference`, company, month)
        .map(q => ({ company, reference: q.reference, status: q.status, journalIds: parse(q.journal_ids), error: q.error, reason: q.reason })),
      reports: this.#reports(c, month) };
  }
  integrity() {
    const checks = this.#all('PRAGMA integrity_check'); if (checks.some(r => r.integrity_check !== 'ok')) fail('SQLite integrity check failed.', 409);
    if (this.#all('PRAGMA foreign_key_check').length) fail('SQLite foreign-key check failed.', 409);
    const companies = this.#all('SELECT code FROM companies');
    for (const { code: c } of companies) {
      const co = this.#company(c);
      for (const currency of [[co.currency, co.scale], [co.reportCurrency, co.reportScale]]) {
        if (this.#get('SELECT scale FROM currencies WHERE code=?', currency[0])?.scale !== currency[1]) fail('Currency precision integrity failure.', 409);
      }
      this.#checkAggregates(c, []);
      for (const row of this.#all('SELECT id FROM journals WHERE company=?', c)) {
        const j = this.journal(c, row.id);
        if (!this.#get('SELECT 1 FROM journal_seals WHERE company=? AND journal_id=?', c, j.id)
          || j.lines.length < 2 || sum(j.lines.map(l => l.debit)) !== sum(j.lines.map(l => l.credit))) fail('Posted journal balance/seal integrity failure.', 409);
        for (const l of j.lines) {
          const db = this.#get('SELECT * FROM lines WHERE company=? AND id=?', c, l.id);
          if (db.account !== l.account || db.debit !== l.debit || db.credit !== l.credit || l.accountingCurrency !== co.currency || l.currency !== co.currency
            || l.transactionDebit !== l.debit || l.transactionCredit !== l.credit || l.reportingCurrency !== co.reportCurrency
            || (co.currency === co.reportCurrency ? l.reportingDebit !== l.debit || l.reportingCredit !== l.credit : l.reportingDebit !== null || l.reportingCredit !== null)
            || !equal(l.rateRefs, { accounting: null, reporting: null })) fail('Posted line currency/amount integrity failure.', 409);
        }
      }
      for (const s of this.#all('SELECT * FROM source_events WHERE company=?', c)) {
        const r = this.#result(c, s.reference);
        const command = parse(s.command), plan = r.receipt.plan;
        if (!equal(r.receipt.command, command) || r.operation !== s.operation || command.company !== c || command.reference !== s.reference
          || command.accountingDate !== s.accounting_date || plan.version !== 1 || r.receipt.assurance !== 'simulated-local-single-operator'
          || !equal(plan.lines, plan.journals.flatMap(j => j.lines))) fail('Source receipt identity/plan integrity failure.', 409);
        if (typeof r.receipt.token !== 'string' || !/^[a-f0-9]{64}$/.test(r.receipt.token)) fail('Accepted token integrity failure.', 409);
        const queued = this.#get('SELECT * FROM transfer_queue WHERE company=? AND reference=?', c, s.reference);
        if ((r.receipt.status === 'pending') !== !!queued
          || (queued && (s.operation !== 'journal' || plan.transferMode !== 'queued' || r.receipt.journalIds.length))
          || (!queued && !['posted', 'recorded'].includes(r.receipt.status))) fail('Transfer acceptance integrity failure.', 409);
        const actual = this.#all('SELECT id FROM journals WHERE company=? AND reference=? ORDER BY id', c, s.reference).map(j => j.id);
        if (!equal(actual, r.journalIds)) fail('Source GL mapping integrity failure.', 409);
        if (['posted', 'transferred'].includes(r.status)) {
          if (!actual.length || actual.length !== plan.journals.length) fail('Source journal count integrity failure.', 409);
          actual.forEach((id, i) => {
            const j = this.journal(c, id), spec = plan.journals[i];
            const lines = j.lines.map(({ id, lineNo, journalId, ...l }) => l);
            if (!equal(lines, spec.lines) || j.accountingDate !== command.accountingDate || j.documentDate !== command.documentDate
              || j.taxDate !== command.taxDate || j.operation !== command.operation || j.kind !== spec.kind || j.memo !== spec.memo
              || j.role !== spec.role || !equal(j.policySnapshots, plan.policySnapshots) || !equal(j.expectedRevisions, plan.expectedRevisions))
              fail('Approved plan/header to GL integrity failure.', 409);
          });
        } else if (actual.length) fail('Untransferred source has GL.', 409);
        const statistics = this.#get('SELECT data FROM statistics WHERE company=? AND reference=?', c, s.reference);
        if ((s.operation === 'statistics') !== !!statistics || (statistics && !equal(parse(statistics.data), plan.objectEffects[0]))) fail('Statistics source integrity failure.', 409);
        const links = this.#all('SELECT line_id FROM clearing_links WHERE company=? AND reference=? ORDER BY line_id', c, s.reference).map(l => l.line_id);
        if (!equal(links, s.operation === 'clearing.match' ? [...command.data.lineIds].sort((a, b) => a - b) : [])) fail('Clearing source integrity failure.', 409);
        if (links.length) {
          const matched = links.map(id => this.#get('SELECT debit,credit,account FROM lines WHERE company=? AND id=?', c, id));
          if (matched.some(l => l.account !== command.data.account) || sum(matched.map(l => safe(BigInt(l.debit) - BigInt(l.credit)))) !== 0) fail('Clearing balance integrity failure.', 409);
        }
        const effects = this.#get('SELECT data FROM adapter_facts WHERE company=? AND reference=?', c, s.reference);
        const hasEffects = !!(plan.facts.length || plan.objectEffects.length);
        if (hasEffects !== !!effects || (effects && !equal(parse(effects.data), { facts: plan.facts, objectEffects: plan.objectEffects }))) fail('Source business effects integrity failure.', 409);
        const correction = this.#get('SELECT * FROM corrections WHERE company=? AND reference=?', c, s.reference);
        if (!!plan.correction !== !!correction || (correction && (correction.original_id !== plan.correction.originalId || correction.output_id !== actual[0] || correction.type !== plan.correction.type))) fail('Correction source integrity failure.', 409);
        const audits = this.#all("SELECT action FROM audit WHERE company=? AND reference=? ORDER BY id", c, s.reference).map(a => a.action);
        if (audits.filter(a => a === 'source.accept').length !== 1) fail('Source acceptance audit integrity failure.', 409);
        if (queued) {
          const expected = { pending: 'source.accept', failed: 'transfer.failed', transferred: 'transfer.complete', withdrawn: 'transfer.withdraw' }[queued.status];
          if (audits.at(-1) !== expected) fail('Transfer audit integrity failure.', 409);
        }
      }
      for (const cfg of this.#configs(c)) {
        const v = this.#get('SELECT * FROM config_versions WHERE company=? AND kind=? AND code=? AND revision=?', c, cfg.kind, cfg.code, cfg.revision);
        if (!v || !!v.active !== cfg.active || !equal(parse(v.data), cfg.data)) fail('Configuration version integrity failure.', 409);
        if (cfg.kind === 'account') {
          const a = this.#get('SELECT * FROM accounts WHERE company=? AND code=?', c, cfg.code);
          if (!a || a.category !== cfg.data.category || a.purpose !== cfg.data.purpose || !equal(parse(a.data), cfg.data)) fail('Account configuration integrity failure.', 409);
        }
      }
    }
    const counts = {};
    for (const table of ['companies', 'currencies', 'configs', 'config_versions', 'periods', 'source_events', 'receipts', 'journals', 'lines', 'statistics', 'clearing_links', 'transfer_queue', 'corrections', 'audit'])
      counts[table] = this.#get(`SELECT count(*) AS n FROM ${table}`).n;
    return { ok: true, schemaVersion: 1, revision: this.#revision(), counts };
  }
}

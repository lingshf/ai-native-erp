import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new AppError(message, status); };
export const safe = (value) => {
  if (!Number.isSafeInteger(value)) fail('金额累计超过安全范围。');
  return value;
};
export const decimal = (cents) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
export function money(value) {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) {
    fail('金额须为非负十进制字符串，最多两位小数、九位整数。');
  }
  const [whole, fraction = ''] = value.split('.');
  return safe(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || value < '1900-01-01' || value > '9998-12-31'
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    fail('日期无效，请使用有效的 YYYY-MM-DD 日期（1900-9998）。');
  }
  return value;
}
const CHART = [
  ['1000', '现金 / Cash', 'ASSET'], ['1200', '预付费用 / Prepayments', 'ASSET'],
  ['2000', '应计负债 / Accrued liabilities', 'LIABILITY'],
  ['3000', '投入资本 / Contributed capital', 'EQUITY'],
  ['3100', '留存收益 / Retained earnings', 'EQUITY'],
  ['4000', '服务收入 / Service revenue', 'REVENUE'],
  ['5000', '租金费用 / Rent expense', 'EXPENSE'],
  ['5100', '工资费用 / Wages expense', 'EXPENSE'],
];
const BUILTIN_CODES = new Set(CHART.map(([code]) => code));
const CATEGORIES = new Set(CHART.map(([, , category]) => category));
const normalSide = (category) => ['ASSET', 'EXPENSE'].includes(category) ? 'DEBIT' : 'CREDIT';
function accountFields(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !fields.includes(key))
    || fields.some((key) => !Object.hasOwn(input, key))) fail('科目配置字段无效。');
}
function accountName(name) {
  if (typeof name !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(name)
    || !name.trim() || name.trim().length > 80) fail('科目名称须为 1-80 个字符，不可含换行或控制字符。');
  return name.trim();
}
function accountCode(code) {
  if (typeof code !== 'string' || !/^[1-9]\d{3}$/.test(code)) fail('科目编号须为 1000-9999 的四位数字字符串。');
  return code;
}
export function withDimensions(line, dimensions = line.dimensions) {
  const { account, debit, credit } = line;
  return { account, debit, credit, ...(dimensions && Object.keys(dimensions).length
    ? { dimensions: Object.fromEntries(Object.entries(dimensions).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) } : {}) };
}
function dimensionCode(code, value = false) {
  if (typeof code !== 'string' || !(value ? /^[A-Z0-9][A-Z0-9_-]{0,19}$/ : /^[A-Z][A-Z0-9_]{0,19}$/).test(code)) {
    fail('维度/值编号须为 1-20 位大写字母、数字或下划线；维度以字母开头，值另可用短横线。');
  }
  return code;
}
function dimensionUpdate(input, old) {
  accountFields(input, ['active', 'revision']);
  if (typeof input.active !== 'boolean' || !Number.isSafeInteger(input.revision)
    || input.revision < 1 || input.revision === Number.MAX_SAFE_INTEGER) fail('维度状态或版本无效。');
  if (old.revision !== input.revision) fail('维度配置已变更，请刷新后核对再保存。', 409);
}
function postingVersion(input, old) {
  if (typeof input.active !== 'boolean' || !Number.isSafeInteger(input.revision)
    || input.revision < 1 || input.revision === Number.MAX_SAFE_INTEGER) fail('服务/规则状态或版本无效。');
  if (input.revision !== old.revision) fail('服务或规则已变更，请刷新后核对再保存。', 409);
}
function eventInput(input) {
  accountFields(input, ['type', 'reference', 'date', 'service', 'amount',
    ...(input && Object.hasOwn(input, 'dimensions') ? ['dimensions'] : [])]);
  if (input.type !== 'cash_service') fail('仅支持教学现金服务收入事件。');
  if (typeof input.reference !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(input.reference)) fail('来源编号须为 1-40 位大写字母、数字、下划线或短横线。');
  validDate(input.date); dimensionCode(input.service);
  const amount = money(input.amount);
  if (!amount) fail('业务金额须大于零。');
  const map = input.dimensions;
  if (map !== undefined) {
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length > 10) fail('业务维度须为最多 10 对编号与值的对象。');
    for (const [code, value] of Object.entries(map)) { dimensionCode(code); dimensionCode(value, true); }
  }
  const { dimensions } = withDimensions({ dimensions: map });
  return { type: input.type, reference: input.reference, date: input.date,
    service: input.service, amount: decimal(amount), ...(dimensions ? { dimensions } : {}) };
}

export class Book {
  #previewKey = randomBytes(32);
  constructor(file, { today = localToday() } = {}) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts (
        code TEXT PRIMARY KEY, name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')));
      CREATE TABLE IF NOT EXISTS account_settings (
        code TEXT PRIMARY KEY REFERENCES accounts(code),
        active INTEGER NOT NULL CHECK(active IN (0,1)),
        manual_allowed INTEGER NOT NULL CHECK(manual_allowed IN (0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
      CREATE TABLE IF NOT EXISTS account_properties (
        code TEXT PRIMARY KEY REFERENCES accounts(code),
        normal_side TEXT NOT NULL CHECK(normal_side IN ('DEBIT','CREDIT')),
        purpose TEXT NOT NULL CHECK(purpose IN ('general','contra')),
        related_account TEXT REFERENCES accounts(code),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
        CHECK((purpose='general' AND related_account IS NULL)
          OR (purpose='contra' AND related_account IS NOT NULL AND related_account<>code)));
      CREATE TABLE IF NOT EXISTS periods (
        month TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('open','closed')));
      CREATE TABLE IF NOT EXISTS journals (
        id INTEGER PRIMARY KEY, date TEXT NOT NULL, memo TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('normal','adjusting','reversal','closing')),
        status TEXT NOT NULL CHECK(status IN ('draft','posted')),
        reversal_of INTEGER UNIQUE REFERENCES journals(id));
      CREATE TABLE IF NOT EXISTS lines (
        id INTEGER PRIMARY KEY, journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        account TEXT NOT NULL REFERENCES accounts(code),
        debit INTEGER NOT NULL CHECK(typeof(debit)='integer' AND debit>=0),
        credit INTEGER NOT NULL CHECK(typeof(credit)='integer' AND credit>=0),
        CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
      CREATE TABLE IF NOT EXISTS dimensions (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
      CREATE TABLE IF NOT EXISTS dimension_values (
        dimension TEXT NOT NULL REFERENCES dimensions(code), code TEXT NOT NULL, name TEXT NOT NULL,
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
        PRIMARY KEY(dimension,code));
      CREATE TABLE IF NOT EXISTS line_dimensions (
        line_id INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
        dimension TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY(line_id,dimension),
        FOREIGN KEY(dimension,value) REFERENCES dimension_values(dimension,code));
      CREATE TABLE IF NOT EXISTS teaching_services (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, group_code TEXT NOT NULL,
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
      CREATE TABLE IF NOT EXISTS account_dimension_structures (
        account TEXT PRIMARY KEY REFERENCES accounts(code),
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
        segments_json TEXT NOT NULL, allowed_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS posting_rules (
        id INTEGER PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN('service','group','all')),
        match_code TEXT NOT NULL, revenue_account TEXT NOT NULL REFERENCES accounts(code),
        active INTEGER NOT NULL CHECK(active IN(0,1)),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0));
      CREATE TABLE IF NOT EXISTS posting_events (
        reference TEXT PRIMARY KEY, input_json TEXT NOT NULL, plan_json TEXT NOT NULL,
        preview_token TEXT NOT NULL, journal_id INTEGER NOT NULL UNIQUE REFERENCES journals(id));
      CREATE TRIGGER IF NOT EXISTS immutable_event_update BEFORE UPDATE ON posting_events
        BEGIN SELECT RAISE(ABORT,'Posted source event is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_event_delete BEFORE DELETE ON posting_events
        BEGIN SELECT RAISE(ABORT,'Posted source event is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS source_event_insert BEFORE INSERT ON posting_events
        WHEN NOT EXISTS(SELECT 1 FROM journals WHERE id=NEW.journal_id AND status='posted'
          AND kind='normal' AND reversal_of IS NULL)
        BEGIN SELECT RAISE(ABORT,'Source event requires a posted normal journal'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_dimension_insert BEFORE INSERT ON line_dimensions
        WHEN (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=NEW.line_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted dimensions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_dimension_delete BEFORE DELETE ON line_dimensions
        WHEN (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=OLD.line_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted dimensions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_dimension_update BEFORE UPDATE ON line_dimensions
        WHEN (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=OLD.line_id)='posted'
          OR (SELECT j.status FROM lines l JOIN journals j ON j.id=l.journal_id WHERE l.id=NEW.line_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted dimensions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_journal_update BEFORE UPDATE ON journals
        WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_journal_delete BEFORE DELETE ON journals
        WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_line_update BEFORE UPDATE ON lines
        WHEN (SELECT status FROM journals WHERE id=OLD.journal_id)='posted'
          OR (SELECT status FROM journals WHERE id=NEW.journal_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_line_delete BEFORE DELETE ON lines
        WHEN (SELECT status FROM journals WHERE id=OLD.journal_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_line_insert BEFORE INSERT ON lines
        WHEN (SELECT status FROM journals WHERE id=NEW.journal_id)='posted'
        BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
    `);
    if (!this.db.prepare('SELECT 1 FROM periods LIMIT 1').get()) {
      validDate(today);
      this.transaction(() => {
        const account = this.db.prepare('INSERT INTO accounts(code,name,category) VALUES (?,?,?)');
        for (const row of CHART) account.run(...row);
        this.db.prepare("INSERT INTO periods VALUES (?, 'open')").run(today.slice(0, 7));
        for (const [memo, credit, amount] of [
          ['教学示例：投入资本 12,000', '3000', 1200000],
          ['教学示例：现金服务收入 2,000', '4000', 200000],
        ]) {
          const id = this.insert({ date: today.slice(0, 7) + '-01', memo, kind: 'normal',
            lines: [{ account: '1000', debit: amount, credit: 0 }, { account: credit, debit: 0, credit: amount }] });
          this.db.prepare("UPDATE journals SET status='posted' WHERE id=? AND status='draft'").run(id);
        }
      });
    }
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  accounts() {
    return this.db.prepare(`SELECT a.code,a.name,a.category,
      COALESCE(s.active,1) AS active,COALESCE(s.manual_allowed,1) AS manualAllowed,
      COALESCE(s.revision,0) AS revision,
      COALESCE(p.normal_side,CASE WHEN a.category IN ('ASSET','EXPENSE') THEN 'DEBIT' ELSE 'CREDIT' END) AS normalSide,
      COALESCE(p.purpose,'general') AS purpose,p.related_account AS relatedAccount,
      COALESCE(p.revision,0) AS propertyRevision FROM accounts a
      LEFT JOIN account_settings s ON s.code=a.code
      LEFT JOIN account_properties p ON p.code=a.code ORDER BY a.code`).all()
      .map((a) => ({ ...a, active: Boolean(a.active), manualAllowed: Boolean(a.manualAllowed),
        builtin: BUILTIN_CODES.has(a.code) }));
  }
  createAccount(input) {
    return this.transaction(() => {
      accountFields(input, ['code', 'name', 'category']);
      const code = accountCode(input.code), name = accountName(input.name);
      if (!CATEGORIES.has(input.category)) fail('科目类型无效。');
      if (this.accounts().some((a) => a.code === code)) fail('科目编号已存在。', 409);
      this.db.prepare('INSERT INTO accounts(code,name,category) VALUES (?,?,?)').run(code, name, input.category);
      this.db.prepare('INSERT INTO account_settings VALUES (?,1,1,1)').run(code);
      return this.accounts().find((a) => a.code === code);
    });
  }
  updateAccount(code, input) {
    return this.transaction(() => {
      accountCode(code);
      accountFields(input, ['name', 'active', 'manualAllowed', 'revision']);
      const name = accountName(input.name);
      if (typeof input.active !== 'boolean' || typeof input.manualAllowed !== 'boolean'
        || !Number.isSafeInteger(input.revision) || input.revision < 0
        || input.revision === Number.MAX_SAFE_INTEGER) fail('科目状态或版本无效。');
      const old = this.accounts().find((a) => a.code === code);
      if (!old) fail('科目不存在。', 404);
      if (old.builtin) fail('内置八科目不可修改。', 409);
      if (old.revision !== input.revision) fail('科目配置已变更，请刷新后核对再保存。', 409);
      if (name !== old.name && this.db.prepare(`SELECT 1 FROM lines l JOIN journals j ON j.id=l.journal_id
        WHERE l.account=? AND j.status='posted' LIMIT 1`).get(code)) fail('已过账使用的科目不可修改名称。', 409);
      this.db.prepare('UPDATE accounts SET name=? WHERE code=?').run(name, code);
      this.db.prepare(`INSERT INTO account_settings(code,active,manual_allowed,revision) VALUES (?,?,?,?)
        ON CONFLICT(code) DO UPDATE SET active=excluded.active,
        manual_allowed=excluded.manual_allowed,revision=excluded.revision`)
        .run(code, Number(input.active), Number(input.manualAllowed), old.revision + 1);
      return this.accounts().find((a) => a.code === code);
    });
  }
  setAccountProperties(code, input) {
    return this.transaction(() => {
      accountCode(code);
      accountFields(input, ['normalSide', 'purpose', 'relatedAccount', 'revision']);
      if (!['DEBIT', 'CREDIT'].includes(input.normalSide) || !['general', 'contra'].includes(input.purpose)
        || !Number.isSafeInteger(input.revision) || input.revision < 0
        || input.revision === Number.MAX_SAFE_INTEGER
        || (input.purpose === 'general' ? input.relatedAccount !== null : typeof input.relatedAccount !== 'string')) {
        fail('会计属性、关联科目或版本无效。');
      }
      if (input.purpose === 'contra') accountCode(input.relatedAccount);
      const accounts = this.accounts(), old = accounts.find((a) => a.code === code);
      if (!old) fail('科目不存在。', 404);
      if (old.builtin) fail('内置八科目的会计属性不可修改。', 409);
      if (old.propertyRevision !== input.revision) fail('会计属性已变更，请刷新后核对再保存。', 409);
      if (accounts.some((a) => a.purpose === 'contra' && a.relatedAccount === code)
        && (input.purpose !== 'general' || input.normalSide !== normalSide(old.category))) {
        fail('已有备抵科目关联此原值科目，须保留一般用途及类型正常方向。', 409);
      }
      if (input.purpose === 'contra') {
        const gross = accounts.find((a) => a.code === input.relatedAccount);
        if (!gross || gross.code === code || gross.category !== old.category || gross.purpose !== 'general'
          || gross.normalSide !== normalSide(gross.category) || input.normalSide === normalSide(old.category)) {
          fail('备抵须关联同类型、类型正常方向的一般原值科目，并采用相反正常方向；不可关联自身或形成链。', 409);
        }
      }
      this.db.prepare(`INSERT INTO account_properties VALUES (?,?,?,?,?)
        ON CONFLICT(code) DO UPDATE SET normal_side=excluded.normal_side,purpose=excluded.purpose,
        related_account=excluded.related_account,revision=excluded.revision`)
        .run(code, input.normalSide, input.purpose, input.relatedAccount, old.propertyRevision + 1);
      return this.accounts().find((a) => a.code === code);
    });
  }
  dimensions() {
    return this.db.prepare('SELECT * FROM dimensions ORDER BY code').all().map((d) => ({
      ...d, active: Boolean(d.active), values: this.db.prepare(
        'SELECT code,name,active,revision FROM dimension_values WHERE dimension=? ORDER BY code'
      ).all(d.code).map((v) => ({ ...v, active: Boolean(v.active) })),
    }));
  }
  dimension(code) {
    dimensionCode(code);
    const d = this.dimensions().find((item) => item.code === code);
    if (!d) fail('维度不存在。', 404);
    return d;
  }
  createDimension(input) {
    return this.transaction(() => {
      accountFields(input, ['code', 'name']);
      const code = dimensionCode(input.code), name = accountName(input.name);
      if (this.dimensions().some((d) => d.code === code)) fail('维度编号已存在。', 409);
      this.db.prepare('INSERT INTO dimensions VALUES (?,?,1,1)').run(code, name);
      return this.dimension(code);
    });
  }
  createDimensionValue(code, input) {
    return this.transaction(() => {
      const d = this.dimension(code);
      accountFields(input, ['code', 'name']);
      const value = dimensionCode(input.code, true), name = accountName(input.name);
      if (d.values.some((v) => v.code === value)) fail('维度值编号已存在。', 409);
      this.db.prepare('INSERT INTO dimension_values VALUES (?,?,?,1,1)').run(code, value, name);
      return this.dimension(code).values.find((v) => v.code === value);
    });
  }
  updateDimension(code, input) {
    return this.transaction(() => {
      const d = this.dimension(code); dimensionUpdate(input, d);
      this.db.prepare('UPDATE dimensions SET active=?,revision=revision+1 WHERE code=?').run(Number(input.active), code);
      return this.dimension(code);
    });
  }
  updateDimensionValue(code, value, input) {
    return this.transaction(() => {
      dimensionCode(value, true);
      const v = this.dimension(code).values.find((item) => item.code === value);
      if (!v) fail('维度值不存在。', 404);
      dimensionUpdate(input, v);
      this.db.prepare('UPDATE dimension_values SET active=?,revision=revision+1 WHERE dimension=? AND code=?')
        .run(Number(input.active), code, value);
      return this.dimension(code).values.find((item) => item.code === value);
    });
  }
  validateDimensions(map, allowRestricted = false) {
    if (map === undefined) return undefined;
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length > 10) fail('行维度须为最多 10 对编号与值的对象。');
    for (const [code, value] of Object.entries(map)) {
      dimensionCode(value, true);
      const d = this.dimension(code), v = d.values.find((item) => item.code === value);
      if (!v) fail(`维度 ${code} 的值不存在。`, 400);
      if (!allowRestricted && (!d.active || !v.active)) fail(`维度 ${code}=${value} 已停用。`, 409);
    }
    return map;
  }
  dimensionStructures() {
    return this.db.prepare('SELECT * FROM account_dimension_structures ORDER BY account').all().map((s) => ({
      account: s.account, active: Boolean(s.active), revision: s.revision,
      segments: JSON.parse(s.segments_json), allowed: JSON.parse(s.allowed_json),
    }));
  }
  setDimensionStructure(account, input) {
    return this.transaction(() => {
      accountCode(account);
      if (!this.accounts().some((a) => a.code === account)) fail('科目不存在。', 404);
      accountFields(input, ['active', 'revision', 'segments', 'allowed']);
      if (typeof input.active !== 'boolean' || !Number.isSafeInteger(input.revision)
        || input.revision < 0 || input.revision === Number.MAX_SAFE_INTEGER) fail('结构状态或版本无效。');
      const old = this.dimensionStructures().find((s) => s.account === account);
      if (input.revision !== (old?.revision || 0)) fail('科目维度结构已变更，请刷新核对后保存。', 409);
      if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 10) fail('结构须有 1-10 个维度段。');
      const seen = new Set(), definitions = new Map(this.dimensions().map((d) => [d.code, d]));
      const segments = input.segments.map((s) => {
        accountFields(s, ['code', 'required']); dimensionCode(s.code);
        if (typeof s.required !== 'boolean' || seen.has(s.code)) fail('结构段必填标志无效或维度重复。');
        const definition = definitions.get(s.code);
        if (!definition) fail(`结构维度 ${s.code} 不存在。`);
        if (input.active && !definition.active) fail(`结构维度 ${s.code} 已停用，请先核对状态。`, 409);
        seen.add(s.code); return { code: s.code, required: s.required };
      }).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
      if (!Array.isArray(input.allowed) || input.allowed.length > 50) fail('允许组合须为 0-50 项数组。');
      const tuples = new Set(), allowed = input.allowed.map((map) => {
        if (!map || typeof map !== 'object' || Array.isArray(map)) fail('允许组合须为维度编号与值的对象。');
        for (const [code, value] of Object.entries(map)) {
          dimensionCode(value, true);
          if (!seen.has(code)) fail(`允许组合包含未声明的维度 ${code}。`);
          const definition = definitions.get(code), v = definition.values.find((item) => item.code === value);
          if (!v) fail(`结构维度 ${code} 的值 ${value} 不存在。`);
          if (input.active && !v.active) fail(`结构维度值 ${code}=${value} 已停用。`, 409);
        }
        if (segments.some((s) => s.required && !Object.hasOwn(map, s.code))) fail('每个允许组合须包含所有必填段。');
        const tuple = withDimensions({ dimensions: map }).dimensions || {}, key = JSON.stringify(tuple);
        if (tuples.has(key)) fail('允许组合重复。');
        tuples.add(key); return tuple;
      });
      this.db.prepare(`INSERT INTO account_dimension_structures VALUES (?,?,?,?,?)
        ON CONFLICT(account) DO UPDATE SET active=excluded.active,revision=excluded.revision,
        segments_json=excluded.segments_json,allowed_json=excluded.allowed_json`)
        .run(account, Number(input.active), input.revision + 1, JSON.stringify(segments), JSON.stringify(allowed));
      return this.dimensionStructures().find((s) => s.account === account);
    });
  }
  validateStructure(account, dimensions, lineNumber) {
    const structure = this.dimensionStructures().find((s) => s.account === account && s.active);
    if (!structure) return;
    const map = dimensions || {}, prefix = `第 ${lineNumber} 行科目 ${account} 维度结构版本 ${structure.revision}：`;
    const missing = structure.segments.filter((s) => s.required && !Object.hasOwn(map, s.code));
    if (missing.length) fail(prefix + `缺少必填维度 ${missing.map((s) => s.code).join('、')}，不会自动填值。`, 409);
    const projected = Object.fromEntries(structure.segments.filter((s) => Object.hasOwn(map, s.code)).map((s) => [s.code, map[s.code]]));
    if (structure.allowed.length && !structure.allowed.some((tuple) => JSON.stringify(tuple) === JSON.stringify(projected))) {
      fail(prefix + '不允许此维度组合；可选段未填表示空值而非任意值，请核对结构。', 409);
    }
  }
  lineDimensions(id) {
    return Object.fromEntries(this.db.prepare(
      'SELECT dimension,value FROM line_dimensions WHERE line_id=? ORDER BY dimension'
    ).all(id).map((row) => [row.dimension, row.value]));
  }
  insertLines(id, lines) {
    const statement = this.db.prepare('INSERT INTO lines(journal_id,account,debit,credit) VALUES (?,?,?,?)');
    const attribute = this.db.prepare('INSERT INTO line_dimensions VALUES (?,?,?)');
    for (const l of lines) {
      const lineId = statement.run(id, l.account, l.debit, l.credit).lastInsertRowid;
      for (const [code, value] of Object.entries(l.dimensions || {})) attribute.run(lineId, code, value);
    }
  }
  services() {
    return this.db.prepare('SELECT code,name,group_code AS "group",active,revision FROM teaching_services ORDER BY code')
      .all().map((s) => ({ ...s, active: Boolean(s.active) }));
  }
  createService(input) {
    return this.transaction(() => {
      accountFields(input, ['code', 'name', 'group']);
      const code = dimensionCode(input.code), name = accountName(input.name), group = dimensionCode(input.group);
      if (this.services().some((s) => s.code === code)) fail('教学服务编号已存在。', 409);
      this.db.prepare('INSERT INTO teaching_services VALUES (?,?,?,1,1)').run(code, name, group);
      return this.services().find((s) => s.code === code);
    });
  }
  updateService(code, input) {
    return this.transaction(() => {
      dimensionCode(code); accountFields(input, ['group', 'active', 'revision']);
      const group = dimensionCode(input.group), old = this.services().find((s) => s.code === code);
      if (!old) fail('教学服务不存在。', 404);
      postingVersion(input, old);
      this.db.prepare('UPDATE teaching_services SET group_code=?,active=?,revision=revision+1 WHERE code=?')
        .run(group, Number(input.active), code);
      return this.services().find((s) => s.code === code);
    });
  }
  postingRules() {
    return this.db.prepare('SELECT id,scope,match_code AS "match",revenue_account AS revenueAccount,active,revision FROM posting_rules ORDER BY id')
      .all().map((r) => ({ ...r, active: Boolean(r.active) }));
  }
  validatePostingRule(input, active = true) {
    if (!['service', 'group', 'all'].includes(input.scope)) fail('规则范围无效。');
    if (input.scope === 'all') {
      if (input.match !== '*') fail('全部范围的匹配编号须为 *。');
    } else {
      dimensionCode(input.match);
      if (active && !this.services().some((s) => (input.scope === 'service' ? s.code : s.group) === input.match)) {
        fail('规则匹配的教学服务或组不存在。');
      }
    }
    accountCode(input.revenueAccount);
    if (!this.accounts().some((a) => a.code === input.revenueAccount && a.category === 'REVENUE')) fail('规则贷方须为已有收入科目。');
  }
  createPostingRule(input) {
    return this.transaction(() => {
      accountFields(input, ['scope', 'match', 'revenueAccount']); this.validatePostingRule(input);
      const id = Number(this.db.prepare('INSERT INTO posting_rules(scope,match_code,revenue_account,active,revision) VALUES (?,?,?,1,1)')
        .run(input.scope, input.match, input.revenueAccount).lastInsertRowid);
      return this.postingRules().find((r) => r.id === id);
    });
  }
  updatePostingRule(id, input) {
    return this.transaction(() => {
      if (!Number.isSafeInteger(id) || id < 1) fail('规则 ID 无效。');
      accountFields(input, ['scope', 'match', 'revenueAccount', 'active', 'revision']);
      const old = this.postingRules().find((r) => r.id === id);
      if (!old) fail('过账规则不存在。', 404);
      postingVersion(input, old); this.validatePostingRule(input, input.active);
      this.db.prepare('UPDATE posting_rules SET scope=?,match_code=?,revenue_account=?,active=?,revision=revision+1 WHERE id=?')
        .run(input.scope, input.match, input.revenueAccount, Number(input.active), id);
      return this.postingRules().find((r) => r.id === id);
    });
  }
  eventReceipts() {
    return this.db.prepare('SELECT reference,input_json,plan_json,journal_id FROM posting_events ORDER BY reference').all()
      .map((r) => ({ reference: r.reference, event: JSON.parse(r.input_json), plan: JSON.parse(r.plan_json), journalId: r.journal_id }));
  }
  eventPlan(input) {
    const event = eventInput(input), service = this.services().find((s) => s.code === event.service);
    if (!service || !service.active) fail('教学服务不存在或已停用。', 409);
    const priority = { service: 1, group: 2, all: 3 };
    const candidates = this.postingRules().filter((r) => r.active && (r.scope === 'all'
      || (r.scope === 'service' ? r.match === service.code : r.match === service.group)))
      .map((r) => ({ ...r, priority: priority[r.scope] })).sort((a, b) => a.priority - b.priority || a.id - b.id);
    if (!candidates.length) fail('没有匹配的现金服务过账规则，请维护后重新预览。', 409);
    if (candidates[1]?.priority === candidates[0].priority) fail('同等最高优先级的过账规则冲突，请消除歧义。', 409);
    const rule = candidates[0];
    if (!this.accounts().some((a) => a.code === rule.revenueAccount && a.category === 'REVENUE')) fail('命中规则的收入科目无效。', 409);
    const journal = this.validate({ date: event.date, memo: `教学现金服务 ${event.reference} / ${event.service}`,
      kind: 'normal', lines: [
        withDimensions({ account: '1000', debit: event.amount, credit: '0', dimensions: event.dimensions }),
        withDimensions({ account: rule.revenueAccount, debit: '0', credit: event.amount, dimensions: event.dimensions }),
      ] });
    const configFingerprint = createHash('sha256').update(JSON.stringify({ engine: 1,
      services: this.services(), rules: this.postingRules(), accounts: this.accounts(),
      dimensions: this.dimensions(), dimensionStructures: this.dimensionStructures(), periods: this.periods() })).digest('hex');
    const appliedStructures = [...new Set(journal.lines.map((l) => l.account))]
      .flatMap((account) => this.dimensionStructures().filter((s) => s.account === account && s.active));
    return { event, service: { ...service }, rule, candidates,
      reason: `具体服务 > 服务组 > 全部；命中规则 #${rule.id}，${rule.scope}=${rule.match}，版本 ${rule.revision}。`,
      lineMeanings: ['收到现金 / cash_receipt', '确认服务收入 / service_revenue'],
      money: { unit: '教学单位', minorUnitsPerUnit: 100 }, journal, dimensionStructures: appliedStructures, configFingerprint };
  }
  #signPlan(plan) { return createHmac('sha256', this.#previewKey).update(JSON.stringify(plan)).digest('hex'); }
  previewEvent(input) {
    const event = eventInput(input);
    const existing = this.db.prepare('SELECT journal_id FROM posting_events WHERE reference=?').get(event.reference);
    if (existing) fail(`来源编号已过账到凭证 #${existing.journal_id}，请查看原始回执；冲销不会释放编号。`, 409);
    const plan = this.eventPlan(event);
    return { ...plan, token: this.#signPlan(plan) };
  }
  postEvent(input) {
    accountFields(input, ['event', 'token']);
    const event = eventInput(input.event);
    if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) fail('预览凭据无效，请重新预览。', 409);
    return this.transaction(() => {
      const old = this.db.prepare('SELECT input_json,preview_token FROM posting_events WHERE reference=?').get(event.reference);
      if (old) {
        if (old.input_json !== JSON.stringify(event) || old.preview_token !== input.token) fail('来源编号已使用且输入或预览凭据不同。', 409);
        return { ...this.eventReceipts().find((r) => r.reference === event.reference), replayed: true };
      }
      const plan = this.eventPlan(event);
      if (!timingSafeEqual(Buffer.from(input.token, 'hex'), Buffer.from(this.#signPlan(plan), 'hex'))) fail('业务或配置已变化，请重新预览再确认。', 409);
      const id = this.insert(plan.journal);
      const changed = this.db.prepare("UPDATE journals SET status='posted' WHERE id=? AND status='draft'").run(id);
      if (changed.changes !== 1) fail('事件凭证状态冲突。', 409);
      this.reports(event.date.slice(0, 7));
      this.db.prepare('INSERT INTO posting_events VALUES (?,?,?,?,?)')
        .run(event.reference, JSON.stringify(event), JSON.stringify(plan), input.token, id);
      return { ...this.eventReceipts().find((r) => r.reference === event.reference), replayed: false };
    });
  }
  periods() { return this.db.prepare('SELECT * FROM periods ORDER BY month').all().map((p) => ({ ...p })); }
  period(month, open = false) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('会计期间格式须为 YYYY-MM。');
    validDate(`${month}-01`);
    const p = this.db.prepare('SELECT * FROM periods WHERE month=?').get(month);
    if (!p) fail('会计期间不存在。', 404);
    if (open && p.status !== 'open') fail('该期间已关账，不可修改。', 409);
    return p;
  }
  validate(input, { allowRestricted = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('凭证格式无效。');
    for (const key of Object.keys(input)) {
      if (!['date', 'memo', 'kind', 'lines', 'rationale'].includes(key)) fail(`不支持的凭证字段：${key}`);
    }
    const { date, memo, kind = 'normal', lines } = input;
    validDate(date);
    this.period(date.slice(0, 7), true);
    if (typeof memo !== 'string' || !memo.trim() || memo.length > 200) fail('摘要须为 1-200 个字符。');
    if (!['normal', 'adjusting'].includes(kind)) fail('只能手工创建普通或调整凭证。');
    if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) fail('凭证须有 2-100 行。');
    const accounts = new Map(this.accounts().map((a) => [a.code, a]));
    const normalized = lines.map((line, index) => {
      if (!line || typeof line !== 'object' || !accounts.has(line.account)) fail('凭证行科目无效。');
      const account = accounts.get(line.account);
      if (!allowRestricted && (!account.active || !account.manualAllowed)) {
        fail(`科目 ${account.code} 已停用或禁止手工录入，请更换科目或核对科目配置。`, 409);
      }
      const debit = money(line.debit), credit = money(line.credit);
      if ((debit > 0) === (credit > 0)) fail('每行须且只能有一侧为正数。');
      const dimensions = this.validateDimensions(line.dimensions, allowRestricted);
      if (!allowRestricted) this.validateStructure(line.account, dimensions, index + 1);
      return withDimensions({ account: line.account, debit, credit }, dimensions);
    });
    const debit = normalized.reduce((s, l) => safe(s + l.debit), 0);
    const credit = normalized.reduce((s, l) => safe(s + l.credit), 0);
    if (!debit || debit !== credit) fail('凭证借贷不平衡。');
    return { date, memo: memo.trim(), kind, lines: normalized };
  }
  insert(data, reversalOf = null) {
    const id = Number(this.db.prepare(
      "INSERT INTO journals(date,memo,kind,status,reversal_of) VALUES (?,?,?,'draft',?)"
    ).run(data.date, data.memo, data.kind, reversalOf).lastInsertRowid);
    this.insertLines(id, data.lines);
    return id;
  }
  journal(id) {
    if (!Number.isSafeInteger(id) || id < 1) fail('凭证 ID 无效。');
    const j = this.db.prepare('SELECT * FROM journals WHERE id=?').get(id);
    if (!j) fail('凭证不存在。', 404);
    return { ...j, lines: this.db.prepare('SELECT id,account,debit,credit FROM lines WHERE journal_id=? ORDER BY id').all(id)
      .map((l) => withDimensions(l, this.lineDimensions(l.id))) };
  }
  journals() {
    return this.db.prepare('SELECT id FROM journals ORDER BY date DESC,id DESC').all().map((j) => this.journal(j.id));
  }
  save(input, id) {
    return this.transaction(() => {
      const data = this.validate(input);
      if (id !== undefined) {
        const old = this.journal(id);
        if (old.status !== 'draft' || old.kind === 'reversal') fail('已过账或冲销凭证不可编辑。', 409);
        this.period(old.date.slice(0, 7), true);
        this.db.prepare('DELETE FROM lines WHERE journal_id=?').run(id);
        this.db.prepare('UPDATE journals SET date=?,memo=?,kind=? WHERE id=?')
          .run(data.date, data.memo, data.kind, id);
        this.insertLines(id, data.lines);
      } else id = this.insert(data);
      return this.journal(id);
    });
  }
  delete(id) {
    return this.transaction(() => {
      const j = this.journal(id);
      this.period(j.date.slice(0, 7), true);
      if (j.status !== 'draft') fail('仅可删除草稿。', 409);
      this.db.prepare('DELETE FROM journals WHERE id=?').run(id);
      return { deleted: id };
    });
  }
  post(id) {
    return this.transaction(() => {
      const j = this.journal(id);
      this.period(j.date.slice(0, 7), true);
      if (j.status !== 'draft' || j.kind === 'closing') fail('凭证不可重复过账。', 409);
      if (j.kind === 'reversal') {
        const source = this.journal(j.reversal_of);
        const expected = source.lines.map((l) => withDimensions({ ...l, debit: l.credit, credit: l.debit }));
        if (!['normal', 'adjusting'].includes(source.kind) || source.status !== 'posted'
          || JSON.stringify(j.lines) !== JSON.stringify(expected)) fail('冲销凭证不再精确对应原凭证。', 409);
      }
      this.validate({ date: j.date, memo: j.memo, kind: j.kind === 'reversal' ? 'normal' : j.kind,
        lines: j.lines.map((l) => withDimensions({ ...l, debit: decimal(l.debit), credit: decimal(l.credit) })) },
      { allowRestricted: j.kind === 'reversal' });
      const changed = this.db.prepare("UPDATE journals SET status='posted' WHERE id=? AND status='draft'").run(id);
      if (changed.changes !== 1) fail('凭证状态冲突。', 409);
      this.reports(j.date.slice(0, 7));
      return this.journal(id);
    });
  }
  reverse(id, date) {
    return this.transaction(() => {
      validDate(date);
      this.period(date.slice(0, 7), true);
      const source = this.journal(id);
      if (source.status !== 'posted' || !['normal', 'adjusting'].includes(source.kind)) fail('仅可冲销已过账的普通或调整凭证。', 409);
      if (this.db.prepare('SELECT 1 FROM journals WHERE reversal_of=?').get(id)) fail('该凭证已有冲销凭证。', 409);
      const newId = this.insert({ date, memo: `冲销 #${id}`, kind: 'reversal',
        lines: source.lines.map((l) => withDimensions({ ...l, debit: l.credit, credit: l.debit })) }, id);
      return this.journal(newId);
    });
  }
  posted(month) {
    this.period(month);
    return this.db.prepare(`
      SELECT j.id,j.date,j.memo,j.kind,j.reversal_of,l.id AS line_id,l.account,l.debit,l.credit,s.kind AS source_kind
      FROM journals j JOIN lines l ON l.journal_id=j.id
      LEFT JOIN journals s ON s.id=j.reversal_of
      WHERE j.status='posted' AND j.date<? ORDER BY j.date,j.id,l.id
    `).all(`${month}-32`).map(({ line_id, ...row }) => {
      const dimensions = this.lineDimensions(line_id);
      return { ...row, ...(Object.keys(dimensions).length ? { dimensions } : {}) };
    });
  }
  balances(rows) {
    const result = new Map(this.accounts().map((a) => [a.code, 0]));
    for (const l of rows) result.set(l.account, safe(result.get(l.account) + l.debit - l.credit));
    return result;
  }
  reports(month) {
    const rows = this.posted(month), start = `${month}-01`,
      chart = this.accounts(), accounts = chart.map(({ code, name, category }) => ({ code, name, category }));
    const balances = this.balances(rows);
    const before = this.balances(rows.filter((l) => l.date < start));
    const activity = this.balances(rows.filter((l) => l.date >= start && l.kind !== 'closing'));
    const sum = (category, map, sign = 1) => accounts.filter((a) => a.category === category)
      .reduce((s, a) => safe(s + sign * map.get(a.code)), 0);
    const revenue = sum('REVENUE', activity, -1), expense = sum('EXPENSE', activity);
    const profit = safe(revenue - expense);
    const unclosed = safe(-sum('REVENUE', balances) - sum('EXPENSE', balances));
    const assets = sum('ASSET', balances), liabilities = sum('LIABILITY', balances, -1);
    const equity = safe(sum('EQUITY', balances, -1) + unclosed);
    const opening = safe(sum('EQUITY', before, -1) - sum('REVENUE', before) - sum('EXPENSE', before));
    const movements = sum('EQUITY', activity, -1);
    const trial = (selected) => {
      const map = this.balances(selected);
      const lines = accounts.map((a) => ({ ...a, debit: Math.max(map.get(a.code), 0), credit: Math.max(-map.get(a.code), 0) }));
      return { rows: lines, debit: lines.reduce((s, a) => safe(s + a.debit), 0),
        credit: lines.reduce((s, a) => safe(s + a.credit), 0) };
    };
    const groups = new Map();
    for (const a of chart.filter((item) => item.purpose === 'contra')) {
      const grossAccount = chart.find((item) => item.code === a.relatedAccount);
      const measure = ['REVENUE', 'EXPENSE'].includes(a.category) ? 'activity' : 'closing';
      const map = measure === 'activity' ? activity : balances;
      const sign = normalSide(a.category) === 'DEBIT' ? 1 : -1;
      if (!groups.has(grossAccount.code)) groups.set(grossAccount.code, { account: grossAccount.code,
        category: a.category, measure, gross: sign * map.get(grossAccount.code), contra: 0, accounts: [] });
      const group = groups.get(grossAccount.code);
      group.contra = safe(group.contra + sign * map.get(a.code)); group.accounts.push(a.code);
    }
    return {
      month, revenue, expense, profit, assets, liabilities, equity, unclosedProfit: unclosed,
      equitySummary: { opening, movements, profit, closing: safe(opening + movements + profit) },
      accounts: accounts.map((a) => ({ ...a, balance: balances.get(a.code), activity: activity.get(a.code) })),
      accountAnalysis: {
        basis: 'current_account_configuration',
        rows: chart.map(({ code, normalSide, purpose, relatedAccount, propertyRevision }) => {
          const balance = balances.get(code), normalAmount = balance === 0 ? 0 : balance * (normalSide === 'DEBIT' ? 1 : -1);
          return { code, normalSide, purpose, relatedAccount, propertyRevision, balance, normalAmount,
            oppositeBalance: normalAmount < 0 };
        }),
        contraGroups: [...groups.values()].map((group) => ({ ...group, net: safe(group.gross + group.contra) })),
      },
      trialBalances: {
        unadjusted: trial(rows.filter((l) => l.date < start
          || (l.kind !== 'closing' && l.kind !== 'adjusting' && l.source_kind !== 'adjusting'))),
        adjusted: trial(rows.filter((l) => l.date < start || l.kind !== 'closing')),
        postClosing: trial(rows),
      },
    };
  }
  reconciliation(month) {
    const r = this.reports(month);
    const check = (id, left, right) => {
      left = safe(left) || 0; right = safe(right) || 0;
      const difference = safe(left - right) || 0;
      return { id, left, right, difference, pass: difference === 0 };
    };
    const checks = [
      ...['unadjusted', 'adjusted', 'postClosing'].map((stage) =>
        check(`tb.${stage}`, r.trialBalances[stage].debit, r.trialBalances[stage].credit)),
      check('balanceSheet', r.assets, safe(r.liabilities + r.equity)),
      check('equitySummary', r.equitySummary.closing, r.equity),
      check('profit', safe(r.revenue - r.expense), r.profit),
    ];
    return { month, checks, allPass: checks.every((row) => row.pass) };
  }
  ledger(account, month, filter = {}) {
    if (!this.accounts().some((a) => a.code === account)) fail('科目不存在。', 404);
    const filtered = Object.keys(filter).length > 0;
    if (filtered) {
      dimensionCode(filter.value, true);
      if (!this.dimension(filter.dimension).values.some((v) => v.code === filter.value)) fail('维度值不存在。', 404);
    }
    const rows = this.posted(month).filter((l) => l.account === account
      && (!filtered || l.dimensions?.[filter.dimension] === filter.value));
    let balance = 0, opening = 0;
    const entries = [];
    for (const l of rows) {
      balance = safe(balance + l.debit - l.credit);
      if (l.date < `${month}-01`) opening = balance;
      else entries.push({ ...l, balance });
    }
    return { account, month, opening, entries, closing: balance, ...(filtered ? { filter: { ...filter } } : {}) };
  }
  previewClose(month) {
    this.period(month, true);
    const count = this.db.prepare("SELECT COUNT(*) AS n FROM journals WHERE status='draft' AND substr(date,1,7)=?").get(month).n;
    const r = this.reports(month);
    const lines = r.accounts.filter((a) => ['REVENUE', 'EXPENSE'].includes(a.category) && a.balance !== 0)
      .map((a) => ({ account: a.code, debit: Math.max(-a.balance, 0), credit: Math.max(a.balance, 0) }));
    const net = lines.reduce((s, l) => safe(s + l.debit - l.credit), 0);
    if (net) lines.push({ account: '3100', debit: Math.max(-net, 0), credit: Math.max(net, 0) });
    return { month, drafts: count, profit: r.profit, lines };
  }
  closePeriod(month) {
    return this.transaction(() => {
      const preview = this.previewClose(month);
      if (preview.drafts) fail(`期间还有 ${preview.drafts} 张草稿，请先过账或删除。`, 409);
      if (preview.lines.length) {
        const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
        const id = this.insert({ date: `${month}-${last}`, memo: `${month} 收入费用结转`, kind: 'closing', lines: preview.lines });
        this.db.prepare("UPDATE journals SET status='posted' WHERE id=? AND status='draft'").run(id);
      }
      this.reports(month);
      const result = this.db.prepare("UPDATE periods SET status='closed' WHERE month=? AND status='open'").run(month);
      if (result.changes !== 1) fail('期间状态冲突。', 409);
      return { month, status: 'closed' };
    });
  }
  nextPeriod() {
    return this.transaction(() => {
      const last = this.periods().at(-1);
      if (last.status !== 'closed') fail('请先关闭当前期间。', 409);
      let year = Number(last.month.slice(0, 4)), month = Number(last.month.slice(5));
      if (++month > 12) { month = 1; year++; }
      if (year > 9998) fail('期间超出支持年份。');
      const next = `${year}-${String(month).padStart(2, '0')}`;
      this.db.prepare("INSERT INTO periods VALUES (?,'open')").run(next);
      return { month: next, status: 'open' };
    });
  }
}

const fail = (message) => {
  const error = new Error(message);
  error.code = "SNAPSHOT_INVALID";
  throw error;
};
const own = (o, k) => Object.hasOwn(o, k);
const keys = (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : []);
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const safe = (n) => {
  const b =
    typeof n === "bigint"
      ? n
      : Number.isSafeInteger(n)
        ? BigInt(n)
        : fail("Unsafe integer amount.");
  if (b > MAX || b < -MAX) fail("Amount aggregate exceeds safe integer precision.");
  return Number(b);
};
const sum = (values) => safe(values.reduce((a, n) => a + BigInt(n), 0n));
function record(o, allowed, required = allowed) {
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(o)) ||
    Reflect.ownKeys(o).some((k) => typeof k !== "string" || !allowed.includes(k)) ||
    required.some((k) => !own(o, k))
  )
    fail("Invalid or unknown fields.");
  return o;
}
function clean(value, depth = 0) {
  if (depth > 20) fail("Input nesting too deep.");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("Unsafe number.");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 2000) fail("Too many array items.");
    return value.map((v) => clean(v, depth + 1));
  }
  record(value, keys(value));
  for (const k of Object.keys(value))
    if (["__proto__", "prototype", "constructor"].includes(k)) fail("Unsafe field.");
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, clean(value[k], depth + 1)]),
  );
}
const json = (o) => JSON.stringify(clean(o));
const parse = (s) => JSON.parse(s);
const equal = (a, b) => json(a) === json(b);
function code(s) {
  if (typeof s !== "string" || !/^[A-Z0-9][A-Z0-9_.:-]{0,59}$/.test(s)) fail("Invalid code.");
  return s;
}
function integer(n, min = 0, max = Number.MAX_SAFE_INTEGER - 1) {
  if (!Number.isSafeInteger(n) || n < min || n > max) fail("Invalid integer.");
  return n;
}
const IMMUTABLE = [
  "chart_templates",
  "config_versions",
  "source_events",
  "receipts",
  "journals",
  "lines",
  "journal_seals",
  "statistics",
  "clearing_links",
  "corrections",
  "adapter_facts",
  "audit",
];
const COLUMNS = {
  meta: ["id", "revision"],
  currencies: ["code", "scale"],
  chart_templates: ["code", "revision", "data"],
  companies: [
    "code",
    "name",
    "year",
    "currency",
    "scale",
    "report_currency",
    "report_scale",
    "template",
    "template_revision",
  ],
  configs: ["company", "kind", "code", "revision", "active", "data"],
  config_versions: ["company", "kind", "code", "revision", "active", "data"],
  accounts: ["company", "code", "category", "purpose", "data"],
  periods: ["company", "month", "revision", "status", "modules"],
  source_events: ["company", "reference", "operation", "accounting_date", "command"],
  receipts: ["company", "reference", "evidence"],
  journals: [
    "id",
    "company",
    "reference",
    "accounting_date",
    "document_date",
    "tax_date",
    "kind",
    "operation",
    "memo",
    "details",
    "substr_month",
  ],
  lines: ["id", "company", "journal_id", "line_no", "account", "debit", "credit", "data"],
  journal_seals: ["company", "journal_id"],
  transfer_queue: ["company", "reference", "status", "journal_ids", "error", "reason"],
  statistics: ["company", "reference", "data"],
  clearing_links: ["company", "line_id", "reference"],
  corrections: ["company", "original_id", "output_id", "reference", "type"],
  adapter_facts: ["company", "reference", "data"],
  audit: ["id", "company", "action", "reference", "data", "at"],
};
const FOREIGN_KEYS = {
  companies: [
    "currency:currencies:code",
    "report_currency:currencies:code",
    "template,template_revision:chart_templates:code,revision",
  ],
  configs: ["company:companies:code"],
  config_versions: ["company,kind,code:configs:company,kind,code"],
  accounts: ["company:companies:code"],
  periods: ["company:companies:code"],
  source_events: ["company:companies:code"],
  receipts: ["company,reference:source_events:company,reference"],
  journals: [
    "company,reference:source_events:company,reference",
    "company,substr_month:periods:company,month",
  ],
  lines: ["company,journal_id:journals:company,id", "company,account:accounts:company,code"],
  journal_seals: ["company,journal_id:journals:company,id"],
  transfer_queue: ["company,reference:receipts:company,reference"],
  statistics: ["company,reference:source_events:company,reference"],
  clearing_links: [
    "company,line_id:lines:company,id",
    "company,reference:source_events:company,reference",
  ],
  corrections: [
    "company,original_id:journals:company,id",
    "company,output_id:journals:company,id",
    "company,reference:source_events:company,reference",
  ],
  adapter_facts: ["company,reference:source_events:company,reference"],
  audit: ["company:companies:code"],
};

class LegacyEnterpriseIntegrity {
  #db;
  constructor(db) {
    this.#db = db;
    if (this.#get("PRAGMA user_version").user_version !== 1)
      fail("Unknown enterprise snapshot schema.");
    for (const [table, columns] of Object.entries(COLUMNS)) {
      const actual = this.#all(`PRAGMA table_xinfo(${table})`).map((r) => r.name);
      if (!equal(actual, columns)) fail(`Incompatible enterprise schema: ${table}.`);
      const groups = new Map();
      for (const fk of this.#all(`PRAGMA foreign_key_list(${table})`)) {
        if (!groups.has(fk.id)) groups.set(fk.id, []);
        groups.get(fk.id).push(fk);
      }
      const actualFK = [...groups.values()]
        .map((g) => {
          g.sort((a, b) => a.seq - b.seq);
          return `${g.map((r) => r.from).join(",")}:${g[0].table}:${g.map((r) => r.to).join(",")}`;
        })
        .sort();
      if (!equal(actualFK, [...(FOREIGN_KEYS[table] ?? [])].sort()))
        fail(`Incompatible scoped foreign keys: ${table}.`);
    }
    const triggers = new Set(
      this.#all("SELECT name FROM sqlite_master WHERE type='trigger'").map((r) => r.name),
    );
    for (const table of IMMUTABLE)
      for (const action of ["UPDATE", "DELETE"])
        if (!triggers.has(`immutable_${table}_${action}`))
          fail("Incomplete immutable enterprise schema.");
    for (const trigger of [
      "seal_balance",
      "sealed_lines",
      "currency_scale",
      "currency_delete",
      "company_update",
      "company_delete",
      "company_scales",
      "used_account_identity",
      "line_shape",
    ])
      if (!triggers.has(trigger)) fail("Incomplete enterprise constraints.");
    if (!this.#get("SELECT revision FROM meta WHERE id=1")) fail("Incomplete enterprise schema.");
  }
  #all(sql, ...args) {
    return this.#db.prepare(sql).all(...args);
  }
  #get(sql, ...args) {
    return this.#db.prepare(sql).get(...args);
  }
  #revision() {
    return this.#get("SELECT revision FROM meta WHERE id=1").revision;
  }
  #company(c) {
    code(c);
    const r = this.#get("SELECT * FROM companies WHERE code=?", c);
    if (!r) fail("Company not found.", 404);
    return {
      code: r.code,
      name: r.name,
      year: r.year,
      currency: r.currency,
      scale: r.scale,
      reportCurrency: r.report_currency,
      reportScale: r.report_scale,
      chartTemplate: r.template,
      templateRevision: r.template_revision,
    };
  }
  #configs(c) {
    return this.#all("SELECT * FROM configs WHERE company=? ORDER BY kind,code", c).map((r) => ({
      kind: r.kind,
      code: r.code,
      revision: r.revision,
      active: !!r.active,
      data: parse(r.data),
    }));
  }
  #checkAggregates(c, prospective) {
    // BigInt is used before SQL SUM so even accumulated turnover cannot silently round.
    const all = this.#all("SELECT debit,credit FROM lines WHERE company=?", c);
    sum([...all, ...prospective].map((l) => l.debit));
    sum([...all, ...prospective].map((l) => l.credit));
  }
  #result(c, reference) {
    const r = this.#get(
      "SELECT evidence FROM receipts WHERE company=? AND reference=?",
      c,
      reference,
    );
    if (!r) fail("Source not found.", 404);
    const receipt = parse(r.evidence);
    const q = this.#get(
      "SELECT * FROM transfer_queue WHERE company=? AND reference=?",
      c,
      reference,
    );
    return {
      reference,
      operation: receipt.command.operation,
      status: q?.status ?? receipt.status,
      journalIds: q ? parse(q.journal_ids) : receipt.journalIds,
      receipt,
    };
  }
  journal(company, id) {
    this.#company(company);
    integer(id, 1);
    const j = this.#get("SELECT * FROM journals WHERE company=? AND id=?", company, id);
    if (!j) fail("Journal not found.", 404);
    return {
      id: j.id,
      company,
      reference: j.reference,
      accountingDate: j.accounting_date,
      documentDate: j.document_date,
      taxDate: j.tax_date,
      kind: j.kind,
      operation: j.operation,
      memo: j.memo,
      ...parse(j.details),
      lines: this.#all(
        "SELECT * FROM lines WHERE company=? AND journal_id=? ORDER BY line_no",
        company,
        id,
      ).map((l) => ({
        ...parse(l.data),
        id: l.id,
        journalId: id,
        lineNo: l.line_no,
      })),
    };
  }
  integrity() {
    const checks = this.#all("PRAGMA integrity_check");
    if (checks.some((r) => r.integrity_check !== "ok")) fail("SQLite integrity check failed.", 409);
    if (this.#all("PRAGMA foreign_key_check").length) fail("SQLite foreign-key check failed.", 409);
    const companies = this.#all("SELECT code FROM companies");
    for (const { code: c } of companies) {
      const co = this.#company(c);
      for (const currency of [
        [co.currency, co.scale],
        [co.reportCurrency, co.reportScale],
      ]) {
        if (
          this.#get("SELECT scale FROM currencies WHERE code=?", currency[0])?.scale !== currency[1]
        )
          fail("Currency precision integrity failure.", 409);
      }
      this.#checkAggregates(c, []);
      for (const row of this.#all("SELECT id FROM journals WHERE company=?", c)) {
        const j = this.journal(c, row.id);
        if (
          !this.#get("SELECT 1 FROM journal_seals WHERE company=? AND journal_id=?", c, j.id) ||
          j.lines.length < 2 ||
          sum(j.lines.map((l) => l.debit)) !== sum(j.lines.map((l) => l.credit))
        )
          fail("Posted journal balance/seal integrity failure.", 409);
        for (const l of j.lines) {
          const db = this.#get("SELECT * FROM lines WHERE company=? AND id=?", c, l.id);
          if (
            db.account !== l.account ||
            db.debit !== l.debit ||
            db.credit !== l.credit ||
            l.accountingCurrency !== co.currency ||
            l.currency !== co.currency ||
            l.transactionDebit !== l.debit ||
            l.transactionCredit !== l.credit ||
            l.reportingCurrency !== co.reportCurrency ||
            (co.currency === co.reportCurrency
              ? l.reportingDebit !== l.debit || l.reportingCredit !== l.credit
              : l.reportingDebit !== null || l.reportingCredit !== null) ||
            !equal(l.rateRefs, { accounting: null, reporting: null })
          )
            fail("Posted line currency/amount integrity failure.", 409);
        }
      }
      for (const s of this.#all("SELECT * FROM source_events WHERE company=?", c)) {
        const r = this.#result(c, s.reference);
        const command = parse(s.command),
          plan = r.receipt.plan;
        if (
          !equal(r.receipt.command, command) ||
          r.operation !== s.operation ||
          command.company !== c ||
          command.reference !== s.reference ||
          command.accountingDate !== s.accounting_date ||
          plan.version !== 1 ||
          r.receipt.assurance !== "simulated-local-single-operator" ||
          !equal(
            plan.lines,
            plan.journals.flatMap((j) => j.lines),
          )
        )
          fail("Source receipt identity/plan integrity failure.", 409);
        if (typeof r.receipt.token !== "string" || !/^[a-f0-9]{64}$/.test(r.receipt.token))
          fail("Accepted token integrity failure.", 409);
        const queued = this.#get(
          "SELECT * FROM transfer_queue WHERE company=? AND reference=?",
          c,
          s.reference,
        );
        if (
          (r.receipt.status === "pending") !== !!queued ||
          (queued &&
            (s.operation !== "journal" ||
              plan.transferMode !== "queued" ||
              r.receipt.journalIds.length)) ||
          (!queued && !["posted", "recorded"].includes(r.receipt.status))
        )
          fail("Transfer acceptance integrity failure.", 409);
        const actual = this.#all(
          "SELECT id FROM journals WHERE company=? AND reference=? ORDER BY id",
          c,
          s.reference,
        ).map((j) => j.id);
        if (!equal(actual, r.journalIds)) fail("Source GL mapping integrity failure.", 409);
        if (["posted", "transferred"].includes(r.status)) {
          if (!actual.length || actual.length !== plan.journals.length)
            fail("Source journal count integrity failure.", 409);
          actual.forEach((id, i) => {
            const j = this.journal(c, id),
              spec = plan.journals[i];
            const lines = j.lines.map(({ id, lineNo, journalId, ...l }) => l);
            if (
              !equal(lines, spec.lines) ||
              j.accountingDate !== command.accountingDate ||
              j.documentDate !== command.documentDate ||
              j.taxDate !== command.taxDate ||
              j.operation !== command.operation ||
              j.kind !== spec.kind ||
              j.memo !== spec.memo ||
              j.role !== spec.role ||
              !equal(j.policySnapshots, plan.policySnapshots) ||
              !equal(j.expectedRevisions, plan.expectedRevisions)
            )
              fail("Approved plan/header to GL integrity failure.", 409);
          });
        } else if (actual.length) fail("Untransferred source has GL.", 409);
        const statistics = this.#get(
          "SELECT data FROM statistics WHERE company=? AND reference=?",
          c,
          s.reference,
        );
        if (
          (s.operation === "statistics") !== !!statistics ||
          (statistics && !equal(parse(statistics.data), plan.objectEffects[0]))
        )
          fail("Statistics source integrity failure.", 409);
        const links = this.#all(
          "SELECT line_id FROM clearing_links WHERE company=? AND reference=? ORDER BY line_id",
          c,
          s.reference,
        ).map((l) => l.line_id);
        if (
          !equal(
            links,
            s.operation === "clearing.match" ? [...command.data.lineIds].sort((a, b) => a - b) : [],
          )
        )
          fail("Clearing source integrity failure.", 409);
        if (links.length) {
          const matched = links.map((id) =>
            this.#get("SELECT debit,credit,account FROM lines WHERE company=? AND id=?", c, id),
          );
          if (
            matched.some((l) => l.account !== command.data.account) ||
            sum(matched.map((l) => safe(BigInt(l.debit) - BigInt(l.credit)))) !== 0
          )
            fail("Clearing balance integrity failure.", 409);
        }
        const effects = this.#get(
          "SELECT data FROM adapter_facts WHERE company=? AND reference=?",
          c,
          s.reference,
        );
        const hasEffects = !!(plan.facts.length || plan.objectEffects.length);
        if (
          hasEffects !== !!effects ||
          (effects &&
            !equal(parse(effects.data), { facts: plan.facts, objectEffects: plan.objectEffects }))
        )
          fail("Source business effects integrity failure.", 409);
        const correction = this.#get(
          "SELECT * FROM corrections WHERE company=? AND reference=?",
          c,
          s.reference,
        );
        if (
          !!plan.correction !== !!correction ||
          (correction &&
            (correction.original_id !== plan.correction.originalId ||
              correction.output_id !== actual[0] ||
              correction.type !== plan.correction.type))
        )
          fail("Correction source integrity failure.", 409);
        const audits = this.#all(
          "SELECT action FROM audit WHERE company=? AND reference=? ORDER BY id",
          c,
          s.reference,
        ).map((a) => a.action);
        if (audits.filter((a) => a === "source.accept").length !== 1)
          fail("Source acceptance audit integrity failure.", 409);
        if (queued) {
          const expected = {
            pending: "source.accept",
            failed: "transfer.failed",
            transferred: "transfer.complete",
            withdrawn: "transfer.withdraw",
          }[queued.status];
          if (audits.at(-1) !== expected) fail("Transfer audit integrity failure.", 409);
        }
      }
      for (const cfg of this.#configs(c)) {
        const v = this.#get(
          "SELECT * FROM config_versions WHERE company=? AND kind=? AND code=? AND revision=?",
          c,
          cfg.kind,
          cfg.code,
          cfg.revision,
        );
        if (!v || !!v.active !== cfg.active || !equal(parse(v.data), cfg.data))
          fail("Configuration version integrity failure.", 409);
        if (cfg.kind === "account") {
          const a = this.#get("SELECT * FROM accounts WHERE company=? AND code=?", c, cfg.code);
          if (
            !a ||
            a.category !== cfg.data.category ||
            a.purpose !== cfg.data.purpose ||
            !equal(parse(a.data), cfg.data)
          )
            fail("Account configuration integrity failure.", 409);
        }
      }
    }
    const counts = {};
    for (const table of [
      "companies",
      "currencies",
      "configs",
      "config_versions",
      "periods",
      "source_events",
      "receipts",
      "journals",
      "lines",
      "statistics",
      "clearing_links",
      "transfer_queue",
      "corrections",
      "audit",
    ])
      counts[table] = this.#get(`SELECT count(*) AS n FROM ${table}`).n;
    return { ok: true, schemaVersion: 1, revision: this.#revision(), counts };
  }
}

export function legacyEnterpriseIntegrity(db) {
  return new LegacyEnterpriseIntegrity(db).integrity();
}

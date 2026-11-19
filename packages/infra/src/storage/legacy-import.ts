import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  closeSync,
  openSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep, win32 } from "node:path";
import Database from "better-sqlite3";
import {
  JournalService,
  DomainError,
  StorageError,
  importHistoricalPeriod,
  type MasterDataRepository,
  type MasterDataStore,
} from "@erp/core/application";
import {
  accountSchema,
  companySchema,
  dimensionConfigSchema,
  journalDraftSchema,
} from "@erp/core/contracts";
import {
  checkedAccount,
  assertAccountRelationships,
  checkedCompany,
  validateDimensionConfig,
  type Account,
  type JournalDraft,
} from "@erp/core/domain";
import {
  legacyImportPlan,
  type ImportChoices,
  type LegacyImportSnapshot,
} from "../legacy/import-plan.ts";
import { acquireMaintenance } from "./maintenance.ts";
import { inspectSchema, migrateConnection } from "./migrations.ts";
import { masterDataRepository } from "./master-data.ts";
import { journalTools } from "./journals.ts";
import { APPLICATION_ID } from "./sqlite.ts";
import { advanceWriteSequence } from "./write-sequence.ts";
import type { Connection, Row } from "./types.ts";

type Planned = {
  source: string;
  object: string;
  legacy: string;
  company: string;
  target: string;
  lines: number;
};
type Fields = Record<string, unknown>;
const statements = new WeakMap<Database.Database, Map<string, Database.Statement>>();
function prepared(db: Database.Database, sql: string): Database.Statement {
  let cache = statements.get(db);
  if (!cache) {
    cache = new Map();
    statements.set(db, cache);
  }
  let result = cache.get(sql);
  if (!result) {
    result = db.prepare(sql);
    cache.set(sql, result);
  }
  return result;
}
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
function fields(value: string): Fields {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new StorageError("INVALID_INPUT");
  return Object.fromEntries(Object.entries(parsed));
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new StorageError("INVALID_INPUT");
  return value;
}
function id(source: string, company: string, object: string, legacy: string): string {
  const bytes = createHash("sha256")
    .update(JSON.stringify([source, company, object, legacy]))
    .digest()
    .subarray(0, 16);
  // Keep legacy-ID locality in posting indexes; the hash suffix separates ledgers and high bits.
  bytes.writeUIntBE(Number(BigInt(legacy) & 0xffffffffffffn), 0, 6);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function connection(db: Database.Database): Connection {
  return {
    async query(sql, values = []) {
      const statement = prepared(db, sql);
      if (statement.reader) return statement.all(...values) as Row[];
      statement.run(...values);
      return [];
    },
    async script(sql) {
      db.exec(sql);
    },
    async begin() {
      db.exec("BEGIN IMMEDIATE");
    },
    async commit() {
      db.exec("COMMIT");
    },
    async rollback() {
      db.exec("ROLLBACK");
    },
    async release() {},
  };
}
function tableCounts(db: Database.Database): string {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT IN('legacy_import_runs','write_seq') ORDER BY name",
    )
    .all() as { name: string }[];
  return JSON.stringify(
    Object.fromEntries(
      tables.map(({ name }) => [
        name,
        Number((db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get() as { n: bigint }).n),
      ]),
    ),
  );
}
function stage(
  snapshot: LegacyImportSnapshot,
  choices: ImportChoices,
  db: Database.Database,
): void {
  db.pragma("cache_size=-8192");
  db.exec(`CREATE TABLE planned(source TEXT,object TEXT,legacy TEXT,company TEXT,parent TEXT,date TEXT,target TEXT,phase INTEGER,PRIMARY KEY(source,object,legacy));
    CREATE INDEX planned_parent ON planned(source,object,company,parent);
    CREATE INDEX planned_order ON planned(phase,date,source,company,legacy); BEGIN`);
  const insert = db.prepare("INSERT INTO planned VALUES(?,?,?,?,?,?,?,?)");
  const phases: Record<string, number> = {
    companies: 0,
    accounts: 1,
    currencies: 2,
    account_settings: 2,
    account_properties: 2,
    dimensions: 3,
    dimension_values: 4,
    teaching_services: 5,
    periods: 6,
    journals: 7,
    lines: 8,
    line_dimensions: 8,
    audit: 9,
  };
  let executable = false;
  for (const event of legacyImportPlan(snapshot, { choices })) {
    if (event.type === "summary") executable = event.executable;
    if (event.type !== "record" || event.disposition !== "mapped") continue;
    const target = fields(JSON.stringify(event.target));
    const phase = phases[event.object];
    if (phase === undefined) throw new StorageError("INVALID_INPUT");
    insert.run(
      event.source,
      event.object,
      event.legacy_ref,
      target.company_id ?? "",
      target.journal_legacy_ref ?? target.line_legacy_ref ?? "",
      target.accounting_date ?? target.month ?? "",
      JSON.stringify(event.target),
      phase,
    );
  }
  db.exec("COMMIT");
  if (!executable) {
    const error = new StorageError("INVALID_INPUT");
    error.message =
      "Legacy plan is not executable. Resolve unmappable or unsupported records in the dry-run plan before importing.";
    throw error;
  }
}
function* jobs(plan: Database.Database): Generator<Planned> {
  const first = plan
    .prepare("SELECT min(date) AS month FROM planned WHERE source='teaching' AND object='periods'")
    .get() as { month: string | null };
  if (first.month)
    yield {
      source: "teaching",
      object: "companies",
      legacy: "TEACHING",
      company: "TEACHING",
      target: JSON.stringify({
        company_id: "TEACHING",
        name: "Teaching ledger",
        currency: "CNY",
        scale: 2,
        year: Number(first.month.slice(0, 4)),
      }),
      lines: 0,
    };
  for (const row of plan
    .prepare(`SELECT p.*,CASE WHEN object='journals' THEN
      (SELECT count(*) FROM planned l WHERE l.source=p.source AND l.object='lines' AND l.company=p.company AND l.parent=p.legacy)
      ELSE 0 END AS lines FROM planned p WHERE object NOT IN('lines','line_dimensions')
      ORDER BY phase,CASE WHEN object='accounts' AND json_extract(target,'$.contra_of') IS NOT NULL THEN 1 ELSE 0 END,date,source,company,length(legacy),legacy`)
    .iterate() as Iterable<Planned>)
    yield row;
  for (const row of plan
    .prepare(
      "SELECT *,0 AS lines FROM planned WHERE object='periods' AND json_extract(target,'$.status')<>'open' ORDER BY date,source,company",
    )
    .iterate() as Iterable<Planned>)
    yield { ...row, object: "period-state" };
}
function decimal(minor: string, scale: number): string {
  const raw = BigInt(minor)
    .toString()
    .padStart(scale + 1, "0");
  return scale ? `${raw.slice(0, -scale)}.${raw.slice(-scale)}` : raw;
}
function reference(
  db: Database.Database,
  run: string,
  row: Pick<Planned, "source" | "object" | "legacy" | "target">,
  target: string,
): void {
  prepared(
    db,
    "INSERT INTO legacy_refs(source,object_type,legacy_id,target_id,run_id,evidence) VALUES(?,?,?,?,?,?)",
  ).run(row.source, row.object, row.legacy, target, run, row.target);
}
function cached<T>(
  values: Map<string, Promise<T>>,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  let value = values.get(key);
  if (!value) {
    value = read();
    values.set(key, value);
  }
  return value;
}
function historicalRepository(repo: MasterDataRepository): MasterDataRepository {
  const companies = new Map<string, ReturnType<MasterDataRepository["company"]>>();
  const catalogs = new Map<string, ReturnType<MasterDataRepository["dimensionCatalog"]>>();
  const periods = new Map<string, ReturnType<MasterDataRepository["period"]>>();
  const stamps = new Map<string, Promise<string>>();
  const accounts = new Map<string, Map<string, Account>>();
  return {
    ...repo,
    company: (code) => cached(companies, code, () => repo.company(code)),
    dimensionCatalog: (company) => cached(catalogs, company, () => repo.dimensionCatalog(company)),
    period: (company, month) =>
      cached(periods, JSON.stringify([company, month]), () => repo.period(company, month)),
    journalConfigurationStamp: (company) =>
      cached(stamps, company, () => repo.journalConfigurationStamp(company)),
    async accountsByCodes(company, codes) {
      let saved = accounts.get(company);
      if (!saved) {
        saved = new Map();
        accounts.set(company, saved);
      }
      const ordered = [...new Set(codes)].sort();
      const missing = ordered.filter((code) => !saved.has(code));
      if (missing.length)
        for (const account of await repo.accountsByCodes(company, missing))
          saved.set(account.code, account);
      return ordered.flatMap((code) => {
        const account = saved.get(code);
        return account ? [account] : [];
      });
    },
  };
}
async function apply(
  row: Planned,
  plan: Database.Database,
  db: Database.Database,
  repo: MasterDataRepository,
  journals: JournalService,
  run: string,
  at: string,
): Promise<void> {
  const data = fields(row.target),
    company = row.company;
  let target = `${company}:${text(data.code ?? data.month ?? row.legacy)}`;
  if (row.object === "companies") {
    const owner = companySchema.parse({
      code: company,
      name: data.name,
      currency: data.currency,
      scale: data.scale,
      year: data.year,
      closeMode: row.source === "teaching" ? "monthly-teaching" : "annual",
      revision: 1,
    });
    checkedCompany(owner);
    await repo.insertCompany(owner);
    await repo.history(company, "company", company, 1, owner, at, "legacy.import");
    target = company;
  } else if (row.object === "accounts") {
    const account = accountSchema.parse({
      code: data.code,
      name: data.name,
      category: data.category,
      reportGroup: data.report_group,
      normalSide: data.normal_side,
      purpose: data.purpose,
      controlModule: data.control_module,
      contraOf: data.contra_of,
      manualAllowed: data.manual_allowed,
      active: data.active,
      builtin: false,
      revision: 1,
    });
    checkedAccount(account);
    assertAccountRelationships(
      account,
      account.contraOf ? await repo.account(company, account.contraOf) : null,
      [],
    );
    await repo.saveAccount(company, account, 0);
    await repo.history(company, "account", account.code, 1, account, at, "legacy.import");
  } else if (row.object === "dimensions" || row.object === "dimension_values") {
    const value = row.object === "dimension_values";
    const config = dimensionConfigSchema.parse({
      kind: value ? "value" : "dimension",
      code: value ? data.value_code : data.code,
      ...(value ? { dimension: data.dimension_code } : {}),
      name: data.name,
      active: data.active,
      from: "1900-01-01",
      to: "9998-12-31",
      revision: 1,
    });
    validateDimensionConfig(config, await repo.dimensionCatalog(company));
    await repo.saveDimension(company, config, 0, at);
    target = value
      ? `${company}:${text(data.dimension_code)}:${text(data.value_code)}`
      : `${company}:${config.code}`;
  } else if (row.object === "teaching_services") {
    await repo.saveBusinessMaster(
      company,
      "service",
      {
        code: text(data.code),
        name: text(data.name),
        group: text(data.group_code),
        dimensions: {},
        active: data.active === true,
        revision: 1,
      },
      0,
    );
  } else if (row.object === "periods") {
    await repo.savePeriod(company, { month: text(data.month), status: "open", revision: 1 }, 0);
  } else if (row.object === "period-state") {
    const closingRefs = db
      .prepare(`SELECT f.legacy_id AS legacyRef,f.target_id AS journalId FROM legacy_refs f
      JOIN journal_entries e ON e.id=f.target_id JOIN period_closing_journals c ON c.journal_id=e.id AND c.company_id=e.company_id
      WHERE f.source=? AND f.object_type='journals' AND e.company_id=? AND e.period=? ORDER BY f.legacy_id`)
      .all(row.source, company, text(data.month)) as { legacyRef: string; journalId: string }[];
    const status = text(data.status);
    if (status !== "closed" && status !== "frozen") throw new StorageError("INVALID_INPUT");
    await importHistoricalPeriod(repo, {
      company,
      month: text(data.month),
      status,
      sourceRef: `${row.source}:periods:${row.legacy}`,
      closingRefs,
      at,
    });
    return;
  } else if (row.object === "journals") {
    const owner = await repo.company(company);
    if (!owner) throw new StorageError("NOT_FOUND");
    const children = prepared(
      plan,
      "SELECT *,0 AS lines FROM planned WHERE source=? AND object='lines' AND company=? AND parent=? ORDER BY coalesce(json_extract(target,'$.line_no'),CAST(legacy AS INTEGER)),legacy",
    ).all(row.source, company, row.legacy) as Planned[];
    const draftId = id(row.source, company, "journals", row.legacy);
    const lines: JournalDraft["lines"] = children.map((child) => {
      const line = fields(child.target);
      const dimensions: Record<string, string> = {};
      if (row.source === "teaching")
        for (const dimension of prepared(
          plan,
          "SELECT target FROM planned WHERE source=? AND object='line_dimensions' AND company=? AND parent=? ORDER BY legacy",
        ).all(row.source, company, child.legacy) as { target: string }[]) {
          const value = fields(dimension.target);
          dimensions[text(value.dimension_code)] = text(value.value_code);
        }
      return {
        account: text(line.account_code),
        debit: decimal(text(line.debit_minor), owner.scale),
        credit: decimal(text(line.credit_minor), owner.scale),
        dimensions,
        suspense: null,
      };
    });
    const draft: JournalDraft = {
      id: draftId,
      revision: 1,
      sourceRef: `LEGACY:${draftId}`,
      date: text(data.accounting_date),
      documentDate: text(data.document_date),
      taxDate: text(data.tax_date),
      memo: text(data.memo),
      kind: data.kind === "adjusting" ? "adjusting" : "normal",
      operation: data.operation === "reverse" ? "reverse" : "journal",
      originalId:
        data.reversal_of === null
          ? null
          : id(row.source, company, "journals", text(data.reversal_of)),
      headerDimensions: {},
      lines,
    };
    reference(db, run, row, draftId);
    if (data.status === "draft") {
      journalDraftSchema.parse(draft);
      await repo.saveJournalDraft(company, draft, 0);
    } else
      await journals.importHistorical(repo, company, draft, {
        run,
        closing: data.is_closing === true,
      });
    for (const [index, child] of children.entries()) {
      const lineId = `${draftId}:${index + 1}`;
      reference(db, run, child, lineId);
      for (const dimension of prepared(
        plan,
        "SELECT *,0 AS lines FROM planned WHERE source=? AND object='line_dimensions' AND company=? AND parent=? ORDER BY legacy",
      ).all(row.source, company, child.legacy) as Planned[])
        reference(db, run, dimension, lineId);
    }
    return;
  } else if (row.object === "audit") {
    const saved = db
      .prepare(`INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at)
      SELECT 'LOCAL','LOCAL',?,coalesce(max(sequence),0)+1,?,?,'legacy.import',?,? FROM audit WHERE company_id=? RETURNING sequence`)
      .get(
        company,
        text(data.operation),
        text(data.reference),
        text(data.details),
        text(data.recorded_at),
        company,
      ) as { sequence: bigint };
    target = `${company}:${saved.sequence}`;
  } else if (row.object === "currencies") {
    target = `ledger_companies.currency:${text(data.code)}`;
  } else if (!["currencies", "account_settings", "account_properties"].includes(row.object))
    throw new StorageError("INVALID_INPUT");
  reference(db, run, row, target);
}

export async function executeLegacyImport(
  snapshot: LegacyImportSnapshot,
  request: { target: string; choices: ImportChoices; batchLines?: number },
  hooks: { beforeBatchCommit?: (batch: number) => void } = {},
): Promise<{ runId: string; status: "imported"; batches: number }> {
  const batchLines = request.batchLines ?? 5000;
  if (
    !Number.isInteger(batchLines) ||
    batchLines < 1 ||
    batchLines > 5000 ||
    !isAbsolute(request.target) ||
    win32.normalize(request.target).startsWith("\\\\") ||
    win32.normalize(request.target).startsWith("\\??\\") ||
    request.target.includes("\0")
  )
    throw new StorageError("INVALID_INPUT");
  const target = join(realpathSync(dirname(request.target)), basename(request.target));
  const snapshotRelative = relative(realpathSync(snapshot.directory), target);
  if (
    snapshotRelative !== ".." &&
    !snapshotRelative.startsWith(`..${sep}`) &&
    !isAbsolute(snapshotRelative)
  )
    throw new StorageError("INVALID_INPUT");
  const temporary = mkdtempSync(join(tmpdir(), "erp-import-"));
  let release: (() => void) | undefined, db: Database.Database | undefined;
  const plan = new Database(join(temporary, "plan.sqlite"));
  try {
    stage(snapshot, request.choices, plan);
    release = acquireMaintenance(target);
    const existed = existsSync(target);
    if (existed) {
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        throw new StorageError("CONFLICT");
      db = new Database(target, { readonly: true, fileMustExist: true });
    } else {
      closeSync(openSync(target, "wx", 0o600));
      db = new Database(target, { fileMustExist: true });
      db.pragma(`application_id=${APPLICATION_ID}`);
    }
    db.defaultSafeIntegers(true);
    let raw = connection(db);
    const snapshotSha = JSON.stringify(snapshot.snapshotSha256);
    const choices = JSON.stringify(
      Object.fromEntries(Object.entries(request.choices).sort(([a], [b]) => a.localeCompare(b))),
    );
    let runId: string = randomUUID(),
      cursor = 0,
      at = new Date().toISOString();
    if (existed) {
      if (Number(db.pragma("application_id", { simple: true })) !== APPLICATION_ID)
        throw new StorageError("CONFLICT");
      const version = await inspectSchema(raw, false);
      const runs = db.prepare("SELECT * FROM legacy_import_runs").all() as Row[];
      const run = runs[0];
      if (
        runs.length !== 1 ||
        run.tool !== "legacy.import.v2" ||
        run.status !== "importing" ||
        run.snapshot_sha !== snapshotSha ||
        run.choices !== choices ||
        Number(run.migration_version) !== version ||
        run.counts !== tableCounts(db) ||
        run.write_sequence !==
          (db.prepare("SELECT value FROM write_seq WHERE id=1").get() as { value: bigint }).value
      )
        throw new StorageError("CONFLICT");
      runId = text(run.id);
      cursor = Number(run.cursor);
      at = text(run.created_at);
      db.close();
      db = new Database(target, { fileMustExist: true });
      db.defaultSafeIntegers(true);
      raw = connection(db);
    }
    db.pragma("foreign_keys=ON");
    if (!existed) {
      await raw.begin();
      try {
        await migrateConnection(raw);
        const version = await inspectSchema(raw, false);
        db.prepare(
          "INSERT INTO legacy_import_runs(id,tool,snapshot_sha,choices,migration_version,status,created_at) VALUES(?,'legacy.import.v2',?,?,?,'importing',?)",
        ).run(runId, snapshotSha, choices, version, at);
        db.prepare("UPDATE legacy_import_runs SET counts=? WHERE id=?").run(tableCounts(db), runId);
        await raw.commit();
      } catch (error) {
        await raw.rollback();
        throw error;
      }
    }
    db.pragma("journal_mode=WAL");
    db.pragma("synchronous=NORMAL");
    // Bound checkpoint work per commit and the final close without an unbounded WAL.
    db.pragma("wal_autocheckpoint=65536");
    db.pragma("cache_size=-131072");
    const repo = masterDataRepository(raw);
    // All metadata is complete and immutable during the journal phase.
    const historical = historicalRepository(repo);
    const store: MasterDataStore = {
      read: async (work) => work(repo),
      write: async (work) => work(repo),
    };
    const journals = new JournalService(store, { ...journalTools, now: () => at });
    let index = 0,
      batch = 0,
      pending: Planned[] = [],
      lines = 0;
    async function flush(final = false) {
      if (!db) throw new StorageError("CLOSED");
      await raw.begin();
      try {
        for (const job of pending)
          await apply(
            job,
            plan,
            db,
            job.object === "journals" ? historical : repo,
            journals,
            runId,
            at,
          );
        if (pending.length) await advanceWriteSequence(raw);
        db.prepare(
          "UPDATE legacy_import_runs SET cursor=?,counts=?,write_sequence=(SELECT value FROM write_seq WHERE id=1),status=? WHERE id=?",
        ).run(index, tableCounts(db), final ? "imported" : "importing", runId);
        hooks.beforeBatchCommit?.(++batch);
        await raw.commit();
      } catch (error) {
        await raw.rollback();
        throw error;
      }
      pending = [];
      lines = 0;
    }
    for (const job of jobs(plan)) {
      if (index < cursor) {
        index++;
        continue;
      }
      if (pending.length && (lines + Number(job.lines) > batchLines || pending.length >= 2500))
        await flush();
      pending.push(job);
      lines += Number(job.lines);
      index++;
    }
    await flush(true);
    return { runId, status: "imported", batches: batch };
  } catch (error) {
    if (error instanceof DomainError) throw new StorageError(error.code);
    throw error;
  } finally {
    try {
      db?.close();
    } finally {
      try {
        release?.();
      } finally {
        plan.close();
        rmSync(temporary, { recursive: true });
      }
    }
  }
}

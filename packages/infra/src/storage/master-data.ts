import {
  DomainError,
  StorageError,
  type MasterDataRepository,
  type MasterDataStore,
} from "@erp/core/application";
import type { Account, Company, Page, PageQuery, Period } from "@erp/core/domain";
import {
  accountSchema,
  companySchema,
  periodSchema,
  type ContractSchema,
} from "@erp/core/contracts";
import { Queue } from "./queue.ts";
import { sqliteBackend } from "./sqlite.ts";
import { storageError } from "./errors.ts";
import { inspectSchema } from "./migrations.ts";
import { dimensionRepository } from "./dimensions.ts";
import { journalRepository } from "./journals.ts";
import { businessRepository } from "./business-events.ts";
import { reportRepository } from "./reports.ts";
import type { Connection, Row, SqliteStorageConfig } from "./types.ts";

function decode<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageError("STORAGE_FAILURE");
  return parsed.data;
}
const numeric = (value: unknown) => (typeof value === "bigint" ? Number(value) : value);
function companyRow(row: Row): Company {
  return decode(companySchema, {
    code: row.company_id,
    name: row.name,
    currency: row.currency,
    scale: numeric(row.scale),
    year: numeric(row.year),
    closeMode: row.close_mode,
    revision: numeric(row.revision),
  });
}
function flag(value: unknown): boolean {
  if (value !== 0n && value !== 1n && value !== 0 && value !== 1)
    throw new StorageError("STORAGE_FAILURE");
  return value === 1n || value === 1;
}
function accountRow(row: Row): Account {
  return decode(accountSchema, {
    code: row.code,
    name: row.name,
    category: row.category,
    reportGroup: row.report_group,
    normalSide: row.normal_side,
    purpose: row.purpose,
    controlModule: row.control_module,
    contraOf: row.contra_of,
    manualAllowed: flag(row.manual_allowed),
    active: flag(row.active),
    builtin: flag(row.builtin),
    revision: numeric(row.revision),
  });
}
function periodRow(row: Row): Period {
  return decode(periodSchema, {
    month: row.month,
    status: row.status,
    revision: numeric(row.revision),
  });
}
function page<T>(
  rows: readonly Row[],
  query: PageQuery,
  parse: (row: Row) => T,
  key: (item: T) => string,
): Page<T> {
  const items = rows.slice(0, query.limit).map(parse);
  return { items, nextCursor: rows.length > query.limit ? key(items[items.length - 1]) : null };
}
function repository(db: Connection): MasterDataRepository {
  return {
    ...dimensionRepository(db),
    ...journalRepository(db),
    ...businessRepository(db),
    ...reportRepository(db),
    async company(code) {
      const rows = await db.query("SELECT * FROM ledger_companies WHERE company_id=?", [code]);
      return rows[0] ? companyRow(rows[0]) : null;
    },
    async companies(query) {
      return page(
        await db.query(
          "SELECT * FROM ledger_companies WHERE company_id>? ORDER BY company_id LIMIT ?",
          [query.cursor ?? "", query.limit + 1],
        ),
        query,
        companyRow,
        (item) => item.code,
      );
    },
    async currencyScale(currency) {
      const rows = await db.query("SELECT scale FROM ledger_companies WHERE currency=? LIMIT 1", [
        currency,
      ]);
      return rows[0] ? Number(rows[0].scale) : null;
    },
    async insertCompany(company) {
      await db.query("INSERT INTO tenants(tenant_id) VALUES('LOCAL') ON CONFLICT DO NOTHING");
      await db.query(
        "INSERT INTO books(tenant_id,book_id) VALUES('LOCAL','LOCAL') ON CONFLICT DO NOTHING",
      );
      await db.query(
        "INSERT INTO companies(tenant_id,book_id,company_id) VALUES('LOCAL','LOCAL',?) ON CONFLICT DO NOTHING",
        [company.code],
      );
      await db.query(
        "INSERT INTO ledger_companies(company_id,name,currency,scale,year,close_mode,revision) VALUES(?,?,?,?,?,?,?)",
        [
          company.code,
          company.name,
          company.currency,
          company.scale,
          company.year,
          company.closeMode,
          company.revision,
        ],
      );
    },
    async account(company, code, at) {
      if (at !== undefined) {
        const rows = await db.query(
          "SELECT snapshot FROM config_history WHERE company_id=? AND kind='account' AND config_key=? AND recorded_at<=? ORDER BY recorded_at DESC,revision DESC LIMIT 1",
          [company, code, at],
        );
        if (!rows[0]) return null;
        if (typeof rows[0].snapshot !== "string") throw new StorageError("STORAGE_FAILURE");
        return decode(accountSchema, JSON.parse(rows[0].snapshot));
      }
      const rows = await db.query("SELECT * FROM accounts WHERE company_id=? AND code=?", [
        company,
        code,
      ]);
      return rows[0] ? accountRow(rows[0]) : null;
    },
    async accounts(company, query) {
      return page(
        await db.query(
          "SELECT * FROM accounts WHERE company_id=? AND code>? ORDER BY code LIMIT ?",
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        accountRow,
        (item) => item.code,
      );
    },
    async contraChildren(company, code) {
      return (
        await db.query("SELECT * FROM accounts WHERE company_id=? AND contra_of=?", [company, code])
      ).map(accountRow);
    },
    async accountsByCodes(company, codes) {
      if (!codes.length) return [];
      return (
        await db.query(
          `SELECT * FROM accounts WHERE company_id=? AND code IN(${codes.map(() => "?").join(",")}) ORDER BY code`,
          [company, ...codes],
        )
      ).map(accountRow);
    },
    async saveAccount(company, account, expected) {
      const fields = [
        account.name,
        account.category,
        account.reportGroup,
        account.normalSide,
        account.purpose,
        account.controlModule,
        account.contraOf,
        Number(account.manualAllowed),
        Number(account.active),
        Number(account.builtin),
        account.revision,
      ];
      if (expected === 0) {
        await db.query(
          "INSERT INTO accounts(name,category,report_group,normal_side,purpose,control_module,contra_of,manual_allowed,active,builtin,revision,company_id,code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [...fields, company, account.code],
        );
      } else {
        const rows = await db.query(
          "UPDATE accounts SET name=?,category=?,report_group=?,normal_side=?,purpose=?,control_module=?,contra_of=?,manual_allowed=?,active=?,builtin=?,revision=? WHERE company_id=? AND code=? AND revision=? RETURNING code",
          [...fields, company, account.code, expected],
        );
        if (rows.length !== 1) throw new StorageError("CONFLICT");
      }
    },
    async periods(company, query) {
      return page(
        await db.query(
          "SELECT * FROM periods WHERE company_id=? AND month>? ORDER BY month LIMIT ?",
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        periodRow,
        (item) => item.month,
      );
    },
    async period(company, month) {
      const rows = await db.query("SELECT * FROM periods WHERE company_id=? AND month=?", [
        company,
        month,
      ]);
      return rows[0] ? periodRow(rows[0]) : null;
    },
    async savePeriod(company, period, expected) {
      if (expected === 0)
        await db.query("INSERT INTO periods(company_id,month,status,revision) VALUES(?,?,?,?)", [
          company,
          period.month,
          period.status,
          period.revision,
        ]);
      else if (
        (
          await db.query(
            "UPDATE periods SET status=?,revision=? WHERE company_id=? AND month=? AND revision=? RETURNING month",
            [period.status, period.revision, company, period.month, expected],
          )
        ).length !== 1
      )
        throw new StorageError("CONFLICT");
    },
    async history(company, kind, key, revision, snapshot, at, reason) {
      await db.query(
        "INSERT INTO config_history(company_id,kind,config_key,revision,recorded_at,actor,reason,snapshot) VALUES(?,?,?,?,?,'LOCAL',?,?)",
        [company, kind, key, revision, at, reason, JSON.stringify(snapshot)],
      );
    },
  };
}
export function createMasterDataStore(
  config: SqliteStorageConfig,
): MasterDataStore & { close(): Promise<void> } {
  const backend = sqliteBackend(config);
  const queue = new Queue();
  const inflight = new Set<Promise<unknown>>();
  let closed = false;
  function run<T>(write: boolean, work: (repo: MasterDataRepository) => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new StorageError("CLOSED"));
    const operation = (async () => {
      const release = await queue.acquire();
      let db: Connection | undefined;
      let begun = false;
      let destroy = false;
      try {
        db = await backend.acquire(!write, false);
        await db.begin();
        begun = true;
        await inspectSchema(db, false);
        const result = await work(repository(db));
        await db.commit();
        begun = false;
        return result;
      } catch (error) {
        if (begun && db) {
          try {
            await db.rollback();
          } catch {
            destroy = true;
            throw new StorageError("STORAGE_FAILURE");
          }
        }
        if (error instanceof DomainError) throw error;
        throw storageError(error);
      } finally {
        try {
          await db?.release(destroy);
        } finally {
          release();
        }
      }
    })();
    inflight.add(operation);
    void operation.then(
      () => inflight.delete(operation),
      () => inflight.delete(operation),
    );
    return operation;
  }
  return {
    read: (work) => run(false, work),
    write: (work) => run(true, work),
    async close() {
      closed = true;
      queue.close();
      await Promise.allSettled([...inflight]);
      await backend.close();
    },
  };
}

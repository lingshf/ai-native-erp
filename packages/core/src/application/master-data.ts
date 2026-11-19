import {
  DomainError,
  assertAccountRelationships,
  changedPeriod,
  checkedAccount,
  checkedAccountCode,
  checkedCode,
  checkedCompany,
  checkedExpectedRevision,
  checkedPage,
  checkedTeachingMonth,
  defaultAccounts,
  type Account,
  type AccountInput,
  type Company,
  type CompanyInput,
  type Page,
  type PageQuery,
  type Period,
} from "@erp/core/domain";
import type { DimensionRepository } from "./dimensions.ts";
import type { JournalRepository } from "./journals.ts";
import type { BusinessRepository } from "./business-events.ts";
import type { ReportRepository } from "./reports.ts";
import type { PeriodCloseRepository } from "./period-close.ts";
import type { TradeRepository } from "./trade-master.ts";
import type { TradeDocumentRepository } from "./trade-documents.ts";
import { businessError } from "@erp/core/domain";

export interface MasterDataRepository
  extends DimensionRepository,
    JournalRepository,
    BusinessRepository,
    ReportRepository,
    PeriodCloseRepository,
    TradeRepository,
    TradeDocumentRepository {
  company(code: string): Promise<Company | null>;
  companies(query: PageQuery): Promise<Page<Company>>;
  currencyScale(currency: string): Promise<number | null>;
  insertCompany(company: Company): Promise<void>;
  account(company: string, code: string, at?: string): Promise<Account | null>;
  accounts(company: string, query: PageQuery): Promise<Page<Account>>;
  accountsByCodes(company: string, codes: readonly string[]): Promise<readonly Account[]>;
  contraChildren(company: string, code: string): Promise<readonly Account[]>;
  saveAccount(company: string, account: Account, expected: number): Promise<void>;
  periods(company: string, query: PageQuery): Promise<Page<Period>>;
  period(company: string, month: string): Promise<Period | null>;
  savePeriod(company: string, period: Period, expected: number): Promise<void>;
  history(
    company: string,
    kind: "company" | "account" | "period",
    key: string,
    revision: number,
    snapshot: Company | Account | Period,
    at: string,
    reason: string,
  ): Promise<void>;
}
export interface MasterDataStore {
  read<T>(work: (repository: MasterDataRepository) => Promise<T>): Promise<T>;
  write<T>(work: (repository: MasterDataRepository) => Promise<T>): Promise<T>;
}
function required<T>(value: T | null): T {
  if (value === null) throw new DomainError("NOT_FOUND");
  return value;
}
function cas(actual: number, expected: number): void {
  if (actual !== checkedExpectedRevision(expected)) throw new DomainError("CONFLICT");
}
export class MasterDataService {
  private readonly store: MasterDataStore;
  private readonly now: () => string;
  constructor(store: MasterDataStore, now = () => new Date().toISOString()) {
    this.store = store;
    this.now = now;
  }
  initialize(year: number): Promise<void> {
    return this.store.write(async (repo) => {
      if (!(await repo.company("DEFAULT"))) {
        await this.addCompany(repo, {
          code: "DEFAULT",
          name: "默认公司 / Default company",
          currency: "CNY",
          scale: 2,
          year,
          closeMode: "monthly-teaching",
        });
      }
    });
  }
  private async addCompany(repo: MasterDataRepository, input: CompanyInput): Promise<Company> {
    const company = { ...checkedCompany(input), revision: 1 };
    if (await repo.company(company.code)) throw new DomainError("CONFLICT");
    const scale = await repo.currencyScale(company.currency);
    if (scale !== null && scale !== company.scale) throw new DomainError("CONFLICT");
    const at = this.now();
    await repo.insertCompany(company);
    await repo.history(company.code, "company", company.code, 1, company, at, "");
    for (const account of defaultAccounts()) {
      await repo.saveAccount(company.code, account, 0);
      await repo.history(company.code, "account", account.code, 1, account, at, "");
    }
    for (let month = 1; month <= 12; month++) {
      const period: Period = {
        month: `${company.year}-${String(month).padStart(2, "0")}`,
        status: "open",
        revision: 1,
      };
      await repo.savePeriod(company.code, period, 0);
      await repo.history(company.code, "period", period.month, 1, period, at, "");
    }
    return company;
  }
  createCompany(input: CompanyInput): Promise<Company> {
    return this.store.write((repo) => this.addCompany(repo, input));
  }
  companies(query: PageQuery): Promise<Page<Company>> {
    checkedPage(query);
    if (query.cursor !== undefined) checkedCode(query.cursor);
    return this.store.read((repo) => repo.companies(query));
  }
  accounts(company: string, query: PageQuery): Promise<Page<Account>> {
    checkedCode(company);
    checkedPage(query);
    if (query.cursor !== undefined) checkedAccountCode(query.cursor);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.accounts(company, query);
    });
  }
  account(company: string, code: string, at?: string): Promise<Account> {
    checkedCode(company);
    checkedAccountCode(code);
    if (
      at !== undefined &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(at) ||
        !Number.isFinite(Date.parse(at)) ||
        new Date(at).toISOString() !== at)
    )
      throw new DomainError("INVALID_INPUT");
    return this.store.read(async (repo) => required(await repo.account(company, code, at)));
  }
  saveAccount(company: string, input: AccountInput, expected: number): Promise<Account> {
    checkedCode(company);
    checkedExpectedRevision(expected);
    const fields = checkedAccount(input);
    return this.store.write(async (repo) => {
      const owner = required(await repo.company(company));
      const old = await repo.account(company, fields.code);
      cas(old?.revision ?? 0, expected);
      if (old?.builtin && owner.closeMode === "monthly-teaching")
        throw new DomainError("INVALID_INPUT", { path: "code", rule: "readOnly" });
      assertAccountRelationships(
        fields,
        fields.contraOf === null ? null : await repo.account(company, fields.contraOf),
        await repo.contraChildren(company, fields.code),
      );
      const account: Account = {
        ...fields,
        builtin: old?.builtin ?? false,
        revision: expected + 1,
      };
      await repo.saveAccount(company, account, expected);
      await repo.history(
        company,
        "account",
        fields.code,
        account.revision,
        account,
        this.now(),
        "",
      );
      return account;
    });
  }
  periods(company: string, query: PageQuery): Promise<Page<Period>> {
    checkedCode(company);
    checkedPage(query);
    if (query.cursor !== undefined) checkedTeachingMonth(query.cursor);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.periods(company, query);
    });
  }
  setPeriod(
    company: string,
    month: string,
    expected: number,
    status: Period["status"],
    reason: string,
    confirmed: boolean,
  ): Promise<Period> {
    checkedCode(company);
    checkedTeachingMonth(month);
    if (status === "closed") throw new DomainError("INVALID_INPUT");
    return this.store.write(async (repo) => {
      const old = required(await repo.period(company, month));
      cas(old.revision, expected);
      const next = changedPeriod(old, status, reason, confirmed);
      if (next.status !== "open" && (await repo.pendingTransfers(company, month)))
        businessError("status", "pending", true);
      await repo.savePeriod(company, next, expected);
      await repo.history(company, "period", month, next.revision, next, this.now(), reason.trim());
      return next;
    });
  }
}

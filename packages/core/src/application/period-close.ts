import {
  DomainError,
  checkedCode,
  checkedExpectedRevision,
  checkedJournalId,
  checkedTeachingMonth,
  checkedMinor,
  closingJournals,
  nextLedgerMonth,
  type CloseCommand,
  type ClosePreview,
  type CloseResult,
  type Period,
} from "@erp/core/domain";
import { JournalService, type JournalTools, type JournalPreview } from "./journals.ts";
import type { MasterDataRepository, MasterDataStore } from "./master-data.ts";

export interface PeriodCloseRepository {
  closeState(
    company: string,
    month: string,
    annual: boolean,
  ): Promise<{
    drafts: number;
    queue: number;
    priorPeriods: number;
  }>;
  periodClose(company: string, key: string): Promise<CloseResult | null>;
  insertPeriodClose(result: CloseResult): Promise<void>;
  isClosingJournal(company: string, id: string): Promise<boolean>;
}
function command(input: CloseCommand) {
  checkedCode(input.company);
  checkedTeachingMonth(input.month);
  checkedJournalId(input.commandId);
  checkedExpectedRevision(input.revision);
}
function required<T>(value: T | null): T {
  if (value === null) throw new DomainError("NOT_FOUND");
  return value;
}
export class PeriodCloseService {
  private readonly store: MasterDataStore;
  private readonly tools: JournalTools;
  private readonly journals: JournalService;
  constructor(store: MasterDataStore, tools: JournalTools) {
    this.store = store;
    this.tools = tools;
    this.journals = new JournalService(store, tools);
  }
  private async plan(repo: MasterDataRepository, input: CloseCommand) {
    const owner = required(await repo.company(input.company));
    const period = required(await repo.period(input.company, input.month));
    if (
      period.status === "closed" ||
      period.revision !== input.revision ||
      (await repo.journalEntry(input.company, input.commandId)) ||
      (await repo.journalDraft(input.company, input.commandId))
    )
      throw new DomainError("CONFLICT");
    const snapshot = await repo.reportSnapshot(input.company);
    const rows = await repo.reportBalances(input.company, input.month, "adjusted");
    const built = closingJournals(owner, input.month, rows);
    const state = await repo.closeState(input.company, input.month, owner.closeMode === "annual");
    const blockers = (["drafts", "queue", "priorPeriods"] as const).filter(
      (key) => state[key] !== 0,
    );
    const turnover = await repo.journalTurnover(input.company);
    checkedMinor(
      BigInt(turnover) + built.journals.reduce((sum, item) => sum + BigInt(item.debit), 0n),
      0,
    );
    const lines = built.journals.flatMap((item) => item.lines);
    const fingerprint = this.tools.hash([
      "period-close-v1",
      input,
      owner,
      period,
      snapshot,
      await repo.journalConfigurationStamp(input.company),
      state,
      rows,
      built,
      turnover,
    ]);
    const preview: ClosePreview = {
      ...input,
      fingerprint,
      action: built.action,
      snapshot,
      date: built.date,
      netProfit: built.netProfit,
      blockers,
      lines,
    };
    const current: JournalPreview = {
      fingerprint,
      plan: {
        version: 1,
        company: owner.code,
        currency: owner.currency,
        scale: owner.scale,
        draftId: input.commandId,
        draftRevision: input.revision,
        sourceRef: `CLOSE:${input.month}:${input.revision}`,
        date: built.date,
        documentDate: built.date,
        taxDate: built.date,
        module: null,
        memo: `Period close ${input.month}`,
        operation: "journal",
        originalId: null,
        journals: built.journals,
      },
    };
    return { preview, current, period, owner };
  }
  preview(input: CloseCommand) {
    command(input);
    return this.store.read(async (repo) => (await this.plan(repo, input)).preview);
  }
  confirm(
    input: CloseCommand & { fingerprint: string; confirmation: "CLOSE" },
  ): Promise<CloseResult> {
    command(input);
    if (input.confirmation !== "CLOSE" || !/^[0-9a-f]{64}$/u.test(input.fingerprint))
      throw new DomainError("INVALID_INPUT");
    return this.store.write(async (repo) => {
      const previous = await repo.periodClose(input.company, input.commandId);
      if (previous) {
        if (
          previous.preview.month !== input.month ||
          previous.preview.revision !== input.revision ||
          previous.preview.fingerprint !== input.fingerprint
        )
          throw new DomainError("CONFLICT");
        return previous;
      }
      if (await repo.journalReceipt(input.company, input.commandId))
        throw new DomainError("CONFLICT");
      const selected: CloseCommand = {
        company: input.company,
        month: input.month,
        revision: input.revision,
        commandId: input.commandId,
      };
      const { preview, current, period, owner } = await this.plan(repo, selected);
      if (preview.blockers.length || preview.fingerprint !== input.fingerprint)
        throw new DomainError("CONFLICT");
      const receipt = await this.journals.commit(repo, current, input.commandId, "period.close");
      const next: Period = {
        ...period,
        status: preview.action === "freeze" ? "frozen" : "closed",
        revision: period.revision + 1,
      };
      await repo.savePeriod(input.company, next, period.revision);
      await repo.history(
        input.company,
        "period",
        next.month,
        next.revision,
        next,
        receipt.postedAt,
        "period.close",
      );
      if (owner.closeMode === "annual" && input.month.endsWith("-12")) {
        const periods = await repo.periods(input.company, {
          limit: 500,
          cursor: `${input.month.slice(0, 4)}-01`,
        });
        const january = await repo.period(input.company, `${input.month.slice(0, 4)}-01`);
        for (const old of [...(january ? [january] : []), ...periods.items]) {
          if (
            old.month >= input.month ||
            old.month.slice(0, 4) !== input.month.slice(0, 4) ||
            old.status === "closed"
          )
            continue;
          const closed: Period = {
            ...old,
            status: "closed",
            revision: checkedExpectedRevision(old.revision) + 1,
          };
          await repo.savePeriod(input.company, closed, old.revision);
          await repo.history(
            input.company,
            "period",
            old.month,
            closed.revision,
            closed,
            receipt.postedAt,
            "period.yearClose",
          );
        }
      }
      const result = { preview, period: next, receipt };
      await repo.insertPeriodClose(result);
      return result;
    });
  }
  openNext(company: string, month: string, revision: number) {
    checkedCode(company);
    checkedTeachingMonth(month);
    checkedExpectedRevision(revision);
    const nextMonth = nextLedgerMonth(month);
    return this.store.write(async (repo) => {
      const owner = required(await repo.company(company));
      const old = required(await repo.period(company, month));
      if (
        old.revision !== revision ||
        old.status === "open" ||
        ((owner.closeMode === "monthly-teaching" || month.endsWith("-12")) &&
          old.status !== "closed")
      )
        throw new DomainError("CONFLICT");
      const existing = await repo.period(company, nextMonth);
      if (existing) {
        if (existing.status !== "open") throw new DomainError("CONFLICT");
        return existing;
      }
      const next: Period = { month: nextMonth, status: "open", revision: 1, modules: [] };
      await repo.savePeriod(company, next, 0);
      await repo.history(
        company,
        "period",
        nextMonth,
        1,
        next,
        this.tools.now(),
        "period.openNext",
      );
      return next;
    });
  }
}

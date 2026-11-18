import {
  DomainError,
  buildJournalPlan,
  checkedCode,
  checkedExpectedRevision,
  checkedJournalDraft,
  checkedJournalId,
  checkedPage,
  journalError,
  type JournalDraft,
  type JournalEntry,
  type JournalCorrection,
  type JournalPlan,
  type JournalReceipt,
  type JournalSummary,
  type Page,
  type PageQuery,
} from "@erp/core/domain";
import type { MasterDataRepository, MasterDataStore } from "./master-data.ts";
export interface JournalRepository {
  journalDraft(company: string, id: string): Promise<JournalDraft | null>;
  saveJournalDraft(company: string, draft: JournalDraft, expected: number): Promise<void>;
  deleteJournalDraft(company: string, id: string, expected: number): Promise<void>;
  journalPage(
    company: string,
    status: "draft" | "posted",
    query: PageQuery,
  ): Promise<Page<JournalSummary>>;
  journalEntry(company: string, id: string): Promise<JournalEntry | null>;
  journalChain(company: string, id: string): Promise<readonly JournalCorrection[]>;
  journalReceipt(company: string, key: string): Promise<JournalReceipt | null>;
  journalSourceExists(company: string, reference: string): Promise<boolean>;
  journalConfigurationStamp(company: string): Promise<string>;
  journalTurnover(company: string): Promise<number>;
  insertJournalReceipt(receipt: JournalReceipt): Promise<void>;
  insertJournalEntry(company: string, entry: JournalEntry, key: string): Promise<void>;
  insertJournalCorrection(company: string, originalId: string, entry: JournalEntry): Promise<void>;
  insertJournalAudit(receipt: JournalReceipt): Promise<void>;
}
export interface JournalPreview {
  readonly fingerprint: string;
  readonly plan: JournalPlan;
}
export interface JournalConfirm {
  readonly company: string;
  readonly draftId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly confirmation: "POST";
}
export interface JournalTools {
  readonly hash: (parts: readonly unknown[]) => string;
  readonly id: () => string;
  readonly now: () => string;
}
function required<T>(value: T | null): T {
  if (value === null) throw new DomainError("NOT_FOUND");
  return value;
}
export class JournalService {
  private readonly store: MasterDataStore;
  private readonly tools: JournalTools;
  constructor(store: MasterDataStore, tools: JournalTools) {
    this.store = store;
    this.tools = tools;
  }
  list(company: string, status: "draft" | "posted", query: PageQuery) {
    checkedCode(company);
    checkedPage(query);
    if (!["draft", "posted"].includes(status)) journalError("status", "shape");
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.journalPage(company, status, query);
    });
  }
  draft(company: string, id: string) {
    checkedCode(company);
    checkedJournalId(id);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return required(await repo.journalDraft(company, id));
    });
  }
  entry(company: string, id: string) {
    checkedCode(company);
    checkedJournalId(id);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return {
        entry: required(await repo.journalEntry(company, id)),
        chain: await repo.journalChain(company, id),
      };
    });
  }
  save(company: string, draft: JournalDraft) {
    checkedCode(company);
    checkedJournalDraft(draft);
    return this.store.write(async (repo) => {
      required(await repo.company(company));
      const old = await repo.journalDraft(company, draft.id);
      if ((old?.revision ?? 0) !== draft.revision || (await repo.journalEntry(company, draft.id)))
        journalError("revision", "stale", true);
      const saved = { ...draft, revision: draft.revision + 1 };
      checkedExpectedRevision(saved.revision);
      await repo.saveJournalDraft(company, saved, draft.revision);
      return saved;
    });
  }
  remove(company: string, id: string, revision: number) {
    checkedCode(company);
    checkedJournalId(id);
    checkedExpectedRevision(revision);
    return this.store.write(async (repo) => {
      required(await repo.company(company));
      const draft = required(await repo.journalDraft(company, id));
      if (draft.revision !== revision) journalError("revision", "stale", true);
      await repo.deleteJournalDraft(company, id, revision);
      return { deleted: id };
    });
  }
  private async compute(
    repo: MasterDataRepository,
    company: string,
    id: string,
    revision: number,
  ): Promise<JournalPreview> {
    const configuration = required(await repo.company(company));
    const draft = required(await repo.journalDraft(company, id));
    if (draft.revision !== revision) journalError("revision", "stale", true);
    if (await repo.journalSourceExists(company, draft.sourceRef))
      journalError("sourceRef", "source", true);
    const catalog = await repo.dimensionCatalog(company);
    const original = draft.originalId
      ? required(await repo.journalEntry(company, draft.originalId))
      : null;
    const corrections = original ? await repo.journalChain(company, original.id) : [];
    const codes = [
      ...new Set([
        ...draft.lines.map((line) => line.account),
        ...(original?.lines.map((line) => line.account) ?? []),
        ...catalog.flatMap((config) => (config.kind === "balance" ? [config.account] : [])),
      ]),
    ]
      .filter(Boolean)
      .sort();
    const accounts = await repo.accountsByCodes(company, codes);
    const period = await repo.period(company, draft.date.slice(0, 7));
    const stamp = await repo.journalConfigurationStamp(company);
    const turnover = await repo.journalTurnover(company);
    const plan = buildJournalPlan({
      draft,
      company: configuration,
      period,
      accounts,
      catalog,
      original,
      corrections,
      turnover,
    });
    const { lines, ...draftHeader } = draft;
    const fingerprint = this.tools.hash([
      "journal-plan-v1",
      configuration,
      period,
      stamp,
      draftHeader,
      ...lines,
      ...accounts,
      ...catalog,
      ...corrections,
      ...plan.journals.flatMap((journal) => {
        const { lines, ...header } = journal;
        return [header, ...lines];
      }),
    ]);
    return { fingerprint, plan };
  }
  preview(company: string, id: string, revision: number) {
    checkedCode(company);
    checkedJournalId(id);
    checkedExpectedRevision(revision);
    return this.store.read((repo) => this.compute(repo, company, id, revision));
  }
  confirm(input: JournalConfirm): Promise<JournalReceipt> {
    checkedCode(input.company);
    checkedJournalId(input.draftId);
    checkedJournalId(input.idempotencyKey);
    checkedExpectedRevision(input.revision);
    if (input.confirmation !== "POST" || !/^[0-9a-f]{64}$/u.test(input.fingerprint))
      journalError("fingerprint", "shape");
    return this.store.write(async (repo) => {
      const previous = await repo.journalReceipt(input.company, input.idempotencyKey);
      if (previous) {
        if (
          previous.draftId !== input.draftId ||
          previous.draftRevision !== input.revision ||
          previous.fingerprint !== input.fingerprint
        )
          journalError("idempotencyKey", "source", true);
        return previous;
      }
      const current = await this.compute(repo, input.company, input.draftId, input.revision);
      if (current.fingerprint !== input.fingerprint) journalError("fingerprint", "stale", true);
      const postedAt = this.tools.now();
      const entries: JournalEntry[] = current.plan.journals.map((journal, index) => ({
        ...journal,
        id: index === 0 ? input.draftId : this.tools.id(),
        sourceRef: current.plan.sourceRef,
        operation: current.plan.operation,
        date: current.plan.date,
        memo: current.plan.memo,
        fingerprint: current.fingerprint,
        postedAt,
      }));
      const receipt: JournalReceipt = {
        company: input.company,
        sourceRef: current.plan.sourceRef,
        idempotencyKey: input.idempotencyKey,
        draftId: input.draftId,
        draftRevision: input.revision,
        fingerprint: input.fingerprint,
        operation: current.plan.operation,
        journalIds: entries.map((entry) => entry.id),
        postedAt,
      };
      await repo.insertJournalReceipt(receipt);
      for (const entry of entries) {
        await repo.insertJournalEntry(input.company, entry, input.idempotencyKey);
        if (current.plan.originalId)
          await repo.insertJournalCorrection(input.company, current.plan.originalId, entry);
      }
      await repo.insertJournalAudit(receipt);
      await repo.deleteJournalDraft(input.company, input.draftId, input.revision);
      return receipt;
    });
  }
}

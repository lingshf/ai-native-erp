import {
  DomainError,
  buildJournalPlan,
  checkedCode,
  checkedExpectedRevision,
  checkedJournalDraft,
  checkedJournalId,
  checkedPage,
  journalError,
  journalDates,
  type JournalDraft,
  type JournalEntry,
  type JournalCorrection,
  type JournalPlan,
  type JournalReceipt,
  type JournalSummary,
  type Page,
  type PageQuery,
  type DimensionMap,
} from "@erp/core/domain";
import { postingAdapters, type PostingAdapterRegistry } from "./posting-adapters.ts";
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
  insertHistoricalJournal(company: string, entry: JournalEntry, run: string): Promise<void>;
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
  private readonly adapters: PostingAdapterRegistry;
  constructor(
    store: MasterDataStore,
    tools: JournalTools,
    adapters: PostingAdapterRegistry = postingAdapters,
  ) {
    this.store = store;
    this.tools = tools;
    this.adapters = Object.freeze(
      Object.fromEntries(
        Object.entries(adapters).map(([module, grants]) => [
          checkedCode(module),
          Object.freeze([...grants]),
        ]),
      ),
    );
  }
  adapter(module: string) {
    if (!Object.hasOwn(this.adapters, module)) journalError("adapter", "manual");
    const adapter = {
      module,
      controlModules: this.adapters[module],
      periodModules: module === "TRADE" ? (["trade", "tax"] as const) : [],
    };
    return Object.freeze({
      preview: (company: string, draft: JournalDraft) => this.previewFor(company, draft, adapter),
      confirm: (input: JournalConfirm) => this.confirmFor(input, adapter),
      plan: (
        repo: MasterDataRepository,
        company: string,
        draft: JournalDraft,
        master: readonly DimensionMap[],
      ) => this.planFor(repo, company, draft, master, adapter),
    });
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
        businessEventId: await repo.journalBusinessEvent(company, id),
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
      const saved = { ...draft, ...journalDates(draft), revision: draft.revision + 1 };
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
  async plan(
    repo: MasterDataRepository,
    company: string,
    draft: JournalDraft,
    master: readonly DimensionMap[] = [],
  ): Promise<JournalPreview> {
    return this.planFor(repo, company, draft, master);
  }
  private async planFor(
    repo: MasterDataRepository,
    company: string,
    draft: JournalDraft,
    master: readonly DimensionMap[],
    adapter?: Parameters<typeof buildJournalPlan>[0]["adapter"],
  ): Promise<JournalPreview> {
    const configuration = required(await repo.company(company));
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
      master,
      ...(adapter ? { adapter } : {}),
    });
    const { lines, ...draftHeader } = draft;
    const fingerprint = this.tools.hash([
      "journal-plan-v1",
      adapter ?? null,
      configuration,
      period,
      stamp,
      { ...draftHeader, ...journalDates(draft) },
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
  preview(company: string, draft: JournalDraft) {
    return this.previewFor(company, draft);
  }
  private previewFor(
    company: string,
    draft: JournalDraft,
    adapter?: Parameters<typeof buildJournalPlan>[0]["adapter"],
  ) {
    checkedCode(company);
    checkedJournalDraft(draft);
    return this.store.read(async (repo) => {
      const saved = await repo.journalDraft(company, draft.id);
      if ((saved?.revision ?? 0) !== draft.revision || (await repo.journalEntry(company, draft.id)))
        journalError("revision", "stale", true);
      await this.manualSource(repo, company, draft);
      return this.planFor(repo, company, draft, [], adapter);
    });
  }
  confirm(input: JournalConfirm): Promise<JournalReceipt> {
    return this.confirmFor(input);
  }
  private confirmFor(
    input: JournalConfirm,
    adapter?: Parameters<typeof buildJournalPlan>[0]["adapter"],
  ): Promise<JournalReceipt> {
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
          previous.fingerprint !== input.fingerprint ||
          previous.module !== (adapter?.module ?? null) ||
          previous.operation === "period.close" ||
          (await repo.businessByReceipt(input.company, input.idempotencyKey))
        )
          journalError("idempotencyKey", "source", true);
        return previous;
      }
      const draft = required(await repo.journalDraft(input.company, input.draftId));
      if (draft.revision !== input.revision) journalError("revision", "stale", true);
      await this.manualSource(repo, input.company, draft);
      const current = await this.planFor(repo, input.company, draft, [], adapter);
      if (current.fingerprint !== input.fingerprint) journalError("fingerprint", "stale", true);
      const receipt = await this.commit(repo, current, input.idempotencyKey);
      await repo.deleteJournalDraft(input.company, input.draftId, input.revision);
      return receipt;
    });
  }
  private async manualSource(repo: MasterDataRepository, company: string, draft: JournalDraft) {
    if (await repo.journalSourceExists(company, draft.sourceRef))
      journalError("sourceRef", "source", true);
    if (draft.originalId && (await repo.journalBusinessEvent(company, draft.originalId)))
      journalError("originalId", "businessSource");
    if (draft.originalId && (await repo.isClosingJournal(company, draft.originalId)))
      journalError("originalId", "source", true);
  }
  private entries(current: JournalPreview, postedAt: string): JournalEntry[] {
    return current.plan.journals.map((journal, index) => ({
      ...journal,
      id: index === 0 ? current.plan.draftId : this.tools.id(),
      sourceRef: current.plan.sourceRef,
      operation: current.plan.operation,
      date: current.plan.date,
      documentDate: current.plan.documentDate,
      taxDate: current.plan.taxDate,
      module: current.plan.module,
      memo: current.plan.memo,
      fingerprint: current.fingerprint,
      postedAt,
    }));
  }
  async writeEntries(
    repo: MasterDataRepository,
    current: JournalPreview,
    key: string,
    entries: readonly JournalEntry[],
  ) {
    for (const entry of entries) {
      await repo.insertJournalEntry(current.plan.company, entry, key);
      if (current.plan.originalId)
        await repo.insertJournalCorrection(current.plan.company, current.plan.originalId, entry);
    }
  }
  async commit(
    repo: MasterDataRepository,
    current: JournalPreview,
    key: string,
    operation: JournalReceipt["operation"] = current.plan.operation,
  ): Promise<JournalReceipt> {
    const postedAt = this.tools.now();
    const entries = this.entries(current, postedAt);
    const receipt: JournalReceipt = {
      company: current.plan.company,
      sourceRef: current.plan.sourceRef,
      idempotencyKey: key,
      draftId: current.plan.draftId,
      draftRevision: current.plan.draftRevision,
      fingerprint: current.fingerprint,
      operation,
      module: current.plan.module,
      journalIds: entries.map((entry) => entry.id),
      postedAt,
    };
    await repo.insertJournalReceipt(receipt);
    await this.writeEntries(repo, current, key, entries);
    await repo.insertJournalAudit(receipt);
    return receipt;
  }
  async transfer(
    repo: MasterDataRepository,
    current: JournalPreview,
    key: string,
  ): Promise<readonly string[]> {
    const entries = this.entries(current, this.tools.now());
    await this.writeEntries(repo, current, key, entries);
    return entries.map((entry) => entry.id);
  }
  async importHistorical(
    repo: MasterDataRepository,
    company: string,
    draft: JournalDraft,
    provenance: { run: string; closing: boolean },
  ): Promise<JournalEntry> {
    checkedCode(company);
    checkedJournalId(provenance.run);
    const current = await this.adapter("LEGACY").plan(repo, company, draft, []);
    if (current.plan.journals.length !== 1) journalError("lines", "shape");
    const planned = current.plan.journals[0];
    if (
      planned.lines.length !== draft.lines.length ||
      planned.lines.some((line, index) => {
        const source = draft.lines[index];
        return (
          line.account !== source.account ||
          BigInt(line.debit) !== historicalMinor(source.debit, current.plan.scale) ||
          BigInt(line.credit) !== historicalMinor(source.credit, current.plan.scale) ||
          this.tools.hash([line.dimensions]) !== this.tools.hash([source.dimensions])
        );
      })
    )
      journalError("lines", "correction");
    if (provenance.closing && (draft.operation !== "journal" || draft.kind !== "normal"))
      journalError("operation", "shape");
    const entry = this.entries(current, this.tools.now())[0];
    const historical: JournalEntry = {
      ...entry,
      kind: provenance.closing ? "closing" : entry.kind,
    };
    await repo.insertHistoricalJournal(company, historical, provenance.run);
    if (draft.originalId) await repo.insertJournalCorrection(company, draft.originalId, historical);
    return historical;
  }
}

function historicalMinor(value: string, scale: number): bigint {
  const [whole, fraction = ""] = (value || "0").split(".");
  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

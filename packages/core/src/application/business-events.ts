import {
  DomainError,
  businessError,
  checkedBusinessMaster,
  checkedCode,
  checkedExpectedRevision,
  checkedJournalDay,
  checkedJournalDraft,
  checkedJournalId,
  checkedPage,
  journalError,
  statisticsQuantity,
  type BusinessEvent,
  type BusinessMaster,
  type PostingRule,
  type BusinessPreview,
  type BusinessRecord,
  type BusinessResult,
  type TransferQueueItem,
  type OpenClearingLine,
  type ClearingRef,
  type EventCommand,
  type JournalReceipt,
  type Page,
  type PageQuery,
  type DimensionMap,
} from "@erp/core/domain";
import { businessDraft, cashServiceCancelPlan, cashServicePlan } from "./business-event-cash.ts";
import {
  clearingMatchPreview,
  emptyBusinessPlan,
  statisticsPreview,
} from "./business-event-ledger.ts";
import { required } from "./business-event-plan.ts";
import { JournalService, type JournalTools, type JournalConfirm } from "./journals.ts";
import type { MasterDataRepository, MasterDataStore } from "./master-data.ts";
export type BusinessSummary = Pick<
  BusinessResult["event"],
  "id" | "sourceRef" | "date" | "memo" | "operation"
> & { readonly status: BusinessResult["status"]; readonly createdAt: string };
export type QueueSummary = Omit<TransferQueueItem, "plan">;
export interface BusinessRepository {
  businessMaster(
    company: string,
    kind: "service" | "party",
    code: string,
  ): Promise<BusinessMaster | null>;
  businessMasters(
    company: string,
    kind: "service" | "party",
    query: PageQuery,
  ): Promise<Page<BusinessMaster>>;
  saveBusinessMaster(
    company: string,
    kind: "service" | "party",
    value: BusinessMaster,
    expected: number,
  ): Promise<void>;
  postingRules(company: string, query: PageQuery): Promise<Page<PostingRule>>;
  postingCatalog(company: string): Promise<readonly PostingRule[]>;
  postingRule(company: string, code: string): Promise<PostingRule | null>;
  savePostingRule(company: string, value: PostingRule, expected: number): Promise<void>;
  businessHistory(
    company: string,
    kind: "service" | "party" | "rule",
    code: string,
    revision: number,
    snapshot: BusinessMaster | PostingRule,
    at: string,
  ): Promise<void>;
  businessStamp(company: string): Promise<number>;
  businessEvent(company: string, id: string): Promise<BusinessRecord | null>;
  businessByReceipt(company: string, key: string): Promise<string | null>;
  journalBusinessEvent(company: string, id: string): Promise<string | null>;
  businessCancelled(company: string, id: string): Promise<boolean>;
  businessEvents(company: string, query: PageQuery): Promise<Page<BusinessSummary>>;
  insertBusinessEvent(company: string, record: BusinessRecord): Promise<void>;
  linkBusinessJournal(company: string, eventId: string, journalId: string): Promise<void>;
  insertBusinessEffects(company: string, id: string, preview: BusinessPreview): Promise<void>;
  queueItem(company: string, id: string): Promise<TransferQueueItem | null>;
  queuePage(
    company: string,
    status: TransferQueueItem["status"],
    query: PageQuery,
  ): Promise<Page<QueueSummary>>;
  saveQueue(company: string, item: TransferQueueItem, expected: number): Promise<void>;
  pendingTransfers(company: string, month: string): Promise<boolean>;
  clearingLines(
    company: string,
    refs: readonly ClearingRef[],
  ): Promise<
    readonly (OpenClearingLine & { readonly matched: boolean; readonly balancing: boolean })[]
  >;
  openClearingLines(
    company: string,
    account: string,
    date: string,
    query: PageQuery,
  ): Promise<Page<OpenClearingLine>>;
  businessAudit(
    company: string,
    reference: string,
    action: string,
    details: Readonly<Record<string, unknown>>,
    at: string,
  ): Promise<void>;
}
function checkedEvent(event: BusinessEvent) {
  checkedJournalId(event.id);
  checkedJournalDay(event.date, "date");
  if (
    !event.sourceRef.trim() ||
    !/^[ -~]{1,100}$/u.test(event.sourceRef) ||
    !event.memo.trim() ||
    event.memo.length > 200
  )
    businessError("form", "shape");
  if (event.operation === "cash_service") {
    checkedCode(event.service);
    if (event.party !== null) checkedCode(event.party);
    if (!["receive", "pay"].includes(event.direction) || !/^[A-Z]{3}$/u.test(event.currency))
      businessError("direction", "shape");
  } else if (event.operation === "cash_service.cancel") checkedJournalId(event.originalId);
  else if (event.operation === "statistics") {
    checkedCode(event.code);
    statisticsQuantity(event.quantity);
    if (!event.unit.trim() || event.unit.length > 40) businessError("unit", "shape");
  } else if (event.operation === "clearing.match") {
    if (
      event.lines.length < 2 ||
      event.lines.length > 500 ||
      new Set(event.lines.map((line) => `${line.entryId}:${line.lineNo}`)).size !==
        event.lines.length
    )
      businessError("lines", "shape");
    for (const line of event.lines) {
      checkedJournalId(line.entryId);
      if (!Number.isInteger(line.lineNo) || line.lineNo < 1 || line.lineNo > 2000)
        businessError("lines", "shape");
    }
  } else businessError("operation", "shape");
}
export class BusinessEventService {
  private readonly journals: JournalService;
  private readonly store: MasterDataStore;
  private readonly tools: JournalTools;
  constructor(store: MasterDataStore, tools: JournalTools) {
    this.store = store;
    this.tools = tools;
    this.journals = new JournalService(store, tools);
  }
  async masters(company: string, kind: "service" | "party", query: PageQuery) {
    checkedCode(company);
    checkedPage(query);
    if (query.cursor) checkedCode(query.cursor);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.businessMasters(company, kind, query);
    });
  }
  async saveMaster(company: string, kind: "service" | "party", value: BusinessMaster) {
    checkedCode(company);
    checkedBusinessMaster(value);
    checkedExpectedRevision(value.revision);
    return this.store.write(async (repo) => {
      required(await repo.company(company));
      await this.dimensions(repo, company, value.dimensions);
      const old = await repo.businessMaster(company, kind, value.code);
      if ((old?.revision ?? 0) !== value.revision) businessError("revision", "stale", true);
      const next = { ...value, revision: value.revision + 1 };
      checkedExpectedRevision(next.revision);
      await repo.saveBusinessMaster(company, kind, next, value.revision);
      await repo.businessHistory(company, kind, next.code, next.revision, next, this.tools.now());
      return next;
    });
  }
  rules(company: string, query: PageQuery) {
    checkedCode(company);
    checkedPage(query);
    if (query.cursor) checkedCode(query.cursor);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.postingRules(company, query);
    });
  }
  saveRule(company: string, value: PostingRule) {
    checkedCode(company);
    checkedCode(value.code);
    checkedExpectedRevision(value.revision);
    checkedJournalDay(value.from, "from");
    checkedJournalDay(value.to, "to");
    if (
      value.from > value.to ||
      !["receive", "pay"].includes(value.direction) ||
      !["cash", "offset"].includes(value.meaning)
    )
      businessError("form", "shape");
    for (const [scope, code] of [
      [value.objectScope, value.objectCode],
      [value.partyScope, value.partyCode],
    ]) {
      if (!["exact", "group", "all"].includes(scope)) businessError("scope", "shape");
      if (scope === "all") {
        if (code !== "*") businessError("match", "shape");
      } else checkedCode(code);
    }
    return this.store.write(async (repo) => {
      required(await repo.company(company));
      required(await repo.account(company, value.account));
      if (value.objectScope === "exact")
        required(await repo.businessMaster(company, "service", value.objectCode));
      if (value.partyScope === "exact")
        required(await repo.businessMaster(company, "party", value.partyCode));
      await this.dimensions(repo, company, value.dimensions);
      const old = await repo.postingRule(company, value.code);
      if ((old?.revision ?? 0) !== value.revision) businessError("revision", "stale", true);
      if (!old && (await repo.postingCatalog(company)).length >= 5000)
        businessError("rules", "limit");
      const next = { ...value, revision: value.revision + 1 };
      checkedExpectedRevision(next.revision);
      await repo.savePostingRule(company, next, value.revision);
      await repo.businessHistory(company, "rule", next.code, next.revision, next, this.tools.now());
      return next;
    });
  }
  private async dimensions(repo: MasterDataRepository, company: string, map: DimensionMap) {
    if (Object.keys(map).length > 32) businessError("dimensions", "limit");
    const catalog = await repo.dimensionCatalog(company);
    const definitions = new Set(
      catalog.filter((item) => item.kind === "dimension").map((item) => item.code),
    );
    const values = new Set(
      catalog
        .filter((item) => item.kind === "value")
        .map((item) => `${item.dimension}:${item.code}`),
    );
    for (const [key, value] of Object.entries(map))
      if (!definitions.has(key) || (value !== null && !values.has(`${key}:${value}`)))
        businessError(`dimensions.${key}`, "reference");
  }
  private async fresh(repo: MasterDataRepository, company: string, event: EventCommand) {
    if (
      (await repo.businessEvent(company, event.id)) ||
      (await repo.journalEntry(company, event.id)) ||
      (await repo.journalSourceExists(company, event.sourceRef))
    )
      businessError("sourceRef", "source", true);
  }
  private async compute(
    repo: MasterDataRepository,
    company: string,
    event: EventCommand,
  ): Promise<BusinessPreview> {
    const owner = required(await repo.company(company));
    const period = await repo.period(company, event.date.slice(0, 7));
    if (!period || period.status !== "open") journalError("date", "period");
    // Queued journals keep the journal plan's own fingerprint; no business fingerprint is added.
    if (event.operation === "journal") {
      const current = await this.journals.plan(repo, company, event);
      return { ...current, matches: [], statistics: null, clearing: [] };
    }
    // Draft and empty ledger plan read the event before any branch awaits, as before the split.
    const draft = businessDraft(event);
    const ledger = { company, owner, period };
    const { current, matches, statistics, clearing, evidence } =
      event.operation === "cash_service"
        ? await cashServicePlan(repo, this.journals, company, owner, event, draft)
        : event.operation === "cash_service.cancel"
          ? await cashServiceCancelPlan(repo, this.journals, company, event, draft)
          : event.operation === "statistics"
            ? await statisticsPreview(
                repo,
                this.tools,
                ledger,
                event,
                emptyBusinessPlan(company, owner, event),
              )
            : await clearingMatchPreview(
                repo,
                this.tools,
                ledger,
                event,
                emptyBusinessPlan(company, owner, event),
              );
    // `fingerprint` keeps the key position it has in `current`.
    return {
      ...current,
      fingerprint: this.tools.hash([
        "business-plan-v1",
        company,
        event,
        current.fingerprint,
        await repo.businessStamp(company),
        matches,
        statistics,
        clearing,
        evidence,
      ]),
      matches,
      statistics,
      clearing,
    };
  }
  preview(company: string, event: BusinessEvent) {
    checkedCode(company);
    checkedEvent(event);
    return this.store.read(async (repo) => {
      await this.fresh(repo, company, event);
      return this.compute(repo, company, event);
    });
  }
  private async result(
    repo: MasterDataRepository,
    company: string,
    id: string,
  ): Promise<BusinessResult> {
    const record = required(await repo.businessEvent(company, id));
    const queue = await repo.queueItem(company, id);
    const status =
      queue?.status ??
      (record.event.operation === "cash_service" && (await repo.businessCancelled(company, id))
        ? "cancelled"
        : record.receipt.journalIds.length
          ? "posted"
          : "recorded");
    return { ...record, status, journalIds: queue?.journalIds ?? record.receipt.journalIds, queue };
  }
  detail(company: string, id: string) {
    checkedCode(company);
    checkedJournalId(id);
    return this.store.read((repo) => this.result(repo, company, id));
  }
  list(company: string, query: PageQuery) {
    checkedCode(company);
    checkedPage(query);
    if (query.cursor) checkedJournalId(query.cursor);
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.businessEvents(company, query);
    });
  }
  confirm(input: {
    company: string;
    event: BusinessEvent;
    fingerprint: string;
    idempotencyKey: string;
    confirmation: "POST";
  }) {
    checkedCode(input.company);
    checkedEvent(input.event);
    checkedJournalId(input.idempotencyKey);
    if (input.confirmation !== "POST" || !/^[a-f0-9]{64}$/u.test(input.fingerprint))
      businessError("confirmation", "shape");
    return this.store.write(async (repo) => {
      const previous = await repo.journalReceipt(input.company, input.idempotencyKey);
      if (previous) {
        const id = await repo.businessByReceipt(input.company, input.idempotencyKey);
        const record = id ? await repo.businessEvent(input.company, id) : null;
        if (
          !record ||
          record.receipt.fingerprint !== input.fingerprint ||
          this.tools.hash([record.event]) !== this.tools.hash([input.event])
        )
          businessError("idempotencyKey", "source", true);
        return this.result(repo, input.company, record.event.id);
      }
      await this.fresh(repo, input.company, input.event);
      const preview = await this.compute(repo, input.company, input.event);
      if (preview.fingerprint !== input.fingerprint) businessError("fingerprint", "stale", true);
      const receipt = await this.journals.commit(
        repo,
        preview,
        input.idempotencyKey,
        input.event.operation,
      );
      await repo.insertBusinessEvent(input.company, {
        event: input.event,
        preview,
        receipt,
        createdAt: receipt.postedAt,
      });
      for (const id of receipt.journalIds)
        await repo.linkBusinessJournal(input.company, input.event.id, id);
      await repo.insertBusinessEffects(input.company, input.event.id, preview);
      return this.result(repo, input.company, input.event.id);
    });
  }
  enqueue(input: Omit<JournalConfirm, "confirmation"> & { readonly confirmation: "QUEUE" }) {
    checkedCode(input.company);
    checkedJournalId(input.draftId);
    checkedJournalId(input.idempotencyKey);
    checkedExpectedRevision(input.revision);
    if (input.confirmation !== "QUEUE" || !/^[a-f0-9]{64}$/u.test(input.fingerprint))
      businessError("confirmation", "shape");
    return this.store.write(async (repo) => {
      const previous = await repo.journalReceipt(input.company, input.idempotencyKey);
      if (previous) {
        const id = await repo.businessByReceipt(input.company, input.idempotencyKey);
        if (
          !id ||
          id !== input.draftId ||
          previous.fingerprint !== input.fingerprint ||
          previous.draftRevision !== input.revision ||
          !(await repo.queueItem(input.company, id))
        )
          businessError("idempotencyKey", "source", true);
        return this.result(repo, input.company, id);
      }
      const event = required(await repo.journalDraft(input.company, input.draftId));
      checkedJournalDraft(event);
      if (event.operation !== "journal" || event.originalId || event.revision !== input.revision)
        businessError("draftId", "stale", true);
      const command = { ...event, operation: "journal" as const };
      await this.fresh(repo, input.company, command);
      const preview = await this.compute(repo, input.company, command);
      if (preview.fingerprint !== input.fingerprint) businessError("fingerprint", "stale", true);
      const receipt: JournalReceipt = {
        company: input.company,
        sourceRef: event.sourceRef,
        idempotencyKey: input.idempotencyKey,
        draftId: event.id,
        draftRevision: event.revision,
        fingerprint: preview.fingerprint,
        operation: "journal",
        journalIds: [],
        module: null,
        postedAt: this.tools.now(),
      };
      await repo.insertJournalReceipt(receipt);
      await repo.insertBusinessEvent(input.company, {
        event: command,
        preview,
        receipt,
        createdAt: receipt.postedAt,
      });
      await repo.saveQueue(
        input.company,
        {
          id: event.id,
          sourceRef: event.sourceRef,
          date: event.date,
          memo: event.memo,
          status: "pending",
          createdAt: receipt.postedAt,
          revision: 1,
          journalIds: [],
          fingerprint: null,
          plan: null,
          error: null,
          reason: null,
        },
        0,
      );
      await repo.insertJournalAudit(receipt);
      await repo.deleteJournalDraft(input.company, event.id, event.revision);
      return this.result(repo, input.company, event.id);
    });
  }
  queue(company: string, status: TransferQueueItem["status"], query: PageQuery) {
    checkedCode(company);
    checkedPage(query);
    if (!["pending", "failed", "transferred", "withdrawn"].includes(status))
      businessError("status", "shape");
    if (
      query.cursor &&
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z~[a-f0-9-]{36}$/u.test(query.cursor)
    )
      businessError("cursor", "shape");
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.queuePage(company, status, query);
    });
  }
  transferPreview(company: string, id: string) {
    checkedCode(company);
    checkedJournalId(id);
    return this.store.read(async (repo) => {
      const item = required(await repo.queueItem(company, id));
      if (!["pending", "failed"].includes(item.status)) businessError("status", "queue", true);
      return this.compute(repo, company, required(await repo.businessEvent(company, id)).event);
    });
  }
  async transfer(company: string, id: string, fingerprint: string, confirmation: "TRANSFER") {
    checkedCode(company);
    checkedJournalId(id);
    if (confirmation !== "TRANSFER" || !/^[a-f0-9]{64}$/u.test(fingerprint))
      businessError("confirmation", "shape");
    try {
      return await this.store.write(async (repo) => {
        const item = required(await repo.queueItem(company, id));
        if (item.status === "transferred") {
          if (item.fingerprint !== fingerprint) businessError("fingerprint", "source", true);
          return this.result(repo, company, id);
        }
        if (!["pending", "failed"].includes(item.status)) businessError("status", "queue", true);
        const record = required(await repo.businessEvent(company, id));
        const preview = await this.compute(repo, company, record.event);
        if (preview.fingerprint !== fingerprint) businessError("fingerprint", "stale", true);
        const ids = await this.journals.transfer(repo, preview, record.receipt.idempotencyKey);
        for (const journalId of ids) await repo.linkBusinessJournal(company, id, journalId);
        await repo.saveQueue(
          company,
          {
            ...item,
            revision: item.revision + 1,
            status: "transferred",
            fingerprint,
            plan: preview.plan,
            journalIds: ids,
            error: null,
          },
          item.revision,
        );
        await repo.businessAudit(
          company,
          record.event.sourceRef,
          "transfer.complete",
          { journalIds: ids, fingerprint },
          this.tools.now(),
        );
        return this.result(repo, company, id);
      });
    } catch (error) {
      await this.store.write(async (repo) => {
        const item = await repo.queueItem(company, id);
        if (item && ["pending", "failed"].includes(item.status)) {
          await repo.saveQueue(
            company,
            {
              ...item,
              status: "failed",
              revision: item.revision + 1,
              error: error instanceof DomainError ? error.code : "STORAGE_FAILURE",
            },
            item.revision,
          );
          await repo.businessAudit(
            company,
            item.sourceRef,
            "transfer.failed",
            { error: error instanceof DomainError ? error.code : "STORAGE_FAILURE" },
            this.tools.now(),
          );
        }
      });
      throw error;
    }
  }
  withdraw(company: string, id: string, reason: string, confirmation: "WITHDRAW") {
    checkedCode(company);
    checkedJournalId(id);
    if (confirmation !== "WITHDRAW" || !reason.trim() || reason.length > 200)
      businessError("reason", "shape");
    return this.store.write(async (repo) => {
      const item = required(await repo.queueItem(company, id));
      if (item.status === "withdrawn" && item.reason === reason.trim())
        return this.result(repo, company, id);
      if (!["pending", "failed"].includes(item.status)) businessError("status", "queue", true);
      await repo.saveQueue(
        company,
        {
          ...item,
          status: "withdrawn",
          revision: item.revision + 1,
          reason: reason.trim(),
          error: null,
        },
        item.revision,
      );
      await repo.businessAudit(
        company,
        item.sourceRef,
        "transfer.withdraw",
        { reason: reason.trim() },
        this.tools.now(),
      );
      return this.result(repo, company, id);
    });
  }
  openItems(company: string, account: string, date: string, query: PageQuery) {
    checkedCode(company);
    checkedJournalDay(date, "date");
    checkedPage(query);
    if (
      !/^[1-9]\d{3}$/u.test(account) ||
      (query.cursor && !/^[a-f0-9-]{36}:[1-9]\d{0,3}$/u.test(query.cursor))
    )
      businessError("form", "shape");
    return this.store.read(async (repo) => {
      required(await repo.company(company));
      return repo.openClearingLines(company, account, date, query);
    });
  }
}

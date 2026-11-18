import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  BusinessEventService,
  JournalService,
  MasterDataService,
  DimensionService,
} from "@erp/core/application";
import type { BusinessEvent, CashServiceEvent, JournalDraft, Account } from "@erp/core/domain";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
describe("business events on real SQLite", () => {
  let directory: string,
    filename: string,
    store: ReturnType<typeof createMasterDataStore>,
    events: BusinessEventService,
    master: MasterDataService,
    journals: JournalService;
  const base = () => ({
    id: randomUUID(),
    sourceRef: `EVENT-${randomUUID()}`,
    date: "2026-01-15",
    memo: "Synthetic business",
  });
  const cash = (changes: Partial<CashServiceEvent> = {}): CashServiceEvent => ({
    ...base(),
    operation: "cash_service",
    direction: "receive",
    service: "S",
    party: null,
    currency: "CNY",
    amount: "9.14",
    dimensions: {},
    ...changes,
  });
  const draft = (): JournalDraft => ({
    ...base(),
    revision: 0,
    operation: "journal",
    originalId: null,
    kind: "normal",
    headerDimensions: {},
    lines: [
      { account: "1000", debit: "10", credit: "", dimensions: {}, suspense: null },
      { account: "3000", debit: "", credit: "10", dimensions: {}, suspense: null },
    ],
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-business-"));
    filename = join(directory, "ledger.sqlite");
    const storage = createSqliteStorage({ filename });
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore({ filename });
    master = new MasterDataService(store);
    events = new BusinessEventService(store, journalTools);
    journals = new JournalService(store, journalTools);
    await master.createCompany({
      code: "A",
      name: "A",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    await events.saveMaster("A", "service", {
      code: "S",
      name: "Consulting",
      group: "G",
      active: true,
      revision: 0,
      dimensions: {},
    });
    for (const direction of ["receive", "pay"] as const)
      for (const meaning of ["cash", "offset"] as const)
        await events.saveRule("A", {
          code: `${direction.toUpperCase()}_${meaning.toUpperCase()}`,
          active: true,
          revision: 0,
          direction,
          meaning,
          objectScope: "all",
          objectCode: "*",
          partyScope: "all",
          partyCode: "*",
          account: meaning === "cash" ? "1000" : direction === "receive" ? "4000" : "5000",
          dimensions: {},
          from: "2026-01-01",
          to: "2026-12-31",
        });
  });
  afterEach(async () => {
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  function counts() {
    const db = new Database(filename, { readonly: true });
    try {
      return Object.fromEntries(
        [
          "receipts",
          "audit",
          "journal_entries",
          "journal_lines",
          "journal_drafts",
          "business_events",
          "statistics_facts",
          "business_clearing_links",
          "transfer_queue",
        ].map((table) => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]),
      );
    } finally {
      db.close();
    }
  }
  async function changeAccount(code: string, patch: Partial<Account>) {
    const { builtin: _, revision, ...old } = await master.account("A", code);
    return master.saveAccount("A", { ...old, ...patch }, revision);
  }
  async function envelope(event: BusinessEvent) {
    const preview = await events.preview("A", event);
    return {
      company: "A",
      event,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    };
  }
  async function accept(event: BusinessEvent) {
    return events.confirm(await envelope(event));
  }
  async function post(input: JournalDraft) {
    const saved = await journals.save("A", input);
    const preview = await journals.preview("A", saved);
    return journals.confirm({
      company: "A",
      draftId: saved.id,
      revision: saved.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    });
  }
  async function enqueue() {
    const saved = await journals.save("A", draft());
    const preview = await journals.preview("A", saved);
    const input = {
      company: "A",
      draftId: saved.id,
      revision: saved.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "QUEUE" as const,
    };
    return { result: await events.enqueue(input), input };
  }
  it("keeps cash previews read-only, revalidates current winning accounts and ABA, posts receipts/payments exactly once and replays after restart/close", async () => {
    const event = cash();
    const before = counts();
    const old = await envelope(event);
    expect(counts()).toEqual(before);
    await changeAccount("1000", { name: "Changed" });
    await changeAccount("1000", { name: "Cash" });
    await expect(events.confirm(old)).rejects.toMatchObject({
      code: "CONFLICT",
      issue: { rule: "stale" },
    });
    const input = await envelope(event);
    const [result, duplicate] = await Promise.all([events.confirm(input), events.confirm(input)]);
    expect(duplicate).toEqual(result);
    expect(
      (await journals.entry("A", result.journalIds[0])).entry.lines.map((line) => [
        line.account,
        line.debit,
        line.credit,
      ]),
    ).toEqual([
      ["1000", 914, 0],
      ["4000", 0, 914],
    ]);
    const payment = await accept(cash({ direction: "pay", amount: "5.00" }));
    expect(
      (await journals.entry("A", payment.journalIds[0])).entry.lines.map((line) => [
        line.account,
        line.debit,
        line.credit,
      ]),
    ).toEqual([
      ["1000", 0, 500],
      ["5000", 500, 0],
    ]);
    const strongest = (await events.rules("A", { limit: 100 })).items.find(
      (rule) => rule.code === "RECEIVE_CASH",
    )!;
    const dimensions = new DimensionService(store);
    const common = { active: true, revision: 0, from: "2026-01-01", to: "2026-12-31" };
    await dimensions.save("A", { ...common, kind: "dimension", code: "DEPT", name: "Department" });
    for (const code of ["PARTY", "SERVICE", "RULE", "EVENT"])
      await dimensions.save("A", { ...common, kind: "value", dimension: "DEPT", code, name: code });
    await events.saveMaster("A", "party", {
      code: "P",
      name: "Party",
      group: "PG",
      active: true,
      revision: 0,
      dimensions: { DEPT: "PARTY" },
    });
    let service = (await events.masters("A", "service", { limit: 100 })).items[0];
    for (const [serviceMap, ruleMap, eventMap, expected] of [
      [{}, {}, {}, "PARTY"],
      [{ DEPT: "SERVICE" }, {}, {}, "SERVICE"],
      [{ DEPT: "SERVICE" }, { DEPT: "RULE" }, {}, "RULE"],
      [{ DEPT: "SERVICE" }, { DEPT: "RULE" }, { DEPT: "EVENT" }, "EVENT"],
    ] as const) {
      service = await events.saveMaster("A", "service", { ...service, dimensions: serviceMap });
      const current = (await events.rules("A", { limit: 100 })).items.find(
        (rule) => rule.code === strongest.code,
      )!;
      await events.saveRule("A", { ...current, dimensions: ruleMap });
      const preview = await events.preview("A", cash({ party: "P", dimensions: eventMap }));
      expect(preview.plan.journals[0].lines[0].dimensions.DEPT).toBe(expected);
    }
    await events.saveRule("A", {
      ...strongest,
      code: "INVALID_WINNER",
      revision: 0,
      objectScope: "exact",
      objectCode: "S",
      account: "5000",
    });
    await expect(events.preview("A", cash())).rejects.toMatchObject({ issue: { rule: "account" } });
    await master.setPeriod("A", "2026-01", 1, "frozen", "Closed", true);
    await store.close();
    store = createMasterDataStore({ filename });
    events = new BusinessEventService(store, journalTools);
    expect(await events.confirm(input)).toEqual(result);
    await expect(
      events.confirm({ ...input, event: { ...event, memo: "Different input" } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(counts()).toMatchObject({ business_events: 2, journal_entries: 2, receipts: 2 });
  });
  it("cancels the source cash event with exact D6 history despite disabled accounts/values, preserves the correction chain and rejects repeated or cross-company cancellation", async () => {
    const dimensions = new DimensionService(store),
      common = { active: true, revision: 0, from: "2026-01-01", to: "2026-12-31" };
    await dimensions.save("A", { ...common, kind: "dimension", code: "DEPT", name: "Department" });
    const value = await dimensions.save("A", {
      ...common,
      kind: "value",
      dimension: "DEPT",
      code: "X",
      name: "X",
    });
    const sale = await accept(cash({ dimensions: { DEPT: "X" } }));
    const original = (await journals.entry("A", sale.journalIds[0])).entry;
    await changeAccount("1000", { active: false, manualAllowed: false });
    await dimensions.save("A", { ...value, active: false });
    const cancel: BusinessEvent = {
      ...base(),
      operation: "cash_service.cancel",
      originalId: sale.event.id,
    };
    await expect(events.preview("A", { ...cancel, date: "2026-01-14" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const manual = {
      ...draft(),
      operation: "reverse" as const,
      originalId: original.id,
      lines: [],
    };
    await expect(journals.preview("A", manual)).rejects.toMatchObject({
      issue: { rule: "businessSource" },
    });
    const result = await accept(cancel),
      reversed = (await journals.entry("A", result.journalIds[0])).entry;
    expect(
      reversed.lines.map((line) => [line.account, line.debit, line.credit, line.dimensions]),
    ).toEqual(
      original.lines.map((line) => [line.account, line.credit, line.debit, line.dimensions]),
    );
    expect((await journals.entry("A", original.id)).chain[0].outputId).toBe(reversed.id);
    expect((await events.detail("A", sale.event.id)).status).toBe("cancelled");
    await expect(events.preview("A", { ...cancel, ...base() })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await master.createCompany({
      code: "B",
      name: "B",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    await expect(events.preview("B", { ...cancel, ...base() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("records signed exact six-place statistics without GL and rolls back acceptance/evidence when a new fact write fails", async () => {
    const event: BusinessEvent = {
      ...base(),
      operation: "statistics",
      code: "HOURS",
      quantity: "-3.125",
      unit: "hours",
      dimensions: {},
    };
    const input = await envelope(event),
      before = counts();
    const db = new Database(filename);
    try {
      db.exec(
        "CREATE TRIGGER inject_stat BEFORE INSERT ON statistics_facts BEGIN SELECT RAISE(ABORT,'injected fact'); END",
      );
      await expect(events.confirm(input)).rejects.toBeDefined();
      expect(counts()).toEqual(before);
      db.exec("DROP TRIGGER inject_stat");
      const result = await events.confirm(input);
      expect(result).toMatchObject({
        status: "recorded",
        journalIds: [],
        preview: { statistics: { quantity: -3125000, scale: 6, unit: "hours" } },
      });
      expect(db.prepare("SELECT quantity_minor FROM statistics_facts").get()).toEqual({
        quantity_minor: -3125000,
      });
      expect(counts()).toMatchObject({ journal_entries: 0, receipts: 1, statistics_facts: 1 });
      for (const [quantity, exact] of [
        ["0", 0],
        ["2.000001", 2000001],
      ] as const) {
        const fact = await accept({ ...event, ...base(), quantity });
        expect(fact.preview.statistics?.quantity).toBe(exact);
        expect(fact.journalIds).toEqual([]);
      }
      expect(() => db.exec("UPDATE statistics_facts SET quantity_minor=1")).toThrow();
      expect(() => db.exec("DELETE FROM business_events")).toThrow();
    } finally {
      db.close();
    }
    expect(() => events.preview("A", { ...event, ...base(), quantity: "1.0000001" })).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ rule: "quantity" }) }),
    );
    expect(() => events.preview("A", { ...event, ...base(), quantity: "9007199255" })).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ rule: "quantity" }) }),
    );
  });
  it("matches complete same-company source clearing lines at zero residual, pages open items and atomically reserves every selected line", async () => {
    const { builtin: _, revision: __, ...account } = await master.account("A", "1000");
    await master.saveAccount(
      "A",
      { ...account, code: "1280", name: "Cash clearing", purpose: "clearing" },
      0,
    );
    const first = draft();
    first.lines = [{ ...first.lines[0], account: "1280" }, first.lines[1]];
    const second = draft();
    second.lines = [second.lines[0], { ...second.lines[1], account: "1280" }];
    const a = await post(first),
      b = await post(second);
    const refs = [
      { entryId: a.journalIds[0], lineNo: 1 },
      { entryId: b.journalIds[0], lineNo: 2 },
    ];
    const open = await events.openItems("A", "1280", "2026-01-15", { limit: 1 });
    expect(open.items).toHaveLength(1);
    expect(
      (await events.openItems("A", "1280", "2026-01-15", { limit: 1, cursor: open.nextCursor! }))
        .items[0].entryId,
    ).not.toBe(open.items[0].entryId);
    const event: BusinessEvent = {
      ...base(),
      operation: "clearing.match",
      account: "1280",
      lines: refs,
    };
    await expect(events.preview("A", { ...event, date: "2026-01-14" })).rejects.toMatchObject({
      issue: { rule: "line" },
    });
    const input = await envelope(event),
      before = counts(),
      db = new Database(filename);
    try {
      db.exec(
        "CREATE TRIGGER inject_link BEFORE INSERT ON business_clearing_links WHEN NEW.line_no=2 BEGIN SELECT RAISE(ABORT,'injected link'); END",
      );
      await expect(events.confirm(input)).rejects.toBeDefined();
      expect(counts()).toEqual(before);
      db.exec("DROP TRIGGER inject_link");
      expect(await events.confirm(input)).toMatchObject({ status: "recorded", journalIds: [] });
    } finally {
      db.close();
    }
    expect((await events.openItems("A", "1280", "2026-01-15", { limit: 100 })).items).toEqual([]);
    await expect(events.preview("A", { ...event, ...base() })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(counts()).toMatchObject({ journal_entries: 2, business_clearing_links: 2 });
  });
  it("keeps queue acceptance immutable, revalidates transfer under current rules, persists failed/withdrawn states and transfers once after an explicit fresh preview", async () => {
    const queued = await enqueue();
    expect(queued.result).toMatchObject({ status: "pending", journalIds: [] });
    expect(counts()).toMatchObject({ journal_entries: 0, journal_drafts: 0, receipts: 1 });
    await expect(
      master.setPeriod("A", "2026-01", 1, "frozen", "Closing", true),
    ).rejects.toMatchObject({ issue: { rule: "pending" } });
    await changeAccount("1000", { active: false });
    await expect(events.transferPreview("A", queued.result.event.id)).rejects.toMatchObject({
      issue: { rule: "account" },
    });
    await changeAccount("1000", { active: true });
    await expect(
      events.transfer("A", queued.result.event.id, queued.result.preview.fingerprint, "TRANSFER"),
    ).rejects.toMatchObject({ issue: { rule: "stale" } });
    expect((await events.detail("A", queued.result.event.id)).status).toBe("failed");
    const preview = await events.transferPreview("A", queued.result.event.id),
      db = new Database(filename);
    try {
      db.exec(
        "CREATE TRIGGER inject_transfer BEFORE INSERT ON journal_lines BEGIN SELECT RAISE(ABORT,'injected transfer'); END",
      );
      await expect(
        events.transfer("A", queued.result.event.id, preview.fingerprint, "TRANSFER"),
      ).rejects.toBeDefined();
      expect(counts()).toMatchObject({ journal_entries: 0, receipts: 1 });
      db.exec("DROP TRIGGER inject_transfer");
      const [done, retry] = await Promise.all([
        events.transfer("A", queued.result.event.id, preview.fingerprint, "TRANSFER"),
        events.transfer("A", queued.result.event.id, preview.fingerprint, "TRANSFER"),
      ]);
      expect(retry).toEqual(done);
      expect(done.receipt).toEqual(queued.result.receipt);
      expect(done.status).toBe("transferred");
      expect((await journals.entry("A", done.journalIds[0])).businessEventId).toBeNull();
      await expect(
        journals.preview("A", {
          ...draft(),
          operation: "reverse",
          originalId: done.journalIds[0],
          lines: [],
        }),
      ).resolves.toMatchObject({ plan: { operation: "reverse" } });
      expect(counts()).toMatchObject({ journal_entries: 1, receipts: 1 });
      expect(() => db.exec("UPDATE transfer_queue SET status='failed'")).toThrow();
      expect(
        db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM transfer_queue WHERE company_id=? AND status=? AND (created_at,id)>(?,?) ORDER BY created_at,id LIMIT ?",
          )
          .all("A", "pending", "", "", 101)
          .map((row) => row.detail)
          .join(" "),
      ).toMatch(/SEARCH .*transfer_queue_status_created/u);
    } finally {
      db.close();
    }
    const withdrawn = await enqueue();
    const withdrawal = await events.withdraw(
      "A",
      withdrawn.result.event.id,
      "Wrong source",
      "WITHDRAW",
    );
    const afterWithdrawal = counts();
    expect(
      await events.withdraw("A", withdrawn.result.event.id, "Wrong source", "WITHDRAW"),
    ).toEqual(withdrawal);
    expect(counts()).toEqual(afterWithdrawal);
    await expect(
      events.withdraw("A", withdrawn.result.event.id, "Changed reason", "WITHDRAW"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      events.transfer(
        "A",
        withdrawn.result.event.id,
        withdrawn.result.preview.fingerprint,
        "TRANSFER",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await events.enqueue(withdrawn.input)).status).toBe("withdrawn");
    expect(counts()).toMatchObject({ journal_entries: 1 });
    await enqueue();
    await enqueue();
    const page = await events.queue("A", "pending", { limit: 1 });
    expect(
      (await events.queue("A", "pending", { limit: 1, cursor: page.nextCursor! })).items[0].id,
    ).not.toBe(page.items[0].id);
  });
});

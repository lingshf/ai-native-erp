import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DimensionService,
  JournalService,
  MasterDataService,
  StorageError,
  type MasterDataStore,
} from "@erp/core/application";
import type { JournalDraft, Account } from "@erp/core/domain";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";

function journalDraft(changes: Partial<JournalDraft> = {}): JournalDraft {
  return {
    id: randomUUID(),
    revision: 0,
    sourceRef: `MANUAL-${randomUUID()}`,
    date: "2026-01-15",
    memo: "Manual capital",
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [
      { account: "1100", debit: "53.27", credit: "", dimensions: {}, suspense: null },
      { account: "3000", debit: "", credit: "53.27", dimensions: {}, suspense: null },
    ],
    ...changes,
  };
}
describe("journal application on real SQLite", () => {
  let directory: string,
    filename: string,
    store: ReturnType<typeof createMasterDataStore>,
    master: MasterDataService,
    dimensions: DimensionService,
    service: JournalService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-journals-"));
    filename = join(directory, "ledger.sqlite");
    const storage = createSqliteStorage({ filename });
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore({ filename });
    master = new MasterDataService(store);
    dimensions = new DimensionService(store);
    service = new JournalService(store, journalTools);
    await master.initialize(2026);
    const { builtin: _, revision: __, ...cash } = await master.account("DEFAULT", "1000");
    await master.saveAccount("DEFAULT", { ...cash, code: "1100", name: "Bank" }, 0);
  });
  afterEach(async () => {
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const counts = () => {
    const db = new Database(filename, { readonly: true });
    try {
      return Object.fromEntries(
        [
          "journal_drafts",
          "journal_entries",
          "journal_lines",
          "journal_corrections",
          "receipts",
          "audit",
          "config_history",
          "dimension_history",
        ].map((table) => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]),
      );
    } finally {
      db.close();
    }
  };
  async function changeAccount(code: string, changes: Partial<Account>) {
    const { builtin: _, revision, ...account } = await master.account("DEFAULT", code);
    return master.saveAccount("DEFAULT", { ...account, ...changes }, revision);
  }
  async function preview(draft: JournalDraft) {
    const saved = await service.save("DEFAULT", draft);
    const result = await service.preview("DEFAULT", saved.id, saved.revision);
    return {
      saved,
      result,
      input: {
        company: "DEFAULT",
        draftId: saved.id,
        revision: saved.revision,
        fingerprint: result.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST" as const,
      },
    };
  }
  async function accept(draft: JournalDraft) {
    const p = await preview(draft);
    return service.confirm(p.input);
  }

  it("keeps preview read-only, enforces draft CAS and durable idempotency, and uses indexed identities", async () => {
    const unused = await service.save("DEFAULT", journalDraft());
    await expect(service.save("DEFAULT", unused)).resolves.toMatchObject({ revision: 2 });
    await expect(service.remove("DEFAULT", unused.id, 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await service.remove("DEFAULT", unused.id, 2);
    const draft = await service.save("DEFAULT", journalDraft());
    await expect(service.save("DEFAULT", { ...draft, revision: 0 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const before = counts();
    const result = await service.preview("DEFAULT", draft.id, draft.revision);
    expect(counts()).toEqual(before);
    const input = {
      company: "DEFAULT",
      draftId: draft.id,
      revision: draft.revision,
      fingerprint: result.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST" as const,
    };
    const [receipt, duplicate] = await Promise.all([
      service.confirm(input),
      service.confirm(input),
    ]);
    expect(duplicate).toEqual(receipt);
    expect(counts()).toMatchObject({
      journal_drafts: 0,
      journal_entries: 1,
      journal_lines: 2,
      receipts: 1,
      audit: 1,
    });
    await expect(service.confirm({ ...input, fingerprint: "0".repeat(64) })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(service.save("DEFAULT", { ...draft, revision: 0 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await store.close();
    store = createMasterDataStore({ filename });
    service = new JournalService(store, journalTools);
    master = new MasterDataService(store);
    await master.setPeriod("DEFAULT", "2026-01", 1, "frozen", "Closed for review", true);
    expect(await service.confirm(input)).toEqual(receipt);
    const db = new Database(filename, { readonly: true });
    try {
      for (const [sql, args] of [
        [
          "SELECT result FROM receipts WHERE company_id=? AND idempotency_key=?",
          ["DEFAULT", input.idempotencyKey],
        ],
        [
          "SELECT 1 FROM receipts WHERE company_id=? AND source_ref=?",
          ["DEFAULT", draft.sourceRef],
        ],
      ] as const) {
        const detail = db
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all(...args)
          .map((row) => row.detail)
          .join(" ");
        expect(detail).toMatch(/SEARCH receipts USING .*INDEX/u);
        expect(detail).not.toMatch(/SCAN receipts/u);
      }
      const turnoverPlan = db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT s.turnover_minor FROM journal_entries e JOIN journal_seals s ON s.company_id=e.company_id AND s.entry_id=e.id WHERE e.company_id=? ORDER BY e.sequence DESC LIMIT 1",
        )
        .all("DEFAULT")
        .map((row) => row.detail)
        .join(" ");
      expect(turnoverPlan).toMatch(/SEARCH e USING INDEX journal_entries_recent/u);
      expect(turnoverPlan).not.toMatch(/\bSCAN\b/u);
    } finally {
      db.close();
    }
  });
  it("rejects stale/ABA configuration, changed drafts, duplicate sources and cross-company correction or key reuse", async () => {
    const p = await preview(journalDraft());
    await changeAccount("1100", { name: "Renamed" });
    await changeAccount("1100", { name: "Bank" });
    await expect(service.confirm(p.input)).rejects.toMatchObject({
      code: "CONFLICT",
      issue: { rule: "stale" },
    });
    const fresh = await service.preview("DEFAULT", p.saved.id, p.saved.revision);
    const edited = await service.save("DEFAULT", { ...p.saved, memo: "Edited" });
    await expect(
      service.confirm({ ...p.input, fingerprint: fresh.fingerprint }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const final = await service.preview("DEFAULT", edited.id, edited.revision);
    const input = { ...p.input, revision: edited.revision, fingerprint: final.fingerprint };
    const receipt = await service.confirm(input);
    const other = await service.save("DEFAULT", journalDraft({ sourceRef: edited.sourceRef }));
    await expect(service.preview("DEFAULT", other.id, other.revision)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await master.createCompany({
      code: "OTHER",
      name: "Other",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    const wrong = await service.save(
      "OTHER",
      journalDraft({ operation: "reverse", originalId: receipt.journalIds[0], lines: [] }),
    );
    await expect(service.preview("OTHER", wrong.id, wrong.revision)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const otherDraft = await service.save(
      "OTHER",
      journalDraft({
        lines: journalDraft().lines.map((line) => ({
          ...line,
          account: line.account === "1100" ? "1000" : line.account,
        })),
      }),
    );
    const otherPlan = await service.preview("OTHER", otherDraft.id, otherDraft.revision);
    await expect(
      service.confirm({
        ...input,
        company: "OTHER",
        draftId: otherDraft.id,
        revision: otherDraft.revision,
        fingerprint: otherPlan.fingerprint,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(counts()).toMatchObject({ journal_entries: 1, receipts: 1, audit: 1 });
  });
  it("preserves incomplete drafts but validates exact money, open periods, active accounts, source grants and suspense evidence before posting", async () => {
    const base = journalDraft();
    for (const [lines, issue] of [
      [[{ ...base.lines[0], debit: "53.271" }, base.lines[1]], { rule: "money" }],
      [[{ ...base.lines[0], debit: "53.26" }, base.lines[1]], { rule: "balance" }],
      [[{ ...base.lines[0], debit: "90071992547409.92" }, base.lines[1]], { rule: "money" }],
    ] as const) {
      const saved = await service.save("DEFAULT", journalDraft({ lines }));
      await expect(service.preview("DEFAULT", saved.id, saved.revision)).rejects.toMatchObject({
        issue,
      });
    }
    const p = await preview(base);
    await changeAccount("1100", { active: false });
    await expect(service.preview("DEFAULT", p.saved.id, p.saved.revision)).rejects.toMatchObject({
      issue: { rule: "account" },
    });
    await expect(service.confirm(p.input)).rejects.toMatchObject({ issue: { rule: "account" } });
    await changeAccount("1100", {
      active: true,
      purpose: "control",
      controlModule: "AP",
      manualAllowed: false,
    });
    await expect(service.preview("DEFAULT", p.saved.id, p.saved.revision)).rejects.toMatchObject({
      issue: { rule: "manual" },
    });
    await changeAccount("1100", { purpose: "suspense", controlModule: null, manualAllowed: true });
    await expect(service.preview("DEFAULT", p.saved.id, p.saved.revision)).rejects.toMatchObject({
      issue: { rule: "suspense" },
    });
    const fixed = await service.save("DEFAULT", {
      ...p.saved,
      lines: p.saved.lines.map((line) => ({
        ...line,
        suspense: { owner: "Local operator", reason: "Investigate", reviewDate: "2026-02-01" },
      })),
    });
    await expect(service.preview("DEFAULT", fixed.id, fixed.revision)).resolves.toHaveProperty(
      "fingerprint",
    );
    const maximum = await preview(
      journalDraft({
        lines: [
          { ...base.lines[0], account: "1000", debit: "90071992547409.91" },
          { ...base.lines[1], account: "3000", credit: "90071992547409.91" },
        ],
      }),
    );
    await service.confirm(maximum.input);
    const extra = await service.save(
      "DEFAULT",
      journalDraft({
        lines: [
          { ...base.lines[0], account: "1000", debit: "0.01" },
          { ...base.lines[1], account: "3000", credit: "0.01" },
        ],
      }),
    );
    await expect(service.preview("DEFAULT", extra.id, extra.revision)).rejects.toMatchObject({
      issue: { scope: "journals", rule: "money" },
    });
    await master.setPeriod("DEFAULT", "2026-01", 1, "frozen", "Review", true);
    await expect(service.preview("DEFAULT", fixed.id, fixed.revision)).rejects.toMatchObject({
      issue: { rule: "period" },
    });
    expect(counts()).toMatchObject({ journal_entries: 1, receipts: 1, audit: 1 });
  });
  it("revalidates generated clearing rows and preserves exact historical reversals under D6", async () => {
    const common = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
    await dimensions.save("DEFAULT", {
      ...common,
      kind: "dimension",
      code: "DEPT",
      name: "Department",
    });
    for (const code of ["A", "B"])
      await dimensions.save("DEFAULT", {
        ...common,
        kind: "value",
        dimension: "DEPT",
        code,
        name: code,
      });
    const { builtin: _, revision: __, ...cash } = await master.account("DEFAULT", "1100");
    await master.saveAccount(
      "DEFAULT",
      {
        ...cash,
        code: "1900",
        name: "Internal clearing",
        purpose: "clearing",
        manualAllowed: false,
      },
      0,
    );
    await dimensions.save("DEFAULT", {
      ...common,
      kind: "balance",
      code: "LEDGER",
      account: "1900",
      dimension: "DEPT",
    });
    const draft = journalDraft({
      lines: journalDraft().lines.map((line, index) => ({
        ...line,
        dimensions: { DEPT: index ? "B" : "A" },
      })),
    });
    const p = await preview(draft);
    expect(p.result.plan.journals[0].lines.map((line) => line.role)).toEqual([
      "business",
      "business",
      "balance",
      "balance",
    ]);
    await changeAccount("1900", { active: false });
    await expect(service.preview("DEFAULT", p.saved.id, p.saved.revision)).rejects.toMatchObject({
      issue: { scope: "journals", rule: "balanceAccount" },
    });
    await expect(service.confirm(p.input)).rejects.toMatchObject({
      issue: { rule: "balanceAccount" },
    });
    await changeAccount("1900", { active: true, purpose: "general" });
    await expect(service.preview("DEFAULT", p.saved.id, p.saved.revision)).rejects.toMatchObject({
      issue: { rule: "balanceAccount" },
    });
    await changeAccount("1900", { purpose: "clearing" });
    await dimensions.save("DEFAULT", {
      ...common,
      kind: "structure",
      code: "1900",
      required: ["DEPT"],
      optional: [],
      forbidden: [],
      allowed: [],
      fixed: { DEPT: "A" },
      conditionals: [],
    });
    await expect(service.preview("DEFAULT", p.saved.id, p.saved.revision)).rejects.toMatchObject({
      issue: { scope: "dimensions", rule: "conflict" },
    });
    await dimensions.save("DEFAULT", {
      ...common,
      revision: 1,
      active: false,
      kind: "structure",
      code: "1900",
      required: [],
      optional: [],
      forbidden: [],
      allowed: [],
      fixed: {},
      conditionals: [],
    });
    const valid = await service.preview("DEFAULT", p.saved.id, p.saved.revision);
    const accepted = await service.confirm({ ...p.input, fingerprint: valid.fingerprint });
    await changeAccount("1100", { active: false, manualAllowed: false });
    await changeAccount("1900", { active: false });
    await dimensions.save("DEFAULT", {
      ...common,
      revision: 1,
      active: false,
      kind: "value",
      dimension: "DEPT",
      code: "A",
      name: "A",
    });
    const reverse = await preview(
      journalDraft({
        operation: "reverse",
        originalId: accepted.journalIds[0],
        date: "2026-02-01",
        lines: [],
      }),
    );
    const reversed = reverse.result.plan.journals[0].lines;
    expect(
      reversed.map((line) => [line.account, line.debit, line.credit, line.dimensions]),
    ).toEqual(
      valid.plan.journals[0].lines.map((line) => [
        line.account,
        line.credit,
        line.debit,
        line.dimensions,
      ]),
    );
    await service.confirm(reverse.input);
    const twice = await service.save(
      "DEFAULT",
      journalDraft({
        operation: "reverse",
        originalId: accepted.journalIds[0],
        date: "2026-02-01",
        lines: [],
      }),
    );
    await expect(service.preview("DEFAULT", twice.id, twice.revision)).rejects.toMatchObject({
      code: "CONFLICT",
      issue: { rule: "correction" },
    });
  });
  it("rolls back every write stage without consuming the draft, receipt or audit", async () => {
    const p = await preview(journalDraft());
    const before = counts();
    for (const stage of ["receipt", "entry", "audit", "draft"]) {
      const broken: MasterDataStore = {
        read: (work) => store.read(work),
        write: (work) =>
          store.write((repo) =>
            work({
              ...repo,
              async insertJournalReceipt(...args) {
                await repo.insertJournalReceipt(...args);
                if (stage === "receipt") throw new StorageError("STORAGE_FAILURE");
              },
              async insertJournalEntry(...args) {
                await repo.insertJournalEntry(...args);
                if (stage === "entry") throw new StorageError("STORAGE_FAILURE");
              },
              async insertJournalAudit(...args) {
                await repo.insertJournalAudit(...args);
                if (stage === "audit") throw new StorageError("STORAGE_FAILURE");
              },
              async deleteJournalDraft(...args) {
                await repo.deleteJournalDraft(...args);
                if (stage === "draft") throw new StorageError("STORAGE_FAILURE");
              },
            }),
          ),
      };
      await expect(new JournalService(broken, journalTools).confirm(p.input)).rejects.toMatchObject(
        { code: "STORAGE_FAILURE" },
      );
      expect(counts()).toEqual(before);
    }
    await expect(service.confirm(p.input)).resolves.toHaveProperty("journalIds", [p.saved.id]);
  });
  it("traces reversible reclassification and both replacement outputs, enforces chronology, and atomically seals immutable GL", async () => {
    const original = (await accept(journalDraft())).journalIds[0];
    const allocation = journalDraft({
      operation: "reclassify",
      originalId: original,
      date: "2026-03-01",
      lines: journalDraft().lines.map((line) => ({
        ...line,
        account: line.account === "1100" ? "1000" : line.account,
      })),
    });
    const reclass = await accept(allocation);
    await accept(
      journalDraft({
        operation: "reverse",
        originalId: reclass.journalIds[0],
        date: "2026-06-01",
        lines: [],
      }),
    );
    const early = await service.save("DEFAULT", {
      ...allocation,
      id: randomUUID(),
      sourceRef: "EARLY",
      date: "2026-04-01",
    });
    await expect(service.preview("DEFAULT", early.id, early.revision)).rejects.toMatchObject({
      issue: { rule: "correction" },
    });
    const partial = await service.save("DEFAULT", {
      ...allocation,
      id: randomUUID(),
      sourceRef: "PARTIAL",
      date: "2026-06-01",
      lines: allocation.lines.map((line) => ({
        ...line,
        debit: line.debit ? "50" : "",
        credit: line.credit ? "50" : "",
      })),
    });
    await expect(service.preview("DEFAULT", partial.id, partial.revision)).rejects.toMatchObject({
      issue: { rule: "amount" },
    });
    const replacement = await preview({
      ...partial,
      id: randomUUID(),
      revision: 0,
      sourceRef: "REPLACE",
      operation: "replace",
    });
    const before = counts();
    let inserts = 0;
    const broken: MasterDataStore = {
      read: (work) => store.read(work),
      write: (work) =>
        store.write((repo) =>
          work({
            ...repo,
            async insertJournalEntry(...args) {
              await repo.insertJournalEntry(...args);
              if (++inserts === 2) throw new StorageError("STORAGE_FAILURE");
            },
          }),
        ),
    };
    await expect(
      new JournalService(broken, journalTools).confirm(replacement.input),
    ).rejects.toMatchObject({ code: "STORAGE_FAILURE" });
    expect(counts()).toEqual(before);
    const replaced = await service.confirm(replacement.input);
    expect(replaced.journalIds).toHaveLength(2);
    await accept(
      journalDraft({
        operation: "reverse",
        originalId: replaced.journalIds[1],
        date: "2026-06-01",
        lines: [],
      }),
    );
    const detail = await service.entry("DEFAULT", original);
    expect(new Set(detail.chain.map((edge) => edge.outputId))).toEqual(
      new Set([
        ...reclass.journalIds,
        ...replaced.journalIds,
        ...(await service.list("DEFAULT", "posted", { limit: 100 })).items
          .filter((item) => item.operation === "reverse")
          .map((item) => item.id),
      ]),
    );
    const db = new Database(filename);
    try {
      db.pragma("foreign_keys = ON");
      for (const table of [
        "journal_entries",
        "journal_lines",
        "journal_seals",
        "journal_corrections",
        "receipts",
        "audit",
      ]) {
        expect(() => db.prepare(`DELETE FROM ${table}`).run()).toThrow(/immutable/u);
      }
      expect(() =>
        db
          .prepare(
            "INSERT INTO journal_lines SELECT company_id,entry_id,1999,period,account_code,debit_minor,credit_minor,dimensions,evidence FROM journal_lines LIMIT 1",
          )
          .run(),
      ).toThrow(/immutable/u);
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });
});

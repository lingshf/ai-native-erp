import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { beforeEach, afterEach, it, expect } from "vitest";
import {
  MasterDataService,
  JournalService,
  PeriodCloseService,
  ReportService,
  BusinessEventService,
} from "@erp/core/application";
import { closingJournals, type JournalDraft, type CloseCommand } from "@erp/core/domain";
import { closePreviewSchema, closeResultSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { createApi } from "../../src/http/index.ts";
let directory: string,
  filename: string,
  store: ReturnType<typeof createMasterDataStore>,
  master: MasterDataService,
  journals: JournalService,
  closing: PeriodCloseService,
  reports: ReportService,
  api: Awaited<ReturnType<typeof createApi>>,
  base: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-close-"));
  filename = join(directory, "ledger.sqlite");
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  store = createMasterDataStore({ filename });
  master = new MasterDataService(store);
  journals = new JournalService(store, journalTools);
  closing = new PeriodCloseService(store, journalTools);
  reports = new ReportService(store);
  await master.initialize(2026);
  api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    masterData: master,
    journals,
    closing,
    reports,
  });
  base = await api.listen();
});
afterEach(async () => {
  await api?.close();
  await store?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
function draft(
  date = "2026-01-15",
  amount = "10",
  debit = "1000",
  credit = "4000",
  kind: "normal" | "adjusting" = "normal",
): JournalDraft {
  return {
    id: randomUUID(),
    revision: 0,
    sourceRef: randomUUID(),
    date,
    memo: "Synthetic close test",
    kind,
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [
      { account: debit, debit: amount, credit: "", dimensions: {}, suspense: null },
      { account: credit, debit: "", credit: amount, dimensions: {}, suspense: null },
    ],
  };
}
async function post(company: string, input: JournalDraft) {
  const saved = await journals.save(company, input),
    preview = await journals.preview(company, saved);
  return journals.confirm({
    company,
    draftId: saved.id,
    revision: saved.revision,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
}
const command = (company: string, month: string, revision = 1): CloseCommand => ({
  company,
  month,
  revision,
  commandId: randomUUID(),
});
function counts() {
  const db = new Database(filename, { readonly: true });
  try {
    return Object.fromEntries(
      [
        "journal_drafts",
        "journal_entries",
        "journal_lines",
        "journal_seals",
        "receipts",
        "audit",
        "config_history",
        "periods",
        "period_closes",
        "period_closing_journals",
      ].map((table) => [table, db.prepare(`SELECT count(*) n FROM ${table}`).get().n]),
    );
  } finally {
    db.close();
  }
}
async function request(path: string, body: unknown, method = "POST") {
  return fetch(`${base}/api/v1/${path}`, {
    method,
    ...(method === "GET"
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}
async function close(input: CloseCommand) {
  const { month, ...body } = input;
  const previewResponse = await request(`periods/${month}/close-preview`, body);
  expect(previewResponse.status).toBe(200);
  const preview = closePreviewSchema.parse(await previewResponse.json());
  const confirmation = {
    ...body,
    fingerprint: preview.fingerprint,
    confirmation: "CLOSE" as const,
  };
  const response = await request(`periods/${month}/close`, confirmation);
  expect(response.status).toBe(200);
  return { result: closeResultSchema.parse(await response.json()), confirmation };
}
it("closes monthly through zero-write preview, atomic/idempotent confirmation, pinned three-stage reports and next-period commands", async () => {
  await post("DEFAULT", draft("2026-01-10", "100"));
  await post("DEFAULT", draft("2026-01-11", "20", "5000", "1000"));
  const events = new BusinessEventService(store, journalTools);
  const saved = await journals.save("DEFAULT", draft()),
    queuedPreview = await journals.preview("DEFAULT", saved);
  const blocked = command("DEFAULT", "2026-01");
  expect((await closing.preview(blocked)).blockers).toEqual(["drafts"]);
  const queued = await events.enqueue({
    company: "DEFAULT",
    draftId: saved.id,
    revision: saved.revision,
    fingerprint: queuedPreview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "QUEUE",
  });
  const queuedClose = await closing.preview(blocked);
  expect(queuedClose.blockers).toEqual(["queue"]);
  await expect(
    closing.confirm({ ...blocked, fingerprint: queuedClose.fingerprint, confirmation: "CLOSE" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await events.withdraw("DEFAULT", queued.event.id, "Not required", "WITHDRAW");
  const first = await closing.preview(blocked);
  await post("DEFAULT", draft("2026-01-12", "5", "5000", "1000", "adjusting"));
  await expect(
    closing.confirm({ ...blocked, fingerprint: first.fingerprint, confirmation: "CLOSE" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const afterPost = await closing.preview(blocked);
  const { builtin: _, revision: __, ...cash } = await master.account("DEFAULT", "1000");
  await master.saveAccount("DEFAULT", { ...cash, code: "1599", name: "Synthetic" }, 0);
  await expect(
    closing.confirm({ ...blocked, fingerprint: afterPost.fingerprint, confirmation: "CLOSE" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    reports.report("DEFAULT", "2026-01", "adjusted", afterPost.snapshot),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await master.setPeriod("DEFAULT", "2026-01", 1, "frozen", "Review", false);
  expect((await closing.preview(command("DEFAULT", "2026-02"))).blockers).toContain("priorPeriods");
  await expect(closing.openNext("DEFAULT", "2026-01", 2)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  const input = command("DEFAULT", "2026-01", 2),
    before = counts(),
    preview = await closing.preview(input);
  expect(counts()).toEqual(before);
  expect(preview).toMatchObject({
    action: "close",
    date: "2026-01-31",
    netProfit: 7500,
    blockers: [],
  });
  expect(preview.lines.every((line) => Object.keys(line.dimensions).length === 0)).toBe(true);
  const historical = await Promise.all(
    (["unadjusted", "adjusted", "postClosing"] as const).map((stage) =>
      reports.report("DEFAULT", "2026-01", stage),
    ),
  );
  const oldLedger = await reports.ledger("DEFAULT", "4000", "2026-01", {
    limit: 100,
    stage: "postClosing",
  });
  const db = new Database(filename);
  db.exec(
    "CREATE TRIGGER fail_close BEFORE INSERT ON period_closes BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END",
  );
  try {
    await expect(
      closing.confirm({ ...input, fingerprint: preview.fingerprint, confirmation: "CLOSE" }),
    ).rejects.toThrow();
  } finally {
    db.exec("DROP TRIGGER fail_close");
    db.close();
  }
  expect(counts()).toEqual(before);
  expect((await master.periods("DEFAULT", { limit: 1 })).items[0]).toMatchObject({
    status: "frozen",
    revision: 2,
  });
  const { result, confirmation } = await close(input),
    after = counts();
  expect(result).toMatchObject({
    period: { status: "closed", revision: 3 },
    receipt: { operation: "period.close" },
  });
  const retry = await request("periods/2026-01/close", confirmation);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(result);
  expect(counts()).toEqual(after);
  expect(
    (await request("periods/2026-01/close", { ...confirmation, fingerprint: "0".repeat(64) }))
      .status,
  ).toBe(409);
  expect(
    (
      await request("periods/2026-02/close-preview", {
        company: "DEFAULT",
        revision: 1,
        commandId: randomUUID(),
        extra: true,
      })
    ).status,
  ).toBe(400);
  expect((await request("periods/2026-01/close", {}, "GET")).status).toBe(405);
  await expect(
    journals.confirm({
      company: "DEFAULT",
      draftId: input.commandId,
      revision: input.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: input.commandId,
      confirmation: "POST",
    }),
  ).rejects.toThrow();
  const closingId = result.receipt.journalIds[0];
  expect((await journals.entry("DEFAULT", closingId)).entry.kind).toBe("closing");
  await expect(
    journals.preview("DEFAULT", {
      ...draft("2026-02-01"),
      operation: "reverse",
      originalId: closingId,
      lines: [],
    }),
  ).rejects.toThrow();
  await expect(journals.preview("DEFAULT", draft())).rejects.toThrow();
  await expect(master.setPeriod("DEFAULT", "2026-01", 3, "open", "Reopen", true)).rejects.toThrow();
  for (const old of historical)
    expect(await reports.report("DEFAULT", "2026-01", old.stage, old)).toEqual(old);
  expect(
    await reports.ledger("DEFAULT", "4000", "2026-01", {
      limit: 100,
      stage: "postClosing",
      watermark: oldLedger.watermark,
      accountRevision: oldLedger.accountRevision,
    }),
  ).toEqual(oldLedger);
  const adjusted = await reports.report("DEFAULT", "2026-01", "adjusted"),
    closed = await reports.report("DEFAULT", "2026-01", "postClosing");
  expect(closed.income.month).toEqual(adjusted.income.month);
  expect(closed.income.month.profit).toBe(7500);
  expect(closed.balanceSheet.equity).toBe(adjusted.balanceSheet.equity);
  expect(
    closed.trial.rows
      .filter((row) => ["REVENUE", "EXPENSE"].includes(row.category))
      .every((row) => row.closing === 0),
  ).toBe(true);
  expect(closed.trial.rows.find((row) => row.code === "4000")).toMatchObject({
    closing: 0,
    incomeNet: -10000,
  });
  const owner = (await master.companies({ limit: 1 })).items[0],
    revenue = adjusted.trial.rows.find((row) => row.code === "4000"),
    retained = adjusted.trial.rows.find((row) => row.code === "3100");
  if (!owner || !revenue || !retained) throw new Error("Missing synthetic chart");
  const chunks = closingJournals(owner, "2026-01", [
    ...Array.from({ length: 1000 }, (_, index) => ({
      ...revenue,
      code: String(2000 + index),
      opening: 0,
      debit: 0,
      credit: 1,
      closing: -1,
      yearNet: -1,
    })),
    retained,
  ]);
  expect(chunks.journals.map((journal) => journal.lines.length)).toEqual([1000, 2]);
  expect(chunks.netProfit).toBe(1000);
  expect(chunks.journals.every((journal) => journal.debit === journal.credit)).toBe(true);
  expect(
    (await reports.reconciliation("DEFAULT", "2026-01", "postClosing")).reconciliation.allPass,
  ).toBe(true);
  expect(
    (await reports.ledger("DEFAULT", "4000", "2026-01", { limit: 100, stage: "postClosing" }))
      .closing,
  ).toBe(0);
  expect((await reports.ledger("DEFAULT", "4000", "2026-01", { limit: 100 })).closing).toBe(-10000);
  for (let i = 0; i < 2; i++)
    expect(await closing.openNext("DEFAULT", "2026-01", 3)).toMatchObject({
      month: "2026-02",
      status: "open",
      revision: 1,
    });
  await post("DEFAULT", draft("2026-02-01", "10"));
  await post("DEFAULT", draft("2026-02-02", "10", "5000", "1000"));
  const february = await close(command("DEFAULT", "2026-02"));
  expect(february.result.preview).toMatchObject({ netProfit: 0, date: "2026-02-28" });
  expect(february.result.preview.lines.map((line) => line.account)).toEqual(["4000", "5000"]);
  const beforeEmpty = counts(),
    empty = await close(command("DEFAULT", "2026-03"));
  expect(empty.result.receipt.journalIds).toEqual([]);
  expect(counts().journal_entries).toBe(beforeEmpty.journal_entries);
});
it("freezes annual months without GL, revalidates unfreezes, closes the year once and advances across year boundaries", async () => {
  await master.createCompany({
    code: "A",
    name: "Annual",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual",
  });
  await post("A", draft("2026-01-15", "30"));
  const before = counts(),
    january = await close(command("A", "2026-01"));
  expect(january.result).toMatchObject({
    preview: { action: "freeze", lines: [] },
    period: { status: "frozen" },
  });
  expect(counts().journal_entries).toBe(before.journal_entries);
  await expect(journals.preview("A", draft())).rejects.toThrow();
  const pin = await reports.report("A", "2026-01");
  await master.setPeriod("A", "2026-01", 2, "open", "Explicit unfreeze", true);
  const february = command("A", "2026-02"),
    blocked = await closing.preview(february);
  expect(blocked.blockers).toContain("priorPeriods");
  await expect(
    closing.confirm({ ...february, fingerprint: blocked.fingerprint, confirmation: "CLOSE" }),
  ).rejects.toThrow();
  await close(command("A", "2026-01", 3));
  for (let month = 2; month < 12; month++)
    await close(command("A", `2026-${String(month).padStart(2, "0")}`));
  await post("A", draft("2026-12-15", "7", "5000", "1000"));
  const { builtin: _, revision, ...retained } = await master.account("A", "3100");
  await master.saveAccount("A", { ...retained, active: false }, revision);
  await expect(closing.preview(command("A", "2026-12"))).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await master.saveAccount("A", retained, revision + 1);
  const { builtin: __, revision: salesRevision, ...sales } = await master.account("A", "4000");
  await master.saveAccount("A", { ...sales, active: false }, salesRevision);
  const saved = await journals.save("A", draft("2026-12-20")),
    blockedDecember = await closing.preview(command("A", "2026-12"));
  expect(blockedDecember.blockers).toContain("drafts");
  await journals.remove("A", saved.id, saved.revision);
  const december = await close(command("A", "2026-12"));
  expect(december.result.preview).toMatchObject({
    action: "close",
    date: "2026-12-31",
    netProfit: 2300,
  });
  expect((await reports.report("A", "2026-12", "postClosing")).income.ytd.profit).toBe(2300);
  expect((await reports.reconciliation("A", "2026-12", "postClosing")).reconciliation.allPass).toBe(
    true,
  );
  const periods = await master.periods("A", { limit: 100 });
  expect(periods.items).toHaveLength(12);
  expect(periods.items.every((period) => period.status === "closed")).toBe(true);
  await expect(
    master.setPeriod("A", "2026-01", 5, "open", "Cannot reopen year", true),
  ).rejects.toThrow();
  await expect(journals.preview("A", draft("2026-12-31", "1", "5000", "1000"))).rejects.toThrow();
  await expect(reports.report("A", "2026-01", "adjusted", pin)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  const count = counts().config_history;
  for (let i = 0; i < 2; i++) {
    const response = await request("periods/2026-12/open-next", { company: "A", revision: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ month: "2027-01", status: "open", revision: 1 });
  }
  expect(counts().config_history).toBe(count + 1);
  const guard = new Database(filename);
  try {
    expect(() =>
      guard
        .prepare("INSERT INTO period_closing_journals VALUES(?,?)")
        .run("A", pin.trial.rows[0]?.code),
    ).toThrow();
    const ordinary = guard
      .prepare("SELECT id FROM journal_entries WHERE company_id='A' AND period='2026-01'")
      .get();
    expect(() =>
      guard.prepare("INSERT INTO period_closing_journals VALUES(?,?)").run("A", ordinary.id),
    ).toThrow(/invalid closing source/u);
    expect(() =>
      guard.prepare("UPDATE period_closes SET revision=999 WHERE company_id='A'").run(),
    ).toThrow(/immutable/u);
  } finally {
    guard.close();
  }
});

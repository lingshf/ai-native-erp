import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  JournalService,
  MasterDataService,
  ReportService,
  DimensionService,
} from "@erp/core/application";
import type { JournalDraft } from "@erp/core/domain";
import { reportSchema, ledgerSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { REPORT_BALANCES_SQL, LEDGER_ROWS_SQL } from "../../src/storage/reports.ts";
import { createApi } from "../../src/http/index.ts";

let directory: string,
  filename: string,
  store: ReturnType<typeof createMasterDataStore>,
  master: MasterDataService,
  journals: JournalService,
  reports: ReportService;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-reports-"));
  filename = join(directory, "fixture.sqlite");
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  store = createMasterDataStore({ filename });
  master = new MasterDataService(store);
  journals = new JournalService(store, journalTools);
  reports = new ReportService(store);
  await master.createCompany({
    code: "A",
    name: "A",
    currency: "CNY",
    scale: 2,
    year: 2026,
    closeMode: "annual",
  });
});
afterEach(async () => {
  await store?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function post(
  date: string,
  amount: string,
  debit = "1000",
  credit = "4000",
  kind: "normal" | "adjusting" = "normal",
  dimensions: Record<string, string> = {},
) {
  const draft: JournalDraft = {
    id: randomUUID(),
    revision: 0,
    sourceRef: randomUUID(),
    date,
    memo: "Synthetic report",
    kind,
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [
      { account: debit, debit: amount, credit: "", dimensions, suspense: null },
      { account: credit, debit: "", credit: amount, dimensions, suspense: null },
    ],
  };
  const saved = await journals.save("A", draft),
    preview = await journals.preview("A", saved);
  await journals.confirm({
    company: "A",
    draftId: saved.id,
    revision: saved.revision,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
  return saved.id;
}
it("reconciles multiple periods/stages, contra groups and current configuration against actual GL", async () => {
  await master.saveAccount(
    "A",
    {
      code: "1500",
      name: "Allowance",
      category: "ASSET",
      reportGroup: "cash",
      normalSide: "CREDIT",
      purpose: "general",
      controlModule: null,
      contraOf: "1000",
      manualAllowed: true,
      active: true,
    },
    0,
  );
  await post("2026-01-03", "100.03", "1000", "3000");
  await post("2026-01-05", "31.29");
  await post("2026-01-07", "5.03", "5000", "1000");
  await post("2026-02-01", "4.17", "5000", "1500", "adjusting");
  await post("2026-02-02", "2.11", "4000", "1000");
  await post("2026-03-01", "1.01");
  const account = await master.account("A", "1500");
  await master.saveAccount("A", { ...account, active: false }, account.revision);
  const db = new Database(filename, { readonly: true });
  try {
    const lines = db
      .prepare(
        "SELECT l.*,e.kind FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id",
      )
      .all() as {
      account_code: string;
      period: string;
      kind: string;
      debit_minor: number;
      credit_minor: number;
    }[];
    for (const month of ["2026-01", "2026-02", "2026-03"])
      for (const stage of ["unadjusted", "adjusted", "postClosing"] as const) {
        const report = reportSchema.parse(await reports.report("A", month, stage));
        expect(report.reconciliation.allPass).toBe(true);
        const selected = lines.filter(
          (line) =>
            line.period <= month &&
            (stage !== "unadjusted" || line.period < month || line.kind !== "adjusting"),
        );
        for (const [measure, subset] of [
          [report.income.month, selected.filter((line) => line.period === month)],
          [report.income.ytd, selected.filter((line) => line.period >= `${month.slice(0, 4)}-01`)],
        ] as const) {
          const revenue = subset
            .filter((line) => line.account_code === "4000")
            .reduce((sum, line) => sum + line.credit_minor - line.debit_minor, 0);
          const expense = subset
            .filter((line) => line.account_code === "5000")
            .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0);
          expect(measure).toEqual({ revenue, expense, profit: revenue - expense });
        }
        for (const row of report.trial.rows) {
          const selected = lines.filter(
            (line) =>
              line.account_code === row.code &&
              line.period <= month &&
              (stage !== "unadjusted" || line.period < month || line.kind !== "adjusting"),
          );
          expect(row.opening).toBe(
            selected
              .filter((line) => line.period < month)
              .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
          );
          expect(row.closing).toBe(
            selected.reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
          );
          expect(row.debit).toBe(
            selected
              .filter((line) => line.period === month)
              .reduce((sum, line) => sum + line.debit_minor, 0),
          );
          expect(row.credit).toBe(
            selected
              .filter((line) => line.period === month)
              .reduce((sum, line) => sum + line.credit_minor, 0),
          );
        }
        for (const group of report.groups)
          expect(group.closing).toBe(
            report.trial.rows
              .filter((row) => row.reportGroup === group.reportGroup)
              .reduce(
                (sum, row) =>
                  sum + row.closing * (["ASSET", "EXPENSE"].includes(row.category) ? 1 : -1),
                0,
              ),
          );
      }
    const feb = await reports.report("A", "2026-02");
    expect(feb.contraGroups[0]).toMatchObject({ account: "1000", contra: 417 });
    expect(feb.trial.rows.find((row) => row.code === "1500")).toMatchObject({
      active: false,
      normalBalance: 417,
      abnormal: false,
    });
    expect(
      await reports.ledger("A", "1500", "2026-02", { limit: 1, stage: "unadjusted" }),
    ).toMatchObject({ total: 0, closing: 0 });
    // Historical balances survive a year boundary even before the closing slice exists.
    db.close();
    const write = new Database(filename);
    try {
      write.prepare("INSERT INTO periods VALUES('A','2027-01','open',1)").run();
    } finally {
      write.close();
    }
    const next = await reports.report("A", "2027-01");
    expect(next.income.ytd.profit).toBe(0);
    expect(next.balanceSheet).toEqual((await reports.report("A", "2026-03")).balanceSheet);
    expect(next.reconciliation.allPass).toBe(true);
  } finally {
    if (db.open) db.close();
  }
});
it("pages chronological same-entry lines with exact running balances and a stable watermark, scoped dimensions and indexes", async () => {
  const dimensions = new DimensionService(store),
    base = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
  await dimensions.save("A", { ...base, kind: "dimension", code: "DEPT", name: "Department" });
  await dimensions.save("A", { ...base, kind: "value", dimension: "DEPT", code: "A", name: "A" });
  await post("2026-01-01", "10", "1000", "3000");
  await post("2026-02-03", "2", "1000", "4000", "normal", { DEPT: "A" });
  await post("2026-02-01", "1");
  await post("2026-02-03", "3", "1000", "4000", "adjusting");
  await post("2026-02-02", "2", "1000", "1000");
  const source = await reports.report("A", "2026-02");
  await post("2026-02-01", "7");
  let page = ledgerSchema.parse(
    await reports.ledger("A", "1000", "2026-02", { limit: 1, watermark: source.watermark }),
  );
  expect(page).toMatchObject({ opening: 1000, debit: 800, credit: 200, closing: 1600, total: 5 });
  const balances = [page.items[0].balance],
    ids = [`${page.items[0].entryId}:${page.items[0].lineNo}`];
  expect(page.watermark).toBe(source.watermark);
  expect(await reports.report("A", "2026-02", "adjusted", source.watermark)).toEqual(source);
  const historical = await reports.reconciliation("A", "2026-02", "unadjusted", source.watermark);
  expect(historical.watermark).toBe(source.watermark);
  expect(historical.trial.rows.find((row) => row.code === "1000")?.closing).toBe(1300);
  expect(historical.reconciliation.allPass).toBe(true);
  while (page.nextCursor) {
    page = ledgerSchema.parse(
      await reports.ledger("A", "1000", "2026-02", { limit: 1, cursor: page.nextCursor }),
    );
    balances.push(page.items[0].balance);
    ids.push(`${page.items[0].entryId}:${page.items[0].lineNo}`);
    expect(page.total).toBe(5);
  }
  expect(ids).toHaveLength(5);
  expect(new Set(ids).size).toBe(5);
  expect(balances[0]).toBe(1100);
  expect(balances.at(-1)).toBe(1600);
  expect((await reports.ledger("A", "1000", "2026-02", { limit: 100 })).total).toBe(6);
  expect(await reports.ledger("A", "1000", "2026-02", { limit: 1, watermark: 0 })).toMatchObject({
    total: 0,
    closing: 0,
    watermark: 0,
  });
  await expect(reports.report("A", "2026-02", "adjusted", 999)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(
    reports.ledger("A", "1000", "2026-02", { limit: 1, watermark: 999 }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    await reports.ledger("A", "1000", "2026-02", { limit: 100, dimension: "DEPT", value: "A" }),
  ).toMatchObject({ opening: 0, debit: 200, closing: 200, total: 1 });
  expect(
    (await reports.ledger("A", "1000", "2026-02", { limit: 100, dimension: "DEPT", value: null }))
      .total,
  ).toBe(5);
  const first = await reports.ledger("A", "1000", "2026-02", { limit: 1 });
  await expect(
    reports.ledger("A", "1000", "2026-02", {
      limit: 1,
      cursor: first.nextCursor!,
      watermark: source.watermark,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    reports.ledger("A", "4000", "2026-02", { limit: 1, cursor: first.nextCursor! }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    reports.ledger("A", "1000", "2026-02", {
      limit: 1,
      stage: "unadjusted",
      cursor: first.nextCursor!,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    reports.ledger("A", "1000", "2026-02", { limit: 1, cursor: "a" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const db = new Database(filename, { readonly: true });
  try {
    const plan = (sql: string, params: unknown[]) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(...params)
        .map((row) => String((row as { detail: string }).detail))
        .join("\n");
    expect(
      plan(REPORT_BALANCES_SQL, ["2026-02", "2026-02", "2026-02", "2026-01", "A", "2026-02", "A"]),
    ).toContain("SEARCH l USING COVERING INDEX journal_lines_report_totals");
    const ledgerPlan = plan(
      `${LEDGER_ROWS_SQL} ORDER BY e.accounting_date,e.id,l.line_no LIMIT ?`,
      ["A", "2026-02", 9999, "1000", 100],
    );
    expect(ledgerPlan).toContain("journal_entries_ledger_date");
    expect(ledgerPlan).toContain("SEARCH l USING INDEX journal_lines_open_items");
    expect(ledgerPlan).not.toContain("SCAN l");
  } finally {
    db.close();
  }
});
it("enforces read-only HTTP contracts, company isolation and exact request scope", async () => {
  await post("2026-01-01", "1.23");
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    masterData: master,
    reports,
    logError: () => undefined,
  });
  try {
    const host = new URL(await api.listen()).host,
      headers = { host };
    for (const kind of ["trial", "income", "balance-sheet", "reconciliation"]) {
      const reply = await api.app.inject({
        url: `/api/v1/reports/${kind}?company=A&month=2026-01`,
        headers,
      });
      expect(reply.statusCode).toBe(200);
      expect(reportSchema.parse(reply.json()).reconciliation.allPass).toBe(true);
      if (kind === "reconciliation")
        expect(reply.json().reconciliation.checks.map((check: { id: string }) => check.id)).toEqual(
          [
            "tb.unadjusted",
            "tb.adjusted",
            "tb.postClosing",
            "balanceSheet",
            "equitySummary",
            "profit",
          ],
        );
      expect(reply.headers["cache-control"]).toContain("no-store");
    }
    const get = await api.app.inject({
      url: "/api/v1/ledger?company=A&month=2026-01&account=1000&limit=1&watermark=1",
      headers,
    });
    expect(ledgerSchema.parse(get.json()).closing).toBe(123);
    await post("2026-01-02", "0.20");
    for (const kind of ["trial", "income", "balance-sheet", "reconciliation"]) {
      const pinned = await api.app.inject({
        url: `/api/v1/reports/${kind}?company=A&month=2026-01&watermark=1`,
        headers,
      });
      expect(pinned.statusCode).toBe(200);
      expect(
        reportSchema.parse(pinned.json()).trial.rows.find((row) => row.code === "1000")?.closing,
      ).toBe(123);
    }
    const pinnedLedger = await api.app.inject({
      url: "/api/v1/ledger?company=A&month=2026-01&account=1000&watermark=1",
      headers,
    });
    expect(ledgerSchema.parse(pinnedLedger.json())).toMatchObject({
      watermark: 1,
      closing: 123,
      total: 1,
    });
    for (const path of ["reports/trial", "ledger"]) {
      const query = `company=A&month=2026-01${path === "ledger" ? "&account=1000" : ""}`;
      expect(
        (await api.app.inject({ url: `/api/v1/${path}?${query}&watermark=999`, headers }))
          .statusCode,
      ).toBe(409);
      for (const value of ["-1", "9007199254740992", "01", "1&watermark=2"]) {
        expect(
          (await api.app.inject({ url: `/api/v1/${path}?${query}&watermark=${value}`, headers }))
            .statusCode,
        ).toBe(400);
      }
    }
    for (const url of [
      "/api/v1/ledger?company=A&month=2026-01&account=1000&value=A",
      "/api/v1/reports/trial?company=A&month=2026-13",
      "/api/v1/reports/trial?company=A&month=2026-01&extra=1",
      "/api/v1/reports/trial?company=A&company=B&month=2026-01",
    ])
      expect((await api.app.inject({ url, headers })).statusCode).toBe(400);
    expect(
      (await api.app.inject({ url: "/api/v1/reports/trial?company=B&month=2026-01", headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await api.app.inject({
          url: "/api/v1/ledger?company=A&month=2026-01&account=1000",
          headers: { host, origin: "http://untrusted.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await api.app.inject({ url: "/api/v1/reports/trial", method: "POST", headers })).statusCode,
    ).toBe(405);
  } finally {
    await api.close();
  }
});

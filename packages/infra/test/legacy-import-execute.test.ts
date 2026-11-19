import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";
import {
  MasterDataService,
  JournalService,
  BusinessEventService,
  DimensionService,
} from "@erp/core/application";
import { executeLegacyImport } from "../src/storage/legacy-import.ts";
import {
  checkLegacyReconciliation,
  confirmLegacyReconciliation,
  reconcileLegacy,
} from "../src/legacy/reconcile.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { journalTools } from "../src/storage/journals.ts";
import { LegacyImportSnapshot, type ImportChoices } from "../src/legacy/import-plan.ts";
import { captureDirectory, legacyFixture } from "./support/legacy-fixture.mjs";

const choices: ImportChoices = {
  drafts: "import-as-draft",
  receipts: "archive-only",
  "source-events": "archive-only",
  "transfer-queue": "archive-only",
  seals: "archive-only",
  audit: "archive-only",
};
function open(f): LegacyImportSnapshot {
  const snapshot = new LegacyImportSnapshot(f.target, f.manifest);
  f.readers.push(snapshot);
  return snapshot;
}
function rows(file: string, sql: string): unknown[] {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}
function contents(file: string): Record<string, unknown[]> {
  return Object.fromEntries(
    [
      "ledger_companies",
      "accounts",
      "periods",
      "journal_entries",
      "journal_lines",
      "journal_corrections",
      "period_closing_journals",
      "legacy_refs",
    ].map((table) => [table, rows(file, `SELECT * FROM ${table} ORDER BY 1,2`)]),
  );
}
function refresh(f, source: "teaching" | "enterprise") {
  const entry = f.manifest.ledgers[source],
    bytes = readFileSync(join(f.target, entry.file));
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
}
test.for([100, 99])(
  "historical control posting uses the registered adapter and rejects imbalance (credit=%s)",
  async (credit, t) => {
    const f = legacyFixture(t),
      target = join(f.directory, "control.sqlite");
    const source = new Database(join(f.target, "erp.sqlite"));
    try {
      source.exec(`INSERT INTO source_events VALUES('F','FICT-CONTROL','journal','2026-01-15','{}');
      INSERT INTO journals(company,reference,accounting_date,document_date,tax_date,kind,operation,memo,details)
      VALUES('F','FICT-CONTROL','2026-01-15','2026-01-14','2026-01-13','normal','journal','Synthetic control history','{}');`);
      const insert = source.prepare(
        "INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES('F',1,?,?,?,?,?)",
      );
      for (const [index, account, debit, amount] of [
        [1, "1300", 100, 0],
        [2, "4000", 0, credit],
      ] as const) {
        insert.run(
          index,
          account,
          debit,
          amount,
          JSON.stringify({
            account,
            debit,
            credit: amount,
            transactionDebit: debit,
            transactionCredit: amount,
            accountingCurrency: "EUR",
            currency: "EUR",
            reportingCurrency: "EUR",
            reportingDebit: debit,
            reportingCredit: amount,
            rateRefs: { accounting: null, reporting: null },
            dimensions: {},
            dimensionOrigins: {},
            metadata: {},
          }),
        );
      }
    } finally {
      source.close();
    }
    refresh(f, "enterprise");
    const work = executeLegacyImport(open(f), { target, choices });
    if (credit === 100) {
      await work;
      const report = await checkLegacyReconciliation(open(f), target);
      assert.equal(report.verdict, "blocked");
      assert.ok(
        report.blockers.some((blocker) => blocker.company === "F" && blocker.account === "1300"),
      );
      assert.equal(
        report.knownDifferences.some((group) => group.object === "open_items"),
        false,
      );
      const confirmation = join(f.directory, "control-confirmation.json");
      writeFileSync(
        confirmation,
        JSON.stringify({ knownDifferencesSha256: report.knownDifferencesSha256 }),
      );
      assert.equal(
        (await confirmLegacyReconciliation(open(f), target, confirmation)).verdict,
        "blocked",
      );
      const explained = new Database(target);
      explained.defaultSafeIntegers(true);
      explained.exec("PRAGMA foreign_keys=OFF; BEGIN");
      try {
        explained.exec(`INSERT INTO trade_item_sources
          SELECT 'F','00000000-0000-4000-8000-000000000025','invoice','FICT-OPENING',id,NULL
          FROM journal_entries WHERE company_id='F' LIMIT 1;
          INSERT INTO open_items VALUES(
            'F','00000000-0000-4000-8000-000000000025','AR','FICT-PARTY','1300','{}','EUR',
            '2026-01-15','2026-01-15','2026-01-15','2026-01-15',100,100,0,100,100,0,'open',1);`);
        const explainedReport = await reconcileLegacy(open(f), explained);
        assert.equal(explainedReport.verdict, "blocked");
        const check = explainedReport.checks.find(
          (check) => check.section === "trade-reconciliation",
        );
        const control = check?.actual.find((row) => row.account === "1300");
        assert.equal(control?.subledgerMinor, "100");
        assert.equal(control?.tradeDifferenceMinor, "-100");
        assert.equal(control?.otherSourceMinor, "100");
      } finally {
        explained.exec("ROLLBACK");
        explained.close();
      }
      assert.equal(
        rows(
          target,
          "SELECT sum(debit_minor) n FROM journal_lines WHERE company_id='F' AND account_code='1300'",
        )[0].n,
        100,
      );
      assert.equal(rows(target, "SELECT count(*) n FROM receipts")[0].n, 0);
      assert.equal(
        rows(
          target,
          "SELECT count(*) n FROM legacy_refs WHERE source='enterprise' AND object_type='journals'",
        )[0].n,
        1,
      );
      const control = new Database(target);
      try {
        assert.equal(
          control
            .prepare("SELECT modules FROM periods WHERE company_id='F' AND month='2026-01'")
            .get().modules,
          "[]",
        );
        control.exec("UPDATE legacy_import_runs SET status='reconciled'");
      } finally {
        control.close();
      }
      const store = createMasterDataStore({ filename: target });
      try {
        const reconciliation = await store.read((repo) =>
          repo.tradeReconciliation("F", "2026-01-31"),
        );
        assert.deepEqual(
          reconciliation.find((row) => row.account === "1300"),
          {
            account: "1300",
            subledgerMinor: 0,
            glMinor: 100,
            tradeGlMinor: 0,
            otherSourceMinor: 100,
            tradeDifferenceMinor: 0,
            differenceMinor: 100,
          },
        );
      } finally {
        await store.close();
      }
    } else {
      await assert.rejects(work, { code: "INVALID_INPUT" });
      assert.equal(rows(target, "SELECT count(*) n FROM journal_entries")[0].n, 0);
      assert.equal(rows(target, "SELECT count(*) n FROM legacy_refs")[0].n, 0);
      assert.equal(rows(target, "SELECT cursor FROM legacy_import_runs")[0].cursor, 0);
    }
  },
);

test("explicit audit import keeps mapped evidence and references its actual target sequence", async (t) => {
  const f = legacyFixture(t),
    target = join(f.directory, "audit.sqlite");
  const source = new Database(join(f.target, "erp.sqlite"));
  try {
    source.exec(`DROP TRIGGER immutable_audit_UPDATE;
      UPDATE audit SET reference='FICT-AUDIT';`);
  } finally {
    source.close();
  }
  refresh(f, "enterprise");
  await executeLegacyImport(open(f), { target, choices: { ...choices, audit: "import" } });
  assert.deepEqual(rows(target, "SELECT company_id,sequence,reference,principal FROM audit"), [
    { company_id: "F", sequence: 1, reference: "FICT-AUDIT", principal: "legacy.import" },
  ]);
  assert.equal(
    rows(target, "SELECT target_id FROM legacy_refs WHERE object_type='audit'")[0].target_id,
    "F:1",
  );
});

test.for([false, true])(
  "synthetic import preserves all posted lines, stages, dimensions and historical closes (history=%s)",
  async (history, t) => {
    const f = legacyFixture(t, { history }),
      target = join(f.directory, "target.sqlite");
    if (history) {
      const source = new Database(f.snapshot);
      try {
        source.exec(`INSERT INTO account_settings VALUES('1000',0,0,1);
          UPDATE dimensions SET active=0 WHERE code='TEAM';
          UPDATE dimension_values SET active=0 WHERE dimension='TEAM';`);
      } finally {
        source.close();
      }
      refresh(f, "teaching");
    }
    const before = captureDirectory(f.target, { mtime: true });
    const result = await executeLegacyImport(open(f), { target, choices });
    assert.equal(result.status, "imported");
    const db = new Database(target, { readonly: true });
    const source = new Database(f.snapshot, { readonly: true });
    try {
      assert.equal(
        db.prepare("SELECT count(*) n FROM journal_entries").get().n,
        source.prepare("SELECT count(*) n FROM journals WHERE status='posted'").get().n,
      );
      assert.equal(
        db.prepare("SELECT count(*) n FROM journal_drafts").get().n,
        source.prepare("SELECT count(*) n FROM journals WHERE status='draft'").get().n,
      );
      assert.equal(db.prepare("SELECT count(*) n FROM receipts").get().n, 0);
      assert.equal(db.prepare("SELECT count(*) n FROM period_closes").get().n, 0);
      assert.equal(
        db.prepare("SELECT count(*) n FROM period_closing_journals").get().n,
        source.prepare("SELECT count(*) n FROM journals WHERE kind='closing'").get().n,
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      for (const month of source.prepare("SELECT month,status FROM periods").all()) {
        assert.equal(
          db
            .prepare("SELECT status FROM periods WHERE company_id='TEACHING' AND month=?")
            .get(month.month).status,
          month.status,
        );
        for (const stage of ["unadjusted", "adjusted", "postClosing"]) {
          const filter =
            stage === "unadjusted"
              ? "AND j.kind NOT IN('adjusting','closing') AND coalesce(r.kind,'')<>'adjusting'"
              : stage === "adjusted"
                ? "AND j.kind<>'closing'"
                : "";
          const expected = source
            .prepare(`SELECT l.account,sum(l.debit) debit,sum(l.credit) credit FROM lines l JOIN journals j ON j.id=l.journal_id LEFT JOIN journals r ON r.id=j.reversal_of
          WHERE j.status='posted' AND substr(j.date,1,7)=? ${filter} GROUP BY l.account ORDER BY l.account`)
            .all(month.month);
          const actual = db
            .prepare(`SELECT l.account_code account,sum(l.debit_minor) debit,sum(l.credit_minor) credit FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
          WHERE l.company_id='TEACHING' AND l.period=? ${stage === "unadjusted" ? "AND e.kind<>'adjusting'" : ""}
          ${stage !== "postClosing" ? "AND NOT EXISTS(SELECT 1 FROM period_closing_journals c WHERE c.journal_id=e.id)" : ""}
          GROUP BY l.account_code ORDER BY l.account_code`)
            .all(month.month);
          assert.deepEqual(actual, expected);
        }
      }
      const expected = source
        .prepare(
          "SELECT d.dimension,d.value,sum(l.debit) debit,sum(l.credit) credit FROM line_dimensions d JOIN lines l ON l.id=d.line_id JOIN journals j ON j.id=l.journal_id WHERE j.status='posted' GROUP BY d.dimension,d.value",
        )
        .all();
      const actual = db
        .prepare(
          "SELECT d.key dimension,d.value,sum(l.debit_minor) debit,sum(l.credit_minor) credit FROM journal_lines l,json_each(l.dimensions) d GROUP BY d.key,d.value",
        )
        .all();
      assert.deepEqual(actual, expected);
      if (history) {
        assert.deepEqual(
          db
            .prepare(
              "SELECT active,manual_allowed FROM accounts WHERE company_id='TEACHING' AND code='1000'",
            )
            .get(),
          { active: 0, manual_allowed: 0 },
        );
        assert.equal(
          db
            .prepare("SELECT active FROM dimensions WHERE company_id='TEACHING' AND code='TEAM'")
            .get()?.active,
          0,
        );
        const evidence = db
          .prepare("SELECT reason FROM config_history WHERE kind='period' ORDER BY config_key")
          .all();
        assert.equal(evidence.length, 2);
        for (const row of evidence) {
          const value = JSON.parse(row.reason);
          assert.equal(value.source, "legacy.import");
          assert.equal(value.closingRefs.length, 1);
          assert.ok(
            db
              .prepare(
                "SELECT 1 FROM legacy_refs WHERE object_type='journals' AND legacy_id=? AND target_id=?",
              )
              .get(value.closingRefs[0].legacyRef, value.closingRefs[0].journalId),
          );
        }
      }
      assert.equal(db.prepare("SELECT status FROM legacy_import_runs").get().status, "imported");
    } finally {
      db.close();
      source.close();
    }
    assert.deepEqual(captureDirectory(f.target, { mtime: true }), before);
    const runtime = createMasterDataStore({ filename: target });
    try {
      await assert.rejects(
        runtime.read((repo) => repo.company("TEACHING")),
        { code: "CONFLICT" },
      );
    } finally {
      await runtime.close();
    }
    const control = new Database(target);
    const sequence = control.prepare("SELECT value FROM write_seq").get().value;
    control.exec("UPDATE legacy_import_runs SET status='reconciled'");
    assert.equal(control.prepare("SELECT value FROM write_seq").get().value, sequence);
    control.close();
    const reconciled = createMasterDataStore({ filename: target });
    try {
      assert.equal((await reconciled.read((repo) => repo.company("TEACHING")))?.code, "TEACHING");
    } finally {
      await reconciled.close();
    }
  },
);

test("committed atomic batches survive interruption; rollback and resume match uninterrupted import", async (t) => {
  const f = legacyFixture(t, { history: true }),
    snapshot = open(f);
  const first = join(f.directory, "first.sqlite"),
    resumed = join(f.directory, "resumed.sqlite");
  await executeLegacyImport(snapshot, { target: first, choices, batchLines: 4 });
  await assert.rejects(
    executeLegacyImport(
      snapshot,
      { target: resumed, choices, batchLines: 4 },
      {
        beforeBatchCommit(batch) {
          if (batch === 3) throw new Error("synthetic interruption");
        },
      },
    ),
    /synthetic interruption/,
  );
  assert.equal(rows(resumed, "SELECT status FROM legacy_import_runs")[0].status, "importing");
  const before = readFileSync(resumed);
  for (const changed of [{ ...choices, drafts: "skip" }]) {
    await assert.rejects(
      executeLegacyImport(snapshot, { target: resumed, choices: changed as ImportChoices }),
      { code: "CONFLICT" },
    );
    assert.deepEqual(readFileSync(resumed), before);
  }
  const result = await executeLegacyImport(snapshot, { target: resumed, choices, batchLines: 4 });
  assert.equal(result.status, "imported");
  const normalize = (value: Record<string, unknown[]>) =>
    JSON.stringify(value, (key, item) =>
      ["run_id", "import_run", "posted_at"].includes(key)
        ? null
        : key === "evidence" && typeof item === "string"
          ? JSON.stringify(JSON.parse(item))
          : item,
    );
  assert.equal(normalize(contents(resumed)), normalize(contents(first)));
});

test("new targets only; invalid snapshots/options, completed, foreign and contaminated targets remain unchanged", async (t) => {
  const f = legacyFixture(t),
    snapshot = open(f),
    target = join(f.directory, "new.sqlite");
  await assert.rejects(
    executeLegacyImport(snapshot, { target, choices: { drafts: "skip" } as ImportChoices }),
    /six decision C/,
  );
  assert.equal(readdirSync(f.directory).includes("new.sqlite"), false);
  await assert.rejects(
    executeLegacyImport(
      snapshot,
      { target, choices },
      {
        beforeBatchCommit() {
          throw Error("interrupt");
        },
      },
    ),
    /interrupt/,
  );
  const raw = new Database(target);
  raw.exec("INSERT INTO tenants(tenant_id) VALUES('FOREIGN')");
  raw.close();
  const before = readFileSync(target);
  await assert.rejects(executeLegacyImport(snapshot, { target, choices }), { code: "CONFLICT" });
  assert.deepEqual(readFileSync(target), before);
  const empty = join(f.directory, "normal.sqlite"),
    storage = createSqliteStorage({ filename: empty });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const emptyBefore = readFileSync(empty);
  await assert.rejects(executeLegacyImport(snapshot, { target: empty, choices }), {
    code: "CONFLICT",
  });
  assert.deepEqual(readFileSync(empty), emptyBefore);
});

test("storage commit path counts business transactions, including drafts, state and restored values; failures/read-only do not count", async (t) => {
  const f = legacyFixture(t),
    target = join(f.directory, "sequence.sqlite"),
    storage = createSqliteStorage({ filename: target });
  await storage.migrate();
  const seq = () => rows(target, "SELECT value FROM write_seq")[0].value;
  assert.equal(seq(), 0);
  const scope = { level: "company", tenantId: "T", bookId: "B", companyId: "C" } as const;
  await storage.provision(scope);
  assert.equal(seq(), 1);
  await storage.write({ level: "company", scopes: [scope] }, (s) => s.revisions.advance(scope, 0));
  assert.equal(seq(), 2);
  await assert.rejects(
    storage.write({ level: "company", scopes: [scope] }, () => {
      throw Error("rollback");
    }),
    { code: "STORAGE_FAILURE" },
  );
  assert.equal(seq(), 2);
  await storage.read(scope, (s) => s.revisions.get(scope));
  assert.equal(seq(), 2);
  await storage.close();
  const store = createMasterDataStore({ filename: target }),
    master = new MasterDataService(store);
  try {
    await master.createCompany({
      code: "F",
      name: "Fictional",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    assert.equal(seq(), 3);
    const original = await master.account("F", "1000");
    const { revision: _, builtin: __, ...input } = original;
    await master.saveAccount("F", { ...input, name: "Changed" }, 1);
    assert.equal(seq(), 4);
    await master.saveAccount("F", input, 2);
    assert.equal(seq(), 5);
    await master.setPeriod("F", "2026-01", 1, "frozen", "test", true);
    assert.equal(seq(), 6);
    const journals = new JournalService(store, journalTools);
    const draft: Parameters<typeof journals.save>[1] = {
      id: "00000000-0000-4000-8000-000000000001",
      revision: 0,
      sourceRef: "SYNTH",
      date: "2026-02-01",
      memo: "Synthetic draft",
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines: [],
    };
    const saved = await journals.save("F", draft);
    assert.equal(seq(), 7);
    const edited = await journals.save("F", { ...saved, memo: "Edited without GL" });
    assert.equal(seq(), 8);
    assert.equal(rows(target, "SELECT count(*) n FROM journal_lines")[0].n, 0);
    const balanced = await journals.save("F", {
      ...edited,
      lines: [
        { account: "1000", debit: "1", credit: "", dimensions: {}, suspense: null },
        { account: "3000", debit: "", credit: "1", dimensions: {}, suspense: null },
      ],
    });
    assert.equal(seq(), 9);
    const preview = await journals.preview("F", balanced);
    const events = new BusinessEventService(store, journalTools);
    await events.enqueue({
      company: "F",
      draftId: balanced.id,
      revision: balanced.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
      confirmation: "QUEUE",
    });
    assert.equal(seq(), 10);
    await events.withdraw("F", balanced.id, "Synthetic withdrawal", "WITHDRAW");
    assert.equal(seq(), 11);
    await events.saveMaster("F", "service", {
      code: "S",
      name: "Synthetic",
      group: "G",
      active: true,
      revision: 0,
      dimensions: {},
    });
    assert.equal(seq(), 12);
    await new DimensionService(store).save("F", {
      kind: "dimension",
      code: "D",
      name: "Synthetic dimension",
      active: true,
      from: "2026-01-01",
      to: "2026-12-31",
      revision: 0,
    });
    assert.equal(seq(), 13);
  } finally {
    await store.close();
  }
});

test("snapshot SHA changes and migration-version drift refuse resume without target writes", async (t) => {
  const f = legacyFixture(t),
    target = join(f.directory, "interrupted.sqlite");
  await assert.rejects(
    executeLegacyImport(
      open(f),
      { target, choices },
      {
        beforeBatchCommit() {
          throw Error("interrupt");
        },
      },
    ),
    /interrupt/,
  );
  const before = readFileSync(target);
  for (const reader of f.readers) reader.close();
  const src = new Database(join(f.target, "erp.sqlite"));
  try {
    src.exec("UPDATE meta SET revision=revision+1");
  } finally {
    src.close();
  }
  refresh(f, "enterprise");
  await assert.rejects(executeLegacyImport(open(f), { target, choices }), { code: "CONFLICT" });
  assert.deepEqual(readFileSync(target), before);
  const raw = new Database(target);
  raw.prepare("UPDATE legacy_import_runs SET snapshot_sha=?,migration_version=0").run(
    JSON.stringify({
      teaching: f.manifest.ledgers.teaching.sha256,
      enterprise: f.manifest.ledgers.enterprise.sha256,
    }),
  );
  raw.close();
  const changed = readFileSync(target);
  await assert.rejects(executeLegacyImport(open(f), { target, choices }), { code: "CONFLICT" });
  assert.deepEqual(readFileSync(target), changed);
});

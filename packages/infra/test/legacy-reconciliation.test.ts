import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";
import { LegacyImportSnapshot, type ImportChoices } from "../src/legacy/import-plan.ts";
import {
  checkLegacyReconciliation,
  confirmLegacyReconciliation,
  reconciliationSha256,
  saveReconciliation,
} from "../src/legacy/reconcile.ts";
import { executeLegacyImport } from "../src/storage/legacy-import.ts";
import { readMigrationStatus } from "../src/storage/reconciliation.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { legacyFixture, captureDirectory, openingItemsFile } from "./support/legacy-fixture.mjs";

const choices: ImportChoices = {
  drafts: "import-as-draft",
  receipts: "archive-only",
  "source-events": "archive-only",
  "transfer-queue": "archive-only",
  seals: "archive-only",
  audit: "archive-only",
};
async function fixture(
  t,
  options: {
    history?: boolean;
    drafts?: ImportChoices["drafts"];
    tradeControls?: boolean;
    controlAmounts?: readonly number[];
    /** Reproduces a target without opening=done (D26 gate) after a valid M2-03b import. */
    withoutOpening?: boolean;
  } = {},
) {
  const tradeControls = options.tradeControls ?? false;
  const f = legacyFixture(t, { ...options, tradeControls, tradeAdvances: tradeControls });
  if (options.controlAmounts?.length) {
    const source = new Database(join(f.target, "erp.sqlite"));
    try {
      for (const [index, amount] of options.controlAmounts.entries()) {
        const reference = `FICT-GATE-${index}`;
        source
          .prepare("INSERT INTO source_events VALUES('F',?,'journal','2026-01-15','{}')")
          .run(reference);
        const journal = source
          .prepare(`INSERT INTO journals(
          company,reference,accounting_date,document_date,tax_date,kind,operation,memo,details)
          VALUES('F',?,'2026-01-15','2026-01-15','2026-01-15','normal','journal','Fictional opening gate','{}')`)
          .run(reference);
        const insert = source.prepare(
          "INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES('F',?,?,?,?,?,?)",
        );
        for (const [line, account, signed] of [
          [1, "1300", amount],
          [2, "4000", -amount],
        ] as const) {
          const debit = Math.max(0, signed),
            credit = Math.max(0, -signed);
          insert.run(
            journal.lastInsertRowid,
            line,
            account,
            debit,
            credit,
            JSON.stringify({
              account,
              debit,
              credit,
              transactionDebit: debit,
              transactionCredit: credit,
              accountingCurrency: "EUR",
              currency: "EUR",
              reportingCurrency: "EUR",
              reportingDebit: debit,
              reportingCredit: credit,
              rateRefs: { accounting: null, reporting: null },
              dimensions: {},
              dimensionOrigins: {},
              metadata: {},
            }),
          );
        }
      }
    } finally {
      source.close();
    }
    const bytes = readFileSync(join(f.target, "erp.sqlite"));
    f.manifest.ledgers.enterprise.bytes = bytes.length;
    f.manifest.ledgers.enterprise.sha256 = reconciliationSha256(bytes);
    writeFileSync(join(f.target, "manifest.json"), JSON.stringify(f.manifest));
  }
  const snapshot = new LegacyImportSnapshot(f.target, f.manifest);
  f.readers.push(snapshot);
  const target = join(f.directory, "target.sqlite");
  await executeLegacyImport(snapshot, {
    target,
    choices: { ...choices, drafts: options.drafts ?? choices.drafts },
    ...(tradeControls
      ? {
          openingItems: openingItemsFile({
            accounts: ["1300", "1400", "2100", "2300"],
            items: { "1300": options.controlAmounts ?? [] },
            master: true,
          }),
        }
      : {}),
  });
  if (options.withoutOpening) {
    const db = new Database(target);
    try {
      db.exec("UPDATE legacy_import_runs SET opening=NULL");
    } finally {
      db.close();
    }
  }
  const confirmation = join(f.directory, "confirmation.json");
  const report = await checkLegacyReconciliation(snapshot, target);
  writeFileSync(
    confirmation,
    JSON.stringify({ knownDifferencesSha256: report.knownDifferencesSha256 }),
  );
  return { ...f, snapshotReader: snapshot, targetFile: target, confirmation, report };
}
function state(target: string) {
  const db = new Database(target, { readonly: true });
  try {
    return {
      run: db.prepare("SELECT status,write_sequence FROM legacy_import_runs").get(),
      sequence: db.prepare("SELECT value FROM write_seq").get(),
      reconciliation: db.prepare("SELECT * FROM legacy_reconciliations").get(),
      business: [
        "accounts",
        "journal_entries",
        "journal_lines",
        "journal_drafts",
        "periods",
        "legacy_refs",
      ].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()),
    };
  } finally {
    db.close();
  }
}
test.for([false, true])(
  "check is byte-preserving; atomic confirmation locks first W (history=%s)",
  async (history, t) => {
    const f = await fixture(t, { history });
    const sourceBefore = captureDirectory(f.target, { mtime: true });
    const bytes = readFileSync(f.targetFile),
      before = state(f.targetFile);
    assert.equal(
      (await checkLegacyReconciliation(f.snapshotReader, f.targetFile)).verdict,
      "pending",
    );
    assert.deepEqual(readFileSync(f.targetFile), bytes);
    const result = await confirmLegacyReconciliation(
      f.snapshotReader,
      f.targetFile,
      f.confirmation,
    );
    assert.equal(result.verdict, "pass");
    const after = state(f.targetFile);
    assert.deepEqual(after.business, before.business);
    assert.deepEqual(after.sequence, before.sequence);
    assert.equal(after.run.status, "reconciled");
    assert.equal(after.reconciliation.baseline, before.sequence.value);
    assert.equal(after.reconciliation.report_sha, reconciliationSha256(JSON.stringify(result)));
    assert.equal(
      after.reconciliation.confirmation_sha,
      reconciliationSha256(readFileSync(f.confirmation)),
    );
    assert.equal((await checkLegacyReconciliation(f.snapshotReader, f.targetFile)).verdict, "pass");
    const confirmedBytes = readFileSync(f.targetFile);
    assert.equal(
      (await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation)).verdict,
      "pass",
    );
    assert.deepEqual(readFileSync(f.targetFile), confirmedBytes);
    const store = createMasterDataStore({ filename: f.targetFile });
    try {
      await store.write(async (repo) => {
        const account = await repo.account("TEACHING", "1000");
        assert.ok(account);
        await repo.saveAccount(
          "TEACHING",
          {
            ...account,
            name: "Fictional post-confirmation edit",
            revision: account.revision + 1,
          },
          account.revision,
        );
      });
    } finally {
      await store.close();
    }
    const written = state(f.targetFile);
    assert.equal(written.sequence.value, before.sequence.value + 1);
    await assert.rejects(
      () => confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation),
      { code: "CONFLICT" },
    );
    assert.deepEqual(state(f.targetFile), written);
    assert.deepEqual(captureDirectory(f.target, { mtime: true }), sourceBefore);
  },
);
test("stale list confirmation stays pending and preserves every target byte", async (t) => {
  const f = await fixture(t, { drafts: "skip" });
  assert.ok(
    f.report.knownDifferences.some(
      (group) => group.object === "journals" && group.legacyRefs.includes("3"),
    ),
  );
  writeFileSync(f.confirmation, JSON.stringify({ knownDifferencesSha256: "0".repeat(64) }));
  const before = readFileSync(f.targetFile);
  assert.equal(
    (await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation)).verdict,
    "pending",
  );
  assert.deepEqual(readFileSync(f.targetFile), before);
  assert.equal(state(f.targetFile).run.status, "imported");
});
test("first confirmation survives UPDATE, DELETE and both REPLACE forms with recursive triggers disabled", async (t) => {
  const f = await fixture(t);
  const beforeConfirmation = new Database(f.targetFile);
  try {
    saveReconciliation(beforeConfirmation, {
      ...f.report,
      checks: [...f.report.checks, { section: "fictional-refresh", expected: [], actual: [] }],
    });
    assert.ok(
      JSON.parse(
        beforeConfirmation.prepare("SELECT report FROM legacy_reconciliations").get().report,
      ).checks.some((check) => check.section === "fictional-refresh"),
    );
  } finally {
    beforeConfirmation.close();
  }
  await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation);
  const before = state(f.targetFile);
  const db = new Database(f.targetFile);
  try {
    db.pragma("recursive_triggers=OFF");
    for (const sql of [
      "UPDATE legacy_reconciliations SET baseline=baseline+1",
      "DELETE FROM legacy_reconciliations",
      ...["INSERT OR REPLACE", "REPLACE"].map(
        (insert) => `${insert} INTO legacy_reconciliations
          SELECT run_id,report,report_sha,confirmation_sha,baseline+1 FROM legacy_reconciliations`,
      ),
    ]) {
      assert.throws(() => db.exec(sql), /immutable reconciliation/);
      assert.deepEqual(state(f.targetFile), before);
    }
  } finally {
    db.close();
  }
});
test.for([
  [
    "amount",
    "DROP TRIGGER journal_lines_no_update; UPDATE journal_lines SET debit_minor=debit_minor+1 WHERE debit_minor>0",
    "balances.teaching",
  ],
  [
    "journal",
    "PRAGMA foreign_keys=OFF; DROP TRIGGER journal_entries_no_delete; DELETE FROM journal_entries WHERE id=(SELECT id FROM journal_entries LIMIT 1)",
    "journals",
  ],
  ["period", "UPDATE periods SET status='frozen'", "periods"],
  [
    "dimension",
    `DROP TRIGGER journal_lines_no_update; UPDATE journal_lines SET dimensions='{}'`,
    "dimensions",
  ],
  [
    "reference",
    "DELETE FROM legacy_refs WHERE object_type='lines' AND legacy_id='1'",
    "legacy_refs",
  ],
  [
    "extra-line",
    `DROP TRIGGER journal_lines_sealed; INSERT INTO journal_lines SELECT company_id,entry_id,1999,period,account_code,debit_minor,credit_minor,dimensions,evidence FROM journal_lines LIMIT 1`,
    "line-counts",
  ],
] as const)("reports precise mismatches without updating run: %s", async ([, sql, section], t) => {
  const f = await fixture(t);
  const db = new Database(f.targetFile);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
  const before = state(f.targetFile);
  const report = await checkLegacyReconciliation(f.snapshotReader, f.targetFile);
  assert.equal(report.verdict, "difference");
  assert.ok(
    report.differences.some((difference) => difference.section === section),
    JSON.stringify(report.differences),
  );
  assert.equal(
    (await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation)).verdict,
    "difference",
  );
  assert.deepEqual(state(f.targetFile), before);
});
test("confirmation excludes another process's business admission and rejects a changed write_seq", async (t) => {
  const f = await fixture(t);
  const before = state(f.targetFile);
  await assert.rejects(
    () =>
      confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation, {
        afterRead() {
          const child = spawnSync(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              `
        import {acquireDatabaseLease} from './packages/infra/src/storage/maintenance.ts';
        try { const release=await acquireDatabaseLease(${JSON.stringify(f.targetFile)}); release(); process.exitCode=2; }
        catch(error) { if(error.code!=='BUSY') throw error; }
      `,
            ],
            { encoding: "utf8", timeout: 3000 },
          );
          assert.equal(child.status, 0, child.stderr);
          const db = new Database(f.targetFile);
          try {
            db.exec("UPDATE write_seq SET value=value+1");
          } finally {
            db.close();
          }
        },
      }),
    { code: "CONFLICT" },
  );
  const after = state(f.targetFile);
  assert.deepEqual(after.run, before.run);
  assert.deepEqual(after.reconciliation, before.reconciliation);
  assert.deepEqual(after.business, before.business);
});
test("import-time differences persist failed report and block business runtime", async (t) => {
  const f = legacyFixture(t),
    target = join(f.directory, "failed.sqlite");
  const snapshot = new LegacyImportSnapshot(f.target, f.manifest);
  f.readers.push(snapshot);
  await assert.rejects(
    executeLegacyImport(
      snapshot,
      { target, choices, openingItems: openingItemsFile() },
      {
        beforeReconcile(db) {
          db.exec("UPDATE periods SET status='frozen'");
        },
      },
    ),
    { code: "CONFLICT" },
  );
  const status = readMigrationStatus(target);
  assert.equal(status.run?.status, "failed");
  assert.equal(status.run?.report?.verdict, "difference");
  const store = createMasterDataStore({ filename: target });
  try {
    await assert.rejects(
      store.read((repo) => repo.company("TEACHING")),
      { code: "CONFLICT" },
    );
  } finally {
    await store.close();
  }
});
test.for(["check", "confirm"] as const)(
  "CLI explicit %s preserves the verdict and exit status",
  async (action, t) => {
    const f = await fixture(t);
    const args = [
      resolve("scripts", "storage-admin.mjs"),
      "legacy-reconcile",
      "--snapshot-dir",
      f.target,
      "--target",
      f.targetFile,
    ];
    const result = spawnSync(
      process.execPath,
      [...args, ...(action === "check" ? ["--check"] : ["--confirm", f.confirmation])],
      {
        encoding: "utf8",
        timeout: 3000,
      },
    );
    assert.equal(result.status, action === "check" ? 1 : 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).verdict, action === "check" ? "pending" : "pass");
  },
);
const gateCases = [
  { name: "LEGACY 100", amounts: [100] },
  { name: "LEGACY +100/-100", amounts: [100, -100] },
  { name: "control without entries", amounts: [] },
] as const;
test.for(gateCases)(
  "valid opening items satisfy the gate without a blocker: $name",
  async ({ amounts }, t) => {
    const f = await fixture(t, { tradeControls: true, controlAmounts: amounts });
    assert.deepEqual(f.report.blockers, []);
    assert.equal(f.report.verdict, "pending");
    const db = new Database(f.targetFile, { readonly: true });
    try {
      const run = db.prepare("SELECT opening,opening_details_sha FROM legacy_import_runs").get();
      assert.equal(run.opening, "done");
      assert.match(run.opening_details_sha, /^[0-9a-f]{64}$/u);
      assert.equal(db.prepare("SELECT count(*) n FROM open_items").get().n, amounts.length);
    } finally {
      db.close();
    }
    assert.equal(
      (await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation)).verdict,
      "pass",
    );
  },
);
test.for(gateCases)("opening gate blocks valid confirmation: $name", async ({ amounts }, t) => {
  const f = await fixture(t, {
    tradeControls: true,
    controlAmounts: amounts,
    withoutOpening: true,
  });
  assert.equal(f.report.verdict, "blocked");
  assert.ok(f.report.blockers.some((blocker) => blocker.account === "1300"));
  assert.equal(
    f.report.knownDifferences.some((group) => group.object === "open_items"),
    false,
  );
  const trade = f.report.checks
    .find((check) => check.section === "trade-reconciliation")
    ?.actual.find((row) => row.account === "1300");
  assert.equal(trade?.glMinor, String(amounts.reduce((sum, amount) => sum + amount, 0)));
  if (amounts.length !== 1) {
    assert.equal(trade?.tradeDifferenceMinor, "0");
    assert.equal(trade?.otherSourceMinor, "0");
    assert.equal(trade?.differenceMinor, "0");
  }
  assert.equal(
    (await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation)).verdict,
    "blocked",
  );
  assert.equal(state(f.targetFile).run.status, "imported");
});
test.for(
  gateCases.flatMap((scenario) =>
    (["check", "confirm"] as const).map((action) => ({ ...scenario, action })),
  ),
)("CLI opening gate exits nonzero: $name / $action", async ({ amounts, action }, t) => {
  const f = await fixture(t, {
    tradeControls: true,
    controlAmounts: amounts,
    withoutOpening: true,
  });
  const result = spawnSync(
    process.execPath,
    [
      resolve("scripts", "storage-admin.mjs"),
      "legacy-reconcile",
      "--snapshot-dir",
      f.target,
      "--target",
      f.targetFile,
      ...(action === "check" ? ["--check"] : ["--confirm", f.confirmation]),
    ],
    { encoding: "utf8", timeout: 3000 },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).verdict, "blocked");
  assert.equal(state(f.targetFile).run.status, "imported");
});
test("only opening=done satisfies the control-account gate; true differences still take priority", async (t) => {
  const f = await fixture(t, { tradeControls: true, withoutOpening: true });
  const db = new Database(f.targetFile);
  try {
    db.exec("UPDATE periods SET status='frozen'");
  } finally {
    db.close();
  }
  const different = await checkLegacyReconciliation(f.snapshotReader, f.targetFile);
  assert.equal(different.verdict, "difference");
  assert.ok(different.blockers.length);
  const fix = new Database(f.targetFile);
  try {
    fix.exec("UPDATE periods SET status='open'; UPDATE legacy_import_runs SET opening='done'");
  } finally {
    fix.close();
  }
  const completed = await checkLegacyReconciliation(f.snapshotReader, f.targetFile);
  assert.equal(completed.verdict, "pending");
  assert.deepEqual(completed.blockers, []);
  assert.equal(
    (await confirmLegacyReconciliation(f.snapshotReader, f.targetFile, f.confirmation)).verdict,
    "pass",
  );
});

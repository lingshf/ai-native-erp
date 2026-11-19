import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import {
  LegacyImportSnapshot,
  legacyImportPlan,
  type ImportChoices,
  type ImportEvent,
  type ImportRecord,
} from "../src/legacy/import-plan.ts";
import { openLegacyTeachingSnapshot } from "../src/legacy/teaching.ts";
import { captureDirectory, legacyFixture } from "./support/legacy-fixture.mjs";

const choices: ImportChoices = {
  drafts: "import-as-draft",
  receipts: "archive-only",
  "source-events": "archive-only",
  "transfer-queue": "archive-only",
  seals: "archive-only",
  audit: "archive-only",
};
const records = (events: ImportEvent[]): ImportRecord[] =>
  events.filter((event): event is ImportRecord => event.type === "record");
const summary = (events: ImportEvent[]) => {
  const last = events.at(-1);
  assert.equal(last?.type, "summary");
  if (last?.type !== "summary") throw new Error("Missing summary");
  return last;
};
function refresh(f, source: "teaching" | "enterprise") {
  const entry = f.manifest.ledgers[source];
  const bytes = readFileSync(join(f.target, entry.file));
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
}
function mutate(f, source: "teaching" | "enterprise", sql: string) {
  const db = new DatabaseSync(join(f.target, f.manifest.ledgers[source].file));
  try {
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec(sql);
  } finally {
    db.close();
  }
  refresh(f, source);
}
function open(f): LegacyImportSnapshot {
  const reader = new LegacyImportSnapshot(f.target, f.manifest);
  f.readers.push(reader);
  return reader;
}

function enterpriseHistory(f, suspense = false) {
  const debitAccount = suspense ? "2900" : "1000";
  mutate(
    f,
    "enterprise",
    `
    INSERT INTO source_events VALUES('F','FICT-POSTED','journal','2026-02-01','{}');
    INSERT INTO receipts VALUES('F','FICT-POSTED','{}');
    INSERT INTO journals(id,company,reference,accounting_date,document_date,tax_date,kind,operation,memo,details)
      VALUES(1,'F','FICT-POSTED','2026-02-01','2026-01-31','2026-02-04','normal','journal','Fictional history','{}');
    INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data)
      SELECT 'F',1,1,'${debitAccount}',350,0,json_object(
        'account','${debitAccount}','debit',350,'credit',0,'transactionDebit',350,'transactionCredit',0,
        'accountingCurrency','EUR','currency','EUR','reportingCurrency','EUR',
        'reportingDebit',350,'reportingCredit',0,'rateRefs',json('{"accounting":null,"reporting":null}'),
        'dimensions',json('{}'),'dimensionOrigins',json('{}'),'metadata',json('{}'));
    INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data)
      SELECT 'F',1,2,'4000',0,350,json_object(
        'account','4000','debit',0,'credit',350,'transactionDebit',0,'transactionCredit',350,
        'accountingCurrency','EUR','currency','EUR','reportingCurrency','EUR',
        'reportingDebit',0,'reportingCredit',350,'rateRefs',json('{"accounting":null,"reporting":null}'),
        'dimensions',json('{}'),'dimensionOrigins',json('{}'),'metadata',json('{}'));
    INSERT INTO journal_seals VALUES('F',1);
    INSERT INTO audit(company,action,reference,data,at)
      VALUES('F','journal.import','FICT-POSTED','{}','2026-02-01T10:00:00.000Z');
  `,
  );
}

test.for([{ history: true }, { many: true }, {}])(
  "mapping is byte-identical across pagination and preserves snapshot SHA: %j",
  (variant, t) => {
    const f = legacyFixture(t, variant);
    const before = captureDirectory(f.target, { mtime: true });
    const snapshot = open(f);
    const first = [...legacyImportPlan(snapshot, { choices, batchSize: 1 })];
    const second = [...legacyImportPlan(snapshot, { choices, batchSize: 5000 })];
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    const mapped = records(first);
    const account = mapped.find(
      (row) =>
        row.source === "teaching" &&
        row.object === "accounts" &&
        row.target !== null &&
        typeof row.target === "object" &&
        "code" in row.target &&
        row.target.code === "1100",
    );
    assert.equal(account?.target?.active, false);
    const db = new DatabaseSync(f.snapshot, { readOnly: true });
    try {
      for (const table of ["journals", "lines", "line_dimensions"]) {
        const n = db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n;
        assert.equal(summary(first).counts[`teaching.${table}`].source, n);
        assert.equal(summary(first).counts[`teaching.${table}`].mapped, n);
      }
    } finally {
      db.close();
    }
    for (const row of mapped.filter(
      (row) => row.source === "teaching" && row.object === "journals",
    )) {
      assert.equal(row.target?.tax_date, row.target?.document_date);
      assert.equal(row.target?.document_date, row.target?.accounting_date);
      assert.ok(row.target?.legacy_ref);
    }
    snapshot.close();
    assert.deepEqual(captureDirectory(f.target, { mtime: true }), before);
  },
);

test("monthly movements and all three cumulative trial stages match the read-only reader", (t) => {
  const f = legacyFixture(t, { history: true });
  const snapshot = open(f);
  const events = [...legacyImportPlan(snapshot, { choices, batchSize: 2 })];
  const totals = events.filter((event) => event.type === "totals" && event.source === "teaching");
  const reader = openLegacyTeachingSnapshot(f.config);
  f.readers.push(reader);
  for (const { month } of reader.periods()) {
    const trials = reader.trialBalances(month).trialBalances;
    for (const stage of ["unadjusted", "adjusted", "postClosing"] as const) {
      for (const account of trials[stage].rows) {
        let balance = 0n;
        for (const total of totals) {
          if (
            total.type !== "totals" ||
            total.status !== "posted" ||
            total.account !== account.code ||
            total.month > month
          )
            continue;
          const movement = total.month < month ? total.postClosing : total[stage];
          balance += BigInt(movement.debit) - BigInt(movement.credit);
        }
        assert.equal(balance, BigInt(account.debit) - BigInt(account.credit));
      }
    }
    for (const account of trials.postClosing.rows) {
      const ledger = reader.ledger({ month, account: account.code, limit: 1 });
      const total = totals.find(
        (row) =>
          row.type === "totals" &&
          row.month === month &&
          row.account === account.code &&
          row.status === "posted",
      );
      assert.equal(total?.postClosing.debit ?? "0", String(ledger.debit));
      assert.equal(total?.postClosing.credit ?? "0", String(ledger.credit));
    }
  }
});

test("decision-free dry-run lists all six choices and exact affected counts without defaults", (t) => {
  const f = legacyFixture(t);
  mutate(
    f,
    "enterprise",
    `
    INSERT INTO source_events VALUES('F','FICT-EVENT','journal','2026-01-01','{}');
    INSERT INTO receipts VALUES('F','FICT-EVENT','{}');
    INSERT INTO transfer_queue VALUES('F','FICT-EVENT','pending','[]',NULL,NULL);
    DROP TRIGGER seal_balance;
    INSERT INTO journal_seals VALUES('F',999);
  `,
  );
  const snapshot = open(f);
  const events = [...legacyImportPlan(snapshot, { dryRun: true })];
  assert.equal(events[0].type, "decisions");
  assert.deepEqual(
    events[0].choices.map(({ option, affected, selected }) => [option, affected, selected]),
    Object.keys(choices).map((option) => [option, 1, null]),
  );
  assert.equal(summary(events).executable, false);
  assert.deepEqual(summary(events).drafts, { journals: 1, lines: 2, lineDimensions: 0 });
  assert.throws(() => [...legacyImportPlan(snapshot, {})], /six decision C/);
  for (const incomplete of [
    { drafts: "skip" },
    { ...choices, audit: undefined },
    { ...choices, receipts: "guess" },
    { ...choices, extra: "import" },
  ])
    assert.throws(
      () => [...legacyImportPlan(snapshot, { choices: incomplete, dryRun: true })],
      /six decision C/,
    );
  const decisions = records(events).filter((row) => row.disposition === "decision-required");
  assert.ok(decisions.some((row) => row.object === "journals" && row.legacy_ref === "3"));
  assert.equal(decisions.filter((row) => row.object === "lines").length, 2);
});

test("skip applies to the whole draft aggregate, never posted lines or totals", (t) => {
  const f = legacyFixture(t);
  mutate(f, "teaching", "INSERT INTO line_dimensions VALUES(5,'TEAM','A')");
  const snapshot = open(f);
  const imported = [...legacyImportPlan(snapshot, { choices })];
  const skipped = [...legacyImportPlan(snapshot, { choices: { ...choices, drafts: "skip" } })];
  const skippedRows = records(skipped).filter((row) => row.disposition === "skipped");
  assert.equal(skippedRows.filter((row) => row.object === "journals").length, 1);
  assert.equal(skippedRows.filter((row) => row.object === "lines").length, 2);
  assert.equal(skippedRows.filter((row) => row.object === "line_dimensions").length, 1);
  assert.ok(skippedRows.every((row) => row.target === null));
  assert.deepEqual(
    imported.filter((row) => row.type === "totals"),
    skipped.filter((row) => row.type === "totals"),
  );
});

test("unknown currency, orphan line and missing dimension value are reported, not thrown or lost", (t) => {
  const f = legacyFixture(t);
  mutate(
    f,
    "teaching",
    `
    DROP TRIGGER immutable_line_insert;
    DROP TRIGGER immutable_dimension_insert;
    INSERT INTO lines VALUES(99,999,'1000',1,0);
    INSERT INTO line_dimensions VALUES(1,'TEAM','MISSING');
  `,
  );
  mutate(f, "enterprise", "DROP TRIGGER company_update; UPDATE companies SET currency='ZZZ'");
  const before = captureDirectory(f.target, { mtime: true });
  const events = [...legacyImportPlan(open(f), { choices, batchSize: 1 })];
  const issues = records(events).filter((row) => row.disposition === "unmappable");
  for (const reason of ["UNKNOWN_CURRENCY", "ORPHAN_LINE", "MISSING_DIMENSION_VALUE"])
    assert.ok(issues.some((row) => row.reasons.includes(reason)));
  assert.equal(summary(events).counts["teaching.lines"].source, 9);
  assert.equal(summary(events).counts["teaching.lines"].unmappable, 1);
  assert.equal(summary(events).counts["teaching.line_dimensions"].source, 3);
  assert.equal(summary(events).executable, false);
  assert.deepEqual(captureDirectory(f.target, { mtime: true }), before);
});

test("unrepresentable evidence is explicit; archive-only never manufactures receipts or seals", (t) => {
  const f = legacyFixture(t);
  mutate(
    f,
    "enterprise",
    `
    INSERT INTO source_events VALUES('F','FICT-EVENT','journal','2026-01-01','{}');
    INSERT INTO receipts VALUES('F','FICT-EVENT','{}');
    INSERT INTO transfer_queue VALUES('F','FICT-EVENT','pending','[]',NULL,NULL);
    DROP TRIGGER seal_balance;
    INSERT INTO journal_seals VALUES('F',999);
  `,
  );
  const snapshot = open(f);
  const imported = [
    ...legacyImportPlan(snapshot, {
      choices: {
        drafts: "import-as-draft",
        receipts: "import",
        "source-events": "import",
        "transfer-queue": "import",
        seals: "import",
        audit: "import",
      },
    }),
  ];
  for (const table of ["receipts", "source_events", "transfer_queue", "journal_seals", "audit"]) {
    const row = records(imported).find(
      (row) => row.source === "enterprise" && row.object === table,
    );
    assert.equal(row?.disposition, "unmappable");
    assert.ok(row?.reasons.includes("TARGET_SCHEMA_UNSUPPORTED"));
  }
  const archived = [...legacyImportPlan(snapshot, { choices })];
  for (const row of records(archived).filter((row) =>
    ["receipts", "source_events", "transfer_queue", "journal_seals", "audit"].includes(row.object),
  )) {
    assert.equal(row.disposition, "archive-only");
    assert.equal(row.target, null);
  }
});

test("Enterprise history preserves dates and normalized minor amounts without replaying business events", (t) => {
  const f = legacyFixture(t);
  enterpriseHistory(f);
  const events = [...legacyImportPlan(open(f), { choices: { ...choices, audit: "import" } })];
  const mapped = records(events);
  const journal = mapped.find((row) => row.source === "enterprise" && row.object === "journals");
  assert.equal(journal?.disposition, "mapped");
  assert.equal(journal?.target?.legacy_ref, "1");
  assert.equal(journal?.target?.accounting_date, "2026-02-01");
  assert.equal(journal?.target?.document_date, "2026-01-31");
  assert.equal(journal?.target?.tax_date, "2026-01-31");
  assert.equal(journal?.target?.status, "historical");
  assert.equal(summary(events).counts["enterprise.lines"].mapped, 2);
  const line = mapped.find((row) => row.source === "enterprise" && row.object === "lines");
  assert.equal(line?.target?.debit_minor, "350");
  assert.equal(JSON.parse(line?.target?.evidence).currency, "EUR");
  const audit = mapped.find(
    (row) => row.source === "enterprise" && row.object === "audit" && row.legacy_ref === "2",
  );
  assert.equal(audit?.disposition, "mapped");
  assert.equal(audit?.target?.principal, "legacy.import");
});

test("large aggregate amounts stay exact; malformed safe-range violations are reported", (t) => {
  const f = legacyFixture(t);
  mutate(
    f,
    "teaching",
    `
    DROP TRIGGER immutable_line_update;
    UPDATE lines SET debit=9007199254740991 WHERE id=1;
    UPDATE lines SET credit=9007199254740991 WHERE id=2;
  `,
  );
  const events = [...legacyImportPlan(open(f), { choices })];
  const cash = events.find(
    (row) =>
      row.type === "totals" &&
      row.source === "teaching" &&
      row.account === "1000" &&
      row.status === "posted",
  );
  assert.equal(cash?.postClosing.debit, "9007199254941316");
  // A separate snapshot is opened after deliberate fictional corruption.
  for (const reader of f.readers) reader.close();
  mutate(f, "teaching", "UPDATE lines SET debit=9223372036854775807 WHERE id=1");
  const invalid = [...legacyImportPlan(open(f), { choices })];
  const line = records(invalid).find(
    (row) => row.source === "teaching" && row.object === "lines" && row.legacy_ref === "1",
  );
  assert.equal(line?.disposition, "unmappable");
  assert.deepEqual(line?.reasons, ["INVALID_AMOUNT"]);
});

test("bad digest, unsafe paths, closed readers and oversized batches fail explicitly", (t) => {
  const f = legacyFixture(t);
  assert.throws(
    () =>
      new LegacyImportSnapshot(f.target, {
        ...f.manifest,
        ledgers: {
          ...f.manifest.ledgers,
          enterprise: { ...f.manifest.ledgers.enterprise, sha256: "0".repeat(64) },
        },
      }),
    { code: "INVALID_SNAPSHOT" },
  );
  assert.throws(() => new LegacyImportSnapshot(join(f.directory, "absent"), f.manifest));
  const snapshot = open(f);
  for (const batchSize of [0, 5001, 1.5, Number.NaN]) {
    assert.throws(() => [...legacyImportPlan(snapshot, { choices, batchSize })], RangeError);
  }
  snapshot.close();
  assert.throws(() => [...legacyImportPlan(snapshot, { choices })], { code: "CLOSED" });
});

test("populated Enterprise history is executable with identified source metadata retained", (t) => {
  const f = legacyFixture(t);
  enterpriseHistory(f);
  const before = captureDirectory(f.target, { mtime: true });
  const snapshot = open(f);
  const events = [...legacyImportPlan(snapshot, { choices, batchSize: 1 })];
  assert.equal(
    JSON.stringify(events),
    JSON.stringify([...legacyImportPlan(snapshot, { choices, batchSize: 5000 })]),
  );
  assert.equal(summary(events).executable, true);
  assert.equal(summary(events).counts["teaching.journals"].mapped, 4);
  assert.equal(summary(events).counts["teaching.lines"].mapped, 8);
  assert.equal(summary(events).counts["enterprise.companies"].mapped, 1);
  assert.equal(summary(events).counts["enterprise.accounts"].mapped, 15);
  assert.equal(summary(events).counts["enterprise.journals"].mapped, 1);
  assert.equal(summary(events).counts["enterprise.lines"].mapped, 2);
  for (const [table, reason, source] of [
    ["configs", "CONFIG_FOLDED_INTO_ACCOUNT", 15],
    ["config_versions", "SOURCE_CONFIG_HISTORY", 15],
    ["chart_templates", "SOURCE_TEMPLATE", 1],
    ["meta", "SOURCE_REVISION", 1],
  ] as const) {
    const count = summary(events).counts[`enterprise.${table}`];
    assert.equal(count.source, source);
    assert.equal(count["source-only"], source);
    assert.equal(count.unmappable, 0);
    for (const row of records(events).filter(
      (row) => row.source === "enterprise" && row.object === table,
    )) {
      assert.equal(row.disposition, "source-only");
      assert.deepEqual(row.reasons, [reason]);
      assert.equal(row.target, null);
    }
  }
  assert.ok(records(events).every((row) => row.disposition !== "unmappable"));
  assert.equal(events[0].snapshotSha256.teaching, f.manifest.ledgers.teaching.sha256);
  snapshot.close();
  assert.deepEqual(captureDirectory(f.target, { mtime: true }), before);
});

test("a real suspense posting blocks the populated Enterprise plan, not its unused chart definition", (t) => {
  const f = legacyFixture(t);
  enterpriseHistory(f, true);
  const events = [...legacyImportPlan(open(f), { choices })];
  assert.equal(summary(events).executable, false);
  const suspense = records(events).find(
    (row) => row.source === "enterprise" && row.object === "lines" && row.legacy_ref === "1",
  );
  assert.equal(suspense?.disposition, "unmappable");
  assert.deepEqual(suspense?.reasons, ["SUSPENSE_ACCOUNT"]);
  const definition = records(events).find(
    (row) =>
      row.source === "enterprise" && row.object === "accounts" && row.target?.code === "2900",
  );
  assert.equal(definition?.disposition, "mapped");
  assert.equal(summary(events).counts["enterprise.configs"]["source-only"], 15);
});

test("unhandled business configuration is not waived as source metadata", (t) => {
  const f = legacyFixture(t);
  enterpriseHistory(f);
  mutate(
    f,
    "enterprise",
    `
    INSERT INTO configs VALUES('F','unmapped-business-rule','FICT-RULE',1,1,'{}');
    INSERT INTO config_versions VALUES('F','unmapped-business-rule','FICT-RULE',1,1,'{}');
  `,
  );
  const events = [...legacyImportPlan(open(f), { choices })];
  assert.equal(summary(events).executable, false);
  for (const table of ["configs", "config_versions"]) {
    assert.equal(summary(events).counts[`enterprise.${table}`]["source-only"], 15);
    assert.equal(summary(events).counts[`enterprise.${table}`].unmappable, 1);
    const row = records(events).find(
      (row) =>
        row.source === "enterprise" && row.object === table && row.legacy_ref.includes("FICT-RULE"),
    );
    assert.deepEqual(row?.reasons, ["TARGET_SCHEMA_UNSUPPORTED"]);
  }
});

test("a conflicting current account config cannot claim its values were folded into the mapping", (t) => {
  const f = legacyFixture(t);
  enterpriseHistory(f);
  mutate(
    f,
    "enterprise",
    "UPDATE configs SET data=json_set(data,'$.name','Conflicting fictional name') WHERE code='1000'",
  );
  const events = [...legacyImportPlan(open(f), { choices })];
  assert.equal(summary(events).executable, false);
  const config = records(events).find(
    (row) =>
      row.source === "enterprise" && row.object === "configs" && row.legacy_ref.includes("1000"),
  );
  assert.equal(config?.disposition, "unmappable");
  assert.deepEqual(config?.reasons, ["ACCOUNT_CONFIG_MISMATCH"]);
});

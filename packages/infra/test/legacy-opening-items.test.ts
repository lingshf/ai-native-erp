import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";
import { JournalService, MasterDataService, TradeDocumentService } from "@erp/core/application";
import type { TradeActionCommand, TradeSettlementCommand } from "@erp/core/domain";
import { LegacyImportSnapshot, type ImportChoices } from "../src/legacy/import-plan.ts";
import { validateOpeningItems } from "../src/legacy/opening-items.ts";
import { checkLegacyOpeningItems, executeLegacyImport } from "../src/storage/legacy-import.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { journalTools } from "../src/storage/journals.ts";
import { captureDirectory, legacyFixture, openingItemsFile } from "./support/legacy-fixture.mjs";

const choices: ImportChoices = {
  drafts: "import-as-draft",
  receipts: "archive-only",
  "source-events": "archive-only",
  "transfer-queue": "archive-only",
  seals: "archive-only",
  audit: "archive-only",
};
const accounts = ["1300", "1400", "2100", "2300"];
/** Legacy journals 1-5 of company F: 1300 balance 130, 2100 nets to 0 over two journals, 2300 credit 25. */
const history: [string, [string, number][]][] = [
  [
    "2026-01-15",
    [
      ["1300", 100],
      ["4000", -100],
    ],
  ],
  [
    "2026-01-20",
    [
      ["1300", 30],
      ["4000", -30],
    ],
  ],
  [
    "2026-01-18",
    [
      ["2100", -100],
      ["5000", 100],
    ],
  ],
  [
    "2026-01-19",
    [
      ["2100", 100],
      ["1000", -100],
    ],
  ],
  [
    "2026-01-12",
    [
      ["2300", -25],
      ["1000", 25],
    ],
  ],
];
const items = {
  "1300": [
    { remainingMinor: 100, legacyJournal: "1" },
    70,
    { remainingMinor: -40, externalNo: "ADV-1300-1" },
  ],
  "2100": [-100, { remainingMinor: 100, externalNo: "ADV-2100-1" }],
  "2300": [-25],
};
function fixture(t, journals = history) {
  const f = legacyFixture(t, { tradeAdvances: true });
  const source = new Database(join(f.target, "erp.sqlite"));
  try {
    for (const [index, [date, lines]] of journals.entries()) {
      const reference = `FICT-OPENING-${index + 1}`;
      source
        .prepare("INSERT INTO source_events VALUES('F',?,'journal',?,'{}')")
        .run(reference, date);
      const journal = source
        .prepare(`INSERT INTO journals(company,reference,accounting_date,document_date,tax_date,kind,operation,memo,details)
          VALUES('F',?,?,?,?,'normal','journal','Fictional opening history','{}')`)
        .run(reference, date, date, date);
      for (const [line, [account, signed]] of lines.entries()) {
        const debit = Math.max(0, signed),
          credit = Math.max(0, -signed);
        source
          .prepare(
            "INSERT INTO lines(company,journal_id,line_no,account,debit,credit,data) VALUES('F',?,?,?,?,?,?)",
          )
          .run(
            journal.lastInsertRowid,
            line + 1,
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
  const entry = f.manifest.ledgers.enterprise,
    bytes = readFileSync(join(f.target, entry.file));
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  const snapshot = new LegacyImportSnapshot(f.target, f.manifest);
  f.readers.push(snapshot);
  return { ...f, snapshot };
}
function rows(file: string, sql: string, ...args: unknown[]) {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(sql).all(...args) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}
const opening = (extra = {}) => openingItemsFile({ accounts, items, master: true, ...extra });
const tradeTables = [
  "trade_terms",
  "trade_profiles",
  "trade_parties",
  "trade_config_history",
  "open_items",
  "trade_item_sources",
  "legacy_refs",
  "write_seq",
];
const snapshotOf = (file: string) =>
  JSON.stringify(
    tradeTables.map((table) => rows(file, `SELECT * FROM ${table} ORDER BY 1,2`)),
    (key, value) =>
      ["run_id", "import_run", "updated_at", "created_at", "recorded_at"].includes(key)
        ? null
        : value,
  );

test("an opening-phase interruption keeps opening open and resumes identically to an uninterrupted run", async (t) => {
  const f = fixture(t),
    first = join(f.directory, "first.sqlite"),
    resumed = join(f.directory, "resumed.sqlite");
  await executeLegacyImport(f.snapshot, { target: first, choices, openingItems: opening() });
  let interrupt = true;
  await assert.rejects(
    executeLegacyImport(
      f.snapshot,
      { target: resumed, choices, openingItems: opening() },
      {
        beforeOpeningRecheck() {
          if (interrupt) throw new Error("synthetic opening interruption");
        },
      },
    ),
    /synthetic opening interruption/,
  );
  const sha = createHash("sha256").update(opening().bytes).digest("hex");
  assert.deepEqual(
    rows(resumed, "SELECT status,opening,opening_details_sha FROM legacy_import_runs"),
    [{ status: "importing", opening: null, opening_details_sha: sha }],
  );
  assert.deepEqual(rows(resumed, "SELECT count(*) n FROM open_items"), [{ n: 0 }]);
  const before = readFileSync(resumed);
  await assert.rejects(
    executeLegacyImport(f.snapshot, {
      target: resumed,
      choices,
      openingItems: { bytes: Buffer.concat([opening().bytes, Buffer.from("\n")]) },
    }),
    { code: "CONFLICT" },
  );
  assert.deepEqual(readFileSync(resumed), before);
  interrupt = false;
  await executeLegacyImport(f.snapshot, { target: resumed, choices, openingItems: opening() });
  assert.deepEqual(JSON.parse(snapshotOf(resumed)), JSON.parse(snapshotOf(first)));
  assert.deepEqual(
    rows(resumed, "SELECT status,opening,opening_details_sha FROM legacy_import_runs"),
    [{ status: "imported", opening: "done", opening_details_sha: sha }],
  );
});

test("detail items import with kinds, D30 source journals and the bound SHA; a rerun is refused", async (t) => {
  const f = fixture(t),
    first = join(f.directory, "first.sqlite");
  await executeLegacyImport(f.snapshot, { target: first, choices, openingItems: opening() });
  const sha = createHash("sha256").update(opening().bytes).digest("hex");
  const imported = rows(
    first,
    `SELECT o.control_account account,o.side,o.party_id party,s.external_no,s.kind,o.gross_minor gross,o.accounting_date,
      j.legacy_id journal FROM open_items o JOIN trade_item_sources s USING(company_id,item_id)
      JOIN legacy_refs j ON j.object_type='journals' AND j.target_id=s.journal_id ORDER BY 1,4`,
  );
  assert.deepEqual(
    imported.map((row) => ({ ...row, journal: String(row.journal).split(":").at(-1) })),
    [
      ["1300", "AR", "C1", "ADV-1300-1", "advance", 40, "2"],
      ["1300", "AR", "C1", "OPEN-1300-1", "invoice", 100, "1"],
      ["1300", "AR", "C1", "OPEN-1300-2", "invoice", 70, "2"],
      ["2100", "AP", "V1", "ADV-2100-1", "advance", 100, "4"],
      ["2100", "AP", "V1", "OPEN-2100-1", "invoice", 100, "4"],
      ["2300", "AR", "C1", "OPEN-2300-1", "advance", 25, "5"],
    ].map(([account, side, party, external_no, kind, gross, journal]) => ({
      account,
      side,
      party,
      external_no,
      kind,
      gross,
      accounting_date: "2026-01-20",
      journal,
    })),
  );
  assert.deepEqual(
    rows(
      first,
      "SELECT legacy_id,json_extract(evidence,'$.declaration') declaration,json_extract(evidence,'$.sha') sha FROM legacy_refs WHERE object_type='opening_accounts' ORDER BY 1",
    ),
    accounts.map((account) => ({
      legacy_id: `F:${account}`,
      declaration: ["1300", "2100", "2300"].includes(account) ? "detail" : "empty",
      sha,
    })),
  );
  const done = readFileSync(first);
  await assert.rejects(
    executeLegacyImport(f.snapshot, { target: first, choices, openingItems: opening() }),
    { code: "CONFLICT" },
  );
  assert.deepEqual(readFileSync(first), done);
});

test("an opening re-check difference rolls back the phase and retains the target as failed", async (t) => {
  const f = fixture(t),
    target = join(f.directory, "failed.sqlite");
  await assert.rejects(
    executeLegacyImport(
      f.snapshot,
      { target, choices, openingItems: opening() },
      {
        beforeOpeningRecheck(db) {
          db.prepare(
            "DELETE FROM legacy_refs WHERE object_type='opening_accounts' AND legacy_id='F:1400'",
          ).run();
        },
      },
    ),
    (error: Error & { code?: string }) =>
      error.code === "CONFLICT" && /F\/1400: GL 0, opening items 0/u.test(error.message),
  );
  assert.deepEqual(rows(target, "SELECT status,opening FROM legacy_import_runs"), [
    { status: "failed", opening: null },
  ]);
  assert.deepEqual(rows(target, "SELECT count(*) n FROM open_items"), [{ n: 0 }]);
  await assert.rejects(
    executeLegacyImport(f.snapshot, { target, choices, openingItems: opening() }),
    { code: "CONFLICT" },
  );
});

const party = (side: "AP" | "AR") => (side === "AR" ? "C1" : "V1");
const rule = (pattern: RegExp, file: () => { bytes: Buffer } | undefined, journals = history) => ({
  pattern,
  file,
  journals,
});
const cases = {
  "rule 1 missing file": rule(/rule 1 F\/1300 accounts: missing/u, () => undefined),
  "rule 1 undeclared control": rule(/rule 1 F\/2300 accounts: missing/u, () =>
    opening({ accounts: ["1300", "1400", "2100"] }),
  ),
  "rule 2 one non-zero line deleted": rule(
    /rule 2 F\/1300 accounts: detail total 60 differs from LEGACY GL balance 130/u,
    () => opening({ items: { ...items, "1300": items["1300"].filter((_, index) => index !== 1) } }),
  ),
  "rule 2 empty with balance": rule(/rule 2 F\/1300 accounts: detail total 0 differs/u, () =>
    opening({ items: { "2100": items["2100"] } }),
  ),
  "rule 3 unknown party": rule(/rule 3 F\/1300 1300\.items\.1\.party: party X9/u, () =>
    opening({ items: { ...items, "1300": [100, { remainingMinor: 70, party: "X9" }, -40] } }),
  ),
  "rule 3 role": rule(/rule 3 F\/1300 1300\.items\.0\.party: party role vendor/u, () =>
    opening({
      items: {
        ...items,
        "1300": [{ remainingMinor: 130, party: "V1", partyName: "Fictional vendor" }],
      },
    }),
  ),
  "rule 4 duplicate number": rule(/rule 4 F\/1300 1300\.items\.1\.externalNo: duplicate/u, () =>
    opening({
      items: { ...items, "1300": [100, { remainingMinor: 30, externalNo: "open-1300-1" }] },
    }),
  ),
  "rule 4 zero amount": rule(
    /rule 4 F\/1300 1300\.items\.1\.remainingMinor: amount must not be 0/u,
    () => opening({ items: { ...items, "1300": [130, 0] } }),
  ),
  "rule 4 due date": rule(/rule 4 F\/1300 1300\.items\.0\.dueDate: due date precedes/u, () =>
    opening({ items: { ...items, "1300": [{ remainingMinor: 130, dueDate: "2026-01-09" }] } }),
  ),
  "D30 given journal without the account": rule(
    /F\/1300 1300\.items\.0\.legacyJournal: historical journal 3 has no line on 1300/u,
    () => opening({ items: { ...items, "1300": [{ remainingMinor: 130, legacyJournal: "3" }] } }),
  ),
  "D30 no journal touches the account": rule(
    /F\/2100 2100\.items\.0\.legacyJournal: no LEGACY journal touches 2100/u,
    () => opening(),
    history.slice(0, 2),
  ),
};
test.for(Object.entries(cases))(
  "%s blocks before any target is created and lists the issue",
  async ([, { pattern, file, journals }], t) => {
    const f = fixture(t, journals),
      target = join(f.directory, "refused.sqlite"),
      before = captureDirectory(f.target);
    const openingItems = file();
    const dry = checkLegacyOpeningItems(f.snapshot, { choices, openingItems });
    assert.ok(dry.issues.length > 0);
    await assert.rejects(
      executeLegacyImport(f.snapshot, { target, choices, openingItems }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, "INVALID_INPUT");
        assert.match(error.message, pattern);
        return true;
      },
    );
    assert.equal(existsSync(target), false);
    assert.deepEqual(captureDirectory(f.target), before);
  },
);

test("rule 5 compares per-party totals with an explicit legacy partner dimension", () => {
  const plan = new Database(":memory:");
  try {
    plan.exec(
      "CREATE TABLE planned(source TEXT,object TEXT,legacy TEXT,company TEXT,parent TEXT,date TEXT,target TEXT,phase INTEGER)",
    );
    const insert = plan.prepare("INSERT INTO planned VALUES('enterprise',?,?,'F',?,?,?,0)");
    insert.run("companies", "F", null, null, JSON.stringify({ currency: "EUR", year: 2026 }));
    insert.run(
      "accounts",
      "1300",
      null,
      null,
      JSON.stringify({
        code: "1300",
        name: "Receivables control",
        category: "ASSET",
        report_group: "receivables",
        normal_side: "DEBIT",
        purpose: "control",
        control_module: "AR",
        contra_of: null,
        manual_allowed: false,
        active: true,
      }),
    );
    insert.run("journals", "1", null, "2026-01-15", JSON.stringify({ status: "historical" }));
    for (const [line, partner, amount] of [
      ["1", "C1", 100],
      ["2", "C2", 50],
    ] as const) {
      insert.run(
        "lines",
        line,
        "1",
        null,
        JSON.stringify({ account_code: "1300", debit_minor: amount, credit_minor: 0 }),
      );
      insert.run(
        "line_dimensions",
        `${line}:PARTNER`,
        line,
        null,
        JSON.stringify({ dimension_code: "PARTNER", value_code: partner }),
      );
    }
    const { bytes } = openingItemsFile({
      accounts: ["1300"],
      items: { "1300": [150] },
      partnerDimension: "PARTNER",
    });
    const result = validateOpeningItems(plan, bytes);
    assert.deepEqual(
      result.issues.filter((issue) => issue.rule === "5").map((issue) => issue.detail),
      ["party C1: file 150 vs legacy PARTNER 100", "party C2: file 0 vs legacy PARTNER 50"],
    );
    assert.equal(
      result.issues.some((issue) => issue.rule === "2"),
      false,
    );
  } finally {
    plan.close();
  }
});

test("opening items settle by payment and apply on their own accounts; credit and cancel are references", async (t) => {
  const f = fixture(t),
    target = join(f.directory, "runtime.sqlite");
  await executeLegacyImport(f.snapshot, { target, choices, openingItems: opening() });
  const raw = new Database(target);
  try {
    raw.exec("UPDATE legacy_import_runs SET status='reconciled'");
  } finally {
    raw.close();
  }
  const ids = Object.fromEntries(
    rows(target, "SELECT external_no,item_id FROM trade_item_sources").map((row) => [
      row.external_no,
      String(row.item_id),
    ]),
  );
  const store = createMasterDataStore({ filename: target });
  try {
    const master = new MasterDataService(store);
    const period = (await master.periods("F", { limit: 12 })).items.find(
      (item) => item.month === "2026-01",
    );
    assert.ok(period);
    await master.setPeriod("F", "2026-01", period.revision, "open", "Fictional trade", true, [
      "trade",
      "tax",
    ]);
    const journals = new JournalService(store, journalTools);
    const service = new TradeDocumentService(store, journals, journalTools);
    const day = { accountingDate: "2026-01-31", documentDate: "2026-01-31", taxDate: "2026-01-31" };
    const revision = async (itemId: string) =>
      (await service.openItems("F", { limit: 500 })).items.find((item) => item.itemId === itemId)
        ?.revision ?? 0;
    const settle = async (side: "AP" | "AR", itemId: string, gross: number) => {
      const command: TradeSettlementCommand = {
        company: "F",
        paymentId: randomUUID(),
        side,
        party: party(side),
        currency: "EUR",
        ...day,
        items: [{ itemId, revision: await revision(itemId), gross, takeDiscount: false }],
      };
      const preview = await service.previewSettlement(command);
      const receipt = await service.confirmSettlement({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      });
      return (await journals.entry("F", receipt.journalIds[0])).entry.lines.map((line) => [
        line.account,
        line.debit,
        line.credit,
      ]);
    };
    const act = async (command: TradeActionCommand) => {
      const preview = await service.previewAction(command);
      const receipt = await service.confirmAction({
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmation: "POST",
      });
      const lines = [];
      for (const id of receipt.journalIds)
        for (const line of (await journals.entry("F", id)).entry.lines)
          lines.push([line.account, line.debit, line.credit]);
      return lines.sort();
    };
    assert.deepEqual((await settle("AR", ids["OPEN-1300-1"], 60)).sort(), [
      ["1000", 60, 0],
      ["1300", 0, 60],
    ]);
    // The +100/-100 AP pair nets to 0 on 2100 yet each row settles on its own.
    assert.deepEqual((await settle("AP", ids["OPEN-2100-1"], 100)).sort(), [
      ["1000", 0, 100],
      ["2100", 100, 0],
    ]);
    assert.deepEqual((await settle("AP", ids["ADV-2100-1"], 100)).sort(), [
      ["1000", 100, 0],
      ["2100", 0, 100],
    ]);
    const header = { company: "F", actionId: randomUUID(), ...day };
    const apply = async (source: string, gross: number) =>
      act({
        ...header,
        actionId: randomUUID(),
        kind: "apply",
        sourceId: ids[source],
        sourceRevision: await revision(ids[source]),
        targetId: ids["OPEN-1300-2"],
        targetRevision: await revision(ids["OPEN-1300-2"]),
        gross,
      });
    // Same control account: the subledger moves, GL nets to nothing.
    assert.deepEqual(await apply("ADV-1300-1", 40), []);
    // The 2300 advance keeps its own account even though the profile's AR control is 1300.
    assert.deepEqual(await apply("OPEN-2300-1", 25), [
      ["1300", 0, 25],
      ["2300", 25, 0],
    ]);
    assert.equal(
      (await service.openItems("F", { limit: 500 })).items.find(
        (item) => item.itemId === ids["OPEN-1300-2"],
      )?.remainingGross,
      5,
    );
    const before = rows(target, "SELECT * FROM open_items ORDER BY item_id");
    await assert.rejects(
      service.previewAction({
        ...header,
        actionId: randomUUID(),
        kind: "credit",
        invoiceId: ids["OPEN-1300-2"],
        revision: await revision(ids["OPEN-1300-2"]),
        lines: [{ sourceLineId: "L1", quantity: "1" }],
      }),
      { issue: { scope: "tradeDocument", path: "invoiceId", rule: "reference" } },
    );
    await assert.rejects(
      service.previewAction({
        ...header,
        actionId: randomUUID(),
        kind: "cancel",
        itemId: ids["OPEN-1300-2"],
        revision: await revision(ids["OPEN-1300-2"]),
        relatedRevision: null,
        reason: "Fictional cancellation",
      }),
      { issue: { scope: "tradeDocument", path: "itemId", rule: "reference" } },
    );
    assert.deepEqual(rows(target, "SELECT * FROM open_items ORDER BY item_id"), before);
  } finally {
    await store.close();
  }
});

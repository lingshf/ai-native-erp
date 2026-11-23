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
  // Identity (raw-bytes SHA) is proven before content: a corrupted file is CONFLICT, while a
  // missing file remains the required-input error.
  for (const [openingItems, code] of [
    [{ bytes: opening().bytes.subarray(0, -1) }, "CONFLICT"],
    [undefined, "INVALID_INPUT"],
  ] as const)
    await assert.rejects(
      executeLegacyImport(f.snapshot, { target: resumed, choices, openingItems }),
      { code },
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
  "rule 4 duplicate number across AP and AR of one party": rule(
    /rule 4 F\/2100 2100\.items\.0\.externalNo: duplicate external number OPEN-1300-1 for C1/u,
    () => {
      const file = JSON.parse(String(opening().bytes));
      const c1 = file.parties.find((party: { code: string }) => party.code === "C1");
      Object.assign(c1, { role: "both", apProfile: "APP" });
      const ap = file.accounts.find((account: { account: string }) => account.account === "2100");
      Object.assign(ap.items[0], {
        party: "C1",
        partyName: "Fictional customer",
        externalNo: "open-1300-1",
      });
      return { bytes: Buffer.from(JSON.stringify(file)) };
    },
  ),
  "shape corrupted file": rule(/rule shape openingItems: file is not a UTF-8 JSON object/u, () => ({
    bytes: opening().bytes.subarray(0, -1),
  })),
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

/** The pre-D430 per-item queries, kept as the oracle the precomputed lookup must match. */
function perItemSourceJournal(
  plan: Database.Database,
  company: string,
  account: string,
  legacyJournal: string | undefined,
) {
  const lines = `FROM planned l JOIN planned j ON j.source=l.source AND j.object='journals' AND j.legacy=l.parent AND j.company=l.company
    WHERE l.object='lines' AND json_extract(j.target,'$.status')='historical' AND l.company=? AND json_extract(l.target,'$.account_code')=?`;
  if (legacyJournal !== undefined)
    return plan
      .prepare(`SELECT 1 ${lines} AND l.parent=? LIMIT 1`)
      .get(company, account, legacyJournal)
      ? legacyJournal
      : null;
  const latest = plan
    .prepare(
      `SELECT j.legacy ${lines} ORDER BY j.date DESC,length(j.legacy) DESC,j.legacy DESC LIMIT 1`,
    )
    .get(company, account) as { legacy: string } | undefined;
  return latest?.legacy ?? null;
}

test("D30 source journals from the per-account lookup match the per-item queries item by item", () => {
  const plan = new Database(":memory:");
  try {
    plan.exec(
      "CREATE TABLE planned(source TEXT,object TEXT,legacy TEXT,company TEXT,parent TEXT,date TEXT,target TEXT,phase INTEGER)",
    );
    const insert = plan.prepare("INSERT INTO planned VALUES('enterprise',?,?,?,?,?,?,0)");
    for (const company of ["F", "G"])
      insert.run(
        "companies",
        company,
        company,
        null,
        null,
        JSON.stringify({ currency: "EUR", year: 2026 }),
      );
    insert.run(
      "accounts",
      "1300",
      "F",
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
    // Same-day journals 9/10/11 test the length-then-value tiebreak; 12 is not historical,
    // 8 has no line on 1300 and G's 13 is another company's journal on the same account.
    const journals: [string, string, string, string, string][] = [
      ["F", "8", "2026-01-18", "historical", "4000"],
      ["F", "9", "2026-01-20", "historical", "1300"],
      ["F", "10", "2026-01-20", "historical", "1300"],
      ["F", "11", "2026-01-20", "historical", "1300"],
      ["F", "12", "2026-01-25", "draft", "1300"],
      ["G", "13", "2026-01-30", "historical", "1300"],
    ];
    for (const [company, legacy, date, status, account] of journals) {
      insert.run("journals", legacy, company, null, date, JSON.stringify({ status }));
      insert.run(
        "lines",
        `${legacy}:1`,
        company,
        legacy,
        null,
        JSON.stringify({ account_code: account, debit_minor: 10, credit_minor: 0 }),
      );
    }
    const given = [undefined, "9", "11", "12", "8", "13", "99"];
    const { bytes } = openingItemsFile({
      accounts: ["1300"],
      items: { "1300": given.map((legacyJournal) => ({ remainingMinor: 1, legacyJournal })) },
    });
    const result = validateOpeningItems(plan, bytes);
    const expected = given.map((legacyJournal) =>
      perItemSourceJournal(plan, "F", "1300", legacyJournal),
    );
    assert.deepEqual(expected, ["11", "9", "11", null, null, null, null]);
    assert.deepEqual(
      result.plan.entries.map((entry) => entry.journalLegacyRef.split(":").at(-1)),
      expected.filter((journal) => journal !== null),
    );
    assert.deepEqual(
      result.issues
        .filter((issue) => /legacyJournal$/u.test(issue.path))
        .map((issue) => Number(issue.path.split(".")[2])),
      expected.flatMap((journal, index) => (journal === null ? [index] : [])),
    );
  } finally {
    plan.close();
  }
});

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

test("party default dimensions pass the same M1-01 check the opening phase save applies", () => {
  const plan = new Database(":memory:");
  try {
    plan.exec(
      "CREATE TABLE planned(source TEXT,object TEXT,legacy TEXT,company TEXT,parent TEXT,date TEXT,target TEXT,phase INTEGER)",
    );
    const insert = plan.prepare("INSERT INTO planned VALUES('enterprise',?,?,'F',NULL,NULL,?,0)");
    insert.run("companies", "F", JSON.stringify({ currency: "EUR", year: 2026 }));
    for (const [code, control_module, category, normal_side] of [
      ["1300", "AR", "ASSET", "DEBIT"],
      ["2300", "AR", "LIABILITY", "CREDIT"],
    ])
      insert.run(
        "accounts",
        code,
        JSON.stringify({
          code,
          name: `Fictional ${code}`,
          category,
          report_group: code === "1300" ? "receivables" : "otherLiabilities",
          normal_side,
          purpose: "control",
          control_module,
          contra_of: null,
          manual_allowed: false,
          active: true,
        }),
      );
    for (const code of ["1000", "4000"])
      insert.run(
        "accounts",
        code,
        JSON.stringify({
          code,
          name: `Fictional ${code}`,
          category: code === "1000" ? "ASSET" : "REVENUE",
          report_group: code === "1000" ? "cash" : "revenue",
          normal_side: code === "1000" ? "DEBIT" : "CREDIT",
          purpose: "general",
          control_module: null,
          contra_of: null,
          manual_allowed: true,
          active: true,
        }),
      );
    insert.run("dimensions", "REGION", JSON.stringify({ code: "REGION", active: true }));
    insert.run(
      "dimension_values",
      "REGION:N",
      JSON.stringify({ dimension_code: "REGION", value_code: "N", active: true }),
    );
    insert.run(
      "dimension_values",
      "REGION:OLD",
      JSON.stringify({ dimension_code: "REGION", value_code: "OLD", active: false }),
    );
    const issues = (to: string, defaultDimensions: unknown) => {
      const file = JSON.parse(String(opening({ accounts: ["1300", "2300"], items: {} }).bytes));
      const master = JSON.parse(String(opening().bytes));
      Object.assign(file, {
        terms: master.terms,
        profiles: master.profiles.filter((profile: { side: string }) => profile.side === "AR"),
        parties: master.parties
          .filter((party: { code: string }) => party.code === "C1")
          .map((party: object) => ({ ...party, to, defaultDimensions })),
      });
      file.terms[0].to = to;
      file.profiles[0].to = to;
      return validateOpeningItems(plan, Buffer.from(JSON.stringify(file))).issues.map(
        ({ rule, path }) => `${rule} ${path}`,
      );
    };
    // The widest M1-01 window is covered by the fixed LEGACY dimension window.
    assert.deepEqual(issues("9998-12-31", { REGION: "N" }), []);
    assert.deepEqual(issues("9998-12-31", { REGION: null }), []);
    // A window ending 9999-12-31 is itself invalid in M1-01 and blocks before any write.
    assert.deepEqual(issues("9999-12-31", { REGION: "N" }), [
      "mapping $.terms.0",
      "mapping $.profiles.0",
      "3 $.parties.0",
    ]);
    for (const [defaultDimensions, path] of [
      [{ REGION: "OLD" }, "defaultDimensions.REGION"],
      [{ REGION: "S" }, "defaultDimensions.REGION"],
      [{ AREA: null }, "defaultDimensions.AREA"],
      [["REGION"], "defaultDimensions"],
      [
        Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`D${i}`, null])),
        "defaultDimensions",
      ],
    ] as const)
      assert.deepEqual(issues("2099-12-31", defaultDimensions), [`3 tradeParty:C1.${path}`]);
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
    // D25 P formula: opening items explain LEGACY GL before and after TRADE settlements.
    const explained = async () =>
      (await service.reconciliation("F", "2026-01")).rows.map((row) => ({
        account: row.account,
        openingGlMinor: row.openingGlMinor,
        tradeGlMinor: row.tradeGlMinor,
        tradeDifferenceMinor: row.tradeDifferenceMinor,
        otherSourceMinor: row.otherSourceMinor,
        differenceMinor: row.differenceMinor,
      }));
    const initial = await explained();
    assert.ok(initial.some((row) => row.openingGlMinor !== 0));
    for (const row of initial)
      assert.deepEqual(row, {
        ...row,
        tradeGlMinor: 0,
        tradeDifferenceMinor: 0,
        otherSourceMinor: 0,
        differenceMinor: 0,
      });
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
    const settled = await explained();
    assert.deepEqual(
      settled.map((row) => row.openingGlMinor),
      initial.map((row) => row.openingGlMinor),
    );
    assert.equal(settled.find((row) => row.account === "1300")?.tradeGlMinor, -85);
    for (const row of settled)
      assert.deepEqual(row, {
        ...row,
        tradeDifferenceMinor: 0,
        otherSourceMinor: 0,
        differenceMinor: 0,
      });
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

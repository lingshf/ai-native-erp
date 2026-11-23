import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { LegacyImportSnapshot, type ImportChoices } from "../../src/legacy/import-plan.ts";
import { legacyFixture, openingItemsFile } from "./legacy-fixture.mjs";

/** Shared by the opening-items and opening-batches tests: legacy company F with AP/AR history. */
type FixtureContext = Parameters<typeof legacyFixture>[0];
export const choices: ImportChoices = {
  drafts: "import-as-draft",
  receipts: "archive-only",
  "source-events": "archive-only",
  "transfer-queue": "archive-only",
  seals: "archive-only",
  audit: "archive-only",
};
export const accounts = ["1300", "1400", "2100", "2300"];
/** Legacy journals 1-5 of company F: 1300 balance 130, 2100 nets to 0 over two journals, 2300 credit 25. */
export const history: [string, [string, number][]][] = [
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
export const items = {
  "1300": [
    { remainingMinor: 100, legacyJournal: "1" },
    70,
    { remainingMinor: -40, externalNo: "ADV-1300-1" },
  ],
  "2100": [-100, { remainingMinor: 100, externalNo: "ADV-2100-1" }],
  "2300": [-25],
};
export function fixture(t: FixtureContext, journals = history) {
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
export function rows(file: string, sql: string, ...args: unknown[]) {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(sql).all(...args) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}
export const opening = (extra = {}) =>
  openingItemsFile({ accounts, items, master: true, ...extra });

/** Receivables control account 1300 as the staged import plan stores it. */
export const RECEIVABLES_CONTROL_1300 = {
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
};
/** An in-memory staged import plan holding enterprise-source rows, for validation unit tests. */
export function plannedImport() {
  const plan = new Database(":memory:");
  plan.exec(
    "CREATE TABLE planned(source TEXT,object TEXT,legacy TEXT,company TEXT,parent TEXT,date TEXT,target TEXT,phase INTEGER)",
  );
  const insert = plan.prepare("INSERT INTO planned VALUES('enterprise',?,?,?,?,?,?,0)");
  const add = (
    object: string,
    legacy: string,
    company: string,
    parent: string | null,
    date: string | null,
    target: object,
  ) => void insert.run(object, legacy, company, parent, date, JSON.stringify(target));
  return { plan, add };
}

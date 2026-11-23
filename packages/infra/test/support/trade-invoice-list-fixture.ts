// TINV-05: deterministic invoice-list fixture shared by the filter tests, the base/head byte
// comparison and bench/trade-invoice-list.ts. Every identifier, date and sequence is fixed by the
// caller; the only journal is one manual entry with a fixed id. Rows are written directly with
// foreign keys ON and checked with PRAGMA foreign_key_check, so they satisfy every CHECK and
// foreign key of the migrations (the list read path needs no lines, open items or GL detail).
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { JournalService, MasterDataService } from "@erp/core/application";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { inspectSchema, migrateConnection } from "../../src/storage/migrations.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";

export interface InvoiceListRow {
  readonly sequence: number;
  readonly side: "AP" | "AR";
  readonly party: string;
  readonly accountingDate: string;
  readonly orderId?: string;
}
export const fixtureJournalId = "00000000-0000-4000-8000-00000000a001";
export const fixtureDocumentId = (sequence: number) =>
  `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
export const fixtureExternalNo = (sequence: number) => `EXT-${String(sequence).padStart(6, "0")}`;
export const fixtureGross = (sequence: number) => 1_000 + ((sequence * 37) % 9_000);

const hex = (seed: number) => `${seed.toString(16).padStart(8, "0")}ab`.repeat(7).slice(0, 64);

/** Migrates and seeds a new ledger at `filename`; every row is in company DEFAULT. */
export async function seedInvoiceList(
  filename: string,
  parties: readonly string[],
  invoices: Iterable<InvoiceListRow>,
  orders: readonly string[] = [],
): Promise<number> {
  const storage = createSqliteStorage({ filename });
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const store = createMasterDataStore({ filename });
  try {
    const master = new MasterDataService(store);
    await master.initialize(2026);
    const { builtin: _, revision: __, ...cash } = await master.account("DEFAULT", "1000");
    await master.saveAccount("DEFAULT", { ...cash, code: "1100", name: "Bank" }, 0);
    const journals = new JournalService(store, journalTools);
    const draft = await journals.save("DEFAULT", {
      id: fixtureJournalId,
      revision: 0,
      sourceRef: "TINV05-FIXTURE",
      date: "2026-01-15",
      memo: "Fixture journal for invoice-list rows",
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines: [
        {
          account: "1100",
          debit: "1.00",
          credit: "",
          dimensions: {},
          suspense: null,
        },
        {
          account: "3000",
          debit: "",
          credit: "1.00",
          dimensions: {},
          suspense: null,
        },
      ],
    });
    const preview = await journals.preview("DEFAULT", draft);
    const receipt = await journals.confirm({
      company: "DEFAULT",
      draftId: draft.id,
      revision: draft.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: "00000000-0000-4000-8000-00000000b001",
      confirmation: "POST",
    });
    assert.deepEqual(receipt.journalIds, [fixtureJournalId]);
  } finally {
    await store.close();
  }
  const db = new Database(filename);
  let count = 0;
  try {
    db.pragma("foreign_keys = ON");
    const account = db.prepare(
      "INSERT OR IGNORE INTO accounts VALUES(?,?,?,?,?,?,?,?,NULL,?,1,0,1)",
    );
    const terms = db.prepare(
      "INSERT INTO trade_terms VALUES(?,'N30','Net 30',1,1,'2026-01-01','2026-12-31',30,0,'0',0)",
    );
    const profile = db.prepare(
      "INSERT INTO trade_profiles VALUES(?,'APP','AP profile',1,1,'2026-01-01','2026-12-31','AP','2100','1000','1000','5000')",
    );
    const party = db.prepare(
      "INSERT INTO trade_parties VALUES(?,?,?,1,1,'2026-01-01','2026-12-31','vendor','APP',NULL,'N30','[]','{}')",
    );
    const order = db.prepare(
      "INSERT INTO trade_orders VALUES(?,?,'AP',?,'CNY','2026-01-05',0,'line',?,'2026-01-05T08:00:00.000Z')",
    );
    const document = db.prepare(
      `INSERT INTO trade_documents(sequence,company_id,document_id,kind,side,party_id,external_no,external_no_normalized,currency,accounting_date,document_date,tax_date,due_date,order_id,po_match,exception_reason,net_minor,tax_minor,gross_minor,journal_id,receipt_key,fingerprint,command_hash,snapshot,posted_at)
       VALUES(?,?,?,'invoice',?,?,?,?,'CNY',?,?,?,?,?,?,NULL,?,0,?,?,?,?,?,'{}','2026-01-15T08:00:00.000Z')`,
    );
    db.transaction(() => {
      for (const [code, name, category, group, side, purpose, module, manual] of [
        ["2100", "Payables", "LIABILITY", "payables", "CREDIT", "control", "AP", 0],
        ["1000", "Cash", "ASSET", "cash", "DEBIT", "general", null, 1],
        ["5000", "Expense", "EXPENSE", "operatingExpense", "DEBIT", "general", null, 1],
      ] as const)
        account.run("DEFAULT", code, name, category, group, side, purpose, module, manual);
      terms.run("DEFAULT");
      profile.run("DEFAULT");
      for (const code of parties) party.run("DEFAULT", code, `Fictional ${code}`);
      for (const orderId of orders) order.run("DEFAULT", orderId, parties[0], hex(orderId.length));
      for (const row of invoices) {
        const gross = fixtureGross(row.sequence);
        const day = row.accountingDate;
        document.run(
          row.sequence,
          "DEFAULT",
          fixtureDocumentId(row.sequence),
          row.side,
          row.party,
          fixtureExternalNo(row.sequence),
          fixtureExternalNo(row.sequence),
          day,
          day,
          day,
          day,
          row.orderId ?? null,
          row.orderId ? "matched" : "notApplicable",
          gross,
          gross,
          fixtureJournalId,
          `00000000-0000-4000-9000-${String(row.sequence).padStart(12, "0")}`,
          hex(row.sequence),
          hex(row.sequence + 1),
        );
        count++;
      }
    })();
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    db.close();
  }
  return count;
}

/** Acceptance 2 compatibility fixture: identical on base and head, five invoices in DEFAULT. */
export const compatParties = ["P01", "P02", "P03"] as const;
export const compatOrders = ["PO-1"] as const;
export const compatInvoices: readonly InvoiceListRow[] = [
  { sequence: 1, side: "AP", party: "P01", accountingDate: "2026-01-10" },
  { sequence: 2, side: "AR", party: "P02", accountingDate: "2026-02-11" },
  {
    sequence: 3,
    side: "AP",
    party: "P01",
    accountingDate: "2026-03-12",
    orderId: "PO-1",
  },
  { sequence: 4, side: "AR", party: "P03", accountingDate: "2026-04-13" },
  { sequence: 5, side: "AP", party: "P02", accountingDate: "2026-05-14" },
];

/** Runs the real migrations up to and including 017 and stops before 018 (trade_documents_party). */
export function ledgerAt017(filename: string): Promise<void> {
  return ledgerBefore(filename, "trade_documents_party", 17);
}
/** Runs the real migrations up to and including 018 and stops before 019 (trade_order_invoicing). */
export function ledgerAt018(filename: string): Promise<void> {
  return ledgerBefore(filename, "trade_order_invoicing", 18);
}
// Applies every pending migration in order until the first script that mentions `marker`, which
// is rejected with its whole transaction step; the ledger is left at `version`.
async function ledgerBefore(filename: string, marker: string, version: number): Promise<void> {
  const backend = sqliteBackend({ filename });
  const db = await backend.acquire(false, true),
    stop = Error(`stop before ${marker}`);
  try {
    await db.begin();
    await assert.rejects(
      migrateConnection({
        ...db,
        async script(sql) {
          if (sql.includes(marker)) throw stop;
          await db.script(sql);
        },
      }),
      (error) => error === stop,
    );
    await db.commit();
    assert.equal(await inspectSchema(db, true), version);
  } finally {
    await db.release();
    await backend.close();
  }
}

/**
 * Copies every row of every user table except schema_migrations from `source` (a ledger with
 * really posted documents) into `target` (a ledger built by ledgerAt017 or ledgerAt018), in table
 * creation order, then asserts every table of `target` equals `source` row for row (all columns)
 * and that no foreign key is broken. Tables the older target does not have yet (e.g. 019's
 * trade_order_invoicing) are skipped: its upgrade must create them. Rows produced by INSERT
 * triggers in the target are kept only when identical to the copied ones.
 */
export function copyLedgerRows(source: string, target: string): void {
  const db = new Database(target);
  try {
    db.pragma("foreign_keys = OFF");
    db.prepare("ATTACH DATABASE ? AS src").run(source);
    const tables = db
      .prepare(
        "SELECT name FROM src.sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name<>'schema_migrations' AND name IN (SELECT name FROM main.sqlite_schema WHERE type='table') ORDER BY rowid",
      )
      .pluck()
      .all() as string[];
    // INSERT triggers check cross-table state (e.g. a seal needs its journal lines), so a table
    // rejected in one pass is retried after the others; each failed statement rolls back alone.
    db.transaction(() => {
      // Rows the migrations themselves seed (counters) are replaced by the source's rows.
      for (const table of tables) db.exec(`DELETE FROM main."${table}"`);
      let pending = tables;
      while (pending.length) {
        const failed = pending.filter((table) => {
          try {
            db.exec(`INSERT OR IGNORE INTO main."${table}" SELECT * FROM src."${table}"`);
            return false;
          } catch {
            return true;
          }
        });
        assert.ok(failed.length < pending.length, `cannot copy ${failed.join(", ")}`);
        pending = failed;
      }
    })();
    for (const table of tables)
      assert.equal(
        db.prepare(`SELECT count(*) FROM main."${table}"`).pluck().get(),
        db.prepare(`SELECT count(*) FROM src."${table}"`).pluck().get(),
        table,
      );
    for (const table of tables)
      assert.deepEqual(
        db.prepare(`SELECT * FROM main."${table}" EXCEPT SELECT * FROM src."${table}"`).all(),
        [],
        table,
      );
    for (const table of tables)
      assert.deepEqual(
        db.prepare(`SELECT * FROM src."${table}" EXCEPT SELECT * FROM main."${table}"`).all(),
        [],
        table,
      );
    db.exec("DETACH DATABASE src");
    db.pragma("foreign_keys = ON");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    db.close();
  }
}

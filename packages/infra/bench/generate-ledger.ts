import { createHash } from "node:crypto";
import { openSync, closeSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { MasterDataService, DimensionService } from "@erp/core/application";
import { journalReceiptSchema } from "@erp/core/contracts";
import { createSqliteStorage } from "../src/storage/index.ts";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { APPLICATION_ID } from "../src/storage/sqlite.ts";

export const ledgerFixtureId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export async function generateLedgerFixture(filename: string) {
  const start = performance.now(),
    storage = createSqliteStorage({ filename });
  // Refuse existing targets: this utility must never seed a user's ledger.
  closeSync(openSync(filename, "wx"));
  const empty = new Database(filename);
  try {
    empty.pragma(`application_id = ${APPLICATION_ID}`);
  } finally {
    empty.close();
  }
  try {
    await storage.migrate();
  } finally {
    await storage.close();
  }
  const store = createMasterDataStore({ filename });
  try {
    const master = new MasterDataService(store, () => "2025-01-01T00:00:00.000Z"),
      dimensions = new DimensionService(store, () => "2025-01-01T00:00:00.000Z");
    await master.initialize(2025);
    for (let i = 0; i < 192; i++)
      await master.saveAccount(
        "DEFAULT",
        {
          code: String(1300 + i),
          name: `Synthetic ${i}`,
          category: i < 96 ? "ASSET" : "REVENUE",
          reportGroup: i < 96 ? "otherAssets" : "otherRevenue",
          normalSide: i < 96 ? "DEBIT" : "CREDIT",
          purpose: "general",
          controlModule: null,
          contraOf: null,
          manualAllowed: true,
          active: true,
        },
        0,
      );
    const base = { revision: 0, active: true, from: "2025-01-01", to: "2026-12-31" };
    for (const code of ["DEPT", "COST", "SITE"]) {
      await dimensions.save("DEFAULT", { ...base, kind: "dimension", code, name: code });
      for (const value of ["A", "B"])
        await dimensions.save("DEFAULT", {
          ...base,
          kind: "value",
          dimension: code,
          code: value,
          name: value,
        });
    }
  } finally {
    await store.close();
  }
  const db = new Database(filename),
    digest = createHash("sha256");
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    const periods = Array.from(
      { length: 24 },
      (_, i) => `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
    );
    const insertPeriod = db.prepare(
      "INSERT INTO periods(company_id,month,status,revision) VALUES('DEFAULT',?,'open',1) ON CONFLICT DO NOTHING",
    );
    for (const month of periods) insertPeriod.run(month);
    const accounts = db.prepare("SELECT code,normal_side FROM accounts ORDER BY code").all() as {
      code: string;
      normal_side: string;
    }[];
    const debits = accounts
        .filter((a) => a.normal_side === "DEBIT" && a.code !== "1000")
        .map((a) => a.code),
      credits = accounts.filter((a) => a.normal_side === "CREDIT").map((a) => a.code);
    const receipt = db.prepare(
      "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version,idempotency_key,source_ref) VALUES('LOCAL','LOCAL','DEFAULT','journal.confirm',?,'LOCAL',?,?,1,?,?)",
    );
    const entry = db.prepare(
      "INSERT INTO journal_entries(company_id,id,receipt_key,source_ref,accounting_date,document_date,tax_date,period,memo,kind,operation,role,posted_at,fingerprint) VALUES('DEFAULT',?,?,?,?,?,?,?,'Deterministic capacity fixture',?,'journal','normal',?,?)",
    );
    const line = db.prepare("INSERT INTO journal_lines VALUES('DEFAULT',?,?,?,?,?,?,?,?)");
    const seal = db.prepare("INSERT INTO journal_seals VALUES('DEFAULT',?,?)");
    const audit = db.prepare(
      "INSERT INTO audit VALUES('LOCAL','LOCAL','DEFAULT',?,'journal.confirm',?,'LOCAL',?,?)",
    );
    const evidence = JSON.stringify({
      dimensionOrigins: {},
      role: "business",
      suspense: null,
      balancing: null,
      historical: null,
      group: null,
    });
    const postedAt = "2026-12-31T23:59:59.000Z";
    let turnover = 0;
    db.transaction(() => {
      for (let index = 0; index < 1000; index++) {
        const id = ledgerFixtureId(index + 1),
          key = ledgerFixtureId(index + 1001),
          sourceRef = `SYNTHETIC-${index + 1}`;
        const month = index < 200 ? "2026-12" : periods[(index - 200) % 24],
          date = `${month}-${String((index % 28) + 1).padStart(2, "0")}`;
        const fingerprint = createHash("sha256").update(`m012-v1:${id}`).digest("hex");
        const result = JSON.stringify(
          journalReceiptSchema.parse({
            company: "DEFAULT",
            sourceRef,
            idempotencyKey: key,
            draftId: id,
            draftRevision: 1,
            fingerprint,
            operation: "journal",
            journalIds: [id],
            postedAt,
          }),
        );
        receipt.run(key, fingerprint, result, key, sourceRef);
        entry.run(
          id,
          key,
          sourceRef,
          date,
          date,
          date,
          month,
          index % 7 === 0 ? "adjusting" : "normal",
          postedAt,
          fingerprint,
        );
        let debitTotal = 0;
        for (let pair = 0; pair < 500; pair++) {
          const amount = ((index * 17 + pair * 13) % 10000) + 1,
            choice = (index + pair) % 2 ? "A" : "B";
          const dimensions = JSON.stringify({
            DEPT: choice,
            COST: pair % 3 ? "A" : "B",
            SITE: index % 3 ? "A" : "B",
          });
          const debit = index < 200 ? "1000" : debits[(index + pair) % debits.length],
            credit = credits[(index + pair) % credits.length];
          line.run(id, pair * 2 + 1, month, debit, amount, 0, dimensions, evidence);
          line.run(id, pair * 2 + 2, month, credit, 0, amount, dimensions, evidence);
          digest.update(`${id}:${pair}:${date}:${debit}:${credit}:${amount}:${dimensions}\n`);
          debitTotal += amount;
        }
        turnover += debitTotal;
        seal.run(id, turnover);
        audit.run(index + 1, sourceRef, result, postedAt);
      }
    })();
    const counts = db
      .prepare(`SELECT
      (SELECT count(*) FROM ledger_companies) AS companies,(SELECT count(*) FROM accounts) AS accounts,
      (SELECT count(*) FROM periods) AS periods,(SELECT count(*) FROM dimensions) AS dimensions,
      (SELECT count(*) FROM journal_lines) AS lines,
      (SELECT count(*) FROM journal_lines WHERE account_code='1000' AND period='2026-12') AS scrollRows,
      (SELECT sum(debit_minor)-sum(credit_minor) FROM journal_lines) AS imbalance`)
      .get() as {
      companies: number;
      accounts: number;
      periods: number;
      dimensions: number;
      lines: number;
      scrollRows: number;
      imbalance: number;
    };
    if (
      counts.companies !== 1 ||
      counts.accounts !== 200 ||
      counts.periods !== 24 ||
      counts.dimensions !== 3 ||
      counts.lines !== 1_000_000 ||
      counts.scrollRows !== 100_000 ||
      counts.imbalance !== 0
    )
      throw new Error("Invalid million-line fixture shape");
    if (
      db.prepare("PRAGMA foreign_key_check").all().length ||
      db.pragma("quick_check", { simple: true }) !== "ok"
    )
      throw new Error("Invalid fixture integrity");
    db.exec("ANALYZE");
    db.pragma("wal_checkpoint(TRUNCATE)");
    return {
      seed: "m012-v1",
      ...counts,
      turnoverMinor: turnover,
      logicalSha256: digest.digest("hex"),
      generationMs: performance.now() - start,
      bytes: statSync(filename).size,
      note: "Synthetic direct bulk loader, not posting throughput. Production schema, foreign keys, immutable triggers and per-entry balance/turnover seals remain enabled. 1000 journals × 1000 lines; exactly 100000 cash lines in 2026-12.",
    };
  } finally {
    db.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3)
    throw new Error("Usage: node generate-ledger.ts <new-sqlite-file>");
  console.log(JSON.stringify(await generateLedgerFixture(resolve(process.argv[2])), null, 2));
}

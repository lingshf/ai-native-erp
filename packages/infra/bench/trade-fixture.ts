import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { DimensionService, MasterDataService, TradeMasterService } from "@erp/core/application";
import type { AccountInput } from "@erp/core/domain";
import { createMasterDataStore } from "../src/storage/master-data.ts";
import { generateLedgerFixture } from "./generate-ledger.ts";

export const tradeLoad = Object.freeze({
  glLines: 1_000_000,
  parties: 1_000,
  openItems: 100_000,
  invoiceLines: 100,
});
const window = {
  name: "Synthetic capacity fixture",
  from: "2025-01-01",
  to: "2026-12-31",
};
const base = { company: "DEFAULT", active: true, expectedRevision: 0 };
export const partyCode = (index: number) => `P${String(index).padStart(4, "0")}`;
export const siteCode = (index: number) => `S${String(index).padStart(3, "0")}`;

/** Rows the M1-R3 history layer adds on top of the M1-07 capacity shape (zero when absent). */
export interface TradeHistoryShape {
  readonly advances: number;
  readonly glLines: number;
  readonly closed: number;
}
const noHistory: TradeHistoryShape = { advances: 0, glLines: 0, closed: 0 };
export function assertTradeFixture(
  filename: string,
  addedInvoices = 0,
  addedGlLines = 0,
  history: TradeHistoryShape = noHistory,
) {
  const db = new Database(filename, { readonly: true });
  try {
    const shape = db
      .prepare(
        `SELECT
      (SELECT count(*) FROM journal_lines) glLines,
      (SELECT count(*) FROM trade_parties) parties,
      (SELECT count(*) FROM open_items) openItems,
      (SELECT count(*) FROM open_items WHERE side='AP') ap,
      (SELECT count(*) FROM open_items WHERE side='AR') ar,
      (SELECT count(*) FROM open_items WHERE status='open') active,
      (SELECT count(*) FROM trade_item_sources) sources,
      (SELECT count(*) FROM trade_invoice_terms) terms,
      (SELECT count(*) FROM trade_control_segments) segments,
      (SELECT count(*) FROM trade_config_history WHERE kind='tradeParty') partyHistory,
      (SELECT count(*) FROM trade_parties WHERE role='vendor' AND ap_profile='AP') vendors,
      (SELECT count(*) FROM trade_parties WHERE role='customer' AND ar_profile='AR') customers,
      (SELECT sum(gross_minor) FROM open_items WHERE accounting_date<='2026-06-30') historicalGross,
      (SELECT sum(debit_minor)-sum(credit_minor) FROM journal_lines) imbalance,
      (SELECT count(*) FROM (
        SELECT party_id FROM open_items WHERE item_id LIKE '10000000-%'
        GROUP BY party_id HAVING count(*)<>100)) unevenParties,
      (SELECT count(*) FROM open_items o LEFT JOIN (
        SELECT company_id,item_id,sum(gross_minor) gross,sum(remaining_gross_minor) remaining
        FROM trade_control_segments GROUP BY company_id,item_id
      ) s USING(company_id,item_id)
        WHERE s.gross IS NULL OR s.gross<>o.gross_minor
          OR s.remaining<>o.remaining_gross_minor) badSegments,
      (SELECT count(*) FROM open_items o JOIN trade_item_sources s USING(company_id,item_id)
        JOIN journal_entries j ON j.company_id=s.company_id AND j.id=s.journal_id
        WHERE o.item_id LIKE '10000000-%' AND o.accounting_date<>j.accounting_date) badDates
    `,
      )
      .get() as Record<string, number>;
    assert.equal(shape.glLines, tradeLoad.glLines + addedGlLines + history.glLines);
    assert.equal(shape.parties, tradeLoad.parties);
    assert.equal(shape.partyHistory, tradeLoad.parties);
    assert.equal(shape.vendors, tradeLoad.parties / 2);
    assert.equal(shape.customers, tradeLoad.parties / 2);
    assert.equal(shape.openItems, tradeLoad.openItems + addedInvoices + history.advances);
    assert.equal(shape.ap, (tradeLoad.openItems + addedInvoices + history.advances) / 2);
    assert.equal(shape.ar, (tradeLoad.openItems + addedInvoices + history.advances) / 2);
    assert.equal(shape.active, shape.openItems - history.closed);
    assert.equal(shape.sources, shape.openItems);
    assert.equal(shape.terms, shape.openItems);
    // Capacity and advance items have one segment; measured invoices deliberately have 100.
    assert.equal(
      shape.segments,
      tradeLoad.openItems + history.advances + addedInvoices * tradeLoad.invoiceLines,
    );
    for (const key of ["imbalance", "unevenParties", "badSegments", "badDates"])
      assert.equal(shape[key], 0, key);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.equal(db.pragma("quick_check", { simple: true }), "ok");
    return shape;
  } finally {
    db.close();
  }
}

export async function generateTradeFixture(filename: string) {
  console.info("M1-07: generating a new synthetic million-line GL fixture");
  const ledger = await generateLedgerFixture(filename);
  console.info("M1-07: adding synthetic trade capacity and configuration");
  const store = createMasterDataStore({ filename });
  try {
    const master = new MasterDataService(store);
    for (const period of (await master.periods("DEFAULT", { limit: 100 })).items)
      await master.setPeriod(
        "DEFAULT",
        period.month,
        period.revision,
        "open",
        "Synthetic benchmark",
        true,
        ["trade", "tax"],
      );
    for (const [code, category, reportGroup, purpose, controlModule] of [
      ["2110", "LIABILITY", "payables", "control", "AP"],
      ["2120", "ASSET", "prepayments", "control", "AP"],
      ["2130", "ASSET", "receivables", "control", "AR"],
      ["2140", "LIABILITY", "otherLiabilities", "control", "AR"],
      ["2150", "ASSET", "otherAssets", "control", "TAX"],
      ["2160", "LIABILITY", "taxLiabilities", "control", "TAX"],
    ] as const) {
      const account: AccountInput = {
        code,
        name: `Synthetic ${code}`,
        category,
        reportGroup,
        purpose,
        controlModule,
        normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
        contraOf: null,
        manualAllowed: purpose !== "control",
        active: true,
      };
      await master.saveAccount("DEFAULT", account, 0);
    }
    const dimensions = new DimensionService(store);
    for (let index = 0; index < tradeLoad.invoiceLines; index++)
      await dimensions.save("DEFAULT", {
        kind: "value",
        dimension: "SITE",
        code: siteCode(index),
        name: siteCode(index),
        revision: 0,
        active: true,
        from: window.from,
        to: window.to,
      });
    const trade = new TradeMasterService(store);
    await trade.save({
      ...base,
      kind: "tradeTerms",
      code: "N30",
      data: {
        ...window,
        dueDays: 30,
        discountDays: 0,
        discountPercent: "0",
        allowPartialDiscount: false,
      },
    });
    await trade.save({
      ...base,
      kind: "taxCode",
      code: "VAT",
      data: {
        ...window,
        mode: "ordinary",
        deductiblePercent: "100",
        inputAccount: "2150",
        outputAccount: "2160",
        rates: [{ id: "R13", from: window.from, to: window.to, ratePercent: "13" }],
      },
    });
    for (const side of ["AP", "AR"] as const) {
      await trade.save({
        ...base,
        kind: "tradeProfile",
        code: side,
        data: {
          ...window,
          side,
          controlAccount: side === "AP" ? "2110" : "2130",
          advanceAccount: side === "AP" ? "2120" : "2140",
          cashAccount: "1000",
          discountAccount: "4000",
        },
      });
      await trade.save({
        ...base,
        kind: "tradeParty",
        code: partyCode(side === "AP" ? 0 : 1),
        data: {
          ...window,
          role: side === "AP" ? "vendor" : "customer",
          apProfile: side === "AP" ? "AP" : null,
          arProfile: side === "AR" ? "AR" : null,
          terms: "N30",
          allowedTaxCodes: ["VAT"],
          defaultDimensions: {},
        },
      });
      await trade.save({
        ...base,
        kind: "tradeProduct",
        code: side,
        data: {
          ...window,
          type: side === "AP" ? "expense" : "service",
          expenseAccount: side === "AP" ? "5000" : null,
          revenueAccount: side === "AR" ? "4000" : null,
          allowedTaxCodes: ["VAT"],
          defaultDimensions: {},
        },
      });
    }
  } finally {
    await store.close();
  }
  const db = new Database(filename);
  const digest = createHash("sha256");
  let sqliteVersion: unknown;
  try {
    db.pragma("foreign_keys = ON");
    sqliteVersion = db.prepare("SELECT sqlite_version() version").get();
    const party = db.prepare(`INSERT INTO trade_parties
      SELECT company_id,?, ?,active,revision,valid_from,valid_to,role,ap_profile,ar_profile,
        terms,allowed_tax_codes,default_dimensions FROM trade_parties WHERE code=?`);
    const history = db.prepare(`INSERT INTO trade_config_history
      SELECT company_id,kind,?,revision,recorded_at,actor,
        json_set(snapshot,'$.code',?,'$.data.name',?)
      FROM trade_config_history WHERE kind='tradeParty' AND config_key=?`);
    const source = db.prepare(
      "INSERT INTO trade_item_sources VALUES('DEFAULT',?,'invoice',?,?,NULL)",
    );
    const item = db.prepare(`INSERT INTO open_items VALUES(
      'DEFAULT',?,?,?,?,'{}','CNY',?,?,?,?,11300,10000,1300,11300,10000,1300,'open',1)`);
    const terms = db.prepare("INSERT INTO trade_invoice_terms VALUES('DEFAULT',?,'0',0)");
    const segment = db.prepare(
      "INSERT INTO trade_control_segments VALUES('DEFAULT',?,'{}',11300,11300)",
    );
    const journals = db
      .prepare("SELECT id,accounting_date FROM journal_entries ORDER BY sequence")
      .all() as {
      id: string;
      accounting_date: string;
    }[];
    db.transaction(() => {
      for (let index = 2; index < tradeLoad.parties; index++) {
        const code = partyCode(index),
          template = partyCode(index % 2);
        party.run(code, code, template);
        history.run(code, code, code, template);
      }
      for (let index = 0; index < tradeLoad.openItems; index++) {
        const id = `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
        const side = index % 2 === 0 ? "AP" : "AR";
        const journal = journals[Math.floor(index / 100)];
        const date = journal.accounting_date;
        const due = new Date(`${date}T00:00:00Z`);
        due.setUTCDate(due.getUTCDate() + 30);
        source.run(id, `SYNTHETIC-OPEN-${index}`, journal.id);
        item.run(
          id,
          side,
          partyCode(index % tradeLoad.parties),
          side === "AP" ? "2110" : "2130",
          date,
          date,
          due.toISOString().slice(0, 10),
          date,
        );
        terms.run(id);
        segment.run(id);
        digest.update(`${id}:${side}:${journal.id}:${date}:11300\n`);
      }
    })();
    db.exec("ANALYZE");
    db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
  return {
    seed: "m1-07-trade-v1",
    sqliteVersion,
    ledger,
    shape: assertTradeFixture(filename),
    logicalSha256: digest.digest("hex"),
    note: "Synthetic capacity projection: 100 open invoice items per party, 500 AP/500 AR parties. Sources reuse the existing synthetic GL journals with matching accounting dates; these capacity items are not posted invoices and are not GL-reconciliation evidence. No triggers or foreign keys disabled. Measured confirmations use normal production posting.",
  };
}

// TINV-09: credit notes reduce an order's invoiced quantity. After every step the order detail
// (orderInvoicing) and the stored / recomputed / listed invoicing status agree (V1–V6), and the
// recomputation reads a fixed number of statements on trade_credit_lines_source (V8). The 020
// upgrade (V7) is with the 019 backfill test in application/trade-documents.test.ts.
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JournalService, TradeDocumentService } from "@erp/core/application";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { journalTools } from "../../src/storage/journals.ts";
import { tradeOrderStatuses } from "../../src/storage/trade-documents.ts";
import type { Connection } from "../../src/storage/types.ts";
import {
  invoice,
  invoiceOn,
  line,
  order,
  orderInvoicingSteps,
  orderLine,
  seedTradeTemplate,
  type TradeLedger,
  tradeSteps,
  withReadonly,
} from "../support/trade-ledger.ts";

let templateDirectory: string, template: string, directory: string;
let store: ReturnType<typeof createMasterDataStore>;
// One object for the whole file: beforeEach refills it, the steps below read it at call time.
const ledger = {} as { -readonly [K in keyof TradeLedger]: TradeLedger[K] };
beforeAll(async () => {
  templateDirectory = await mkdtemp(join(tmpdir(), "erp-tinv09-template-"));
  template = join(templateDirectory, "template.sqlite");
  await seedTradeTemplate(template);
});
afterAll(async () => {
  if (templateDirectory) await rm(templateDirectory, { recursive: true, force: true });
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-tinv09-"));
  const filename = join(directory, "ledger.sqlite");
  await copyFile(template, filename);
  store = createMasterDataStore({ filename });
  const journals = new JournalService(store, journalTools);
  Object.assign(ledger, {
    filename,
    journals,
    service: new TradeDocumentService(store, journals, journalTools),
  });
});
afterEach(async () => {
  await store?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const { post, cancel } = tradeSteps(ledger);
const { expectStored, creditOn, cancelCredit, blockingStatusWrites, expectRolledBack } =
  orderInvoicingSteps(ledger);

/** PO-T: one line L1 of 10, invoiced 6 by the returned invoice. */
async function invoicedSix() {
  await ledger.service.createOrder(
    order({ orderId: "PO-T", orderDate: "2026-04-01", lines: [orderLine("L1", "10", "3.00")] }),
  );
  const first = invoiceOn("PO-T", "L1", "6");
  await post(first);
  await expectTen("6", "partial", "0");
  return first;
}
/** Order detail (orderInvoicing) and stored status of PO-T agree after every step. */
async function expectTen(invoiced: string, status: string, credited: string) {
  const detail = await ledger.service.orderInvoicing("DEFAULT", "PO-T");
  expect(detail.invoiced).toEqual([
    { lineId: "L1", invoicedQuantity: invoiced, creditedQuantity: credited },
  ]);
  await expectStored({ "PO-T": status });
}
const onePerStatus = { "PO-F": "full", "PO-N": "none", "PO-P": "partial" };
/** Orders of 2 on line L1 invoiced 2, 0 and 1; returns PO-P's invoice. */
async function ordersOnePerStatus() {
  for (const orderId of Object.keys(onePerStatus))
    await ledger.service.createOrder(
      order({ orderId, orderDate: "2026-04-01", lines: [orderLine("L1", "2", "3.00")] }),
    );
  await post(invoiceOn("PO-F", "L1", "2"));
  const partial = invoiceOn("PO-P", "L1", "1");
  await post(partial);
  await expectStored(onePerStatus);
  return partial;
}

type Statement = { sql: string; values: readonly unknown[] };
/** The statements tradeOrderStatuses reads on `raw`, one list per set of order ids. */
async function statementsPerRun(raw: Database.Database, orderIdSets: readonly string[][]) {
  const runs: Statement[][] = [];
  for (const orderIds of orderIdSets) {
    const statements: Statement[] = [];
    const reader: Pick<Connection, "query"> = {
      query: async (sql, values = []) => {
        statements.push({ sql, values });
        return raw.prepare(sql).all(...values) as Record<string, unknown>[];
      },
    };
    await tradeOrderStatuses(reader, "DEFAULT", orderIds);
    runs.push(statements);
  }
  return runs;
}
const queryPlan = (raw: Database.Database, statement: Statement) =>
  raw
    .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
    .all(...statement.values)
    .map((row) => (row as { detail: string }).detail);

describe("TINV-09 credit notes on one order of 10 invoiced 6 (real SQLite)", () => {
  it("TINV-09 V1 credits reduce the invoiced quantity down to none, and cancelling one restores it", async () => {
    const first = await invoicedSix();
    await creditOn(first.documentId, "2");
    await expectTen("4", "partial", "2");
    const rest = await creditOn(first.documentId, "4");
    await expectTen("0", "none", "6");
    const filtered = await ledger.service.listOrders("DEFAULT", { limit: 10, invoicing: "none" });
    expect(filtered.items.map((item) => item.orderId)).toEqual(["PO-T"]);
    await cancelCredit(rest, first.documentId);
    await expectTen("4", "partial", "2");
  });

  it("TINV-09 V2/V3 a credited quantity is invoiced again without a match exception; cancelling the credit then over-invoices", async () => {
    const first = await invoicedSix();
    const credit = await creditOn(first.documentId, "2");
    const day = { accountingDate: "2026-04-22", documentDate: "2026-04-22", taxDate: "2026-04-22" };
    const again = await post(invoiceOn("PO-T", "L1", "6", day));
    expect(again.receipt.poMatch).toBe("matched");
    await expectTen("10", "full", "2");
    await cancelCredit(credit, first.documentId);
    await expectTen("12", "full", "0");
  });

  it("TINV-09 V4 a failing status write rolls back the whole credit posting or credit cancellation", async () => {
    const first = await invoicedSix();
    const { blocked, close } = blockingStatusWrites();
    try {
      await expectRolledBack(blocked, () => creditOn(first.documentId, "2"));
      await expectTen("6", "partial", "0");
      const credit = await creditOn(first.documentId, "2");
      await expectRolledBack(blocked, () => cancelCredit(credit, first.documentId));
      await expectTen("4", "partial", "2");
    } finally {
      await close();
    }
  });

  it("TINV-09 V5 a credited invoice is cancelled only after its credit, then recomputed to none", async () => {
    const first = await invoicedSix();
    const credit = await creditOn(first.documentId, "2");
    await expect(cancel(first.documentId, undefined, "2026-04-22")).rejects.toThrow();
    await expectTen("4", "partial", "2");
    await cancelCredit(credit, first.documentId);
    await expectTen("6", "partial", "0");
    await cancel(first.documentId, undefined, "2026-04-22");
    await expectTen("0", "none", "0");
  });
});

describe("TORD-08 credited quantity in the order detail (real SQLite)", () => {
  /** PO-C: L1 of 10 invoiced 10 by the returned invoice, L2 of 5 not invoiced. */
  async function invoicedTen() {
    await ledger.service.createOrder(
      order({
        orderId: "PO-C",
        orderDate: "2026-04-01",
        lines: [orderLine("L1", "10", "3.00"), orderLine("L2", "5", "3.00")],
      }),
    );
    const invoiced = invoiceOn("PO-C", "L1", "10");
    await post(invoiced);
    return invoiced;
  }
  /** orderInvoicing rows of PO-C as [lineId, invoiced, credited]. */
  const quantities = async () =>
    (await ledger.service.orderInvoicing("DEFAULT", "PO-C")).invoiced.map((row) => [
      row.lineId,
      row.invoicedQuantity,
      row.creditedQuantity,
    ]);

  it("TORD-08 K3 a partial credit of 4 on 10 invoiced shows 6 invoiced and 4 credited; the uninvoiced line is 0 / 0", async () => {
    const invoiced = await invoicedTen();
    expect(await quantities()).toEqual([
      ["L1", "10", "0"],
      ["L2", "0", "0"],
    ]);
    await creditOn(invoiced.documentId, "4");
    expect(await quantities()).toEqual([
      ["L1", "6", "4"],
      ["L2", "0", "0"],
    ]);
  });

  it("TORD-08 K3 two credits add up exactly and only non-cancelled credits count", async () => {
    const invoiced = await invoicedTen();
    const small = await creditOn(invoiced.documentId, "1.5");
    const large = await creditOn(invoiced.documentId, "2");
    expect((await quantities())[0]).toEqual(["L1", "6.5", "3.5"]);
    await cancelCredit(small, invoiced.documentId);
    expect((await quantities())[0]).toEqual(["L1", "8", "2"]);
    await cancelCredit(large, invoiced.documentId);
    expect((await quantities())[0]).toEqual(["L1", "10", "0"]);
  });
});

describe("TINV-09 credit notes beside one order per status (real SQLite)", () => {
  it("TINV-09 V6 a credit on an invoice without an order leaves every stored status unchanged", async () => {
    await ordersOnePerStatus();
    const loose = invoice({
      accountingDate: "2026-04-20",
      documentDate: "2026-04-20",
      taxDate: "2026-04-20",
      lines: [line({ quantity: "1" })],
    });
    await post(loose);
    const credit = await creditOn(loose.documentId, "1");
    await expectStored(onePerStatus);
    await cancelCredit(credit, loose.documentId);
    await expectStored(onePerStatus);
  });

  it("TINV-09 V8 the recomputation reads two statements whatever the order count, credits on trade_credit_lines_source", async () => {
    const partial = await ordersOnePerStatus();
    await creditOn(partial.documentId, "1");
    await withReadonly(ledger.filename, async (raw) => {
      const runs = await statementsPerRun(raw, [["PO-P"], Object.keys(onePerStatus)]);
      expect(runs.map((statements) => statements.length)).toEqual([2, 2]);
      const credits = runs[1]?.find((item) => item.sql.includes("trade_credit_lines"));
      if (!credits) throw new Error("Missing credit statement");
      expect(queryPlan(raw, credits)).toEqual([
        "SEARCH l USING COVERING INDEX trade_document_lines_order (company_id=? AND order_id=?)",
        "SEARCH o USING PRIMARY KEY (company_id=? AND item_id=?)",
        "SEARCH c USING INDEX trade_credit_lines_source (company_id=? AND invoice_id=? AND source_line_id=?)",
        "SEARCH k USING PRIMARY KEY (company_id=? AND item_id=?)",
      ]);
    });
  });
});

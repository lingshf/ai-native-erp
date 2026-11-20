import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { journalReceiptSchema } from "@erp/core/contracts";
import {
  roundTradeRatio,
  type OpenItem,
  type TradeActionCommand,
  type TradeActionRecord,
  type TradeItemChange,
  type TradePaymentRecord,
  type TradeSettlementAllocation,
} from "@erp/core/domain";

// M1-R3 history layer: average 2 settlements per capacity item plus 5% adjusted items.
export const tradeHistoryLoad = Object.freeze({
  seed: "m1-r3-trade-history-v1",
  settlementsPerItem: [0, 1, 2, 3, 4] as const,
  settlementGross: 2_000,
  cancelled: 2_500,
  advanceApplied: 2_500,
  advanceGross: 6_000,
  appliedGross: 5_000,
  historicalCutoff: "2026-06-30",
  windowEnd: "2026-12-31",
});
const itemGross = 11_300,
  itemNet = 10_000,
  itemTax = 1_300;
const company = "DEFAULT";
const evidence = JSON.stringify({
  dimensionOrigins: {},
  role: "business",
  suspense: null,
  balancing: null,
  historical: null,
  group: null,
});

export type TradeHistoryRole = "settled" | "cancel" | "advance";
/** Deterministic per-item plan: k = index % 5 settlements; index % 80 selects adjustments. */
export function tradeHistoryRole(index: number): {
  role: TradeHistoryRole;
  settlements: number;
} {
  const slot = index % 80;
  if (slot === 0 || slot === 5) return { role: "cancel", settlements: 0 };
  if (slot === 10 || slot === 15) return { role: "advance", settlements: 0 };
  return { role: "settled", settlements: index % 5 };
}
// ISO dates compare lexically; history never extends past the fixture's open window.
const clamp = (value: string) => {
  if (value > tradeHistoryLoad.windowEnd) return tradeHistoryLoad.windowEnd;
  return value;
};
const day = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return clamp(date.toISOString().slice(0, 10));
};
const monthEnd = (value: string, months: number) =>
  clamp(
    new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) + months, 0))
      .toISOString()
      .slice(0, 10),
  );
/** Settlement j (0-based) is dated at the month end j months after the item, clamped to the window. */
export function tradeSettlementDates(accountingDate: string, count: number) {
  return Array.from({ length: count }, (_, j) => monthEnd(accountingDate, j));
}
const id = (prefix: string, index: number) =>
  `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const postedAt = (date: string) => `${date}T12:00:00.000Z`;

interface CapacityItem {
  index: number;
  itemId: string;
  side: "AP" | "AR";
  party: string;
  date: string;
  due: string;
}
function openItem(item: CapacityItem): OpenItem {
  return {
    kind: "invoice",
    segments: [{ dimensions: {}, gross: itemGross, remainingGross: itemGross }],
    discountPercent: "0",
    allowPartialDiscount: false,
    itemId: item.itemId,
    side: item.side,
    party: item.party,
    externalNo: `SYNTHETIC-OPEN-${item.index}`,
    controlAccount: item.side === "AP" ? "2110" : "2130",
    dimensions: {},
    currency: "CNY",
    accountingDate: item.date,
    documentDate: item.date,
    dueDate: item.due,
    discountDate: item.date,
    gross: itemGross,
    net: itemNet,
    tax: itemTax,
    remainingGross: itemGross,
    remainingNet: itemNet,
    remainingTax: itemTax,
    status: "open",
    revision: 1,
  };
}
function consume(item: OpenItem, gross: number, status?: OpenItem["status"]): OpenItem {
  const net =
    gross === item.remainingGross
      ? item.remainingNet
      : roundTradeRatio(BigInt(item.remainingNet) * BigInt(gross), BigInt(item.remainingGross));
  const remainingGross = item.remainingGross - gross;
  assert.ok(remainingGross >= 0);
  return {
    ...item,
    remainingGross,
    remainingNet: item.remainingNet - net,
    remainingTax: item.remainingTax - (gross - net),
    segments: item.segments.map((s) => ({
      ...s,
      remainingGross: s.remainingGross - gross,
    })),
    status: status ?? (remainingGross === 0 ? "settled" : "open"),
    revision: item.revision + 1,
  };
}

type Event =
  | {
      date: string;
      order: number;
      kind: "payment";
      key: string;
      items: CapacityItem[];
      j: number;
    }
  | {
      date: string;
      order: number;
      kind: "cancel" | "advance" | "apply";
      item: CapacityItem;
    };

/**
 * Adds deterministic settlement/adjustment history to the M1-07 capacity fixture with all
 * triggers and foreign keys enabled. This is a direct bulk loader, not posting throughput.
 */
export function addTradeHistory(filename: string) {
  const db = new Database(filename);
  const digest = createHash("sha256");
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    const items = (
      db
        .prepare(
          "SELECT item_id itemId,side,party_id party,accounting_date date,due_date due FROM open_items WHERE item_id LIKE '10000000-%' ORDER BY item_id",
        )
        .all() as Omit<CapacityItem, "index">[]
    ).map((row, index) => ({ ...row, index }));
    const events: Event[] = [];
    const payments = new Map<string, Extract<Event, { kind: "payment" }>>();
    for (const item of items) {
      const plan = tradeHistoryRole(item.index);
      if (plan.role === "cancel")
        events.push({
          date: day(item.date, 7),
          order: 1,
          kind: "cancel",
          item,
        });
      else if (plan.role === "advance") {
        events.push({ date: item.date, order: 0, kind: "advance", item });
        events.push({
          date: day(item.date, 14),
          order: 2,
          kind: "apply",
          item,
        });
      } else
        tradeSettlementDates(item.date, plan.settlements).forEach((date, j) => {
          // One payment per party, settlement round and date; an item never repeats in a payment.
          const key = `${item.party}|${date}|${j}`;
          const payment = payments.get(key);
          if (payment) payment.items.push(item);
          else {
            const created = {
              date,
              order: 3 + j,
              kind: "payment" as const,
              key,
              items: [item],
              j,
            };
            payments.set(key, created);
            events.push(created);
          }
        });
    }
    events.sort((a, b) =>
      a.date < b.date
        ? -1
        : a.date > b.date
          ? 1
          : a.order - b.order ||
            (a.kind === "payment" && b.kind === "payment" ? (a.key < b.key ? -1 : 1) : 0),
    );
    const state = new Map(items.map((item) => [item.itemId, openItem(item)]));
    const deltas: Delta[] = items.map((item) => ({
      kind: "invoice",
      party: item.party,
      date: item.date,
      gross: itemGross,
    }));
    const reduce = (item: OpenItem, date: string, gross: number) =>
      deltas.push({
        kind: item.kind === "advance" ? "advance" : "invoice",
        party: item.party,
        date,
        gross: -gross,
      });
    const advances = new Map<string, OpenItem>();
    let turnover = Number(
      (
        db
          .prepare(
            "SELECT s.turnover_minor t FROM journal_entries e JOIN journal_seals s ON s.company_id=e.company_id AND s.entry_id=e.id ORDER BY e.sequence DESC LIMIT 1",
          )
          .get() as { t: number }
      ).t,
    );
    const receipt = db.prepare(
      "INSERT INTO receipts(tenant_id,book_id,company_id,operation,receipt_key,principal,fingerprint,result,version,idempotency_key,source_ref) VALUES('LOCAL','LOCAL','DEFAULT','journal.confirm',?,'LOCAL',?,?,1,?,?)",
    );
    const entry = db.prepare(
      "INSERT INTO journal_entries(company_id,id,receipt_key,source_ref,accounting_date,document_date,tax_date,period,memo,kind,operation,role,posted_at,fingerprint) VALUES('DEFAULT',?,?,?,?,?,?,?,?,'normal','journal','normal',?,?)",
    );
    const line = db.prepare("INSERT INTO journal_lines VALUES('DEFAULT',?,?,?,?,?,?,'{}',?)");
    const seal = db.prepare("INSERT INTO journal_seals VALUES('DEFAULT',?,?)");
    const payment = db.prepare(
      "INSERT INTO trade_payments(company_id,payment_id,receipt_key,command_hash,fingerprint,receipt) VALUES('DEFAULT',?,?,?,?,?)",
    );
    const settlement = db.prepare(
      "INSERT INTO settlements(company_id,settlement_id,item_id,side,accounting_date,applied_gross_minor,applied_net_minor,applied_tax_minor,discount_minor,receipt_key,journal_id,recorded_at) VALUES('DEFAULT',?,?,?,?,?,?,?,0,?,?,?)",
    );
    const change = db.prepare(
      "UPDATE open_items SET remaining_gross_minor=?,remaining_net_minor=?,remaining_tax_minor=?,status=?,revision=revision+1 WHERE company_id='DEFAULT' AND item_id=? AND revision=?",
    );
    const segment = db.prepare(
      "UPDATE trade_control_segments SET remaining_gross_minor=? WHERE company_id='DEFAULT' AND item_id=? AND dimension_key='{}'",
    );
    const action = db.prepare(
      "INSERT INTO trade_actions(company_id,action_id,kind,related_id,accounting_date,receipt_key,command_hash,record) VALUES('DEFAULT',?,?,?,?,?,?,?)",
    );
    const actionItem = db.prepare("INSERT INTO trade_action_items VALUES('DEFAULT',?,?)");
    const source = db.prepare(
      "INSERT INTO trade_item_sources VALUES('DEFAULT',?,'advance',?,?,NULL)",
    );
    const insertItem = db.prepare(`INSERT INTO open_items VALUES(
      'DEFAULT',?,?,?,?,'{}','CNY',?,?,?,?,?,?,0,?,?,0,?,1)`);
    const terms = db.prepare("INSERT INTO trade_invoice_terms VALUES('DEFAULT',?,'0',0)");
    const insertSegment = db.prepare(
      "INSERT INTO trade_control_segments VALUES('DEFAULT',?,'{}',?,?)",
    );
    let journals = 0,
      glLines = 0,
      settlementRows = 0,
      paymentCount = 0,
      actionCount = 0,
      sequence = 0;
    const journal = (
      journalId: string,
      sourceRef: string,
      date: string,
      memo: string,
      lines: { account: string; debit: number; credit: number }[],
    ) => {
      const key = id("21000000", ++sequence);
      const fingerprint = sha(`${tradeHistoryLoad.seed}:${journalId}`);
      receipt.run(
        key,
        fingerprint,
        JSON.stringify(
          journalReceiptSchema.parse({
            company,
            sourceRef,
            idempotencyKey: key,
            draftId: journalId,
            draftRevision: 1,
            fingerprint,
            operation: "journal",
            module: "TRADE",
            journalIds: [journalId],
            postedAt: postedAt(date),
          }),
        ),
        key,
        sourceRef,
      );
      entry.run(
        journalId,
        key,
        sourceRef,
        date,
        date,
        date,
        date.slice(0, 7),
        memo,
        postedAt(date),
        fingerprint,
      );
      let debit = 0;
      lines.forEach((l, index) => {
        line.run(journalId, index + 1, date.slice(0, 7), l.account, l.debit, l.credit, evidence);
        debit += l.debit;
      });
      turnover += debit;
      seal.run(journalId, turnover);
      journals++;
      glLines += lines.length;
      return key;
    };
    const apply = (before: OpenItem, after: OpenItem) => {
      const result = change.run(
        after.remainingGross,
        after.remainingNet,
        after.remainingTax,
        after.status,
        after.itemId,
        before.revision,
      );
      assert.equal(result.changes, 1);
      segment.run(after.segments[0].remainingGross, after.itemId);
    };
    const record = (
      command: TradeActionCommand,
      key: string,
      gross: number,
      changes: TradeItemChange[],
      relatedId: string | null,
    ) => {
      const sourceRef = `TRADE-${command.kind.toUpperCase()}:${command.actionId}`;
      const value: TradeActionRecord = {
        command,
        commandHash: sha(`${tradeHistoryLoad.seed}:command:${command.actionId}`),
        receipt: {
          fingerprint: sha(`${tradeHistoryLoad.seed}:preview:${command.actionId}`),
          kind: command.kind,
          gross,
          changes,
          creditLines: [],
          links: changes.filter((c) => c.before).map((c) => c.after.itemId),
          company,
          actionId: command.actionId,
          idempotencyKey: key,
          sourceRef,
          journalIds: [command.actionId],
          postedAt: postedAt(command.accountingDate),
        },
      };
      action.run(
        command.actionId,
        command.kind,
        relatedId,
        command.accountingDate,
        key,
        value.commandHash,
        JSON.stringify(value),
      );
      for (const c of changes) actionItem.run(command.actionId, c.after.itemId);
      actionCount++;
    };
    db.transaction(() => {
      for (const event of events) {
        const header = {
          company,
          documentDate: event.date,
          taxDate: event.date,
          accountingDate: event.date,
        };
        if (event.kind === "payment") {
          const paymentId = id("20000000", ++paymentCount);
          const side = event.items[0].side;
          const ap = side === "AP";
          const allocations: TradeSettlementAllocation[] = [];
          const lines: { account: string; debit: number; credit: number }[] = [];
          const updates: [OpenItem, OpenItem][] = [];
          for (const item of event.items) {
            const before = state.get(item.itemId) as OpenItem;
            const gross = event.j === 3 ? before.remainingGross : tradeHistoryLoad.settlementGross;
            const after = consume(before, gross);
            const net = before.remainingNet - after.remainingNet;
            allocations.push({
              segments: [{ dimensions: {}, gross }],
              itemId: item.itemId,
              revision: before.revision,
              gross,
              net,
              tax: gross - net,
              discount: 0,
              cash: gross,
              discountAvailable: false,
              discountDate: before.discountDate,
              settledGross: before.gross - after.remainingGross,
              remainingGross: after.remainingGross,
              remainingNet: after.remainingNet,
              remainingTax: after.remainingTax,
            });
            lines.push({
              account: before.controlAccount,
              debit: ap ? gross : 0,
              credit: ap ? 0 : gross,
            });
            updates.push([before, after]);
          }
          const total = allocations.reduce((n, a) => n + a.gross, 0);
          lines.push({
            account: "1000",
            debit: ap ? 0 : total,
            credit: ap ? total : 0,
          });
          const sourceRef = `TRADE-PAY:${paymentId}`;
          const key = journal(
            paymentId,
            sourceRef,
            event.date,
            `${side} book settlement ${event.items[0].party}`,
            lines,
          );
          const value: TradePaymentRecord = {
            commandHash: sha(`${tradeHistoryLoad.seed}:command:${paymentId}`),
            receipt: {
              company,
              paymentId,
              idempotencyKey: key,
              fingerprint: sha(`${tradeHistoryLoad.seed}:preview:${paymentId}`),
              sourceRef,
              journalIds: [paymentId],
              postedAt: postedAt(event.date),
              gross: total,
              cash: total,
              discount: 0,
              allocations,
            },
          };
          payment.run(
            paymentId,
            key,
            value.commandHash,
            value.receipt.fingerprint,
            JSON.stringify(value.receipt),
          );
          for (const [index, [before, after]] of updates.entries()) {
            apply(before, after);
            const a = allocations[index];
            settlement.run(
              paymentId,
              after.itemId,
              after.side,
              event.date,
              a.gross,
              a.net,
              a.tax,
              key,
              paymentId,
              postedAt(event.date),
            );
            state.set(after.itemId, after);
            reduce(before, event.date, a.gross);
            settlementRows++;
            digest.update(`pay:${paymentId}:${after.itemId}:${event.date}:${a.gross}:${a.net}\n`);
          }
        } else if (event.kind === "cancel") {
          const before = state.get(event.item.itemId) as OpenItem;
          const actionId = id("22000000", event.item.index);
          const after = {
            ...consume(before, before.remainingGross, "cancelled"),
          };
          const ap = before.side === "AP";
          const key = journal(
            actionId,
            `TRADE-CANCEL:${actionId}`,
            event.date,
            "cancel: Synthetic capacity cancellation",
            [
              {
                account: before.controlAccount,
                debit: ap ? before.gross : 0,
                credit: ap ? 0 : before.gross,
              },
              {
                account: ap ? "5000" : "4000",
                debit: ap ? 0 : before.gross,
                credit: ap ? before.gross : 0,
              },
            ],
          );
          record(
            {
              ...header,
              actionId,
              kind: "cancel",
              itemId: before.itemId,
              revision: before.revision,
              relatedRevision: null,
              reason: "Synthetic capacity cancellation",
            },
            key,
            before.gross,
            [{ before, after }],
            before.itemId,
          );
          apply(before, after);
          state.set(after.itemId, after);
          reduce(before, event.date, before.remainingGross);
          digest.update(`cancel:${actionId}:${after.itemId}:${event.date}\n`);
        } else if (event.kind === "advance") {
          const invoice = state.get(event.item.itemId) as OpenItem;
          const actionId = id("30000000", event.item.index);
          const ap = invoice.side === "AP";
          const gross = tradeHistoryLoad.advanceGross;
          const advance: OpenItem = {
            ...invoice,
            kind: "advance",
            itemId: actionId,
            externalNo: actionId,
            controlAccount: ap ? "2120" : "2140",
            dueDate: event.date,
            discountDate: event.date,
            segments: [{ dimensions: {}, gross, remainingGross: gross }],
            gross,
            net: gross,
            tax: 0,
            remainingGross: gross,
            remainingNet: gross,
            remainingTax: 0,
            status: "open",
            revision: 1,
          };
          const key = journal(
            actionId,
            `TRADE-ADVANCE:${actionId}`,
            event.date,
            `advance: ${actionId}`,
            [
              {
                account: advance.controlAccount,
                debit: ap ? gross : 0,
                credit: ap ? 0 : gross,
              },
              {
                account: "1000",
                debit: ap ? 0 : gross,
                credit: ap ? gross : 0,
              },
            ],
          );
          source.run(actionId, actionId, actionId);
          insertItem.run(
            actionId,
            advance.side,
            advance.party,
            advance.controlAccount,
            event.date,
            event.date,
            event.date,
            event.date,
            gross,
            gross,
            gross,
            gross,
            "open",
          );
          terms.run(actionId);
          insertSegment.run(actionId, gross, gross);
          record(
            {
              ...header,
              actionId,
              kind: "advance",
              side: advance.side,
              party: advance.party,
              currency: "CNY",
              gross,
              dimensions: {},
            },
            key,
            gross,
            [{ before: null, after: advance }],
            null,
          );
          advances.set(invoice.itemId, advance);
          deltas.push({
            kind: "advance",
            party: advance.party,
            date: event.date,
            gross,
          });
          digest.update(`advance:${actionId}:${invoice.itemId}:${event.date}:${gross}\n`);
        } else {
          const target = state.get(event.item.itemId) as OpenItem;
          const sourceItem = advances.get(event.item.itemId) as OpenItem;
          const actionId = id("31000000", event.item.index);
          const gross = tradeHistoryLoad.appliedGross;
          const sourceAfter = consume(sourceItem, gross);
          const targetAfter = consume(target, gross);
          const ap = target.side === "AP";
          const key = journal(
            actionId,
            `TRADE-APPLY:${actionId}`,
            event.date,
            `apply: ${actionId}`,
            [
              {
                account: sourceItem.controlAccount,
                debit: ap ? 0 : gross,
                credit: ap ? gross : 0,
              },
              {
                account: target.controlAccount,
                debit: ap ? gross : 0,
                credit: ap ? 0 : gross,
              },
            ],
          );
          record(
            {
              ...header,
              actionId,
              kind: "apply",
              sourceId: sourceItem.itemId,
              sourceRevision: sourceItem.revision,
              targetId: target.itemId,
              targetRevision: target.revision,
              gross,
            },
            key,
            gross,
            [
              { before: sourceItem, after: sourceAfter },
              { before: target, after: targetAfter },
            ],
            null,
          );
          apply(sourceItem, sourceAfter);
          apply(target, targetAfter);
          state.set(target.itemId, targetAfter);
          advances.set(event.item.itemId, sourceAfter);
          reduce(sourceItem, event.date, gross);
          reduce(target, event.date, gross);
          digest.update(`apply:${actionId}:${target.itemId}:${event.date}:${gross}\n`);
        }
      }
    })();
    db.exec("ANALYZE");
    db.pragma("wal_checkpoint(TRUNCATE)");
    const finals = [...state.values(), ...advances.values()];
    const expected = {
      openItems: items.length + advances.size,
      advances: advances.size,
      payments: paymentCount,
      settlements: settlementRows,
      actions: actionCount,
      journals,
      glLines,
      openStatus: finals.filter((i) => i.status === "open").length,
      settledStatus: finals.filter((i) => i.status === "settled").length,
      cancelledStatus: finals.filter((i) => i.status === "cancelled").length,
      current: balancesAt(deltas, tradeHistoryLoad.windowEnd),
      historical: balancesAt(deltas, tradeHistoryLoad.historicalCutoff),
      party: tradeHistoryParty,
      partyCurrent: balancesAt(deltas, tradeHistoryLoad.windowEnd, tradeHistoryParty),
      fixtureShape: {
        advances: advances.size,
        glLines,
        closed: finals.filter((i) => i.status !== "open").length,
      },
    };
    assert.equal(
      expected.current.invoiceGrossMinor,
      finals.filter((i) => i.kind === "invoice").reduce((n, i) => n + i.remainingGross, 0),
    );
    assert.equal(
      expected.current.advanceGrossMinor,
      finals.filter((i) => i.kind === "advance").reduce((n, i) => n + i.remainingGross, 0),
    );
    return {
      seed: tradeHistoryLoad.seed,
      logicalSha256: digest.digest("hex"),
      expected,
    };
  } finally {
    db.close();
  }
}
export type TradeHistoryExpected = ReturnType<typeof addTradeHistory>["expected"];

/** Party for the concurrent party-scoped report: AR, half its items carry advance + apply. */
export const tradeHistoryParty = "P0015";
interface Delta {
  kind: "invoice" | "advance";
  party: string;
  date: string;
  gross: number;
}
/**
 * Expected report totals from the generator's own event log (creation +gross on the item date,
 * each settlement/action −gross on its date), independent of the production report SQL.
 */
export function balancesAt(deltas: readonly Delta[], cutoff: string, party?: string) {
  const totals = { invoiceGrossMinor: 0, advanceGrossMinor: 0 };
  for (const d of deltas)
    if (d.date <= cutoff && (party === undefined || d.party === party))
      totals[d.kind === "invoice" ? "invoiceGrossMinor" : "advanceGrossMinor"] += d.gross;
  return totals;
}

/** Database-level history invariants; throws on any mismatch. */
export function assertTradeHistory(filename: string, expected: TradeHistoryExpected) {
  const db = new Database(filename, { readonly: true });
  try {
    return historyShape(db, expected);
  } finally {
    db.close();
  }
}
function historyShape(db: Database.Database, expected: TradeHistoryExpected) {
  const shape = db
    .prepare(
      `SELECT
      (SELECT count(*) FROM settlements) settlements,
      (SELECT count(*) FROM trade_payments) payments,
      (SELECT count(*) FROM trade_actions) actions,
      (SELECT count(*) FROM trade_actions WHERE kind='cancel') cancels,
      (SELECT count(*) FROM trade_actions WHERE kind='advance') advances,
      (SELECT count(*) FROM trade_actions WHERE kind='apply') applies,
      (SELECT count(*) FROM open_items WHERE status='settled') settled,
      (SELECT count(*) FROM open_items WHERE status='cancelled') cancelled,
      (SELECT count(*) FROM open_items WHERE item_id LIKE '10000000-%' AND revision<>1+
        (SELECT count(*) FROM settlements s WHERE s.company_id=open_items.company_id AND s.item_id=open_items.item_id)+
        (SELECT count(*) FROM trade_action_items i WHERE i.company_id=open_items.company_id AND i.item_id=open_items.item_id)) badRevisions,
      (SELECT count(*) FROM open_items o WHERE o.remaining_gross_minor<>o.gross_minor
        - coalesce((SELECT sum(applied_gross_minor) FROM settlements s WHERE s.company_id=o.company_id AND s.item_id=o.item_id),0)
        - coalesce((SELECT sum(json_extract(c.value,'$.before.remainingGross')-json_extract(c.value,'$.after.remainingGross'))
            FROM trade_action_items i JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id,
            json_each(a.record,'$.receipt.changes') c
            WHERE i.company_id=o.company_id AND i.item_id=o.item_id AND json_extract(c.value,'$.before.itemId')=o.item_id),0)) badBalances,
      (SELECT count(*) FROM settlements s JOIN open_items o USING(company_id,item_id) WHERE s.accounting_date<o.accounting_date) earlySettlements
    `,
    )
    .get() as Record<string, number>;
  assert.equal(shape.settlements, expected.settlements);
  assert.equal(shape.payments, expected.payments);
  assert.equal(shape.actions, expected.actions);
  assert.equal(shape.cancels, tradeHistoryLoad.cancelled);
  assert.equal(shape.advances, tradeHistoryLoad.advanceApplied);
  assert.equal(shape.applies, tradeHistoryLoad.advanceApplied);
  assert.equal(shape.settled, expected.settledStatus);
  assert.equal(shape.cancelled, expected.cancelledStatus);
  for (const key of ["badRevisions", "badBalances", "earlySettlements"])
    assert.equal(shape[key], 0, key);
  return shape;
}

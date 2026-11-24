import { StorageError, type TradeDocumentRepository } from "@erp/core/application";
import type { TradeActionRecord, TradeCreditLine } from "@erp/core/domain";
import { tradeDimensionKey, tradeDocumentError } from "@erp/core/domain";
import { refreshOrdersOfItem } from "./trade-document-order-invoicing.ts";
import { int, json, optional, str } from "./trade-document-rows.ts";
import { insertSegments } from "./trade-document-segments.ts";
import type { Connection } from "./types.ts";

export function tradeActionQueries(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "tradeAction" | "tradeItemActions" | "tradeUndo"> {
  return {
    async tradeAction(company, id, byReceipt = false) {
      const rows = await db.query(
        `SELECT record FROM trade_actions WHERE company_id=? AND ${byReceipt ? "receipt_key" : "action_id"}=?`,
        [company, id],
      );
      return rows[0] ? json<TradeActionRecord>(rows[0].record) : null;
    },
    async tradeItemActions(company, itemId) {
      const rows = await db.query(
        "SELECT a.record FROM trade_action_items i JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id WHERE i.company_id=? AND i.item_id=? ORDER BY a.sequence",
        [company, itemId],
      );
      return rows.map((row) => json<TradeActionRecord>(row.record));
    },
    async tradeUndo(company, kind, relatedId) {
      return (
        (
          await db.query(
            "SELECT 1 FROM trade_actions WHERE company_id=? AND kind=? AND related_id=?",
            [company, kind, relatedId],
          )
        ).length > 0
      );
    },
  };
}
export function tradeItemQueries(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "tradeItemSource" | "tradeOpeningItems" | "tradeCreditLines"> {
  return {
    async tradeItemSource(company, itemId) {
      const rows = await db.query(
        "SELECT journal_id,original_id,EXISTS(SELECT 1 FROM legacy_refs r WHERE r.object_type='opening_items' AND r.target_id=s.item_id) AS opening FROM trade_item_sources s WHERE company_id=? AND item_id=?",
        [company, itemId],
      );
      return rows[0]
        ? {
            journalId: str(rows[0].journal_id),
            originalId: optional(rows[0].original_id),
            opening: Number(rows[0].opening) === 1,
          }
        : null;
    },
    async tradeOpeningItems(company, itemIds) {
      if (!itemIds.length) return new Set<string>();
      const rows = await db.query(
        `SELECT r.target_id FROM legacy_refs r JOIN open_items o ON o.item_id=r.target_id
        WHERE r.object_type='opening_items' AND o.company_id=? AND r.target_id IN (${itemIds.map(() => "?").join(",")})`,
        [company, ...itemIds],
      );
      return new Set(rows.map((row) => str(row.target_id)));
    },
    async tradeCreditLines(company, invoiceId) {
      const rows = await db.query(
        "SELECT c.* FROM trade_credit_lines c JOIN open_items o ON o.company_id=c.company_id AND o.item_id=c.credit_id WHERE c.company_id=? AND c.invoice_id=? AND o.status<>'cancelled' ORDER BY c.credit_id,c.source_line_id",
        [company, invoiceId],
      );
      return rows.map(
        (row): TradeCreditLine => ({
          sourceLineId: str(row.source_line_id),
          quantity: str(row.quantity),
          net: int(row.net_minor),
          tax: int(row.tax_minor),
          deductibleTax: int(row.deductible_tax_minor),
        }),
      );
    },
  };
}
export function tradeItemWrites(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "insertTradeItem" | "changeOpenItem"> {
  return {
    async insertTradeItem(company, item, journalId, originalId) {
      await db.query(
        "INSERT INTO trade_item_sources(company_id,item_id,kind,external_no,journal_id,original_id) VALUES(?,?,?,?,?,?)",
        [company, item.itemId, item.kind, item.externalNo, journalId, originalId],
      );
      await db.query(
        "INSERT INTO open_items(company_id,item_id,side,party_id,control_account,dimensions,currency,accounting_date,document_date,due_date,discount_date,gross_minor,net_minor,tax_minor,remaining_gross_minor,remaining_net_minor,remaining_tax_minor,status,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          item.itemId,
          item.side,
          item.party,
          item.controlAccount,
          JSON.stringify(item.dimensions),
          item.currency,
          item.accountingDate,
          item.documentDate,
          item.dueDate,
          item.discountDate,
          item.gross,
          item.net,
          item.tax,
          item.remainingGross,
          item.remainingNet,
          item.remainingTax,
          item.status,
          item.revision,
        ],
      );
      await db.query("INSERT INTO trade_invoice_terms VALUES(?,?,?,?)", [
        company,
        item.itemId,
        item.discountPercent,
        item.allowPartialDiscount ? 1 : 0,
      ]);
      await insertSegments(db, company, item.itemId, item.segments);
    },
    async changeOpenItem(company, before, after) {
      const rows = await db.query(
        "UPDATE open_items SET remaining_gross_minor=?,remaining_net_minor=?,remaining_tax_minor=?,status=?,revision=revision+1 WHERE company_id=? AND item_id=? AND revision=? RETURNING item_id",
        [
          after.remainingGross,
          after.remainingNet,
          after.remainingTax,
          after.status,
          company,
          before.itemId,
          before.revision,
        ],
      );
      if (rows.length !== 1) tradeDocumentError("revision", "stale", true);
      for (const segment of after.segments) {
        const updated = await db.query(
          "UPDATE trade_control_segments SET remaining_gross_minor=? WHERE company_id=? AND item_id=? AND dimension_key=? RETURNING item_id",
          [segment.remainingGross, company, after.itemId, tradeDimensionKey(segment.dimensions)],
        );
        if (updated.length !== 1) throw new StorageError("STORAGE_FAILURE");
      }
      // TORD-06 / TINV-09: cancelling an invoice or a credit note (or any change into/out of
      // cancelled) changes what the invoiced predicate counts for the orders behind it.
      if ((before.status === "cancelled") !== (after.status === "cancelled"))
        await refreshOrdersOfItem(db, company, after.itemId);
    },
  };
}
export function tradeActionPosting(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "insertTradeAction" | "latestSettlementDate"> {
  return {
    async insertTradeAction(company, record) {
      const c = record.command,
        r = record.receipt;
      const relatedId =
        c.kind === "credit"
          ? c.invoiceId
          : c.kind === "cancel"
            ? c.itemId
            : c.kind === "reverse"
              ? c.settlementId
              : null;
      await db.query(
        "INSERT INTO trade_actions(company_id,action_id,kind,related_id,accounting_date,receipt_key,command_hash,record) VALUES(?,?,?,?,?,?,?,?)",
        [
          company,
          c.actionId,
          c.kind,
          relatedId,
          c.accountingDate,
          r.idempotencyKey,
          record.commandHash,
          JSON.stringify(record),
        ],
      );
      for (const change of r.changes)
        await db.query("INSERT INTO trade_action_items VALUES(?,?,?)", [
          company,
          c.actionId,
          change.after.itemId,
        ]);
      if (c.kind !== "credit") return;
      for (const line of r.creditLines)
        await db.query("INSERT INTO trade_credit_lines VALUES(?,?,?,?,?,?,?,?)", [
          company,
          c.actionId,
          c.invoiceId,
          line.sourceLineId,
          line.quantity,
          line.net,
          line.tax,
          line.deductibleTax,
        ]);
      await refreshOrdersOfItem(db, company, c.actionId);
    },
    async latestSettlementDate(company, itemId) {
      const rows = await db.query(
        "SELECT MAX(day) AS day FROM (SELECT accounting_date AS day FROM settlements WHERE company_id=? AND item_id=? UNION ALL SELECT a.accounting_date FROM trade_action_items i JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id WHERE i.company_id=? AND i.item_id=?)",
        [company, itemId, company, itemId],
      );
      return rows[0].day === null ? "" : str(rows[0].day);
    },
  };
}

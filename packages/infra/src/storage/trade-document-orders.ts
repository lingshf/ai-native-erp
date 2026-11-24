import type { TradeDocumentRepository } from "@erp/core/application";
import type { TradeOrder, TradeOrderSummary } from "@erp/core/domain";
import {
  invoicedOrderLines,
  placeholders,
  subtractCredits,
} from "./trade-document-order-invoicing.ts";
import { tradeOrderPageStatement } from "./trade-document-order-page.ts";
import { int, orderLineRow, str } from "./trade-document-rows.ts";
import type { Connection } from "./types.ts";

export function tradeOrderRecords(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "tradeOrder" | "insertTradeOrder"> {
  return {
    async tradeOrder(company, orderId) {
      const rows = await db.query("SELECT * FROM trade_orders WHERE company_id=? AND order_id=?", [
        company,
        orderId,
      ]);
      const row = rows[0];
      if (!row) return null;
      const lines = await db.query(
        "SELECT * FROM trade_order_lines WHERE company_id=? AND order_id=? ORDER BY line_no",
        [company, orderId],
      );
      return {
        orderId: str(row.order_id),
        side: str(row.side) as TradeOrder["side"],
        party: str(row.party_id),
        currency: str(row.currency),
        orderDate: str(row.order_date),
        priceIncludesTax: int(row.price_includes_tax) === 1,
        rounding: str(row.rounding_mode) as TradeOrder["rounding"],
        commandHash: str(row.command_hash),
        recordedAt: str(row.recorded_at),
        lines: lines.map(orderLineRow),
      };
    },
    async insertTradeOrder(company, order) {
      await db.query(
        "INSERT INTO trade_orders(company_id,order_id,side,party_id,currency,order_date,price_includes_tax,rounding_mode,command_hash,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          company,
          order.orderId,
          order.side,
          order.party,
          order.currency,
          order.orderDate,
          order.priceIncludesTax ? 1 : 0,
          order.rounding,
          order.commandHash,
          order.recordedAt,
        ],
      );
      for (const line of order.lines)
        await db.query(
          "INSERT INTO trade_order_lines(company_id,order_id,line_id,line_no,product_id,tax_code,quantity,unit_price,discount_percent,taxable_charge,net_minor,tax_minor,gross_minor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            company,
            order.orderId,
            line.lineId,
            line.lineNo,
            line.product,
            line.taxCode,
            line.quantity,
            line.unitPrice,
            line.discountPercent,
            line.taxableCharge,
            line.net,
            line.tax,
            line.gross,
          ],
        );
    },
  };
}
export function tradeOrderQueries(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "tradeOrderPage" | "tradeOrderInvoiced" | "tradeOrderLatestDate"> {
  return {
    async tradeOrderPage(company, query) {
      const statement = tradeOrderPageStatement(company, query);
      const fetched = await db.query(statement.sql, statement.values);
      const rows = fetched.slice(0, query.limit);
      const items: TradeOrderSummary[] = rows.map((row) => ({
        orderId: str(row.order_id),
        side: str(row.side) as TradeOrderSummary["side"],
        party: str(row.party_id),
        orderDate: str(row.order_date),
        currency: str(row.currency),
        priceIncludesTax: int(row.price_includes_tax) === 1,
        rounding: str(row.rounding_mode) as TradeOrderSummary["rounding"],
        recordedAt: str(row.recorded_at),
        lineCount: int(row.line_count),
        net: int(row.net_minor),
        tax: int(row.tax_minor),
        gross: int(row.gross_minor),
        invoicing: str(row.invoicing) as TradeOrderSummary["invoicing"],
      }));
      return {
        items,
        nextCursor: fetched.length > query.limit ? items[items.length - 1].orderId : null,
      };
    },
    async tradeOrderInvoiced(company, orderId, orderLineIds) {
      if (!orderLineIds.length) return [];
      // Summed exactly in SQLite over only the referenced lines; TEXT keeps 64-bit precision.
      const rows = await db.query(
        `SELECT l.order_line_id,CAST(SUM(l.quantity_micros) AS TEXT) AS micros ${invoicedOrderLines} AND l.order_id=? AND l.order_line_id IN(${placeholders(orderLineIds.length)}) GROUP BY l.order_line_id`,
        [company, orderId, ...orderLineIds],
      );
      const invoiced = rows.map((row) => ({
        orderId,
        orderLineId: str(row.order_line_id),
        micros: BigInt(str(row.micros)),
      }));
      return subtractCredits(db, company, invoiced);
    },
    async tradeOrderLatestDate(company, orderId) {
      const rows = await db.query(
        "SELECT MAX(day) AS day FROM (SELECT accounting_date AS day FROM trade_documents WHERE company_id=? AND order_id=? UNION ALL SELECT a.accounting_date FROM trade_documents d JOIN trade_action_items i ON i.company_id=d.company_id AND i.item_id=d.document_id JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id WHERE d.company_id=? AND d.order_id=?)",
        [company, orderId, company, orderId],
      );
      return rows[0].day === null ? "" : str(rows[0].day);
    },
  };
}

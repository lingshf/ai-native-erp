import type { TradeDocumentRepository } from "@erp/core/application";
import { openItemRow, str } from "./trade-document-rows.ts";
import { segments } from "./trade-document-segments.ts";
import type { Connection } from "./types.ts";

const openItemSelect =
  "SELECT o.*,d.kind,d.external_no,t.discount_percent,t.allow_partial_discount FROM open_items o JOIN trade_item_sources d ON d.company_id=o.company_id AND d.item_id=o.item_id JOIN trade_invoice_terms t ON t.company_id=o.company_id AND t.item_id=o.item_id";
export function openItemQueries(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "openItem" | "openItemPage"> {
  return {
    async openItem(company, itemId) {
      const rows = await db.query(`${openItemSelect} WHERE o.company_id=? AND o.item_id=?`, [
        company,
        itemId,
      ]);
      return rows[0]
        ? openItemRow(rows[0], (await segments(db, company, [itemId])).get(itemId) ?? [])
        : null;
    },
    async openItemPage(company, query) {
      const [due, item] = query.cursor === undefined ? ["", ""] : query.cursor.split("|");
      const filters = [
        ...(query.party === undefined ? [] : ["o.party_id=?"]),
        ...(query.status === undefined ? [] : ["o.status=?"]),
      ];
      const rows = await db.query(
        `${openItemSelect} WHERE o.company_id=?${filters.map((filter) => ` AND ${filter}`).join("")} AND (o.due_date>? OR (o.due_date=? AND o.item_id>?)) ORDER BY o.due_date,o.item_id LIMIT ?`,
        [
          company,
          ...(query.party === undefined ? [] : [query.party]),
          ...(query.status === undefined ? [] : [query.status]),
          due,
          due,
          item,
          query.limit + 1,
        ],
      );
      const values = await segments(
        db,
        company,
        rows.slice(0, query.limit).map((row) => str(row.item_id)),
      );
      const items = rows
        .slice(0, query.limit)
        .map((row) => openItemRow(row, values.get(str(row.item_id)) ?? []));
      return {
        items,
        nextCursor:
          rows.length > query.limit
            ? `${items[items.length - 1].dueDate}|${items[items.length - 1].itemId}`
            : null,
      };
    },
  };
}

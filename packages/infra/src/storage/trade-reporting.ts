import type { TradeReportingRepository } from "@erp/core/application";
import { projection } from "./trade-reporting-projection.ts";
import { tradeReconciliationRepository } from "./trade-reporting-reconciliation.ts";
import { integer, item } from "./trade-reporting-rows.ts";
import type { Connection } from "./types.ts";

export function tradeReportingRepository(db: Pick<Connection, "query">): TradeReportingRepository {
  return {
    async tradeReportStamp(company) {
      const row = (
        await db.query(
          `SELECT
        (SELECT coalesce(max(sequence),0) FROM journal_entries WHERE company_id=?) journals,
        (SELECT coalesce(max(sequence),0) FROM trade_actions WHERE company_id=?) actions,
        (SELECT count(*) FROM settlements WHERE company_id=?) settlements`,
          [company, company, company],
        )
      )[0];
      return [row.journals, row.actions, row.settlements].map(integer).join(":");
    },
    async tradeReport(company, scope, cutoff, ageingDate, query) {
      const page = projection(company, scope, cutoff, ageingDate, {
        detail: true,
        where: "AND o.item_id>?",
        whereValues: [query.cursor ?? ""],
      });
      const rows = await db.query(
        `${page.sql} SELECT * FROM aged WHERE balance_gross>0 ORDER BY item_id LIMIT ?`,
        [...page.values, query.limit + 1],
      );
      const p = projection(company, scope, cutoff, ageingDate, { detail: false });
      const totals = (
        await db.query(
          `${p.sql} SELECT
        coalesce(sum(CASE WHEN kind='invoice' THEN balance_gross ELSE 0 END),0) invoiceGrossMinor,
        coalesce(sum(CASE WHEN bucket='notDue' THEN balance_gross ELSE 0 END),0) notDue,
        coalesce(sum(CASE WHEN bucket='overdue1_30' THEN balance_gross ELSE 0 END),0) overdue1_30,
        coalesce(sum(CASE WHEN bucket='overdue31_60' THEN balance_gross ELSE 0 END),0) overdue31_60,
        coalesce(sum(CASE WHEN bucket='overdue61_90' THEN balance_gross ELSE 0 END),0) overdue61_90,
        coalesce(sum(CASE WHEN bucket='overdue91Plus' THEN balance_gross ELSE 0 END),0) overdue91Plus,
        coalesce(sum(CASE WHEN kind='credit' THEN balance_gross ELSE 0 END),0) creditGrossMinor,
        coalesce(sum(CASE WHEN kind='advance' THEN balance_gross ELSE 0 END),0) advanceGrossMinor
        FROM (SELECT kind,bucket,sum(balance_gross) balance_gross FROM aged GROUP BY kind,bucket)`,
          p.values,
        )
      )[0];
      const items = rows.slice(0, query.limit).map(item);
      return {
        items,
        nextCursor: rows.length > query.limit ? (items.at(-1)?.documentId ?? null) : null,
        totals: {
          invoiceGrossMinor: integer(totals.invoiceGrossMinor),
          notDue: integer(totals.notDue),
          overdue1_30: integer(totals.overdue1_30),
          overdue31_60: integer(totals.overdue31_60),
          overdue61_90: integer(totals.overdue61_90),
          overdue91Plus: integer(totals.overdue91Plus),
          creditGrossMinor: integer(totals.creditGrossMinor),
          advanceGrossMinor: integer(totals.advanceGrossMinor),
        },
      };
    },
    async tradeReportItem(company, id, cutoff, ageingDate) {
      const p = projection(company, {}, cutoff, ageingDate, {
        detail: true,
        where: "AND o.item_id=?",
        whereValues: [id],
      });
      const row = (await db.query(`${p.sql} SELECT * FROM aged`, p.values))[0];
      return row ? item(row) : null;
    },
    // Spread last so tradeReconciliation keeps its original position as the fourth key.
    ...tradeReconciliationRepository(db),
  };
}

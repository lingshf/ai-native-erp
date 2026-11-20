import { StorageError, type TradeReportingRepository } from "@erp/core/application";
import type { TradeReportItem, TradeReportScope } from "@erp/core/domain";
import type { Connection, Row } from "./types.ts";

function integer(value: unknown): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number))
    throw new StorageError("STORAGE_FAILURE");
  return number;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return value;
}
function item(row: Row): TradeReportItem {
  return {
    kind: text(row.kind) as TradeReportItem["kind"],
    side: text(row.side) as TradeReportItem["side"],
    documentId: text(row.item_id),
    party: text(row.party_id),
    currency: text(row.currency),
    externalNo: text(row.external_no),
    version: integer(row.historical_revision),
    currentVersion: integer(row.revision),
    accountingDate: text(row.accounting_date),
    documentDate: text(row.document_date),
    dueDate: row.kind === "invoice" ? text(row.due_date) : null,
    remainingNetMinor: integer(row.balance_net),
    remainingTaxMinor: integer(row.balance_tax),
    remainingGrossMinor: integer(row.balance_gross),
    overdueDays: row.kind === "invoice" ? Math.max(0, integer(row.days)) : null,
    ageingBucket:
      row.bucket === null ? null : (text(row.bucket) as TradeReportItem["ageingBucket"]),
    controlAccount: text(row.control_account),
    sourceReference: text(row.source_ref),
    journalId: text(row.journal_id),
  };
}
// Immutable action before/after differences are aggregated, never replayed into current state.
function projection(company: string, scope: TradeReportScope, cutoff: string, ageingDate: string) {
  return {
    sql: `WITH base AS (
      SELECT o.*,s.kind,s.external_no,s.journal_id,j.source_ref
      FROM open_items o JOIN trade_item_sources s USING(company_id,item_id)
      JOIN journal_entries j ON j.company_id=s.company_id AND j.id=s.journal_id
      WHERE o.company_id=? AND o.accounting_date<=?
      ${scope.party ? "AND o.party_id=?" : ""} ${scope.side ? "AND o.side=?" : ""}
    ), paid AS (
      SELECT s.item_id,sum(s.applied_gross_minor) gross,sum(s.applied_net_minor) net,
        sum(s.applied_tax_minor) tax,count(*) revisions
      FROM base b JOIN settlements s ON s.company_id=b.company_id AND s.item_id=b.item_id
      WHERE s.accounting_date<=? GROUP BY s.item_id
    ), changed AS (
      SELECT i.item_id,
        sum(json_extract(c.value,'$.before.remainingGross')-json_extract(c.value,'$.after.remainingGross')) gross,
        sum(json_extract(c.value,'$.before.remainingNet')-json_extract(c.value,'$.after.remainingNet')) net,
        sum(json_extract(c.value,'$.before.remainingTax')-json_extract(c.value,'$.after.remainingTax')) tax,
        count(*) revisions
      FROM base b JOIN trade_action_items i ON i.company_id=b.company_id AND i.item_id=b.item_id
      JOIN trade_actions a ON a.company_id=i.company_id AND a.action_id=i.action_id,
        json_each(a.record,'$.receipt.changes') c
      WHERE a.accounting_date<=? AND json_extract(c.value,'$.before.itemId')=i.item_id
      GROUP BY i.item_id
    ), balances AS (
      SELECT b.*,b.gross_minor-coalesce(p.gross,0)-coalesce(c.gross,0) balance_gross,
        b.net_minor-coalesce(p.net,0)-coalesce(c.net,0) balance_net,
        b.tax_minor-coalesce(p.tax,0)-coalesce(c.tax,0) balance_tax,
        1+coalesce(p.revisions,0)+coalesce(c.revisions,0) historical_revision,
        CAST(julianday(?)-julianday(b.due_date) AS INTEGER) days
      FROM base b LEFT JOIN paid p USING(item_id) LEFT JOIN changed c USING(item_id)
    ), aged AS (
      SELECT *,CASE WHEN kind<>'invoice' THEN NULL WHEN days<=0 THEN 'notDue'
        WHEN days<=30 THEN 'overdue1_30' WHEN days<=60 THEN 'overdue31_60'
        WHEN days<=90 THEN 'overdue61_90' ELSE 'overdue91Plus' END bucket FROM balances
    )`,
    values: [
      company,
      cutoff,
      ...(scope.party ? [scope.party] : []),
      ...(scope.side ? [scope.side] : []),
      cutoff,
      cutoff,
      ageingDate,
    ],
  };
}
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
      const p = projection(company, scope, cutoff, ageingDate);
      const rows = await db.query(
        `${p.sql} SELECT * FROM aged WHERE balance_gross>0 AND item_id>? ORDER BY item_id LIMIT ?`,
        [...p.values, query.cursor ?? "", query.limit + 1],
      );
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
        FROM aged`,
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
      const p = projection(company, {}, cutoff, ageingDate);
      const row = (
        await db.query(`${p.sql} SELECT * FROM aged WHERE item_id=?`, [...p.values, id])
      )[0];
      return row ? item(row) : null;
    },
    async tradeReconciliation(company, cutoff) {
      const p = projection(company, {}, cutoff, cutoff);
      const rows = await db.query(
        `${p.sql}, accounts_in_scope AS (
        SELECT control_account account FROM base UNION
        SELECT code FROM accounts WHERE company_id=? AND purpose='control' AND control_module IN('AP','AR')
      ), subledger AS (
        SELECT control_account account,
          sum(balance_gross * CASE WHEN (side='AR' AND kind='invoice') OR (side='AP' AND kind<>'invoice') THEN 1 ELSE -1 END) balance
        FROM aged GROUP BY control_account
      ), opening AS (
        SELECT o.control_account account,
          sum(o.gross_minor * CASE WHEN (o.side='AR' AND s.kind='invoice') OR (o.side='AP' AND s.kind<>'invoice') THEN 1 ELSE -1 END) balance
        FROM legacy_refs r JOIN open_items o ON o.company_id=? AND o.item_id=r.target_id
        JOIN trade_item_sources s ON s.company_id=o.company_id AND s.item_id=o.item_id
        WHERE r.source IN('teaching','enterprise') AND r.object_type='opening_items'
          AND o.accounting_date<=?
        GROUP BY o.control_account
      ), gl AS (
        SELECT l.account_code account,sum(l.debit_minor-l.credit_minor) balance,
          sum(CASE WHEN json_extract(r.result,'$.module')='TRADE' THEN l.debit_minor-l.credit_minor ELSE 0 END) trade
        FROM journal_lines l JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id
        LEFT JOIN receipts r ON r.company_id=j.company_id AND r.idempotency_key=j.receipt_key
        WHERE l.company_id=? AND j.accounting_date<=?
        AND l.account_code IN(SELECT account FROM accounts_in_scope) GROUP BY l.account_code
      ) SELECT a.account,coalesce(s.balance,0) subledger,coalesce(g.balance,0) gl,
        coalesce(g.trade,0) trade,coalesce(o.balance,0) opening FROM accounts_in_scope a
        LEFT JOIN subledger s USING(account) LEFT JOIN gl g USING(account)
        LEFT JOIN opening o USING(account) ORDER BY a.account`,
        [...p.values, company, company, cutoff, company, cutoff],
      );
      return rows.map((row) => {
        const subledgerMinor = integer(row.subledger),
          glMinor = integer(row.gl),
          tradeGlMinor = integer(row.trade),
          openingGlMinor = integer(row.opening);
        // D25 single rule: P = 0 without opening items, so M1 results are unchanged.
        return {
          account: text(row.account),
          subledgerMinor,
          glMinor,
          tradeGlMinor,
          openingGlMinor,
          otherSourceMinor: integer(glMinor - tradeGlMinor - openingGlMinor),
          tradeDifferenceMinor: integer(tradeGlMinor + openingGlMinor - subledgerMinor),
          differenceMinor: integer(glMinor - subledgerMinor),
        };
      });
    },
  };
}

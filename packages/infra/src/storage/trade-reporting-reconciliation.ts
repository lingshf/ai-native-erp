import type { TradeReportingRepository } from "@erp/core/application";
import type { TradeReconciliationRow } from "@erp/core/domain";
import { projection } from "./trade-reporting-projection.ts";
import { integer, text } from "./trade-reporting-rows.ts";
import type { Connection, Row } from "./types.ts";

function reconciliationRow(row: Row): TradeReconciliationRow {
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
}
export function tradeReconciliationRepository(
  db: Pick<Connection, "query">,
): Pick<TradeReportingRepository, "tradeReconciliation"> {
  return {
    async tradeReconciliation(company, cutoff) {
      const p = projection(company, {}, cutoff, cutoff, { detail: false });
      const rows = await db.query(
        `${p.sql}, subledger AS MATERIALIZED (
        SELECT control_account account,
          sum(balance_gross * CASE WHEN (side='AR' AND kind='invoice') OR (side='AP' AND kind<>'invoice') THEN 1 ELSE -1 END) balance
        FROM aged GROUP BY control_account
      ), accounts_in_scope AS MATERIALIZED (
        SELECT account FROM subledger UNION
        SELECT code FROM accounts WHERE company_id=? AND purpose='control' AND control_module IN('AP','AR')
      ), opening AS (
        SELECT o.control_account account,
          sum(o.gross_minor * CASE WHEN (o.side='AR' AND s.kind='invoice') OR (o.side='AP' AND s.kind<>'invoice') THEN 1 ELSE -1 END) balance
        FROM legacy_refs r JOIN open_items o ON o.company_id=? AND o.item_id=r.target_id
        JOIN trade_item_sources s ON s.company_id=o.company_id AND s.item_id=o.item_id
        WHERE r.source IN('teaching','enterprise') AND r.object_type='opening_items'
          AND o.accounting_date<=?
        GROUP BY o.control_account
      ), other_entries AS MATERIALIZED (
        SELECT j.id FROM journal_entries j
        LEFT JOIN receipts r ON r.company_id=j.company_id AND r.idempotency_key=j.receipt_key
        WHERE j.company_id=? AND j.accounting_date<=? AND json_extract(r.result,'$.module') IS NOT 'TRADE'
      ), gl_parts AS (
        SELECT account_code account,sum(debit_minor-credit_minor) amount,0 other FROM journal_lines
        WHERE company_id=? AND account_code IN(SELECT account FROM accounts_in_scope)
          AND period<substr(?,1,7) GROUP BY account_code
        UNION ALL
        SELECT l.account_code,sum(l.debit_minor-l.credit_minor),0 FROM journal_lines l
        JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id
        WHERE l.company_id=? AND l.account_code IN(SELECT account FROM accounts_in_scope)
          AND l.period=substr(?,1,7) AND j.accounting_date<=? GROUP BY l.account_code
        UNION ALL
        SELECT account_code,0,sum(debit_minor-credit_minor) FROM journal_lines
        WHERE company_id=? AND account_code IN(SELECT account FROM accounts_in_scope)
          AND entry_id IN(SELECT id FROM other_entries) GROUP BY account_code
      ), gl AS (
        -- A line's period is its entry's month, so whole earlier periods are summed from the
        -- covering index and only the cutoff month checks entry dates. Trade GL is everything
        -- except lines of entries whose receipt module is not TRADE.
        SELECT account,sum(amount) balance,sum(amount)-sum(other) trade FROM gl_parts GROUP BY account
      ) SELECT a.account,coalesce(s.balance,0) subledger,coalesce(g.balance,0) gl,
        coalesce(g.trade,0) trade,coalesce(o.balance,0) opening FROM accounts_in_scope a
        LEFT JOIN subledger s USING(account) LEFT JOIN gl g USING(account)
        LEFT JOIN opening o USING(account) ORDER BY a.account`,
        [
          ...p.values,
          company,
          company,
          cutoff,
          company,
          cutoff,
          company,
          cutoff,
          company,
          cutoff,
          cutoff,
          company,
        ],
      );
      return rows.map(reconciliationRow);
    },
  };
}

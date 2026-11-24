import type { ReportRepository } from "@erp/core/application";
import { reportSnapshot } from "./report-snapshot.ts";
import { reportBalances } from "./report-balances.ts";
import { reportStages } from "./report-stages.ts";
import { ledgerPage } from "./report-ledger.ts";
import type { Connection } from "./types.ts";
export const REPORT_BALANCES_SQL = `SELECT a.*,
  coalesce(s.opening,0) AS opening,coalesce(s.debit,0) AS debit,coalesce(s.credit,0) AS credit,
  coalesce(s.closing,0) AS closing,coalesce(s.year_net,0) AS year_net
  FROM accounts a LEFT JOIN (
    SELECT l.account_code,
      sum(CASE WHEN l.period<? THEN l.debit_minor-l.credit_minor ELSE 0 END) AS opening,
      sum(CASE WHEN l.period=? THEN l.debit_minor ELSE 0 END) AS debit,
      sum(CASE WHEN l.period=? THEN l.credit_minor ELSE 0 END) AS credit,
      sum(l.debit_minor-l.credit_minor) AS closing,
      sum(CASE WHEN l.period>=? THEN l.debit_minor-l.credit_minor ELSE 0 END) AS year_net
    FROM journal_lines l INDEXED BY journal_lines_report_totals
    WHERE l.company_id=? AND l.period<=?
    GROUP BY l.account_code
  ) s ON s.account_code=a.code WHERE a.company_id=? ORDER BY a.code`;
export const LEDGER_ROWS_SQL = `SELECT l.*,e.accounting_date,e.source_ref,e.memo
  FROM journal_entries e INDEXED BY journal_entries_ledger_date
  CROSS JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
  WHERE e.company_id=? AND e.period=? AND e.sequence<=? AND l.account_code=?`;
export function reportRepository(db: Connection): ReportRepository {
  const balances: ReportRepository["reportBalances"] = (company, month, stage, watermark) =>
    reportBalances(db, REPORT_BALANCES_SQL, company, month, stage, watermark);
  return {
    reportSnapshot: (company) => reportSnapshot(db, company),
    reportBalances: balances,
    reportStages: (company, month, watermark) =>
      reportStages(db, balances, company, month, watermark),
    ledgerPage: (company, account, month, query) =>
      ledgerPage(db, LEDGER_ROWS_SQL, company, account, month, query),
  };
}

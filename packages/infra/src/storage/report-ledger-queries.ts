import type { LedgerCursor, LedgerQuery, TrialStage } from "@erp/core/domain";
import { amount } from "./report-values.ts";
import type { Connection, Parameters, Row } from "./types.ts";

export interface LedgerScope {
  readonly db: Connection;
  readonly ledgerRowsSql: string;
  readonly company: string;
  readonly account: string;
  readonly month: string;
  readonly stage: TrialStage;
  readonly stageSql: string;
  readonly watermark: number;
  readonly dimensionSql: string;
  readonly dimensionValues: Parameters;
}
const closingSql =
  "NOT EXISTS(SELECT 1 FROM period_closing_journals c WHERE c.company_id=e.company_id AND c.journal_id=e.id)";
export function ledgerStageSql(stage: TrialStage) {
  return (
    (stage === "unadjusted" ? " AND e.kind<>'adjusting'" : "") +
    (stage === "postClosing" ? "" : ` AND ${closingSql}`)
  );
}
export function ledgerDimensionFilter(query: LedgerQuery) {
  const dimensionSql =
    query.dimension === undefined ? "" : " AND json_extract(l.dimensions,?) IS ?";
  const dimensionValues: Parameters =
    query.dimension === undefined ? [] : [`$."${query.dimension}"`, query.value ?? null];
  return { dimensionSql, dimensionValues };
}
export async function ledgerTotals(scope: LedgerScope): Promise<Row> {
  const { db, company, account, month, stage, watermark, dimensionSql, dimensionValues } = scope;
  return (
    await db.query(
      `SELECT
        coalesce(sum(CASE WHEN l.period<? THEN l.debit_minor-l.credit_minor ELSE 0 END),0) AS opening,
        coalesce(sum(CASE WHEN l.period=? THEN l.debit_minor ELSE 0 END),0) AS debit,
        coalesce(sum(CASE WHEN l.period=? THEN l.credit_minor ELSE 0 END),0) AS credit,
        coalesce(sum(CASE WHEN l.period=? THEN 1 ELSE 0 END),0) AS total
        FROM journal_lines l INDEXED BY journal_lines_ledger_account
        JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id
        WHERE l.company_id=? AND l.account_code=? AND l.period<=? AND e.sequence<=? AND (?<>'unadjusted' OR l.period<? OR e.kind<>'adjusting')
        AND (l.period<? OR ?='postClosing' OR ${closingSql})${dimensionSql}`,
      [
        month,
        month,
        month,
        month,
        company,
        account,
        month,
        watermark,
        stage,
        month,
        month,
        stage,
        ...dimensionValues,
      ],
    )
  )[0];
}
export async function ledgerPrefixBalance(scope: LedgerScope, after: LedgerCursor) {
  const { db, ledgerRowsSql: LEDGER_ROWS_SQL, company, account, month, watermark } = scope;
  const { stageSql, dimensionSql, dimensionValues } = scope;
  const prefix = await db.query(
    `${LEDGER_ROWS_SQL.replace("SELECT l.*,e.accounting_date,e.source_ref,e.memo", "SELECT coalesce(sum(l.debit_minor-l.credit_minor),0) AS n")}
          AND (e.accounting_date,e.id,l.line_no)<=(?,?,?)${stageSql}${dimensionSql}`,
    [
      company,
      month,
      watermark,
      account,
      after.date,
      after.entryId,
      after.lineNo,
      ...dimensionValues,
    ],
  );
  return amount(prefix[0], "n");
}
export function ledgerRows(scope: LedgerScope, after: LedgerCursor | null, limit: number) {
  const { db, ledgerRowsSql: LEDGER_ROWS_SQL, company, account, month, watermark } = scope;
  const { stageSql, dimensionSql, dimensionValues } = scope;
  const bound = after
    ? " AND (e.accounting_date,e.id)>=(?,?) AND (e.accounting_date,e.id,l.line_no)>(?,?,?)"
    : "";
  return db.query(
    `${LEDGER_ROWS_SQL}${bound}${stageSql}${dimensionSql} ORDER BY e.accounting_date,e.id,l.line_no LIMIT ?`,
    [
      company,
      month,
      watermark,
      account,
      ...(after ? [after.date, after.entryId, after.date, after.entryId, after.lineNo] : []),
      ...dimensionValues,
      limit + 1,
    ],
  );
}

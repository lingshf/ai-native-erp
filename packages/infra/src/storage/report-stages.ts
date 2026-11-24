import { reportMinor, type ReportRow, type TrialStage } from "@erp/core/domain";
import type { ReportRepository } from "@erp/core/application";
import { amount } from "./report-values.ts";
import type { Connection, Row } from "./types.ts";

export async function reportStages(
  db: Connection,
  reportBalances: ReportRepository["reportBalances"],
  company: string,
  month: string,
  watermark?: number,
): Promise<Record<TrialStage, readonly ReportRow[]>> {
  const postClosing = await reportBalances(company, month, "postClosing", watermark);
  const effects = await stageEffects(db, company, month, watermark);
  const adjusted = withoutClosing(postClosing, effects);
  const unadjusted = withoutAdjusting(adjusted, effects);
  return { unadjusted, adjusted, postClosing };
}
async function stageEffects(db: Connection, company: string, month: string, watermark?: number) {
  return new Map(
    (
      await db.query(
        `SELECT l.account_code,
        sum(CASE WHEN e.kind='adjusting' THEN l.debit_minor ELSE 0 END) AS adjusting_debit,
        sum(CASE WHEN e.kind='adjusting' THEN l.credit_minor ELSE 0 END) AS adjusting_credit,
        sum(CASE WHEN c.journal_id IS NOT NULL THEN l.debit_minor ELSE 0 END) AS closing_debit,
        sum(CASE WHEN c.journal_id IS NOT NULL THEN l.credit_minor ELSE 0 END) AS closing_credit
        FROM journal_entries e INDEXED BY journal_entries_ledger_date
        LEFT JOIN period_closing_journals c ON c.company_id=e.company_id AND c.journal_id=e.id
        CROSS JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
        WHERE e.company_id=? AND e.period=? ${watermark === undefined ? "" : "AND e.sequence<=?"}
        AND (e.kind='adjusting' OR c.journal_id IS NOT NULL)
        GROUP BY l.account_code`,
        [company, month, ...(watermark === undefined ? [] : [watermark])],
      )
    ).map((row) => [String(row.account_code), row]),
  );
}
function withoutClosing(
  postClosing: readonly ReportRow[],
  effects: ReadonlyMap<string, Row>,
): ReportRow[] {
  return postClosing.map((row): ReportRow => {
    const effect = effects.get(row.code);
    const debit = effect ? amount(effect, "closing_debit") : 0;
    const credit = effect ? amount(effect, "closing_credit") : 0;
    return {
      ...row,
      debit: reportMinor(row.debit - debit),
      credit: reportMinor(row.credit - credit),
      closing: reportMinor(row.closing - debit + credit),
    };
  });
}
function withoutAdjusting(
  adjusted: readonly ReportRow[],
  effects: ReadonlyMap<string, Row>,
): ReportRow[] {
  return adjusted.map((row): ReportRow => {
    const effect = effects.get(row.code);
    const debit = effect ? amount(effect, "adjusting_debit") : 0;
    const credit = effect ? amount(effect, "adjusting_credit") : 0;
    return {
      ...row,
      debit: reportMinor(row.debit - debit),
      credit: reportMinor(row.credit - credit),
      closing: reportMinor(row.closing - debit + credit),
      yearNet: reportMinor(row.yearNet - debit + credit),
    };
  });
}

import { reportMinor, type ReportRow, type TrialStage } from "@erp/core/domain";
import { accountSchema } from "@erp/core/contracts";
import { amount } from "./report-values.ts";
import type { Connection, Row } from "./types.ts";

export async function reportBalances(
  db: Connection,
  balancesSql: string,
  company: string,
  month: string,
  stage: TrialStage,
  watermark?: number,
): Promise<ReportRow[]> {
  let sql =
    stage === "unadjusted"
      ? balancesSql.replace(
          "GROUP BY l.account_code",
          "AND (l.period<? OR l.entry_id NOT IN (SELECT id FROM journal_entries WHERE company_id=? AND kind='adjusting')) GROUP BY l.account_code",
        )
      : balancesSql;
  if (watermark !== undefined)
    sql = sql.replace(
      "GROUP BY l.account_code",
      "AND l.entry_id IN (SELECT id FROM journal_entries WHERE company_id=? AND sequence<=?) GROUP BY l.account_code",
    );
  const rows = await db.query(sql, [
    month,
    month,
    month,
    `${month.slice(0, 4)}-01`,
    company,
    month,
    ...(stage === "unadjusted" ? [month, company] : []),
    ...(watermark === undefined ? [] : [company, watermark]),
    company,
  ]);
  const closing = await closingEffects(db, company, month, watermark);
  const effects = new Map(closing.map((row) => [String(row.account_code), row]));
  return balanceRows(rows, effects, stage);
}
function closingEffects(db: Connection, company: string, month: string, watermark?: number) {
  return db.query(
    `SELECT l.account_code,
        sum(CASE WHEN l.period=? THEN l.debit_minor ELSE 0 END) AS debit,
        sum(CASE WHEN l.period=? THEN l.credit_minor ELSE 0 END) AS credit,
        sum(CASE WHEN l.period>=? THEN l.debit_minor-l.credit_minor ELSE 0 END) AS year_net
        FROM period_closing_journals c
        CROSS JOIN journal_entries e ON e.company_id=c.company_id AND e.id=c.journal_id
        CROSS JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
        WHERE c.company_id=? AND e.period<=? ${watermark === undefined ? "" : "AND e.sequence<=?"}
        GROUP BY l.account_code`,
    [
      month,
      month,
      `${month.slice(0, 4)}-01`,
      company,
      month,
      ...(watermark === undefined ? [] : [watermark]),
    ],
  );
}
function balanceRows(
  rows: readonly Row[],
  effects: ReadonlyMap<string, Row>,
  stage: TrialStage,
): ReportRow[] {
  return rows.map((row): ReportRow => {
    const effect = effects.get(String(row.code));
    const debit = effect && stage !== "postClosing" ? amount(effect, "debit") : 0;
    const credit = effect && stage !== "postClosing" ? amount(effect, "credit") : 0;
    return {
      ...accountSchema.parse({
        code: row.code,
        name: row.name,
        category: row.category,
        reportGroup: row.report_group,
        normalSide: row.normal_side,
        purpose: row.purpose,
        controlModule: row.control_module,
        contraOf: row.contra_of,
        manualAllowed: Number(row.manual_allowed) === 1,
        active: Number(row.active) === 1,
        builtin: Number(row.builtin) === 1,
        revision: Number(row.revision),
      }),
      opening: amount(row, "opening"),
      debit: reportMinor(amount(row, "debit") - debit),
      credit: reportMinor(amount(row, "credit") - credit),
      closing: reportMinor(amount(row, "closing") - debit + credit),
      yearNet: reportMinor(amount(row, "year_net") - (effect ? amount(effect, "year_net") : 0)),
    };
  });
}

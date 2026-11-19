import { DomainError, StorageError, type ReportRepository } from "@erp/core/application";
import {
  reportMinor,
  checkedReportSnapshot,
  type LedgerCursor,
  type LedgerLine,
  type ReportRow,
} from "@erp/core/domain";
import { accountSchema, ledgerCursorSchema, dimensionMapSchema } from "@erp/core/contracts";
import type { Connection, Row, Parameters } from "./types.ts";

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
const amount = (row: Row, name: string) => {
  const value = Number(row[name]);
  if (!Number.isSafeInteger(value)) throw new StorageError("STORAGE_FAILURE");
  return value;
};
function cursor(text: string | undefined): LedgerCursor | null {
  if (text === undefined) return null;
  if (text.length > 2048) throw new DomainError("INVALID_INPUT");
  try {
    const decoded = ledgerCursorSchema.safeParse(
      JSON.parse(Buffer.from(text, "base64url").toString("utf8")),
    );
    if (
      text.length > 2048 ||
      !decoded.success ||
      Buffer.from(JSON.stringify(decoded.data)).toString("base64url") !== text
    )
      throw new DomainError("INVALID_INPUT");
    return decoded.data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("INVALID_INPUT");
    throw error;
  }
}
export function reportRepository(db: Connection): ReportRepository {
  const latestSnapshot = async (company: string) => {
    const row = (
      await db.query(
        `SELECT
      (SELECT coalesce(max(sequence),0) FROM journal_entries WHERE company_id=?) AS watermark,
      (SELECT coalesce(sum(revision),0) FROM accounts WHERE company_id=?) AS account_revision`,
        [company, company],
      )
    )[0];
    return {
      watermark: amount(row, "watermark"),
      accountRevision: amount(row, "account_revision"),
    };
  };
  const reportBalances: ReportRepository["reportBalances"] = async (
    company,
    month,
    stage,
    watermark,
  ) => {
    let sql =
      stage === "unadjusted"
        ? REPORT_BALANCES_SQL.replace(
            "GROUP BY l.account_code",
            "AND (l.period<? OR l.entry_id NOT IN (SELECT id FROM journal_entries WHERE company_id=? AND kind='adjusting')) GROUP BY l.account_code",
          )
        : REPORT_BALANCES_SQL;
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
    const closing = await db.query(
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
    const effects = new Map(closing.map((row) => [String(row.account_code), row]));
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
  };
  return {
    reportSnapshot: latestSnapshot,
    reportBalances,
    async reportStages(company, month, watermark) {
      const postClosing = await reportBalances(company, month, "postClosing", watermark);
      const effects = new Map(
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
      const adjusted = postClosing.map((row): ReportRow => {
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
      const unadjusted = adjusted.map((row): ReportRow => {
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
      return { unadjusted, adjusted, postClosing };
    },
    async ledgerPage(company, account, month, query) {
      const stage = query.stage ?? "adjusted";
      const closingSql =
        "NOT EXISTS(SELECT 1 FROM period_closing_journals c WHERE c.company_id=e.company_id AND c.journal_id=e.id)";
      const stageSql =
        (stage === "unadjusted" ? " AND e.kind<>'adjusting'" : "") +
        (stage === "postClosing" ? "" : ` AND ${closingSql}`);
      const after = cursor(query.cursor);
      if (
        after &&
        (after.company !== company ||
          after.account !== account ||
          after.month !== month ||
          after.stage !== stage ||
          (query.watermark !== undefined && after.watermark !== query.watermark) ||
          (query.accountRevision !== undefined &&
            after.accountRevision !== query.accountRevision) ||
          after.dimension !== (query.dimension ?? null) ||
          after.value !== (query.value ?? null))
      )
        throw new DomainError("INVALID_INPUT");
      const { watermark, accountRevision } = checkedReportSnapshot(
        query.watermark !== undefined || query.accountRevision !== undefined
          ? { watermark: query.watermark, accountRevision: query.accountRevision }
          : (after ?? undefined),
        await latestSnapshot(company),
      );
      const dimensionSql =
        query.dimension === undefined ? "" : " AND json_extract(l.dimensions,?) IS ?";
      const dimensionValues: Parameters =
        query.dimension === undefined ? [] : [`$."${query.dimension}"`, query.value ?? null];
      const totals = (
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
      const opening = amount(totals, "opening"),
        debit = amount(totals, "debit"),
        credit = amount(totals, "credit");
      let balance = opening;
      if (after) {
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
        balance = reportMinor(balance + amount(prefix[0], "n"));
      }
      const bound = after
        ? " AND (e.accounting_date,e.id)>=(?,?) AND (e.accounting_date,e.id,l.line_no)>(?,?,?)"
        : "";
      const rows = await db.query(
        `${LEDGER_ROWS_SQL}${bound}${stageSql}${dimensionSql} ORDER BY e.accounting_date,e.id,l.line_no LIMIT ?`,
        [
          company,
          month,
          watermark,
          account,
          ...(after ? [after.date, after.entryId, after.date, after.entryId, after.lineNo] : []),
          ...dimensionValues,
          query.limit + 1,
        ],
      );
      const items = rows.slice(0, query.limit).map((row): LedgerLine => {
        const debit = amount(row, "debit_minor"),
          credit = amount(row, "credit_minor");
        balance = reportMinor(balance + debit - credit);
        if (
          typeof row.dimensions !== "string" ||
          typeof row.entry_id !== "string" ||
          typeof row.accounting_date !== "string" ||
          typeof row.source_ref !== "string" ||
          typeof row.memo !== "string"
        )
          throw new StorageError("STORAGE_FAILURE");
        return {
          entryId: row.entry_id,
          lineNo: amount(row, "line_no"),
          date: row.accounting_date,
          sourceRef: row.source_ref,
          memo: row.memo,
          debit,
          credit,
          dimensions: dimensionMapSchema.parse(JSON.parse(row.dimensions)),
          balance,
        };
      });
      const last = items.at(-1);
      const next: LedgerCursor | null =
        rows.length > query.limit && last
          ? {
              company,
              month,
              stage,
              account,
              dimension: query.dimension ?? null,
              value: query.value ?? null,
              watermark,
              accountRevision,
              date: last.date,
              entryId: last.entryId,
              lineNo: last.lineNo,
            }
          : null;
      return {
        stage,
        opening,
        debit,
        credit,
        closing: reportMinor(opening + debit - credit),
        total: amount(totals, "total"),
        watermark,
        accountRevision,
        items,
        nextCursor: next ? Buffer.from(JSON.stringify(next)).toString("base64url") : null,
      };
    },
  };
}

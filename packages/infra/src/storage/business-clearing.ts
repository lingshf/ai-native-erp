import type { BusinessRepository } from "@erp/core/application";
import { openClearingLineSchema } from "@erp/core/contracts";
import type { Connection, Row } from "./types.ts";
import { decoded, json, page } from "./business-rows.ts";
function clearingLine(row: Row) {
  return decoded(openClearingLineSchema, {
    entryId: row.entry_id,
    lineNo: Number(row.line_no),
    account: row.account_code,
    date: row.accounting_date,
    memo: row.memo,
    debit: Number(row.debit_minor),
    credit: Number(row.credit_minor),
    dimensions: json(row.dimensions),
  });
}
const lineProjection =
  "l.entry_id,l.line_no,l.account_code,l.debit_minor,l.credit_minor,l.dimensions,j.accounting_date,j.memo";
export function clearingLineStore(
  db: Connection,
): Pick<BusinessRepository, "clearingLines" | "openClearingLines"> {
  return {
    async clearingLines(company, refs) {
      if (!refs.length) return [];
      const rows = await db.query(
        `SELECT ${lineProjection},c.event_id AS matched,json_extract(l.evidence,'$.balancing') AS balancing FROM journal_lines l JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id LEFT JOIN business_clearing_links c ON c.company_id=l.company_id AND c.entry_id=l.entry_id AND c.line_no=l.line_no WHERE l.company_id=? AND (l.entry_id,l.line_no) IN(${refs.map(() => "(?,?)").join(",")}) ORDER BY l.entry_id,l.line_no`,
        [company, ...refs.flatMap((line) => [line.entryId, line.lineNo])],
      );
      return rows.map((row) => ({
        ...clearingLine(row),
        matched: row.matched !== null,
        balancing: row.balancing !== null,
      }));
    },
    async openClearingLines(company, account, date, query) {
      const [id = "", lineNo = "0"] = query.cursor?.split(":") ?? [];
      const rows = await db.query(
        `SELECT ${lineProjection} FROM journal_lines l JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.entry_id LEFT JOIN business_clearing_links c ON c.company_id=l.company_id AND c.entry_id=l.entry_id AND c.line_no=l.line_no WHERE l.company_id=? AND l.account_code=? AND (l.entry_id,l.line_no)>(?,?) AND j.accounting_date<=? AND c.event_id IS NULL AND json_extract(l.evidence,'$.balancing') IS NULL ORDER BY l.entry_id,l.line_no LIMIT ?`,
        [company, account, id, Number(lineNo), date, query.limit + 1],
      );
      return page(rows, query, clearingLine, (item) => `${item.entryId}:${item.lineNo}`);
    },
  };
}

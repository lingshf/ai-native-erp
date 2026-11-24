import { StorageError } from "@erp/core/application";
import {
  reportMinor,
  type LedgerCursor,
  type LedgerLine,
  type LedgerQuery,
} from "@erp/core/domain";
import { dimensionMapSchema } from "@erp/core/contracts";
import { amount } from "./report-values.ts";
import type { LedgerScope } from "./report-ledger-queries.ts";
import type { Row } from "./types.ts";

export function ledgerItems(rows: readonly Row[], limit: number, opening: number): LedgerLine[] {
  let balance = opening;
  return rows.slice(0, limit).map((row): LedgerLine => {
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
}
export function nextLedgerCursor(
  scope: LedgerScope,
  query: LedgerQuery,
  accountRevision: number,
  hasMore: boolean,
  last: LedgerLine | undefined,
): string | null {
  const { company, month, stage, account, watermark } = scope;
  const next: LedgerCursor | null =
    hasMore && last
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
  return next ? Buffer.from(JSON.stringify(next)).toString("base64url") : null;
}

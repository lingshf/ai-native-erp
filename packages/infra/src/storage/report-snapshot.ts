import type { ReportSnapshot } from "@erp/core/domain";
import { amount } from "./report-values.ts";
import type { Connection } from "./types.ts";

export async function reportSnapshot(db: Connection, company: string): Promise<ReportSnapshot> {
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
}

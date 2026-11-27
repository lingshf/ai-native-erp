import { StorageError } from "@erp/core/application/storage";
import type { TradeReportItem } from "@erp/core/domain";
import type { Row } from "./types.ts";

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

export { integer, item, text };

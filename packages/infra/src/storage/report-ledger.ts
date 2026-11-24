import { DomainError } from "@erp/core/application";
import {
  reportMinor,
  checkedReportSnapshot,
  type LedgerCursor,
  type LedgerPage,
  type LedgerQuery,
  type TrialStage,
} from "@erp/core/domain";
import { decodeLedgerCursor, amount } from "./report-values.ts";
import { reportSnapshot } from "./report-snapshot.ts";
import {
  ledgerDimensionFilter,
  ledgerPrefixBalance,
  ledgerRows,
  ledgerStageSql,
  ledgerTotals,
  type LedgerScope,
} from "./report-ledger-queries.ts";
import { ledgerItems, nextLedgerCursor } from "./report-ledger-items.ts";
import type { Connection } from "./types.ts";

export async function ledgerPage(
  db: Connection,
  ledgerRowsSql: string,
  company: string,
  account: string,
  month: string,
  query: LedgerQuery,
): Promise<LedgerPage> {
  const stage = query.stage ?? "adjusted";
  const stageSql = ledgerStageSql(stage);
  // The cursor is decoded and matched against the query before any database read.
  const after = checkedLedgerCursor(company, account, month, stage, query);
  const { watermark, accountRevision } = checkedReportSnapshot(
    query.watermark !== undefined || query.accountRevision !== undefined
      ? { watermark: query.watermark, accountRevision: query.accountRevision }
      : (after ?? undefined),
    await reportSnapshot(db, company),
  );
  const scope: LedgerScope = {
    db,
    ledgerRowsSql,
    company,
    account,
    month,
    stage,
    stageSql,
    watermark,
    ...ledgerDimensionFilter(query),
  };
  const totals = await ledgerTotals(scope);
  const opening = amount(totals, "opening"),
    debit = amount(totals, "debit"),
    credit = amount(totals, "credit");
  let balance = opening;
  if (after) balance = reportMinor(balance + (await ledgerPrefixBalance(scope, after)));
  const rows = await ledgerRows(scope, after, query.limit);
  const items = ledgerItems(rows, query.limit, balance);
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
    nextCursor: nextLedgerCursor(
      scope,
      query,
      accountRevision,
      rows.length > query.limit,
      items.at(-1),
    ),
  };
}
function checkedLedgerCursor(
  company: string,
  account: string,
  month: string,
  stage: TrialStage,
  query: LedgerQuery,
): LedgerCursor | null {
  const after = decodeLedgerCursor(query.cursor);
  if (
    after &&
    (after.company !== company ||
      after.account !== account ||
      after.month !== month ||
      after.stage !== stage ||
      (query.watermark !== undefined && after.watermark !== query.watermark) ||
      (query.accountRevision !== undefined && after.accountRevision !== query.accountRevision) ||
      after.dimension !== (query.dimension ?? null) ||
      after.value !== (query.value ?? null))
  )
    throw new DomainError("INVALID_INPUT");
  return after;
}

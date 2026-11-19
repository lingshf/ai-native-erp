import {
  DomainError,
  checkedCode,
  checkedJournalId,
  checkedPage,
  checkedTeachingMonth,
  type TradeReport,
  type TradeReportItem,
  type TradeReportQuery,
  type TradeReportScope,
  type TradeReconciliation,
  type TradeReconciliationRow,
  type PageQuery,
} from "@erp/core/domain";
import type { MasterDataRepository } from "./master-data.ts";
import type { JournalTools } from "./journals.ts";

export interface TradeReportingRepository {
  tradeReportStamp(company: string): Promise<string>;
  tradeReport(
    company: string,
    scope: TradeReportScope,
    cutoff: string,
    ageingDate: string,
    query: PageQuery,
  ): Promise<Pick<TradeReport, "items" | "nextCursor" | "totals">>;
  tradeReportItem(
    company: string,
    id: string,
    cutoff: string,
    ageingDate: string,
  ): Promise<TradeReportItem | null>;
  tradeReconciliation(company: string, cutoff: string): Promise<readonly TradeReconciliationRow[]>;
}
export function tradeReportDates(month: string | undefined, now: string) {
  if (month !== undefined) checkedTeachingMonth(month);
  const asOf =
    month === undefined
      ? null
      : `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`;
  return { asOf, cutoff: asOf ?? "9999-12-31", ageingDate: asOf ?? now.slice(0, 10) };
}
async function companyExists(repo: MasterDataRepository, company: string) {
  checkedCode(company);
  if (!(await repo.company(company))) throw new DomainError("NOT_FOUND");
}
export async function readTradeReport(
  repo: MasterDataRepository,
  tools: JournalTools,
  company: string,
  query: TradeReportQuery,
): Promise<TradeReport> {
  checkedCode(company);
  checkedPage(query);
  if (query.party !== undefined) checkedCode(query.party);
  if (query.side !== undefined && query.side !== "AP" && query.side !== "AR")
    throw new DomainError("INVALID_INPUT");
  if (query.cursor !== undefined) checkedJournalId(query.cursor);
  if (
    (query.cursor && !query.snapshot) ||
    (query.snapshot !== undefined && !/^[0-9a-f]{64}$/u.test(query.snapshot))
  )
    throw new DomainError("INVALID_INPUT");
  const dates = tradeReportDates(query.month, tools.now());
  await companyExists(repo, company);
  const scope = {
    ...(query.month === undefined ? {} : { month: query.month }),
    ...(query.side === undefined ? {} : { side: query.side }),
    ...(query.party === undefined ? {} : { party: query.party }),
  };
  const snapshot = tools.hash([
    company,
    scope,
    dates.ageingDate,
    await repo.tradeReportStamp(company),
  ]);
  if (query.snapshot !== undefined && query.snapshot !== snapshot)
    throw new DomainError("CONFLICT");
  return {
    company,
    basis: dates.asOf ? "monthEnd" : "current",
    asOf: dates.asOf,
    ageingDate: dates.ageingDate,
    snapshot,
    ...(await repo.tradeReport(company, scope, dates.cutoff, dates.ageingDate, query)),
  };
}
export async function readTradeReconciliation(
  repo: MasterDataRepository,
  tools: JournalTools,
  company: string,
  month?: string,
): Promise<TradeReconciliation> {
  const dates = tradeReportDates(month, tools.now());
  await companyExists(repo, company);
  return {
    company,
    asOf: dates.asOf,
    basis: "debitMinusCredit",
    scope: "companyAllParties",
    rows: await repo.tradeReconciliation(company, dates.cutoff),
  };
}

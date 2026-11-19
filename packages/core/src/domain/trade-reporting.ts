import type { OpenItem, Page, PageQuery, TradeSide } from "./index.ts";

export const ageingBuckets = [
  "notDue",
  "overdue1_30",
  "overdue31_60",
  "overdue61_90",
  "overdue91Plus",
] as const;
export type AgeingBucket = (typeof ageingBuckets)[number];
export interface TradeReportScope {
  readonly month?: string;
  readonly side?: TradeSide;
  readonly party?: string;
}
export interface TradeReportQuery extends TradeReportScope, PageQuery {
  readonly snapshot?: string;
}
export interface TradeReportItem {
  readonly kind: OpenItem["kind"];
  readonly side: TradeSide;
  readonly documentId: string;
  readonly party: string;
  readonly currency: string;
  readonly externalNo: string;
  readonly version: number;
  readonly currentVersion: number;
  readonly accountingDate: string;
  readonly documentDate: string;
  readonly dueDate: string | null;
  readonly remainingNetMinor: number;
  readonly remainingTaxMinor: number;
  readonly remainingGrossMinor: number;
  readonly overdueDays: number | null;
  readonly ageingBucket: AgeingBucket | null;
  readonly controlAccount: string;
  readonly sourceReference: string;
  readonly journalId: string;
}
export interface TradeAgeing {
  readonly invoiceGrossMinor: number;
  readonly notDue: number;
  readonly overdue1_30: number;
  readonly overdue31_60: number;
  readonly overdue61_90: number;
  readonly overdue91Plus: number;
  readonly creditGrossMinor: number;
  readonly advanceGrossMinor: number;
}
export interface TradeReport extends Page<TradeReportItem> {
  readonly company: string;
  readonly basis: "current" | "monthEnd";
  readonly asOf: string | null;
  readonly ageingDate: string;
  readonly snapshot: string;
  readonly totals: TradeAgeing;
}
export interface TradeReconciliationRow {
  readonly account: string;
  readonly subledgerMinor: number;
  readonly tradeGlMinor: number;
  readonly otherSourceMinor: number;
  readonly glMinor: number;
  readonly tradeDifferenceMinor: number;
  readonly differenceMinor: number;
}
export interface TradeReconciliation {
  readonly company: string;
  readonly asOf: string | null;
  readonly basis: "debitMinusCredit";
  readonly scope: "companyAllParties";
  readonly rows: readonly TradeReconciliationRow[];
}

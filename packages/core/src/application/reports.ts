import {
  DomainError,
  buildReports,
  reportCheck,
  checkedReportSnapshot,
  checkedCode,
  checkedAccountCode,
  checkedTeachingMonth,
  checkedPage,
  type ReportRow,
  type TrialStage,
  type LedgerQuery,
  type LedgerPage,
  type ReportSnapshot,
} from "@erp/core/domain";
import type { MasterDataStore } from "./master-data.ts";

export interface ReportRepository {
  reportSnapshot(company: string): Promise<ReportSnapshot>;
  reportBalances(
    company: string,
    month: string,
    stage: TrialStage,
    watermark?: number,
  ): Promise<readonly ReportRow[]>;
  reportStages(
    company: string,
    month: string,
    watermark?: number,
  ): Promise<Readonly<Record<TrialStage, readonly ReportRow[]>>>;
  ledgerPage(
    company: string,
    account: string,
    month: string,
    query: LedgerQuery,
  ): Promise<LedgerPage>;
}
function checkedScope(company: string, month: string, stage: TrialStage) {
  checkedCode(company);
  checkedTeachingMonth(month);
  if (!["unadjusted", "adjusted", "postClosing"].includes(stage))
    throw new DomainError("INVALID_INPUT");
}
export class ReportService {
  private readonly store: MasterDataStore;
  constructor(store: MasterDataStore) {
    this.store = store;
  }
  report(
    company: string,
    month: string,
    stage: TrialStage = "adjusted",
    requestedSnapshot?: ReportSnapshot,
  ) {
    checkedScope(company, month, stage);
    return this.store.read(async (repo) => {
      const owner = await repo.company(company);
      if (!owner || !(await repo.period(company, month))) throw new DomainError("NOT_FOUND");
      const latest = await repo.reportSnapshot(company),
        snapshot = checkedReportSnapshot(requestedSnapshot, latest);
      const historical = snapshot.watermark === latest.watermark ? undefined : snapshot.watermark;
      const rows = await repo.reportBalances(company, month, stage, historical);
      const incomeRows =
        stage === "postClosing"
          ? await repo.reportBalances(company, month, "adjusted", historical)
          : rows;
      return {
        ...buildReports(owner, month, stage, rows, incomeRows),
        ...snapshot,
      };
    });
  }
  reconciliation(
    company: string,
    month: string,
    stage: TrialStage = "adjusted",
    requestedSnapshot?: ReportSnapshot,
  ) {
    checkedScope(company, month, stage);
    return this.store.read(async (repo) => {
      const owner = await repo.company(company);
      if (!owner || !(await repo.period(company, month))) throw new DomainError("NOT_FOUND");
      const latest = await repo.reportSnapshot(company),
        snapshot = checkedReportSnapshot(requestedSnapshot, latest),
        historical = snapshot.watermark === latest.watermark ? undefined : snapshot.watermark;
      const stages = await repo.reportStages(company, month, historical);
      const unadjusted = buildReports(owner, month, "unadjusted", stages.unadjusted);
      const adjusted = buildReports(owner, month, "adjusted", stages.adjusted);
      const postClosing = buildReports(
        owner,
        month,
        "postClosing",
        stages.postClosing,
        adjusted.trial.rows,
      );
      const selected =
        stage === "unadjusted" ? unadjusted : stage === "postClosing" ? postClosing : adjusted;
      const checks = [
        reportCheck("tb.unadjusted", unadjusted.trial.debit, unadjusted.trial.credit),
        reportCheck("tb.adjusted", adjusted.trial.debit, adjusted.trial.credit),
        reportCheck("tb.postClosing", postClosing.trial.debit, postClosing.trial.credit),
        ...selected.reconciliation.checks.filter((check) => check.id !== "trial"),
      ];
      return {
        ...selected,
        ...snapshot,
        reconciliation: { checks, allPass: checks.every((check) => check.pass) },
      };
    });
  }
  ledger(company: string, account: string, month: string, query: LedgerQuery) {
    checkedScope(company, month, query.stage ?? "adjusted");
    checkedAccountCode(account);
    checkedPage(query);
    if ((query.dimension === undefined) !== (query.value === undefined))
      throw new DomainError("INVALID_INPUT");
    if (query.dimension !== undefined) {
      checkedCode(query.dimension);
      if (query.value !== null && query.value !== undefined) checkedCode(query.value);
    }
    return this.store.read(async (repo) => {
      const owner = await repo.company(company);
      if (!owner || !(await repo.period(company, month)) || !(await repo.account(company, account)))
        throw new DomainError("NOT_FOUND");
      if (
        query.dimension &&
        (!(await repo.dimension(company, "dimension", query.dimension)) ||
          (query.value !== null &&
            !(await repo.dimension(company, "value", query.value ?? "", query.dimension))))
      )
        throw new DomainError("NOT_FOUND");
      return {
        company,
        account,
        month,
        currency: owner.currency,
        scale: owner.scale,
        ...(await repo.ledgerPage(company, account, month, query)),
      };
    });
  }
}

import {
  DomainError,
  buildReports,
  reportCheck,
  reportWatermark,
  checkedCode,
  checkedAccountCode,
  checkedTeachingMonth,
  checkedPage,
  type ReportRow,
  type TrialStage,
  type LedgerQuery,
  type LedgerPage,
} from "@erp/core/domain";
import type { MasterDataStore } from "./master-data.ts";

export interface ReportRepository {
  reportWatermark(company: string): Promise<number>;
  reportBalances(
    company: string,
    month: string,
    stage: TrialStage,
    watermark?: number,
  ): Promise<readonly ReportRow[]>;
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
    requestedWatermark?: number,
  ) {
    checkedScope(company, month, stage);
    return this.store.read(async (repo) => {
      const owner = await repo.company(company);
      if (!owner || !(await repo.period(company, month))) throw new DomainError("NOT_FOUND");
      const latest = await repo.reportWatermark(company),
        watermark = reportWatermark(requestedWatermark, latest);
      return {
        ...buildReports(
          owner,
          month,
          stage,
          await repo.reportBalances(
            company,
            month,
            stage,
            watermark === latest ? undefined : watermark,
          ),
        ),
        watermark,
      };
    });
  }
  reconciliation(
    company: string,
    month: string,
    stage: TrialStage = "adjusted",
    requestedWatermark?: number,
  ) {
    checkedScope(company, month, stage);
    return this.store.read(async (repo) => {
      const owner = await repo.company(company);
      if (!owner || !(await repo.period(company, month))) throw new DomainError("NOT_FOUND");
      const latest = await repo.reportWatermark(company),
        watermark = reportWatermark(requestedWatermark, latest),
        historical = watermark === latest ? undefined : watermark;
      const unadjusted = buildReports(
        owner,
        month,
        "unadjusted",
        await repo.reportBalances(company, month, "unadjusted", historical),
      );
      const adjusted = buildReports(
        owner,
        month,
        "adjusted",
        await repo.reportBalances(company, month, "adjusted", historical),
      );
      const selected = stage === "unadjusted" ? unadjusted : { ...adjusted, stage };
      const checks = [
        reportCheck("tb.unadjusted", unadjusted.trial.debit, unadjusted.trial.credit),
        reportCheck("tb.adjusted", adjusted.trial.debit, adjusted.trial.credit),
        reportCheck("tb.postClosing", adjusted.trial.debit, adjusted.trial.credit),
        ...selected.reconciliation.checks.filter((check) => check.id !== "trial"),
      ];
      return {
        ...selected,
        watermark,
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

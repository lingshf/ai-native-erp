import type { CompanyDto } from "@erp/core/contracts";
import type { MasterDataFailure } from "../master-data-client.ts";
import type { Preferences } from "../ui/index.ts";
import { FinancialReport } from "./financial-report.tsx";
import { ledgerFilters } from "./ledger-query.ts";
import { LedgerGrid } from "./ledger-grid.tsx";
import { LedgerSnapshot } from "./ledger-snapshot.tsx";
import type { T, View } from "./types.ts";

export function ReportContent({
  ledger,
  params,
  search,
  company,
  month,
  account,
  stage,
  view,
  preferences,
  conflict,
  setConflict,
  t,
}: {
  ledger: boolean;
  params: URLSearchParams;
  search: URLSearchParams;
  company: CompanyDto;
  month: string;
  account: string;
  stage: string;
  view: string;
  preferences: Preferences;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
  t: T;
}) {
  return ledger ? (
    params.has("watermark") ? (
      <LedgerGrid
        key={`${search}:${account}:${params.get("dimension")}:${params.get("value")}`}
        company={company}
        month={month}
        account={account}
        params={params}
        preferences={preferences}
        conflict={conflict}
        setConflict={setConflict}
        t={t}
      />
    ) : (
      <LedgerSnapshot
        scope={ledgerFilters(company.code, month, account, params)}
        conflict={conflict}
        setConflict={setConflict}
        t={t}
      />
    )
  ) : (
    <FinancialReport
      company={company}
      month={month}
      stage={stage}
      view={view as View}
      group={params.get("group")}
      search={search}
      preferences={preferences}
      t={t}
    />
  );
}

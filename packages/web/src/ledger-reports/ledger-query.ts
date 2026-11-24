import { useEffect } from "react";
import { MasterDataFailure } from "../master-data-client.ts";

export function ledgerFilters(
  company: string,
  month: string,
  account: string,
  params: URLSearchParams,
) {
  const filters = new URLSearchParams({
    company,
    month,
    account,
    limit: "500",
    stage: params.get("stage") ?? "adjusted",
  });
  for (const key of ["dimension", "value", "watermark", "accountRevision"]) {
    if (params.has(key)) filters.set(key, params.get(key) ?? "");
  }
  return filters;
}

export function ledgerKey(filters: URLSearchParams) {
  return [
    "ledger-live",
    ...[
      "company",
      "month",
      "account",
      "stage",
      "dimension",
      "value",
      "watermark",
      "accountRevision",
    ].map((key) => filters.get(key)),
  ];
}

export function useLedgerConflict(
  error: unknown,
  setConflict: (error: MasterDataFailure | null) => void,
) {
  useEffect(() => {
    if (error instanceof MasterDataFailure && error.status === 409) setConflict(error);
  }, [error, setConflict]);
}

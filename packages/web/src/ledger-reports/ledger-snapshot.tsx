import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ledgerSchema } from "@erp/core/contracts";
import { masterRequest, type MasterDataFailure } from "../master-data-client.ts";
import { ErrorBox, SnapshotUnavailable } from "./error-box.tsx";
import { ledgerKey, useLedgerConflict } from "./ledger-query.ts";
import type { T } from "./types.ts";

export function LedgerSnapshot({
  scope,
  conflict,
  setConflict,
  t,
}: {
  scope: URLSearchParams;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
  t: T;
}) {
  const [, setParams] = useSearchParams(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["ledger-live", scope.get("company"), "snapshot", scope.toString()],
    enabled: conflict === null,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      if (conflict) throw conflict;
      return masterRequest(`/api/v1/ledger?${scope}`, ledgerSchema, { signal });
    },
  });
  useLedgerConflict(query.error, setConflict);
  useEffect(() => {
    if (!query.data || query.isError || query.isFetching || conflict) return;
    const next = new URLSearchParams(scope);
    next.delete("limit");
    next.set("watermark", String(query.data.watermark));
    next.set("accountRevision", String(query.data.accountRevision));
    client.setQueryData(ledgerKey(next), { pages: [query.data], pageParams: [""] });
    setParams(next, { replace: true });
  }, [query.data, query.isError, query.isFetching, conflict, scope, client, setParams]);
  if (conflict) return <SnapshotUnavailable t={t} />;
  if (query.isError)
    return <ErrorBox error={query.error} retry={() => void query.refetch()} t={t} />;
  return <p role="status">{t("master.loading")}</p>;
}

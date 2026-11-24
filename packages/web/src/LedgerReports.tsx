import { useCallback, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { companiesPageSchema } from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { masterRequest, type MasterDataFailure } from "./master-data-client.ts";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { CompanyReports } from "./ledger-reports/company-reports.tsx";
import { CompanySelector } from "./ledger-reports/company-selector.tsx";
import { ErrorBox } from "./ledger-reports/error-box.tsx";
import type { T } from "./ledger-reports/types.ts";
import "./pages/ledger.css";
export function LedgerReports({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [failedSnapshot, setFailedSnapshot] = useState<{
    scope: string;
    error: MasterDataFailure;
  } | null>(null);
  const t: T = (key) => label(preferences.language, key);
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const code = params.get("company") ?? items[0]?.code;
  const company = items.find((item) => item.code === code);
  const scope = `${code}:${location.pathname}:${params.get("watermark")}:${params.get("accountRevision")}`;
  const conflict = failedSnapshot?.scope === scope ? failedSnapshot.error : null;
  const setConflict = useCallback(
    (error: MasterDataFailure | null) => setFailedSnapshot(error ? { scope, error } : null),
    [scope],
  );
  return (
    <section className="page ledger-page">
      <PageHeader
        title={t(location.pathname === "/ledger" ? "ledger.detail" : "ledger.title")}
        description={t("ledger.live")}
        context={
          <CompanySelector
            items={items}
            company={company}
            locked={conflict !== null}
            hasNextPage={companies.hasNextPage}
            onSelect={(value) => setParams({ company: value })}
            onLoadMore={() => void companies.fetchNextPage()}
            t={t}
          />
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("ledger.teachingTitle")}>
        {t("ledger.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <ErrorBox error={companies.error} retry={() => void companies.refetch()} t={t} />
      )}
      {code && !company && !companies.isPending && !companies.hasNextPage && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.invalid")}
        </MessageBar>
      )}
      {company && (
        <CompanyReports
          key={`${company.code}:${location.pathname}`}
          company={company}
          preferences={preferences}
          conflict={conflict}
          setConflict={setConflict}
        />
      )}
    </section>
  );
}

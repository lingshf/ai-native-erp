import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { companiesPageSchema } from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { masterRequest } from "./master-data-client.ts";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { CompanyJournals } from "./journals/company-journals.tsx";
import type { T } from "./journals/dialogs.tsx";
export function Journals({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams();
  const t: T = (key) => label(preferences.language, key);
  const [locked, setLocked] = useState(false);
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
  const company = items.find((item) => item.code === (params.get("company") ?? items[0]?.code));
  return (
    <section className="page journals">
      <PageHeader
        title={t("journal.title")}
        description={t("journal.description")}
        context={
          <>
            <div className="field">
              <label htmlFor="journal-company">{t("master.company")}</label>
              <select
                id="journal-company"
                disabled={locked}
                value={company?.code ?? ""}
                onChange={(event) => setParams({ company: event.target.value })}
              >
                {items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </div>
            {companies.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={companies.isFetchingNextPage}
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("journal.teachingTitle")}>
        {t("journal.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          {t("journal.error")}{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void companies.refetch()}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {company && (
        <CompanyJournals
          key={`${company.code}:${params.get("id") ?? ""}`}
          company={company}
          initialEntryId={params.get("id")}
          language={preferences.language}
          teaching={preferences.teaching}
          lock={setLocked}
        />
      )}
    </section>
  );
}

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { companiesPageSchema } from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { masterRequest } from "./master-data-client.ts";
// 本模块不再直接使用 Journals，但保留这条导入：入口模块不直接导入 Journals 时，Rolldown 会把 Journals 块改为命名空间导出，
// 入口块因此变化（REFAC-02 G4 要求入口块字节不变）；位置同 base，Journals 的求值顺序也与 base 一致。
import "./Journals.tsx";
import { PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { CompanyEvents } from "./business-events/company-events.tsx";
import { PageControls } from "./business-events/list.tsx";
import type { T } from "./business-events/types.ts";
export { BusinessError } from "./business-events/business-error.tsx";
export function BusinessEvents({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key),
    [params] = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(
      () => params.get("company") ?? undefined,
    ),
    [locked, setLocked] = useState(false);
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
  const items = companies.data?.pages.flatMap((p) => p.items) ?? [],
    company = items.find((item) => item.code === (selected ?? items[0]?.code));
  return (
    <section className="page business-events">
      <PageHeader
        title={t("business.title")}
        description={t("business.description")}
        context={
          <div className="field">
            <label htmlFor="business-company">{t("master.company")}</label>
            <select
              id="business-company"
              disabled={locked}
              value={company?.code ?? ""}
              onChange={(event) => setSelected(event.target.value)}
            >
              {items.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("business.teachingTitle")}>
        {t("business.teaching")}
      </TeachingTip>
      <PageControls page={companies} t={t} />
      {company && (
        <CompanyEvents
          key={company.code}
          company={company}
          language={preferences.language}
          lock={setLocked}
          initialId={params.get("company") === company.code ? params.get("id") : null}
          initialQueue={params.get("view") === "queue"}
        />
      )}
    </section>
  );
}

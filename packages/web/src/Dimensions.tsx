import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { companiesPageSchema, type CompanyDto } from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { masterRequest } from "./master-data-client.ts";
import { PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { Notice } from "./dimensions/dimension-failure.tsx";
import { DimensionPane } from "./dimensions/dimension-pane.tsx";
import type { Kind, T } from "./dimensions/dimension-types.ts";
import { LoadMoreButton } from "./dimensions/load-more-button.tsx";
import { pageItems } from "./dimensions/page-items.ts";
import { useDimensionPage } from "./dimensions/use-dimension-page.ts";
import "./pages/master.css";
const kinds = ["dimension", "value", "structure", "defaults", "derivation", "balance"] as const;
export function Dimensions({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key);
  const [selected, setSelected] = useState("");
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = pageItems(companies.data);
  const company = rows.find((item) => item.code === (selected || rows[0]?.code));
  return (
    <section className="page ui-master dimensions">
      <PageHeader
        title={t("dim.title")}
        description={t("dim.description")}
        context={
          companies.data && (
            <>
              <div className="field">
                <label htmlFor="dimension-company">{t("master.company")}</label>
                <select
                  id="dimension-company"
                  value={company?.code ?? ""}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {rows.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <LoadMoreButton pages={companies} className="btn btn-secondary" t={t} />
            </>
          )
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("dim.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <Notice error={companies.error} t={t} retry={() => void companies.refetch()} />
      )}
      {company && <CompanyDimensions key={company.code} company={company} t={t} />}
    </section>
  );
}
function CompanyDimensions({ company, t }: { company: CompanyDto; t: T }) {
  const [kind, setKind] = useState<Kind>("dimension"),
    [dimension, setDimension] = useState("");
  const definitions = useDimensionPage(company.code, "dimension", "", kind === "value");
  return (
    <>
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="dimension-kind">{t("dim.kind")}</label>
          <select
            id="dimension-kind"
            value={kind}
            onChange={(event) => {
              const next = kinds.find((value) => value === event.target.value);
              if (next) setKind(next);
            }}
          >
            {kinds.map((item) => (
              <option key={item} value={item}>
                {t(`dim.${item}`)}
              </option>
            ))}
          </select>
        </div>
        {kind === "value" && (
          <>
            <div className="field">
              <label htmlFor="dimension-parent">{t("dim.parent")}</label>
              <select
                id="dimension-parent"
                value={dimension}
                onChange={(event) => setDimension(event.target.value)}
              >
                <option value="">{t("dim.choose")}</option>
                {pageItems(definitions.data).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code}
                  </option>
                ))}
              </select>
            </div>
            <LoadMoreButton pages={definitions} className="btn btn-secondary" t={t} />
          </>
        )}
      </div>
      {kind === "value" && definitions.isError && (
        <Notice error={definitions.error} t={t} retry={() => void definitions.refetch()} />
      )}
      {kind === "value" && !dimension && <p className="ui-master-note">{t("dim.emptyParent")}</p>}
      {(kind !== "value" || dimension) && (
        <DimensionPane
          key={`${kind}:${dimension}`}
          company={company}
          kind={kind}
          dimension={kind === "value" ? dimension : ""}
          t={t}
        />
      )}
    </>
  );
}

import type { BusinessPreviewDto, CompanyDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { Facts, LinePlan } from "../journals/dialogs.tsx";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { formatMinor } from "../reports-data.ts";
import type { T } from "./types.ts";
export function BusinessPlan({
  preview,
  company,
  language,
  t,
}: {
  preview: BusinessPreviewDto;
  company: CompanyDto;
  language: Language;
  t: T;
}) {
  return (
    <>
      <Facts
        items={[
          [t("journal.sourceRef"), preview.plan.sourceRef],
          [t("journal.date"), preview.plan.date],
          [t("journal.currency"), preview.plan.currency],
          [t("journal.memo"), preview.plan.memo],
        ]}
      />
      {preview.matches.map((match) => (
        <section key={match.meaning}>
          <h4>
            {t("business.match")}: {t(`business.${match.meaning}`)} → {match.rule} / r
            {match.revision} → {match.account}
          </h4>
          <p>
            {t("business.candidates")}:{" "}
            {match.candidates
              .map(
                (item) =>
                  `${t(item.objectScope === "group" ? "business.groupScope" : `business.${item.objectScope}`)} / ${t(item.partyScope === "group" ? "business.groupScope" : `business.${item.partyScope}`)} (${item.count})`,
              )
              .join(" · ")}
          </p>
        </section>
      ))}
      {!preview.plan.journals.length && <p>{t("business.noGl")}</p>}
      {preview.plan.journals.map((journal) => (
        <section key={journal.role}>
          <h4>{t(journal.role === "reversal" ? "journal.historical" : "journal.business")}</h4>
          <LinePlan
            lines={journal.lines}
            company={company}
            language={language}
            t={t}
            total={journal}
          />
        </section>
      ))}
      {preview.statistics && (
        <section>
          <h4>
            {preview.statistics.code}:{" "}
            {formatMinor(preview.statistics.quantity, language, preview.statistics.scale)}{" "}
            {preview.statistics.unit}
          </h4>
          {Object.entries(preview.statistics.dimensionOrigins).map(([key, origins]) => (
            <p key={key}>
              {key}:{" "}
              {origins.map((origin) => `${origin.source} → ${origin.value ?? "-"}`).join(" · ")}
            </p>
          ))}
        </section>
      )}
      {preview.clearing.length > 0 && (
        <VirtualRows
          className="jv-rows"
          items={preview.clearing}
          title={t("business.selected")}
          header={[t("journal.original"), t("journal.line")]}
          render={(line) => (
            <>
              <td>{line.entryId}</td>
              <td>{line.lineNo}</td>
            </>
          )}
        />
      )}
    </>
  );
}

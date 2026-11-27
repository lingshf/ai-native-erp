import type { LegacyLedgerResponse } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import type { Translate } from "./report-label.ts";

export function LedgerKpis({
  first,
  t,
  language,
}: {
  first: LegacyLedgerResponse;
  t: Translate;
  language: Language;
}) {
  return (
    <dl className="kpis">
      {(["opening", "debit", "credit", "closing"] as const).map((field) => (
        <div key={field} className={field === "closing" ? "kpi emphasis" : "kpi"}>
          <dt className="label">{t(`reports.${field}`)}</dt>
          <dd className="value">{formatMinor(first[field], language)}</dd>
        </div>
      ))}
      <div className="kpi">
        <dt className="label">{t("reports.totalEntries")}</dt>
        <dd className="value">{first.totalEntries}</dd>
      </div>
    </dl>
  );
}

import type { SetURLSearchParams } from "react-router-dom";
import type { LegacyContextResponse } from "@erp/core/contracts";
import { PageHeader } from "../ui/components/index.tsx";
import type { Translate } from "./report-label.ts";
import { isTrialStage } from "./trial-stage.ts";

export function ReportPeriodHeader({
  t,
  periods,
  source,
  stage,
  setParams,
  value,
  disabled,
}: {
  t: Translate;
  periods: LegacyContextResponse["periods"];
  source: LegacyContextResponse["source"];
  stage: string;
  setParams: SetURLSearchParams;
  value: string;
  disabled: boolean;
}) {
  return (
    <PageHeader
      title={t("reports.group")}
      description={t("reports.snapshot")}
      context={
        <div className="field">
          <label htmlFor="report-period">{t("reports.period")}</label>
          <select
            id="report-period"
            value={value}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value;
              if (periods.some((period) => period.month === next)) {
                setParams({
                  source: source.snapshotSha256,
                  month: next,
                  stage: isTrialStage(stage) ? stage : "adjusted",
                });
              }
            }}
          >
            <option value="" disabled>
              {t("reports.choosePeriod")}
            </option>
            {periods.map((period) => (
              <option value={period.month} key={period.month}>
                {period.month} · {t(`reports.${period.status}`)}
              </option>
            ))}
          </select>
        </div>
      }
    />
  );
}

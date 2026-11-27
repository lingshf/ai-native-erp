import { legacyTrialStages, type LegacyTrialStage } from "@erp/core/contracts";
import type { Translate } from "./report-label.ts";
import { isTrialStage } from "./trial-stage.ts";

export function TrialStageSelect({
  t,
  stage,
  onStage,
}: {
  t: Translate;
  stage: LegacyTrialStage;
  onStage: (stage: LegacyTrialStage) => void;
}) {
  return (
    <div className="filter-bar">
      <div className="field">
        <label htmlFor="trial-stage">{t("reports.stage")}</label>
        <select
          id="trial-stage"
          value={stage}
          onChange={(event) => {
            const next = event.target.value;
            if (isTrialStage(next)) onStage(next);
          }}
        >
          {legacyTrialStages.map((value) => (
            <option key={value} value={value}>
              {t(`reports.${value}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

import { legacyTrialStages, type LegacyTrialStage } from "@erp/core/contracts";

// One type guard serves URL validation, the period-switch fallback and the stage select.
export const isTrialStage = (value: string): value is LegacyTrialStage =>
  legacyTrialStages.some((stage) => stage === value);

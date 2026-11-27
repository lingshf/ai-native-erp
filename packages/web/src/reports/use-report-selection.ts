import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatch, useSearchParams } from "react-router-dom";
import { label, type Preferences } from "../ui/index.ts";
import { parseContext, readReport } from "../reports-data.ts";
import type { Translate } from "./report-label.ts";
import { isTrialStage } from "./trial-stage.ts";

export function useReportSelection(preferences: Preferences) {
  const client = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [params, setParams] = useSearchParams();
  const trialRoute = useMatch("/reports/trial");
  const ledgerRoute = useMatch("/reports/ledger/:account");
  const { language } = preferences;
  const t: Translate = (key) => label(language, key);
  const context = useQuery({
    queryKey: ["legacy", "context", generation],
    queryFn: ({ signal }) => readReport("/api/v1/legacy/context", signal, parseContext),
    enabled: !reloading,
  });
  const source = context.data?.source;
  const periods = context.data?.periods ?? [];
  const selectedSource = params.has("source") ? params.get("source")! : source?.snapshotSha256;
  const month = params.has("month") ? params.get("month")! : periods.at(-1)?.month;
  const stage = params.get("stage") ?? "adjusted";
  const invalid =
    !!context.data &&
    ([...params.keys()].some(
      (key) => !["source", "month", "stage"].includes(key) || params.getAll(key).length !== 1,
    ) ||
      selectedSource !== source?.snapshotSha256 ||
      ((params.has("month") || periods.length > 0) &&
        !periods.some((period) => period.month === month)) ||
      !isTrialStage(stage));
  useEffect(() => {
    if (!source || invalid || !month || reloading) return;
    if (!params.has("source") || !params.has("month") || !params.has("stage")) {
      setParams({ source: source.snapshotSha256, month, stage }, { replace: true });
    }
  }, [source, month, stage, invalid, params, setParams, reloading]);

  async function reload() {
    if (reloading) return;
    setReloading(true);
    await client.cancelQueries({ queryKey: ["legacy"] });
    client.removeQueries({ queryKey: ["legacy"] });
    setParams({}, { replace: true });
    setGeneration((value) => value + 1);
    setReloading(false);
  }
  return {
    t,
    language,
    context,
    source,
    periods,
    selectedSource,
    month,
    stage,
    invalid,
    setParams,
    trialRoute,
    ledgerRoute,
    reload,
    reloading,
  };
}

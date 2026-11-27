import { useQuery } from "@tanstack/react-query";
import type { LegacyTrialStage } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { parseTrial, readReport, type ReportScope } from "../reports-data.ts";
import { LoadingStatus } from "./loading-status.tsx";
import { Failure } from "./report-failure.tsx";
import type { Translate } from "./report-label.ts";
import { TrialBalanceCard } from "./trial-table.tsx";
import { TrialStageSelect } from "./trial-stage-select.tsx";

export function Trial({
  scope,
  stage,
  t,
  language,
  search,
  onStage,
  reload,
}: {
  scope: ReportScope;
  stage: LegacyTrialStage;
  t: Translate;
  language: Language;
  search: string;
  onStage: (stage: LegacyTrialStage) => void;
  reload: () => void;
}) {
  const query = useQuery({
    queryKey: ["legacy", "trial", scope.source.snapshotSha256, scope.month],
    queryFn: ({ signal }) =>
      readReport(
        `/api/v1/legacy/trial?${new URLSearchParams({
          snapshot: scope.source.snapshotSha256,
          month: scope.month,
        })}`,
        signal,
        (body) => parseTrial(body, scope),
      ),
  });
  const data = query.data?.trialBalances[stage];
  return (
    <section className="ledger-stack">
      <TrialStageSelect t={t} stage={stage} onStage={onStage} />
      {query.isPending ? (
        <LoadingStatus t={t} />
      ) : query.isError ? (
        <Failure
          error={query.error}
          t={t}
          retry={() => {
            void query.refetch();
          }}
          reload={reload}
        />
      ) : (
        data && (
          <TrialBalanceCard
            data={data}
            month={scope.month}
            stage={stage}
            t={t}
            language={language}
            search={search}
          />
        )
      )}
    </section>
  );
}

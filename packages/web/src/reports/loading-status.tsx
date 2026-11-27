import type { Translate } from "./report-label.ts";

export function LoadingStatus({ t }: { t: Translate }) {
  return (
    <p className="ledger-meta" role="status">
      {t("reports.loading")}
    </p>
  );
}

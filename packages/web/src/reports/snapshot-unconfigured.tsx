import { Link } from "react-router-dom";
import { MessageBar, PageHeader } from "../ui/components/index.tsx";
import type { Translate } from "./report-label.ts";

export function SnapshotUnconfigured({ t, refetch }: { t: Translate; refetch: () => void }) {
  return (
    <section className="page reports ledger-page">
      <PageHeader title={t("reports.group")} />
      <MessageBar tone="info" role="status">
        {t("reports.unconfigured")}
      </MessageBar>
      <div className="ledger-actions">
        <Link className="btn btn-primary" to="/ledger-reports">
          {t("ledger.title")}
        </Link>
        <button className="btn btn-secondary" type="button" onClick={refetch}>
          {t("reports.reload")}
        </button>
      </div>
    </section>
  );
}

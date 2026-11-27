import { Link } from "react-router-dom";
import type { Language } from "../ui/index.ts";
import type { ReportScope } from "../reports-data.ts";
import { LedgerEntriesTable } from "./ledger-entries-table.tsx";
import { LedgerKpis } from "./ledger-kpis.tsx";
import { LedgerPaging } from "./ledger-paging.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { Failure, isConflict } from "./report-failure.tsx";
import type { Translate } from "./report-label.ts";
import { useLedgerPages } from "./use-ledger-pages.ts";

export function Ledger({
  scope,
  t,
  language,
  search,
  reload,
}: {
  scope: ReportScope & { account: string };
  t: Translate;
  language: Language;
  search: string;
  reload: () => void;
}) {
  const { query, more } = useLedgerPages(scope);
  const first = query.data?.pages[0];
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <section className="ledger-stack">
      <div className="ledger-heading">
        <h3>
          {t("reports.ledger")} · {scope.account}
        </h3>
        <Link className="btn btn-subtle btn-sm" to={`/reports/trial?${search}`}>
          {t("reports.back")}
        </Link>
      </div>
      <p className="ledger-meta">{t("reports.fullMonth")}</p>
      {query.isPending ? (
        <LoadingStatus t={t} />
      ) : isConflict(query.error) || !first ? (
        <Failure
          error={query.error}
          t={t}
          retry={() => {
            void query.refetch();
          }}
          reload={reload}
        />
      ) : (
        <>
          <LedgerKpis first={first} t={t} language={language} />
          {entries.length === 0 && <p className="empty-state">{t("reports.emptyLedger")}</p>}
          <div className="card">
            <LedgerEntriesTable
              entries={entries}
              account={scope.account}
              month={scope.month}
              t={t}
              language={language}
            />
          </div>
          <LedgerPaging query={query} more={more} reload={reload} t={t} />
        </>
      )}
    </section>
  );
}

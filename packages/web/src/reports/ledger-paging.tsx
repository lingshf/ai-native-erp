import { MessageBar } from "../ui/components/index.tsx";
import { Failure } from "./report-failure.tsx";
import type { Translate } from "./report-label.ts";
import type { LedgerPagesQuery } from "./use-ledger-pages.ts";

export function LedgerPaging({
  query,
  more,
  reload,
  t,
}: {
  query: LedgerPagesQuery;
  more: () => Promise<void>;
  reload: () => void;
  t: Translate;
}) {
  return (
    <>
      {query.isFetchNextPageError ? (
        <>
          <MessageBar tone="warning">{t("reports.incomplete")}</MessageBar>
          <Failure
            error={query.error}
            t={t}
            retry={() => {
              void more();
            }}
            reload={reload}
          />
        </>
      ) : (
        <p className="ledger-meta" role="status">
          {t(query.hasNextPage ? "reports.partial" : "reports.complete")}
        </p>
      )}
      {query.hasNextPage && !query.isFetchNextPageError && (
        <button
          className="btn btn-secondary"
          type="button"
          disabled={query.isFetching}
          onClick={() => {
            void more();
          }}
        >
          {t(query.isFetchingNextPage ? "reports.loadingMore" : "reports.more")}
        </button>
      )}
    </>
  );
}

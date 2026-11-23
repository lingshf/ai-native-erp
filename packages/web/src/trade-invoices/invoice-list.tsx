import type { CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { TradeInvoiceDetail } from "../TradeInvoiceDetail.tsx";
import type { T } from "./invoice-model.ts";
import type { LinkChange } from "./invoice-link.ts";
import { InvoiceLinkWarning, InvoiceListFailure, InvoiceListMore } from "./invoice-list-bars.tsx";
import { InvoiceFilterBar } from "./invoice-list-filter.tsx";
import { InvoiceTable } from "./invoice-list-table.tsx";
import {
  useDetailFocus,
  useInvoiceFilters,
  useInvoicePages,
  useInvoiceRows,
} from "./use-invoice-list.ts";

type InvoiceListProps = {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  params: URLSearchParams;
  write: (change: LinkChange) => void;
};

export function InvoiceList({ company, preferences, t, params, write }: InvoiceListProps) {
  const filters = useInvoiceFilters(company, params, write);
  const { page, rows } = useInvoicePages(company, filters.applied);
  const { scroll, invoice, opened, openDetail, closeDetail } = useDetailFocus(params, write);
  const { visible, before, after } = useInvoiceRows(rows, scroll);
  return (
    <div className="card tinv-list">
      <header>
        <h3>{t("tinv.list")}</h3>
      </header>
      {filters.broken && (
        <InvoiceLinkWarning language={preferences.language} t={t} onClear={filters.clear} />
      )}
      <InvoiceFilterBar t={t} filters={filters} />
      {page.isPending && <p role="status">{t("master.loading")}</p>}
      {page.isError && (
        <InvoiceListFailure t={t} error={page.error} onRetry={() => void page.refetch()} />
      )}
      <section
        className="grid-wrap tinv-list-scroll"
        ref={scroll}
        aria-label={t("tinv.list")}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual list supports keyboard scrolling.
        tabIndex={0}
      >
        <InvoiceTable
          company={company}
          preferences={preferences}
          t={t}
          onOpen={openDetail}
          rowCount={rows.length}
          visible={visible}
          before={before}
          after={after}
        />
        {page.isSuccess && rows.length === 0 && (
          <p className="empty-state">{t(filters.filtered ? "tinv.filter.none" : "tinv.empty")}</p>
        )}
      </section>
      {page.hasNextPage && (
        <InvoiceListMore
          t={t}
          loading={page.isFetchingNextPage}
          onMore={() => void page.fetchNextPage()}
        />
      )}
      {invoice && (
        <TradeInvoiceDetail
          key={invoice}
          company={company}
          documentId={invoice}
          externalNo={
            opened.current?.documentId === invoice
              ? opened.current.externalNo
              : rows.find((row) => row.documentId === invoice)?.externalNo
          }
          preferences={preferences}
          close={closeDetail}
        />
      )}
    </div>
  );
}

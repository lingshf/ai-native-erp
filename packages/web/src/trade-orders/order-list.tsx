import type { CompanyDto } from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import { orderFilterKeys, type OrderFilter } from "../trade-order-link.ts";
import { FastTab } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";
import { OrderLinkWarning, OrderListFailure, OrderListMore } from "./order-list-bars.tsx";
import { OrderFilterBar } from "./order-list-filter.tsx";
import { OrderTable } from "./order-list-table.tsx";
import { useOrderFilters, useOrderRows } from "./use-order-list.ts";

export { restartOrderList } from "./use-order-list.ts";

export function OrderList({
  company,
  language,
  money,
  t,
  params,
  onFilter,
  onOpen,
}: {
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
  params: URLSearchParams;
  onFilter: (filter: OrderFilter) => void;
  onOpen: (orderId: string) => void;
}) {
  const filters = useOrderFilters(params, company.code, onFilter);
  const { page, rows } = useOrderRows(company, filters.applied);
  const filtered = orderFilterKeys.some((key) => filters.applied[key]);
  return (
    <FastTab id="tord-list" title={t("tord.list")}>
      {filters.broken && <OrderLinkWarning t={t} onClear={filters.clear} />}
      <OrderFilterBar t={t} filters={filters} />
      {page.isPending && <p role="status">{label(language, "master.loading")}</p>}
      {page.isError && <OrderListFailure language={language} onRetry={() => void page.refetch()} />}
      {page.isSuccess && rows.length === 0 && (
        <p className="empty-state">{t(filtered ? "tord.listNoMatch" : "tord.listEmpty")}</p>
      )}
      {rows.length > 0 && (
        <OrderTable language={language} money={money} t={t} rows={rows} onOpen={onOpen} />
      )}
      {page.hasNextPage && (
        <OrderListMore
          language={language}
          loading={page.isFetchingNextPage}
          onMore={() => void page.fetchNextPage()}
        />
      )}
    </FastTab>
  );
}

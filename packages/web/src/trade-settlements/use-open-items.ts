import { useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { openItemPageSchema, type CompanyDto } from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { OVERSCAN_ROWS, ROW_HEIGHT_PX, VIRTUALIZE_AFTER_ROWS } from "./settlement-model.ts";

// The open-item query and the allocation table's virtualizer, in their original hook order.
export function useOpenItems(company: CompanyDto) {
  const page = useInfiniteQuery({
    queryKey: ["tradeOpenItems", company.code],
    initialPageParam: "",
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/open-items?company=${encodeURIComponent(company.code)}&status=open&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        openItemPageSchema,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((p) => p.items) ?? [];
  const scroll = useRef<HTMLDivElement>(null);
  const virtual = rows.length > VIRTUALIZE_AFTER_ROWS;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN_ROWS,
  });
  const measured = virtualizer.getVirtualItems();
  const visible = virtual
    ? measured.map((item) => ({ row: rows[item.index], index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  return { page, rows, scroll, virtual, virtualizer, measured, visible };
}
export type OpenItems = ReturnType<typeof useOpenItems>;

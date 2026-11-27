import { dimensionPageSchema } from "@erp/core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { masterRequest } from "../master-data-client.ts";
import type { Kind } from "./dimension-types.ts";

export function useDimensionPage(company: string, kind: Kind, dimension: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["dimensions", company, kind, dimension],
    initialPageParam: "",
    enabled,
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/dimensions?company=${encodeURIComponent(company)}&kind=${kind}&limit=100${dimension ? `&dimension=${encodeURIComponent(dimension)}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        dimensionPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

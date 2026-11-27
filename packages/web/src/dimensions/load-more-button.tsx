import type { T } from "./dimension-types.ts";

type NextPages = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
};

export function LoadMoreButton({
  pages,
  className,
  t,
}: {
  pages: NextPages;
  className: string;
  t: T;
}) {
  if (!pages.hasNextPage) return null;
  return (
    <button
      type="button"
      className={className}
      disabled={pages.isFetchingNextPage}
      onClick={() => void pages.fetchNextPage()}
    >
      {t("master.loadMore")}
    </button>
  );
}

import type { T } from "./types.ts";

export function LoadMoreButton({ onClick, t }: { onClick: () => void; t: T }) {
  return (
    <button type="button" className="btn btn-subtle" onClick={onClick}>
      {t("master.loadMore")}
    </button>
  );
}

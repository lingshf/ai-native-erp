import type { CompanyDto } from "@erp/core/contracts";
import { LoadMoreButton } from "./load-more-button.tsx";
import type { T } from "./types.ts";

export function CompanySelector({
  items,
  company,
  locked,
  hasNextPage,
  onSelect,
  onLoadMore,
  t,
}: {
  items: CompanyDto[];
  company: CompanyDto | undefined;
  locked: boolean;
  hasNextPage: boolean;
  onSelect: (code: string) => void;
  onLoadMore: () => void;
  t: T;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="ledger-company">{t("master.company")}</label>
        <select
          id="ledger-company"
          disabled={locked}
          value={company?.code ?? ""}
          onChange={(event) => onSelect(event.target.value)}
        >
          {items.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} · {item.name}
            </option>
          ))}
        </select>
      </div>
      {hasNextPage && <LoadMoreButton onClick={onLoadMore} t={t} />}
    </>
  );
}

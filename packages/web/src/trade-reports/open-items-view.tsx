import type { CompanyDto } from "@erp/core/contracts";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { Badge } from "../ui/components/index.tsx";
import { ageingTone } from "./report-query.ts";
import type { Money, T } from "./types.ts";
import type { CompanyReportsState } from "./use-company-reports.ts";
type Totals = NonNullable<CompanyReportsState["totals"]>;
type OpenItem = CompanyReportsState["rows"][number];
const COLUMNS = [
  "document",
  "kind",
  "party",
  "net",
  "tax",
  "gross",
  "due",
  "days",
  "ageing",
  "version",
] as const;
export function OpenItemsView({
  state,
  totals,
  company,
  t,
  money,
}: {
  state: CompanyReportsState;
  totals: Totals;
  company: CompanyDto;
  t: T;
  money: Money;
}) {
  const { view, month, page, rows, dirty, openItem } = state;
  return (
    <>
      <OpenItemsKpis totals={totals} t={t} money={money} />
      <div className="card trpt-items">
        <header>
          <h3>{t(view === "ageing" ? "trpt.ageing" : "trpt.openItems")}</h3>
          <span className="summary">
            {month ? page.data?.pages[0]?.asOf : t("trpt.current")} · {company.currency}
          </span>
        </header>
        <VirtualRows
          items={rows}
          title={t(view === "ageing" ? "trpt.ageing" : "trpt.openItems")}
          header={COLUMNS.map((key) => t(`trpt.${key}`))}
          render={(row) => (
            <OpenItemCells row={row} dirty={dirty} openItem={openItem} t={t} money={money} />
          )}
        />
        {rows.length === 0 && <p className="empty-state">{t("trpt.empty")}</p>}
        {page.hasNextPage && (
          <button
            type="button"
            className="btn btn-secondary trpt-more"
            disabled={page.isFetchingNextPage}
            onClick={() => void page.fetchNextPage()}
          >
            {t("master.loadMore")}
          </button>
        )}
      </div>
    </>
  );
}
function OpenItemsKpis({ totals, t, money }: { totals: Totals; t: T; money: Money }) {
  return (
    <dl className="kpis">
      {(Object.keys(totals) as (keyof Totals)[]).map((key) => (
        <div key={key} className={key === "invoiceGrossMinor" ? "kpi emphasis" : "kpi"}>
          <dt className="label">{t(`trpt.${key}`)}</dt>
          <dd className="value">{money(totals[key])}</dd>
          {(key === "creditGrossMinor" || key === "advanceGrossMinor") && (
            <dd className="sub">{t("trpt.notNetted")}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
function OpenItemCells({
  row,
  dirty,
  openItem,
  t,
  money,
}: {
  row: OpenItem;
  dirty: boolean;
  openItem: (documentId: string) => void;
  t: T;
  money: Money;
}) {
  return (
    <>
      <td>
        <button
          type="button"
          className="cell-link"
          disabled={dirty}
          onClick={() => openItem(row.documentId)}
        >
          {row.externalNo}
        </button>
      </td>
      <td>
        {row.side} · {t(`trpt.${row.kind}`)}
      </td>
      <td>{row.party}</td>
      <td className="num">{money(row.remainingNetMinor)}</td>
      <td className="num">{money(row.remainingTaxMinor)}</td>
      <td className="num strong">{money(row.remainingGrossMinor)}</td>
      <td>{row.dueDate ?? t("trpt.none")}</td>
      <td className="num">{row.overdueDays ?? t("trpt.none")}</td>
      <td>
        {row.ageingBucket ? (
          <Badge tone={ageingTone(row.ageingBucket)}>{t(`trpt.${row.ageingBucket}`)}</Badge>
        ) : (
          t("trpt.none")
        )}
      </td>
      <td>
        {row.version} / {row.currentVersion}
      </td>
    </>
  );
}

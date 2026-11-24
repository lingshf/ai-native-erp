import type { CompanyDto, TradeSettlementCommandDto } from "@erp/core/contracts";
import { FastTab } from "../ui/components/index.tsx";
import type { Money, T } from "./settlement-model.ts";
import { settlementTotals } from "./settlement-items.ts";
import { SettlementRow, SettlementSpacerRow } from "./settlement-row.tsx";
import { SettlementKpis, SettlementTableHead } from "./settlement-table-parts.tsx";
import { SettlementListToolbar } from "./settlement-list-toolbar.tsx";
import type { OpenItems } from "./use-open-items.ts";

type SettlementAllocationTabProps = {
  t: T;
  money: Money;
  company: CompanyDto;
  command: TradeSettlementCommandDto;
  locked: boolean;
  openItems: OpenItems;
  onChange: (next: TradeSettlementCommandDto) => void;
};

export function SettlementAllocationTab(props: SettlementAllocationTabProps) {
  const { t, money, company, command, locked, openItems, onChange } = props;
  const { page, rows, scroll, virtual, virtualizer, measured, visible } = openItems;
  const firstSelected = rows.find((item) => item.itemId === command.items[0]?.itemId);
  const { due, allocated } = settlementTotals(command.items, rows);
  return (
    <FastTab id="tset-allocation" title={t("tset.allocation")}>
      <SettlementListToolbar t={t} onRefresh={() => void page.refetch()} />
      <fieldset disabled={locked} className="tset-allocation">
        <p className="tset-hint">{t("tset.minorHint")}</p>
        <SettlementKpis
          t={t}
          money={money}
          entries={[
            [`trade.${command.side}`, due],
            ["tset.allocated", allocated],
            ["tset.remaining", due - allocated],
          ]}
        />
        <div className="grid-wrap accounts-scroll" ref={scroll}>
          <table className="grid" aria-label={t("tset.select")}>
            <SettlementTableHead
              t={t}
              keys={[
                "tset.select",
                "tinv.party",
                "tinv.externalInvoice",
                "tset.remaining",
                "tset.amount",
                "tset.discount",
              ]}
            />
            <tbody>
              {virtual && measured[0]?.start ? (
                <SettlementSpacerRow height={measured[0].start} />
              ) : null}
              {visible.map(({ row, index }) => {
                if (!row) return null;
                return (
                  <SettlementRow
                    key={row.itemId}
                    t={t}
                    money={money}
                    row={row}
                    index={index}
                    command={command}
                    currency={company.currency}
                    firstSelected={firstSelected}
                    onChange={onChange}
                  />
                );
              })}
              {virtual && measured.length > 0 && (
                <SettlementSpacerRow
                  height={virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0)}
                />
              )}
            </tbody>
          </table>
        </div>
        {page.hasNextPage && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page.isFetchingNextPage}
            onClick={() => void page.fetchNextPage()}
          >
            {t("master.loadMore")}
          </button>
        )}
      </fieldset>
    </FastTab>
  );
}

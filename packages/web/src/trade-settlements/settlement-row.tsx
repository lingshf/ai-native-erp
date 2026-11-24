import type { TradeSettlementCommandDto } from "@erp/core/contracts";
import {
  ALLOCATION_COLUMN_COUNT,
  ARIA_ROW_INDEX_OFFSET,
  MAX_SELECTED_ITEMS,
  ROW_HEIGHT_PX,
  type CommandItem,
  type Money,
  type OpenItem,
  type T,
} from "./settlement-model.ts";
import {
  discountAvailable,
  eligibleForSelection,
  setItemDiscount,
  setItemGross,
  toggleItem,
} from "./settlement-items.ts";

type CellProps = {
  t: T;
  row: OpenItem;
  command: TradeSettlementCommandDto;
  onChange: (next: TradeSettlementCommandDto) => void;
};

export function SettlementSpacerRow({ height }: { height: number }) {
  return (
    <tr>
      <td colSpan={ALLOCATION_COLUMN_COUNT} style={{ height, padding: 0 }} />
    </tr>
  );
}

type SettlementRowProps = Omit<CellProps, "row"> & {
  money: Money;
  row: OpenItem;
  index: number;
  currency: string;
  firstSelected: OpenItem | undefined;
};

export function SettlementRow(props: SettlementRowProps) {
  const { t, money, row, index, command, currency, firstSelected, onChange } = props;
  const selected = command.items.find((item) => item.itemId === row.itemId);
  const available = discountAvailable(row, command, selected);
  const eligible = eligibleForSelection(row, command, currency, firstSelected);
  const cell = { t, row, command, onChange };
  return (
    <tr aria-rowindex={index + ARIA_ROW_INDEX_OFFSET} style={{ height: ROW_HEIGHT_PX }}>
      <SettlementSelectCell {...cell} selected={selected} eligible={eligible} />
      <td>
        {row.party} · {row.side}
      </td>
      <td>
        <span>{row.externalNo}</span> · {t(`tadj.${row.kind}`)}
      </td>
      <td>{money(row.remainingGross)}</td>
      <SettlementAmountCell {...cell} selected={selected} />
      <SettlementDiscountCell {...cell} selected={selected} available={available} />
    </tr>
  );
}

function SettlementSelectCell(
  props: CellProps & { selected: CommandItem | undefined; eligible: boolean },
) {
  const { t, row, command, onChange, selected, eligible } = props;
  return (
    <td>
      <label>
        <input
          type="checkbox"
          aria-label={`${t("tset.select")} ${row.externalNo}`}
          checked={!!selected}
          disabled={!eligible || (!selected && command.items.length >= MAX_SELECTED_ITEMS)}
          onChange={(e) =>
            onChange({ ...command, items: toggleItem(command.items, row, e.target.checked) })
          }
        />
      </label>
    </td>
  );
}

function SettlementAmountCell(props: CellProps & { selected: CommandItem | undefined }) {
  const { t, row, command, onChange, selected } = props;
  return (
    <td>
      {selected && (
        <input
          type="number"
          min={1}
          max={row.remainingGross}
          step={1}
          aria-label={`${t("tset.amount")} ${row.externalNo}`}
          value={selected.gross}
          onChange={(e) =>
            onChange({
              ...command,
              items: setItemGross(command.items, row.itemId, e.target.value),
            })
          }
        />
      )}
    </td>
  );
}

function SettlementDiscountCell(
  props: CellProps & { selected: CommandItem | undefined; available: boolean },
) {
  const { t, row, command, onChange, selected, available } = props;
  return (
    <td>
      <span className="tset-discount">
        {row.discountPercent}% · {row.discountDate} ·{" "}
        {t(available ? "tset.available" : "tset.unavailable")}
        {selected && (
          <label>
            <input
              type="checkbox"
              aria-label={`${t("tset.discount")} ${row.externalNo}`}
              checked={selected.takeDiscount}
              disabled={!available && !selected.takeDiscount}
              onChange={(e) =>
                onChange({
                  ...command,
                  items: setItemDiscount(command.items, row.itemId, e.target.checked),
                })
              }
            />
          </label>
        )}
      </span>
    </td>
  );
}

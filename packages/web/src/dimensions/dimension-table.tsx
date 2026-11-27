import type { DimensionDto } from "@erp/core/contracts";
import type { RefObject } from "react";
import type { Kind, T } from "./dimension-types.ts";

export type VisibleRow = { row: DimensionDto; index: number };
type EditRow = (row: DimensionDto) => void;

function DimensionRow({ row, index, onEdit, t }: VisibleRow & { onEdit: EditRow; t: T }) {
  return (
    <tr aria-rowindex={index + 2} style={{ height: 44 }}>
      <td>{row.code}</td>
      <td>{"name" in row ? row.name : t(`dim.${row.kind}`)}</td>
      <td>
        <label className="ui-master-hit">
          <input
            type="checkbox"
            checked={row.active}
            disabled
            aria-label={`${t("master.active")} ${row.code}`}
          />
        </label>
      </td>
      <td>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          aria-label={`${t("dim.edit")} ${row.code}`}
          onClick={() => onEdit(row)}
        >
          {t("dim.edit")}
        </button>
      </td>
    </tr>
  );
}

export function DimensionTable({
  kind,
  rows,
  visible,
  before,
  after,
  scroll,
  empty,
  onEdit,
  t,
}: {
  kind: Kind;
  rows: DimensionDto[];
  visible: VisibleRow[];
  before: number;
  after: number;
  scroll: RefObject<HTMLElement | null>;
  empty: boolean;
  onEdit: EditRow;
  t: T;
}) {
  return (
    <div className="card">
      <section
        className="grid-wrap ui-master-scroll"
        ref={scroll}
        aria-label={t(`dim.${kind}`)}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual list must support keyboard scrolling.
        tabIndex={0}
      >
        <table className="grid" aria-label={t(`dim.${kind}`)} aria-rowcount={rows.length + 1}>
          <thead>
            <tr>
              {(["dim.identifier", "dim.name", "master.active", "dim.edit"] as const).map((key) => (
                <th key={key} scope="col">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {before > 0 && (
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Empty spacer row has no focusable content.
              <tr aria-hidden="true">
                <td colSpan={4} style={{ height: before, padding: 0 }} />
              </tr>
            )}
            {visible.map(({ row, index }) => (
              <DimensionRow key={row.code} row={row} index={index} onEdit={onEdit} t={t} />
            ))}
            {after > 0 && (
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: Empty spacer row has no focusable content.
              <tr aria-hidden="true">
                <td colSpan={4} style={{ height: after, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
        {empty && <p className="empty-state">{t("dim.empty")}</p>}
      </section>
    </div>
  );
}

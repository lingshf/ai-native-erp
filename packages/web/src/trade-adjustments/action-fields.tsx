import type { InputHTMLAttributes } from "react";
import type { Draft, Money, T } from "./action-draft.ts";
import type { OpenItem } from "./use-action-entry.ts";

// What every form section of the entry reads: render-time draft, open items and the one setter.
export type ActionView = {
  t: T;
  money: Money;
  draft: Draft;
  rows: OpenItem[];
  change: (patch: Partial<Draft>) => void;
};
type TextField = Exclude<
  { [K in keyof Draft]: Draft[K] extends string ? K : never }[keyof Draft],
  "kind" | "side"
>;
type InputAttributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "min" | "step" | "maxLength"
>;

// One labelled input bound to a text field of the draft; extra attributes keep their source order.
export function DraftField({
  view,
  field,
  label,
  ...attributes
}: { view: ActionView; field: TextField; label: string } & InputAttributes) {
  return (
    <div className="ui-field">
      <label htmlFor={`tadj-${field}`}>{label}</label>
      <input
        id={`tadj-${field}`}
        {...attributes}
        value={view.draft[field]}
        onChange={(e) => view.change({ [field]: e.target.value })}
      />
    </div>
  );
}

export function ItemSelect({
  view: { t, money, draft, rows, change },
  field,
}: {
  view: ActionView;
  field: "sourceId" | "targetId";
}) {
  return (
    <div className="ui-field">
      <label htmlFor={`tadj-${field}`}>
        {t(field === "sourceId" ? "tadj.source" : "tadj.target")}
      </label>
      <select
        id={`tadj-${field}`}
        value={draft[field]}
        onChange={(e) => change({ [field]: e.target.value })}
      >
        <option value="">{t("tadj.choose")}</option>
        {rows
          .filter(
            (row) =>
              row.status !== "cancelled" &&
              (field === "targetId" || draft.kind === "credit"
                ? row.kind === "invoice"
                : draft.kind !== "apply" || row.kind !== "invoice"),
          )
          .map((row) => (
            <option key={row.itemId} value={row.itemId}>
              {row.externalNo} · {row.party} · {t(`tadj.${row.kind}`)} · {money(row.remainingGross)}{" "}
              · v{row.revision}
            </option>
          ))}
      </select>
    </div>
  );
}

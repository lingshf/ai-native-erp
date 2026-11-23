import { FastTab } from "../ui/components/index.tsx";
import type { partyFilterLabels } from "../ui/trade-adjustment-filter-labels.ts";
import {
  MAX_ACTION_ROWS,
  PARTY_FILTER_MAX_LENGTH,
  REASON_MAX_LENGTH,
  partyCode,
} from "./action-draft.ts";
import { DraftField, ItemSelect, type ActionView } from "./action-fields.tsx";

export type PartyFilterInput = {
  text: (typeof partyFilterLabels)[keyof typeof partyFilterLabels];
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
};
type LoadMore = { hasNextPage: boolean; fetchNextPage: () => Promise<unknown> };

function PartyFilterField({ filter }: { filter: PartyFilterInput }) {
  const { text, value } = filter;
  const invalid = value.trim() !== "" && !partyCode.test(value.trim());
  return (
    <div className="ui-field">
      <label htmlFor="tadj-partyFilter">{text.label}</label>
      <input
        id="tadj-partyFilter"
        maxLength={PARTY_FILTER_MAX_LENGTH}
        placeholder={text.all}
        aria-invalid={invalid}
        aria-describedby="tadj-partyFilter-hint"
        value={value}
        onChange={(e) => filter.onChange(e.target.value)}
        onBlur={filter.onApply}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          filter.onApply();
        }}
      />
      <p id="tadj-partyFilter-hint" className="tadj-hint">
        {invalid ? text.invalid : text.hint}
      </p>
    </div>
  );
}

type Line = ActionView["draft"]["lines"][number];

function CreditLine({ view, line, index }: { view: ActionView; line: Line; index: number }) {
  const { t, draft, change } = view;
  const update = (patch: Partial<Line>) =>
    change({
      lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    });
  return (
    <div className="tadj-line">
      <div className="ui-field">
        <label htmlFor={`tadj-line-${line.id}`}>{t("tadj.sourceLine")}</label>
        <input
          id={`tadj-line-${line.id}`}
          value={line.sourceLineId}
          onChange={(e) => update({ sourceLineId: e.target.value })}
        />
      </div>
      <div className="ui-field">
        <label htmlFor={`tadj-quantity-${line.id}`}>{t("tinv.quantity")}</label>
        <input
          id={`tadj-quantity-${line.id}`}
          inputMode="decimal"
          value={line.quantity}
          onChange={(e) => update({ quantity: e.target.value })}
        />
      </div>
      <button
        type="button"
        className="btn btn-subtle"
        disabled={draft.lines.length === 1}
        onClick={() => change({ lines: draft.lines.filter((_, i) => i !== index) })}
      >
        {t("tinv.removeLine")}
      </button>
    </div>
  );
}

function CreditLinesField({ view }: { view: ActionView }) {
  const { t, draft, change } = view;
  return (
    <div className="tadj-lines">
      {draft.lines.map((line, index) => (
        <CreditLine key={line.id} view={view} line={line} index={index} />
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={draft.lines.length >= MAX_ACTION_ROWS}
        onClick={() =>
          change({
            lines: [...draft.lines, { id: crypto.randomUUID(), sourceLineId: "", quantity: "" }],
          })
        }
      >
        {t("tadj.addLine")}
      </button>
    </div>
  );
}

function ReverseItemsField({ view: { draft, rows, change } }: { view: ActionView }) {
  return (
    <div className="tadj-items">
      {rows
        .filter((row) => row.status !== "cancelled")
        .map((row) => (
          <label key={row.itemId} className="ui-check">
            <input
              type="checkbox"
              checked={draft.items.includes(row.itemId)}
              disabled={!draft.items.includes(row.itemId) && draft.items.length >= MAX_ACTION_ROWS}
              onChange={(e) =>
                change({
                  items: e.target.checked
                    ? [...draft.items, row.itemId]
                    : draft.items.filter((id) => id !== row.itemId),
                })
              }
            />
            <span>
              {row.externalNo} · {row.itemId} · v{row.revision}
            </span>
          </label>
        ))}
    </div>
  );
}

export function ActionAllocationTab({
  view,
  locked,
  irreversible,
  filter,
  page,
}: {
  view: ActionView;
  locked: boolean;
  irreversible: boolean;
  filter: PartyFilterInput;
  page: LoadMore;
}) {
  const { t, draft } = view;
  const number = { type: "number", min: "1", step: "1" } as const;
  return (
    <FastTab id="tadj-allocation" title={t("tadj.allocation")}>
      <fieldset disabled={locked} className="tadj-allocation">
        {draft.kind === "credit" && <p className="tadj-hint">{t("tadj.creditHint")}</p>}
        {draft.kind === "reverse" && <p className="tadj-hint">{t("tadj.reverseHint")}</p>}
        <div className="ui-form-grid">
          {draft.kind !== "advance" && <PartyFilterField filter={filter} />}
          {draft.kind !== "advance" && draft.kind !== "reverse" && (
            <ItemSelect view={view} field="sourceId" />
          )}
          {draft.kind === "apply" && <ItemSelect view={view} field="targetId" />}
          {(draft.kind === "advance" || draft.kind === "apply") && (
            <DraftField view={view} field="gross" label={t("tadj.gross")} {...number} />
          )}
          {draft.kind === "cancel" && (
            <DraftField
              view={view}
              field="relatedRevision"
              label={t("tadj.relatedRevision")}
              {...number}
            />
          )}
          {draft.kind === "reverse" && (
            <DraftField view={view} field="settlementId" label={t("tadj.settlementId")} />
          )}
        </div>
        {draft.kind === "credit" && <CreditLinesField view={view} />}
        {draft.kind === "reverse" && <ReverseItemsField view={view} />}
        {irreversible && (
          <DraftField
            view={view}
            field="reason"
            label={t("tadj.reason")}
            maxLength={REASON_MAX_LENGTH}
          />
        )}
        {page.hasNextPage && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void page.fetchNextPage()}
          >
            {t("master.loadMore")}
          </button>
        )}
      </fieldset>
    </FastTab>
  );
}

import { FastTab } from "../ui/components/index.tsx";
import type { Draft, T } from "./invoice-model.ts";
import { lineFields, MAX_INVOICE_LINES, type LineField } from "./invoice-entry-commands.ts";

const ADD_LINE_SHORTCUT = "Alt+Shift+N";
const LINE_INPUT_MAX_LENGTH = 60;
const EXCEPTION_REASON_MAX_LENGTH = 160;

type Line = Draft["lines"][number];
type LineHandlers = {
  onEditLine: (index: number, field: LineField, value: string) => void;
  onRemoveLine: (index: number) => void;
};

function InvoiceLineRow({
  t,
  line,
  index,
  lineCount,
  onEditLine,
  onRemoveLine,
}: { t: T; line: Line; index: number; lineCount: number } & LineHandlers) {
  return (
    <tr>
      <td>{line.lineId}</td>
      {lineFields.map((field) => (
        <td key={field}>
          <input
            aria-label={`${t(`tinv.${field}`)} ${line.lineId}`}
            inputMode={
              field === "product" || field === "taxCode" || field === "orderLineId"
                ? "text"
                : "decimal"
            }
            maxLength={LINE_INPUT_MAX_LENGTH}
            value={line[field]}
            onChange={(event) => onEditLine(index, field, event.target.value)}
          />
        </td>
      ))}
      <td>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          aria-label={`${t("tinv.removeLine")} ${line.lineId}`}
          disabled={lineCount === 1}
          onClick={() => onRemoveLine(index)}
        >
          {t("tinv.removeLine")}
        </button>
      </td>
    </tr>
  );
}

function InvoiceLinesGrid({
  t,
  lines,
  onEditLine,
  onRemoveLine,
}: { t: T; lines: Line[] } & LineHandlers) {
  return (
    <div className="grid-wrap">
      <table className="grid" aria-label={t("tinv.lines")}>
        <thead>
          <tr>
            <th scope="col">#</th>
            {lineFields.map((field) => (
              <th key={field} scope="col">
                {t(`tinv.${field}`)}
              </th>
            ))}
            <th scope="col">{t("tinv.removeLine")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <InvoiceLineRow
              key={line.lineId}
              t={t}
              line={line}
              index={index}
              lineCount={lines.length}
              onEditLine={onEditLine}
              onRemoveLine={onRemoveLine}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceLineActions({
  t,
  lineCount,
  exception,
  onAddLine,
  onEdit,
}: {
  t: T;
  lineCount: number;
  exception: boolean;
  onAddLine: () => void;
  onEdit: (change: Partial<Draft>) => void;
}) {
  return (
    <div className="ui-form-actions">
      <button
        type="button"
        className="btn btn-secondary"
        aria-keyshortcuts={ADD_LINE_SHORTCUT}
        disabled={lineCount >= MAX_INVOICE_LINES}
        onClick={onAddLine}
      >
        {t("tinv.addLine")}{" "}
        <span aria-hidden="true">
          <kbd>{t("tinv.addLineShortcut")}</kbd>
        </span>
      </button>
      <label className="ui-check" htmlFor="tinv-exception">
        <input
          id="tinv-exception"
          type="checkbox"
          checked={exception}
          onChange={(event) => onEdit({ exception: event.target.checked })}
        />
        {t("tinv.exceptionConfirmed")}
      </label>
    </div>
  );
}

function ExceptionReasonField({
  t,
  reason,
  onEdit,
}: {
  t: T;
  reason: string;
  onEdit: (change: Partial<Draft>) => void;
}) {
  return (
    <div className="ui-field tinv-reason">
      <label htmlFor="tinv-reason">{t("tinv.exceptionReason")}</label>
      <input
        id="tinv-reason"
        maxLength={EXCEPTION_REASON_MAX_LENGTH}
        value={reason}
        onChange={(event) => onEdit({ reason: event.target.value })}
      />
    </div>
  );
}

export function InvoiceLinesTab({
  t,
  draft,
  locked,
  onEdit,
  onAddLine,
  onEditLine,
  onRemoveLine,
}: {
  t: T;
  draft: Draft;
  locked: boolean;
  onEdit: (change: Partial<Draft>) => void;
  onAddLine: () => void;
} & LineHandlers) {
  return (
    <FastTab id="tinv-lines" title={t("tinv.lines")}>
      <fieldset disabled={locked} className="tinv-lines">
        <InvoiceLinesGrid
          t={t}
          lines={draft.lines}
          onEditLine={onEditLine}
          onRemoveLine={onRemoveLine}
        />
        <InvoiceLineActions
          t={t}
          lineCount={draft.lines.length}
          exception={draft.exception}
          onAddLine={onAddLine}
          onEdit={onEdit}
        />
        {draft.exception && <ExceptionReasonField t={t} reason={draft.reason} onEdit={onEdit} />}
      </fieldset>
    </FastTab>
  );
}

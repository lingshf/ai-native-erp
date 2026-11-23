import type { TradeOrderPreviewDto } from "@erp/core/contracts";
import { FastTab } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";
import { type Draft, numeric } from "./order-draft.ts";
import {
  MAX_ORDER_LINES,
  ORDER_TEXT_MAX_LENGTH,
  amountKeys,
  lineFields,
  type FieldErrors,
} from "./order-entry-fields.tsx";
import type { OrderCommands } from "./order-entry-commands.ts";

type Money = (value: number) => string;
type LineCommands = Pick<OrderCommands, "editLine" | "addLine" | "removeLine">;

type OrderLineRowProps = {
  t: T;
  line: Draft["lines"][number];
  index: number;
  lineCount: number;
  preview: TradeOrderPreviewDto | null;
  money: Money;
  errors: FieldErrors;
  commands: LineCommands;
};

function OrderLineRow(props: OrderLineRowProps) {
  const { t, line, index, lineCount, preview, money, errors, commands } = props;
  return (
    <tr>
      <td>{line.lineId}</td>
      {lineFields.map((field) => {
        const path = `line:${line.lineId}.${field}`;
        return (
          <td key={field}>
            <input
              aria-label={`${t(`tord.${field}`)} ${line.lineId}`}
              inputMode={numeric.has(field) ? "decimal" : "text"}
              list={
                field === "product"
                  ? "tord-product-options"
                  : field === "taxCode"
                    ? "tord-tax-options"
                    : undefined
              }
              autoComplete="off"
              maxLength={ORDER_TEXT_MAX_LENGTH}
              value={line[field]}
              onChange={(event) => commands.editLine(index, field, event.target.value)}
              {...errors.props(path)}
            />
            {errors.text(path)}
          </td>
        );
      })}
      {preview &&
        amountKeys.map((key) => (
          <td key={key} className="num">
            {money(preview.lines[index][key])}
          </td>
        ))}
      <td>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          aria-label={`${t("tord.removeLine")} ${line.lineId}`}
          disabled={lineCount === 1}
          onClick={() => commands.removeLine(line.lineId)}
        >
          {t("tord.removeLine")}
        </button>
      </td>
    </tr>
  );
}

type OrderLinesTabProps = Omit<OrderLineRowProps, "line" | "index" | "lineCount"> & {
  draft: Draft;
  busy: boolean;
};

export function OrderLinesTab(props: OrderLinesTabProps) {
  const { t, draft, busy, preview, money, errors, commands } = props;
  return (
    <FastTab
      id="tord-lines"
      title={t("tord.lines")}
      summary={t("tord.lineCount", { count: draft.lines.length })}
    >
      <fieldset disabled={busy} className="tord-lines">
        <div className="grid-wrap">
          <table className="grid" aria-label={t("tord.lines")}>
            <thead>
              <tr>
                <th scope="col">{t("tord.lineId")}</th>
                {lineFields.map((field) => (
                  <th key={field} scope="col">
                    {t(`tord.${field}`)}
                  </th>
                ))}
                {preview &&
                  amountKeys.map((key) => (
                    <th key={key} scope="col" className="num">
                      {t(`tord.${key}`)}
                    </th>
                  ))}
                <th scope="col">{t("tord.removeLine")}</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => (
                <OrderLineRow
                  key={line.lineId}
                  t={t}
                  line={line}
                  index={index}
                  lineCount={draft.lines.length}
                  preview={preview}
                  money={money}
                  errors={errors}
                  commands={commands}
                />
              ))}
              {preview && (
                <tr className="tord-total">
                  <th scope="row" colSpan={1 + lineFields.length}>
                    {t("tord.total")}
                  </th>
                  {amountKeys.map((key) => (
                    <td key={key}>{money(preview[key])}</td>
                  ))}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {errors.text("lines")}
        <div className="ui-form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={draft.lines.length >= MAX_ORDER_LINES}
            onClick={commands.addLine}
          >
            {t("tord.addLine")}
          </button>
        </div>
      </fieldset>
    </FastTab>
  );
}

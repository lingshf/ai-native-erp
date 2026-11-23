import type { RefObject } from "react";
import { FastTab } from "../ui/components/index.tsx";
import type { Draft, T } from "./invoice-model.ts";

// Text and date header fields: [draft field, maxLength, input type].
const headerFields = [
  ["party", 40, "text"],
  ["externalInvoice", 100, "text"],
  ["accountingDate", 10, "date"],
  ["documentDate", 10, "date"],
  ["taxDate", 10, "date"],
  ["orderId", 40, "text"],
] as const;

export function InvoiceGeneralTab({
  t,
  draft,
  locked,
  firstField,
  onEdit,
}: {
  t: T;
  draft: Draft;
  locked: boolean;
  firstField: RefObject<HTMLSelectElement | null>;
  onEdit: (change: Partial<Draft>) => void;
}) {
  const generalSummary = [
    t(`trade.${draft.side}`),
    draft.party.trim(),
    draft.externalInvoice.trim(),
    draft.accountingDate,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <FastTab id="tinv-general" title={t("tinv.entry")} summary={generalSummary}>
      <fieldset disabled={locked} className="ui-form-grid">
        <div className="ui-field">
          <label htmlFor="tinv-side">{t("tinv.side")}</label>
          <select
            id="tinv-side"
            ref={firstField}
            value={draft.side}
            onChange={(event) => onEdit({ side: event.target.value === "AR" ? "AR" : "AP" })}
          >
            <option value="AP">{t("trade.AP")}</option>
            <option value="AR">{t("trade.AR")}</option>
          </select>
        </div>
        {headerFields.map(([field, max, type]) => (
          <div key={field} className="ui-field">
            <label htmlFor={`tinv-${field}`}>{t(`tinv.${field}`)}</label>
            <input
              id={`tinv-${field}`}
              type={type}
              maxLength={max}
              value={draft[field]}
              onChange={(event) => onEdit({ [field]: event.target.value })}
            />
          </div>
        ))}
        <label className="ui-check" htmlFor="tinv-priceIncludesTax">
          <input
            id="tinv-priceIncludesTax"
            type="checkbox"
            checked={draft.priceIncludesTax}
            onChange={(event) => onEdit({ priceIncludesTax: event.target.checked })}
          />
          {t("tinv.priceIncludesTax")}
        </label>
        <div className="ui-field">
          <label htmlFor="tinv-rounding">{t("tinv.rounding")}</label>
          <select
            id="tinv-rounding"
            value={draft.rounding}
            onChange={(event) =>
              onEdit({ rounding: event.target.value === "document" ? "document" : "line" })
            }
          >
            <option value="line">{t("tinv.roundingLine")}</option>
            <option value="document">{t("tinv.roundingDocument")}</option>
          </select>
        </div>
      </fieldset>
    </FastTab>
  );
}

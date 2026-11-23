import { label, type Preferences } from "../ui/index.ts";
import { FastTab } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";
import type { Draft } from "./order-draft.ts";
import { ORDER_TEXT_MAX_LENGTH, type FieldErrors } from "./order-entry-fields.tsx";

type Language = Preferences["language"];
type EditDraft = (change: Partial<Draft>) => void;

const generalSummary = (draft: Draft, language: Language) =>
  [
    draft.orderId.trim(),
    label(language, `trade.${draft.side}`),
    draft.party.trim(),
    draft.orderDate,
  ]
    .filter(Boolean)
    .join(" · ");

function OrderSideField(props: {
  t: T;
  language: Language;
  side: Draft["side"];
  onEdit: EditDraft;
}) {
  const { t, language, side, onEdit } = props;
  return (
    <div className="ui-field">
      <label htmlFor="tord-side">{t("tord.side")}</label>
      <select
        id="tord-side"
        value={side}
        onChange={(event) => onEdit({ side: event.target.value === "AR" ? "AR" : "AP" })}
      >
        <option value="AP">{label(language, "trade.AP")}</option>
        <option value="AR">{label(language, "trade.AR")}</option>
      </select>
    </div>
  );
}

function OrderRoundingField(props: { t: T; rounding: Draft["rounding"]; onEdit: EditDraft }) {
  const { t, rounding, onEdit } = props;
  return (
    <div className="ui-field">
      <label htmlFor="tord-rounding">{t("tord.rounding")}</label>
      <select
        id="tord-rounding"
        value={rounding}
        onChange={(event) =>
          onEdit({ rounding: event.target.value === "document" ? "document" : "line" })
        }
      >
        <option value="line">{t("tord.roundingLine")}</option>
        <option value="document">{t("tord.roundingDocument")}</option>
      </select>
    </div>
  );
}

type OrderGeneralTabProps = {
  t: T;
  language: Language;
  currency: string;
  draft: Draft;
  busy: boolean;
  errors: FieldErrors;
  onEdit: EditDraft;
};

export function OrderGeneralTab(props: OrderGeneralTabProps) {
  const { t, language, currency, draft, busy, errors, onEdit } = props;
  return (
    <FastTab id="tord-general" title={t("tord.entry")} summary={generalSummary(draft, language)}>
      <fieldset disabled={busy} className="ui-form-grid">
        <div className="ui-field">
          <label htmlFor="tord-orderId">{t("tord.orderId")}</label>
          <input
            id="tord-orderId"
            maxLength={ORDER_TEXT_MAX_LENGTH}
            autoComplete="off"
            value={draft.orderId}
            onChange={(event) => onEdit({ orderId: event.target.value })}
            {...errors.props("orderId")}
          />
          {errors.text("orderId") ?? <p className="ui-hint">{t("tord.codeHint")}</p>}
        </div>
        <OrderSideField t={t} language={language} side={draft.side} onEdit={onEdit} />
        <div className="ui-field">
          <label htmlFor="tord-party">{t("tord.party")}</label>
          <input
            id="tord-party"
            list="tord-party-options"
            maxLength={ORDER_TEXT_MAX_LENGTH}
            autoComplete="off"
            value={draft.party}
            onChange={(event) => onEdit({ party: event.target.value })}
            {...errors.props("party")}
          />
          {errors.text("party")}
        </div>
        <div className="ui-field">
          <label htmlFor="tord-currency">{t("tord.currency")}</label>
          <input id="tord-currency" readOnly value={currency} {...errors.props("currency")} />
          {errors.text("currency")}
        </div>
        <div className="ui-field">
          <label htmlFor="tord-orderDate">{t("tord.orderDate")}</label>
          <input
            id="tord-orderDate"
            type="date"
            value={draft.orderDate}
            onChange={(event) => onEdit({ orderDate: event.target.value })}
            {...errors.props("orderDate")}
          />
          {errors.text("orderDate")}
        </div>
        <label className="ui-check" htmlFor="tord-priceIncludesTax">
          <input
            id="tord-priceIncludesTax"
            type="checkbox"
            checked={draft.priceIncludesTax}
            onChange={(event) => onEdit({ priceIncludesTax: event.target.checked })}
          />
          {t("tord.priceIncludesTax")}
        </label>
        <OrderRoundingField t={t} rounding={draft.rounding} onEdit={onEdit} />
      </fieldset>
    </FastTab>
  );
}

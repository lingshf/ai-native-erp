import { tradeOrderInvoicingStatusSchema } from "@erp/core/contracts";
import type { OrderFilter } from "../trade-order-link.ts";
import type { T } from "./order-model.ts";
import type { OrderFilters } from "./use-order-list.ts";

const PARTY_FILTER_MAX_LENGTH = 60;

const invoicingValues = tradeOrderInvoicingStatusSchema.options;

const dateLabels = { from: "tord.filterFrom", to: "tord.filterTo" } as const;

type FieldProps = { t: T; filters: OrderFilters };

const described = (invalid: OrderFilters["invalid"], kind: "party" | "range") =>
  invalid === kind
    ? { "aria-invalid": true as const, "aria-describedby": `tord-filter-${kind}-error` }
    : {};

function PartyFilterField({ t, filters: { draft, invalid, edit } }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor="tord-filter-party">{t("tord.filterParty")}</label>
      <input
        id="tord-filter-party"
        maxLength={PARTY_FILTER_MAX_LENGTH}
        autoComplete="off"
        value={draft.party}
        onChange={(event) => edit({ party: event.target.value })}
        {...described(invalid, "party")}
      />
      {invalid === "party" && (
        <p className="ui-error-text" id="tord-filter-party-error">
          {t("tord.issue.shape")}
        </p>
      )}
    </div>
  );
}

function SideFilterField({ t, filters: { draft, edit } }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor="tord-filter-side">{t("tord.filterSide")}</label>
      <select
        id="tord-filter-side"
        value={draft.side}
        onChange={(event) => edit({ side: event.target.value as OrderFilter["side"] })}
      >
        <option value="">{t("tord.filterAll")}</option>
        <option value="AP">{t("tord.filterAP")}</option>
        <option value="AR">{t("tord.filterAR")}</option>
      </select>
    </div>
  );
}

function InvoicingFilterField({ t, filters: { draft, edit } }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor="tord-filter-invoicing">{t("tord.invoicing")}</label>
      <select
        id="tord-filter-invoicing"
        value={draft.invoicing}
        onChange={(event) => edit({ invoicing: event.target.value as OrderFilter["invoicing"] })}
      >
        <option value="">{t("tord.filterAll")}</option>
        {invoicingValues.map((value) => (
          <option key={value} value={value}>
            {t(`tord.invoicing.${value}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One end of the order-date range; the range error is shown under the "to" field only. */
function DateFilterField({
  t,
  filters: { draft, invalid, edit },
  end,
}: FieldProps & { end: "from" | "to" }) {
  return (
    <div className="field">
      <label htmlFor={`tord-filter-${end}`}>{t(dateLabels[end])}</label>
      <input
        id={`tord-filter-${end}`}
        type="date"
        value={draft[end]}
        onChange={(event) => edit({ [end]: event.target.value })}
        {...described(invalid, "range")}
      />
      {end === "to" && invalid === "range" && (
        <p className="ui-error-text" id="tord-filter-range-error">
          {t("tord.filterRange")}
        </p>
      )}
    </div>
  );
}

export function OrderFilterBar({ t, filters }: FieldProps) {
  return (
    <form
      className="filter-bar tord-filter"
      aria-label={t("tord.filter")}
      noValidate
      onSubmit={filters.apply}
    >
      <PartyFilterField t={t} filters={filters} />
      <SideFilterField t={t} filters={filters} />
      <InvoicingFilterField t={t} filters={filters} />
      <DateFilterField t={t} filters={filters} end="from" />
      <DateFilterField t={t} filters={filters} end="to" />
      <div className="actions">
        <button type="submit" className="btn btn-secondary">
          {t("tord.filterApply")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={filters.clear}>
          {t("tord.filterClear")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={filters.refresh}>
          {t("tord.listRefresh")}
        </button>
      </div>
    </form>
  );
}

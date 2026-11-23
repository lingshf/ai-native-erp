import type { InvoiceFilter } from "./invoice-link.ts";
import type { T } from "./invoice-model.ts";
import type { InvoiceFilters } from "./use-invoice-list.ts";

const PARTY_FILTER_MAX_LENGTH = 60;

const dateLabels = { from: "tinv.filter.from", to: "tinv.filter.to" } as const;

type FieldProps = { t: T; filters: InvoiceFilters };

const described = (invalid: InvoiceFilters["invalid"], kind: "party" | "range") =>
  invalid === kind
    ? { "aria-invalid": true as const, "aria-describedby": `tinv-filter-${kind}-error` }
    : {};

function PartyFilterField({ t, filters: { draft, invalid, edit } }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor="tinv-filter-party">{t("tinv.filter.party")}</label>
      <input
        id="tinv-filter-party"
        maxLength={PARTY_FILTER_MAX_LENGTH}
        autoComplete="off"
        value={draft.party}
        onChange={(event) => edit({ party: event.target.value })}
        {...described(invalid, "party")}
      />
      {invalid === "party" && (
        <p className="ui-error-text" id="tinv-filter-party-error">
          {t("tinv.filter.partyInvalid")}
        </p>
      )}
    </div>
  );
}

function SideFilterField({ t, filters: { draft, edit } }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor="tinv-filter-side">{t("tinv.filter.side")}</label>
      <select
        id="tinv-filter-side"
        value={draft.side}
        onChange={(event) => edit({ side: event.target.value as InvoiceFilter["side"] })}
      >
        <option value="">{t("tinv.filter.all")}</option>
        <option value="AP">{t("tinv.filter.ap")}</option>
        <option value="AR">{t("tinv.filter.ar")}</option>
      </select>
    </div>
  );
}

/** One end of the accounting-date range; the range error is shown under the "to" field only. */
function DateFilterField({
  t,
  filters: { draft, invalid, edit },
  end,
}: FieldProps & { end: "from" | "to" }) {
  return (
    <div className="field">
      <label htmlFor={`tinv-filter-${end}`}>{t(dateLabels[end])}</label>
      <input
        id={`tinv-filter-${end}`}
        type="date"
        value={draft[end]}
        onChange={(event) => edit({ [end]: event.target.value })}
        {...described(invalid, "range")}
      />
      {end === "to" && invalid === "range" && (
        <p className="ui-error-text" id="tinv-filter-range-error">
          {t("tinv.filter.range")}
        </p>
      )}
    </div>
  );
}

export function InvoiceFilterBar({ t, filters }: FieldProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: TINV-05 needs a submit form (Enter applies) that is a search landmark.
    <form
      className="filter-bar tinv-filter"
      role="search"
      aria-label={t("tinv.filter")}
      noValidate
      onSubmit={filters.apply}
    >
      <PartyFilterField t={t} filters={filters} />
      <SideFilterField t={t} filters={filters} />
      <DateFilterField t={t} filters={filters} end="from" />
      <DateFilterField t={t} filters={filters} end="to" />
      <div className="actions">
        <button type="submit" className="btn btn-secondary">
          {t("tinv.filter.apply")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={filters.clear}>
          {t("tinv.filter.clear")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={filters.refresh}>
          {t("tinv.listRefresh")}
        </button>
      </div>
    </form>
  );
}

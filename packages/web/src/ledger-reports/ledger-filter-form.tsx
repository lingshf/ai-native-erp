import type { FormEventHandler } from "react";
import type { T } from "./types.ts";

type Field = { value: string; onChange: (value: string) => void };

function FilterInput({
  id,
  label,
  field,
  locked,
}: {
  id: string;
  label: string;
  field: Field;
  locked: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        disabled={locked}
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
      />
    </div>
  );
}

export function LedgerFilterForm({
  account,
  dimension,
  value,
  locked,
  onSubmit,
  t,
}: {
  account: Field;
  dimension: Field;
  value: Field;
  locked: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  t: T;
}) {
  return (
    <form className="filter-bar" onSubmit={onSubmit}>
      <FilterInput
        id="ledger-account"
        label={t("ledger.account")}
        field={account}
        locked={locked}
      />
      <FilterInput
        id="ledger-dimension"
        label={t("ledger.dimension")}
        field={dimension}
        locked={locked}
      />
      <FilterInput id="ledger-value" label={t("ledger.value")} field={value} locked={locked} />
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={locked}>
          {t("ledger.apply")}
        </button>
      </div>
    </form>
  );
}

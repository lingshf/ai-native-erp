import type { Dispatch, SetStateAction } from "react";
import { choices, isJsonField, nullable, type TradeFieldName } from "./trade-draft.ts";
import type { Failure } from "./trade-failure.ts";
import type { T } from "./trade-master-types.ts";

export function TradeField({
  field,
  draft,
  setDraft,
  error,
  t,
}: {
  field: TradeFieldName;
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
  error: Failure | null;
  t: T;
}) {
  const options = field in choices ? choices[field as keyof typeof choices] : null;
  const json = isJsonField(field);
  const invalid = error?.path === `data.${field}` || error?.path.startsWith(`data.${field}.`);
  const props = {
    id: `trade-${field}`,
    value: draft[field],
    onChange: (event: { target: { value: string } }) =>
      setDraft((value) => ({ ...value, [field]: event.target.value })),
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": invalid ? "trade-error" : undefined,
  };
  if (field === "allowPartialDiscount")
    return (
      <label className="ui-check" htmlFor={props.id}>
        <input
          id={props.id}
          type="checkbox"
          checked={draft[field] === "true"}
          onChange={(event) =>
            setDraft((value) => ({ ...value, [field]: String(event.target.checked) }))
          }
        />
        {t(`trade.${field}`)}
      </label>
    );
  return (
    <div className={`ui-field${json ? " ui-master-wide" : ""}`}>
      <label htmlFor={`trade-${field}`}>{t(`trade.${field}`)}</label>
      {options ? (
        <select {...props}>
          {options.map((option) => (
            <option key={option} value={option}>
              {t(`trade.${option}`)}
            </option>
          ))}
        </select>
      ) : json ? (
        <textarea {...props} required />
      ) : (
        <input
          {...props}
          type={field === "from" || field === "to" ? "date" : "text"}
          required={!nullable.has(field) && field !== "allowedTaxCodes"}
        />
      )}
    </div>
  );
}

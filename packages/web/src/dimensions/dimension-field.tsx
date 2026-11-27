import type { DimensionDto } from "@erp/core/contracts";
import type { Dispatch, SetStateAction } from "react";
import type { LabelKey } from "../ui/index.ts";
import { arrays, type Draft, type DraftField, jsonFields } from "./dimension-draft.ts";
import type { Failure } from "./dimension-failure.tsx";
import type { Kind, T } from "./dimension-types.ts";

const fieldLabel = (field: DraftField): Exclude<LabelKey, "shell.httpError"> => `dim.${field}`;

export function DimensionField({
  field,
  fieldValue,
  setDraft,
  error,
  kind,
  initial,
  t,
}: {
  field: DraftField;
  fieldValue: string;
  setDraft: Dispatch<SetStateAction<Draft>>;
  error: Failure | null;
  kind: Kind;
  initial: DimensionDto | null;
  t: T;
}) {
  const options = field === "mode" ? (["fill", "replace"] as const) : null;
  const invalid = error?.path.split(".")[0] === field;
  const props = {
    id: `dim-${field}`,
    value: fieldValue,
    onChange: (event: { target: { value: string } }) =>
      setDraft((value) => ({ ...value, [field]: event.target.value })),
    "aria-invalid": invalid ? (true as const) : undefined,
    "aria-describedby": invalid
      ? `dim-${field}-error`
      : field === "allowed"
        ? "dim-allowed-hint"
        : undefined,
  };
  return (
    <div className={`ui-field${jsonFields.has(field) ? " ui-master-wide" : ""}`}>
      <label htmlFor={`dim-${field}`}>{t(fieldLabel(field))}</label>
      {options ? (
        <select {...props} required>
          <option value="">{t("dim.choose")}</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {t(`dim.${value}`)}
            </option>
          ))}
        </select>
      ) : jsonFields.has(field) ? (
        <textarea {...props} required rows={3} maxLength={64000} />
      ) : (
        <input
          {...props}
          type={field === "from" || field === "to" ? "date" : "text"}
          required={!arrays.has(field)}
          disabled={field === "code" && (initial !== null || kind === "balance")}
          maxLength={arrays.has(field) ? 1055 : field === "name" ? 80 : 128}
        />
      )}
      {field === "allowed" && (
        <p id="dim-allowed-hint" className="ui-hint">
          {t("dim.allowedHint")}
        </p>
      )}
      {invalid && (
        <p id={`dim-${field}-error`} className="ui-master-error" role="alert">
          {error.path}: {t(error.key)}
        </p>
      )}
    </div>
  );
}

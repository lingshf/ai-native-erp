import { accountFieldsSchema } from "@erp/core/contracts";
import { groups } from "./account-groups.ts";
import { fieldIssue, type T } from "./account-messages.ts";
import type { AccountEditorState } from "./use-account-editor.ts";
import {
  AccountChecks,
  AccountCodeField,
  AccountContraField,
  AccountFieldIssue,
  AccountModuleField,
  AccountNameField,
  type FieldPath,
} from "./account-inputs.tsx";

type FieldsProps = Pick<
  AccountEditorState,
  "busy" | "draft" | "error" | "patch" | "changeChoice"
> & {
  revision: number;
  t: T;
};
export function AccountFields({
  busy,
  draft,
  error,
  patch,
  changeChoice,
  revision,
  t,
}: FieldsProps) {
  return (
    <fieldset disabled={busy} className="ui-form-grid">
      <AccountCodeField draft={draft} error={error} patch={patch} revision={revision} t={t} />
      <AccountNameField draft={draft} patch={patch} t={t} />
      <AccountSelect
        id="account-category"
        label={t("master.category")}
        value={draft.category}
        options={accountFieldsSchema.shape.category.options}
        optionLabel={(value) => t(`master.category.${value}`)}
        onChange={(value) => changeChoice("category", value)}
        issuePath="category"
        error={error}
        t={t}
      />
      <AccountSelect
        id="account-report"
        label={t("master.reportGroup")}
        value={draft.reportGroup}
        options={groups[draft.category]}
        optionLabel={(value) => t(`master.report.${value}`)}
        onChange={(value) => changeChoice("reportGroup", value)}
        error={error}
        t={t}
      />
      <AccountSelect
        id="account-side"
        label={t("master.normalSide")}
        value={draft.normalSide}
        options={accountFieldsSchema.shape.normalSide.options}
        optionLabel={(value) => t(`master.side.${value}`)}
        onChange={(value) => changeChoice("normalSide", value)}
        issuePath="normalSide"
        error={error}
        t={t}
      />
      <AccountSelect
        id="account-purpose"
        label={t("master.purpose")}
        value={draft.purpose}
        options={accountFieldsSchema.shape.purpose.options}
        optionLabel={(value) => t(`master.purpose.${value}`)}
        onChange={(value) => changeChoice("purpose", value)}
        issuePath="purpose"
        error={error}
        t={t}
      />
      {draft.purpose === "control" && (
        <AccountModuleField draft={draft} changeChoice={changeChoice} t={t} />
      )}
      <AccountContraField draft={draft} error={error} patch={patch} t={t} />
      <AccountChecks draft={draft} patch={patch} t={t} />
    </fieldset>
  );
}
// No `issuePath` (report group) means no field error, as before; `issue.props` follow `onChange` to keep attribute order.
function AccountSelect<V extends string>({
  id,
  label,
  value,
  options,
  optionLabel,
  onChange,
  issuePath,
  error,
  t,
}: {
  id: string;
  label: string;
  value: V;
  options: readonly V[];
  optionLabel: (value: V) => string;
  onChange: (value: string) => void;
  issuePath?: FieldPath;
  error: unknown;
  t: T;
}) {
  const issue = issuePath ? fieldIssue(error, issuePath) : undefined;
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...issue?.props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
      {issue && issuePath && <AccountFieldIssue issue={issue} path={issuePath} t={t} />}
    </div>
  );
}

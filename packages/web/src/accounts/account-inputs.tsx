import { accountFieldsSchema, type AccountCommand } from "@erp/core/contracts";
import { fieldIssue, type FieldIssue, type T } from "./account-messages.ts";
import type { AccountEditorState } from "./use-account-editor.ts";

export type FieldPath = keyof AccountCommand;
type Draft = Pick<AccountEditorState, "draft">;
type Patch = Pick<AccountEditorState, "patch">;

export function AccountFieldIssue({
  issue,
  path,
  t,
}: {
  issue: FieldIssue;
  path: FieldPath;
  t: T;
}) {
  return issue.key ? (
    <p id={`account-${path}-error`} role="alert" className="ui-error-text">
      {t(issue.key)}
    </p>
  ) : null;
}
export function AccountCodeField({
  draft,
  error,
  patch,
  revision,
  t,
}: Draft & Patch & { error: unknown; revision: number; t: T }) {
  const issue = fieldIssue(error, "code");
  return (
    <div className="ui-field">
      <label htmlFor="account-code">{t("master.code")}</label>
      <input
        id="account-code"
        value={draft.code}
        disabled={revision !== 0}
        required
        pattern="[1-9][0-9]{3}"
        onChange={(event) => patch({ code: event.target.value })}
        {...issue.props}
      />
      <AccountFieldIssue issue={issue} path="code" t={t} />
    </div>
  );
}
export function AccountNameField({ draft, patch, t }: Draft & Patch & { t: T }) {
  return (
    <div className="ui-field ui-span-2">
      <label htmlFor="account-name">{t("master.name")}</label>
      <input
        id="account-name"
        value={draft.name}
        required
        maxLength={80}
        onChange={(event) => patch({ name: event.target.value })}
      />
    </div>
  );
}
export function AccountModuleField({
  draft,
  changeChoice,
  t,
}: Draft & Pick<AccountEditorState, "changeChoice"> & { t: T }) {
  return (
    <div className="ui-field ui-span-2">
      <label htmlFor="account-module">{t("master.controlModule")}</label>
      <select
        id="account-module"
        value={draft.controlModule ?? ""}
        required
        aria-describedby="account-module-hint"
        onChange={(event) => changeChoice("controlModule", event.target.value)}
      >
        <option value="">{t("master.chooseModule")}</option>
        {accountFieldsSchema.shape.controlModule.unwrap().options.map((value) => (
          <option key={value} value={value}>
            {t(`master.module.${value}`)}
          </option>
        ))}
      </select>
      <p id="account-module-hint" className="ui-hint">
        {t("master.moduleHint")}
      </p>
    </div>
  );
}
export function AccountContraField({
  draft,
  error,
  patch,
  t,
}: Draft & Patch & { error: unknown; t: T }) {
  const issue = fieldIssue(error, "contraOf");
  return (
    <div className="ui-field">
      <label htmlFor="account-contra">{t("master.contraOf")}</label>
      <input
        id="account-contra"
        value={draft.contraOf ?? ""}
        placeholder={t("master.none")}
        pattern="[1-9][0-9]{3}"
        onChange={(event) => patch({ contraOf: event.target.value || null })}
        {...issue.props}
      />
      <AccountFieldIssue issue={issue} path="contraOf" t={t} />
    </div>
  );
}
export function AccountChecks({ draft, patch, t }: Draft & Patch & { t: T }) {
  return (
    <div className="ui-field acct-checks">
      <label className="ui-check">
        <input
          type="checkbox"
          checked={draft.manualAllowed}
          disabled={draft.purpose === "control"}
          onChange={(event) => patch({ manualAllowed: event.target.checked })}
        />
        {t("master.manualAllowed")}
      </label>
      <label className="ui-check">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => patch({ active: event.target.checked })}
        />
        {t("master.active")}
      </label>
    </div>
  );
}

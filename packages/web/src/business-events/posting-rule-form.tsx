import type { PostingRuleDto } from "@erp/core/contracts";
import { DimensionFields } from "../journals/dialogs.tsx";
import { PageControls } from "./list.tsx";
import { scopeChange } from "./posting-rule.ts";
import {
  RuleAccountField,
  RuleAccountOptions,
  RuleActiveField,
  RuleCodeField,
  RuleDateField,
  RuleDirectionSelect,
  RuleMeaningSelect,
  ScopeCodeField,
} from "./posting-rule-fields.tsx";
import { ScopeSelect } from "./scope-select.tsx";
import type { T } from "./types.ts";
import type { PostingRuleEditor } from "./use-posting-rule-editor.ts";

type PostingRuleFormProps = {
  value: PostingRuleDto;
  editor: PostingRuleEditor;
  dimensionKeys: string[];
  t: T;
};

export function PostingRuleForm({ value, editor, dimensionKeys, t }: PostingRuleFormProps) {
  const change = editor.setValue;
  return (
    <form
      ref={editor.form}
      onSubmit={(submit) => {
        submit.preventDefault();
        editor.save(value);
      }}
    >
      <fieldset disabled={editor.busy}>
        <legend className="jv-legend">{t("business.rules")}</legend>
        <RuleCodeField value={value} change={change} t={t} />
        <RuleActiveField value={value} change={change} t={t} />
        <RuleDirectionSelect value={value} change={change} t={t} />
        <RuleMeaningSelect value={value} change={change} t={t} />
        <ScopeSelect
          label={t("business.objectScope")}
          scope={value.objectScope}
          t={t}
          select={(scope) => {
            const next = scopeChange(scope);
            if (next) change({ ...value, objectScope: next.scope, objectCode: next.code });
          }}
        />
        <ScopeCodeField
          label={t("business.objectCode")}
          disabled={value.objectScope === "all"}
          code={value.objectCode}
          change={(objectCode) => change({ ...value, objectCode })}
        />
        <ScopeSelect
          label={t("business.partyScope")}
          scope={value.partyScope}
          t={t}
          select={(scope) => {
            const next = scopeChange(scope);
            if (next) change({ ...value, partyScope: next.scope, partyCode: next.code });
          }}
        />
        <ScopeCodeField
          label={t("business.partyCode")}
          disabled={value.partyScope === "all"}
          code={value.partyCode}
          change={(partyCode) => change({ ...value, partyCode })}
        />
        <RuleAccountField value={value} change={change} t={t} />
        <RuleAccountOptions accounts={editor.accounts} />
        <PageControls page={editor.accounts} t={t} />
        <RuleDateField
          label={t("business.from")}
          date={value.from}
          change={(from) => change({ ...value, from })}
        />
        <RuleDateField
          label={t("business.to")}
          date={value.to}
          change={(to) => change({ ...value, to })}
        />
        <DimensionFields
          title={t("journal.dimensions")}
          keys={[...new Set([...dimensionKeys, ...Object.keys(value.dimensions)])]}
          value={value.dimensions}
          change={(dimensions) => change({ ...value, dimensions })}
        />
        <button type="submit" className="jv-btn">
          {t("business.save")}
        </button>
        <button className="jv-btn" type="button" onClick={editor.cancel}>
          {t("journal.cancel")}
        </button>
      </fieldset>
    </form>
  );
}

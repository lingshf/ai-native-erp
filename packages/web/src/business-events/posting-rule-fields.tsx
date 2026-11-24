import type { PostingRuleDto } from "@erp/core/contracts";
import type { T } from "./types.ts";
import type { PostingRuleEditor } from "./use-posting-rule-editor.ts";

type FieldProps = { value: PostingRuleDto; change: (value: PostingRuleDto) => void; t: T };

export function RuleCodeField({ value, change, t }: FieldProps) {
  return (
    <label>
      {t("business.code")}
      <input
        required
        disabled={value.revision > 0}
        value={value.code}
        onChange={(e) => change({ ...value, code: e.target.value })}
      />
    </label>
  );
}

export function RuleActiveField({ value, change, t }: FieldProps) {
  return (
    <label>
      {t("business.active")}
      <input
        type="checkbox"
        className="jv-check"
        checked={value.active}
        onChange={(e) => change({ ...value, active: e.target.checked })}
      />
    </label>
  );
}

export function RuleDirectionSelect({ value, change, t }: FieldProps) {
  return (
    <label>
      {t("business.direction")}
      <select
        className="jv-select"
        value={value.direction}
        onChange={(e) => {
          if (e.target.value === "receive" || e.target.value === "pay")
            change({ ...value, direction: e.target.value });
        }}
      >
        {(["receive", "pay"] as const).map((item) => (
          <option key={item} value={item}>
            {t(`business.${item}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RuleMeaningSelect({ value, change, t }: FieldProps) {
  return (
    <label>
      {t("business.meaning")}
      <select
        className="jv-select"
        value={value.meaning}
        onChange={(e) => {
          if (e.target.value === "cash" || e.target.value === "offset")
            change({ ...value, meaning: e.target.value });
        }}
      >
        <option value="cash">{t("business.cash")}</option>
        <option value="offset">{t("business.offset")}</option>
      </select>
    </label>
  );
}

export function ScopeCodeField({
  label,
  disabled,
  code,
  change,
}: {
  label: string;
  disabled: boolean;
  code: string;
  change: (code: string) => void;
}) {
  return (
    <label>
      {label}
      <input required disabled={disabled} value={code} onChange={(e) => change(e.target.value)} />
    </label>
  );
}

export function RuleAccountField({ value, change, t }: FieldProps) {
  return (
    <label>
      {t("journal.account")}
      <input
        required
        list="business-rule-accounts"
        pattern="[1-9][0-9]{3}"
        value={value.account}
        onChange={(e) => change({ ...value, account: e.target.value })}
      />
    </label>
  );
}

export function RuleAccountOptions({ accounts }: { accounts: PostingRuleEditor["accounts"] }) {
  return (
    <datalist id="business-rule-accounts">
      {accounts.data?.pages
        .flatMap((p) => p.items)
        .map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
          </option>
        ))}
    </datalist>
  );
}

export function RuleDateField({
  label,
  date,
  change,
}: {
  label: string;
  date: string;
  change: (date: string) => void;
}) {
  return (
    <label>
      {label}
      <input required type="date" value={date} onChange={(e) => change(e.target.value)} />
    </label>
  );
}

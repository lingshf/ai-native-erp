import type { RuleScope } from "./posting-rule.ts";
import type { T } from "./types.ts";

export function ScopeSelect({
  label,
  scope,
  select,
  t,
}: {
  label: string;
  scope: RuleScope;
  select: (scope: string) => void;
  t: T;
}) {
  return (
    <label>
      {label}
      <select className="jv-select" value={scope} onChange={(e) => select(e.target.value)}>
        {(["exact", "group", "all"] as const).map((item) => (
          <option key={item} value={item}>
            {t(item === "group" ? "business.groupScope" : `business.${item}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

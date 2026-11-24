import type { Key, Money, T } from "./settlement-model.ts";

export function SettlementTableHead({ t, keys }: { t: T; keys: Key[] }) {
  return (
    <thead>
      <tr>
        {keys.map((key) => (
          <th key={key}>{t(key)}</th>
        ))}
      </tr>
    </thead>
  );
}

// `unknown` labels a value that cannot be computed (NaN); it defaults to "not loaded".
type SettlementKpisProps = { t: T; money: Money; entries: [Key, number][]; unknown?: Key };

export function SettlementKpis(props: SettlementKpisProps) {
  const { t, money, entries, unknown = "tset.unloaded" } = props;
  return (
    <dl className="kpis">
      {entries.map(([key, value], index) => (
        <div key={key} className={index === 1 ? "kpi emphasis" : "kpi"}>
          <dt className="label">{t(key)}</dt>
          <dd className="value">{Number.isNaN(value) ? t(unknown) : money(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

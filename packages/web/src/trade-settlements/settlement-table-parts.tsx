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

type SettlementKpisProps = { t: T; money: Money; entries: [Key, number][] };

export function SettlementKpis({ t, money, entries }: SettlementKpisProps) {
  return (
    <dl className="kpis">
      {entries.map(([key, value], index) => (
        <div key={key} className={index === 1 ? "kpi emphasis" : "kpi"}>
          <dt className="label">{t(key)}</dt>
          <dd className="value">{Number.isNaN(value) ? t("tset.unloaded") : money(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

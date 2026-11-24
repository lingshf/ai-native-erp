import type { ReactNode } from "react";
import { label, type Preferences } from "../ui/index.ts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
import { amountKeys, orderTotal } from "./order-view-amounts.ts";
import type { T, Order } from "./order-model.ts";

export function OrderKpis({
  order,
  money,
  t,
}: {
  order: Order;
  money: (value: number) => string;
  t: T;
}) {
  return (
    <dl className="kpis">
      {amountKeys.map((key) => (
        <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
          <dt className="label">{t(`tord.${key}`)}</dt>
          <dd className="value">{money(orderTotal(order, key))}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OrderFacts({
  order,
  language,
  t,
}: {
  order: Order;
  language: Preferences["language"];
  t: T;
}) {
  const facts: [TradeOrderKey, ReactNode][] = [
    ["tord.orderId", order.orderId],
    ["tord.side", label(language, `trade.${order.side}`)],
    ["tord.party", order.party],
    ["tord.currency", order.currency],
    ["tord.orderDate", order.orderDate],
    ["tord.priceIncludesTax", t(order.priceIncludesTax ? "tord.yes" : "tord.no")],
    [
      "tord.rounding",
      t(order.rounding === "document" ? "tord.roundingDocument" : "tord.roundingLine"),
    ],
    ["tord.recordedAt", order.recordedAt],
  ];
  return (
    <dl className="tord-facts">
      {facts.map(([key, value]) => (
        <div key={key}>
          <dt>{t(key)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

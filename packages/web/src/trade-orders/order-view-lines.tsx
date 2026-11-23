import type { Preferences } from "../ui/index.ts";
import { formatDecimal } from "../decimal-format.ts";
import { Badge } from "../ui/components/index.tsx";
import { fromMicros } from "./order-quantity.ts";
import { amountKeys, orderTotal } from "./order-view-amounts.ts";
import type { InvoicedQuantities, OrderLine } from "./use-order-invoicing.ts";
import type { T, Order } from "./order-model.ts";

type Money = (value: number) => string;
type Language = Preferences["language"];

// Columns before the amount columns; the total row's label spans them.
const TOTAL_LABEL_COLUMNS = 9;

// TORD-07: line decimals grouped by language; "…" while invoiced quantities are loading.
const lineDecimal = (value: string | undefined, language: Language) =>
  value === undefined ? "…" : formatDecimal(value, language);

function OrderLinesHead({ t }: { t: T }) {
  return (
    <thead>
      <tr>
        <th scope="col">{t("tord.lineNo")}</th>
        <th scope="col">{t("tord.lineId")}</th>
        <th scope="col">{t("tord.product")}</th>
        <th scope="col">{t("tord.taxCode")}</th>
        <th scope="col">{t("tord.quantity")}</th>
        <th scope="col">{t("tord.invoicedQuantity")}</th>
        <th scope="col">{t("tord.uninvoicedQuantity")}</th>
        <th scope="col">{t("tord.creditedQuantity")}</th>
        <th scope="col">{t("tord.unitPrice")}</th>
        <th scope="col">{t("tord.discountPercent")}</th>
        {amountKeys.map((key) => (
          <th key={key} scope="col">
            {t(`tord.${key}`)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function OrderLineRow({
  line,
  quantities,
  language,
  money,
  t,
}: {
  line: OrderLine;
  quantities: InvoicedQuantities;
  language: Language;
  money: Money;
  t: T;
}) {
  const decimal = (value: string | undefined) => lineDecimal(value, language);
  const left = quantities.remaining(line);
  return (
    <tr>
      <td>{line.lineNo}</td>
      <td>{line.lineId}</td>
      <td>{line.product}</td>
      <td>{line.taxCode}</td>
      <td>{decimal(line.quantity)}</td>
      <td>{decimal(quantities.invoiced.get(line.lineId))}</td>
      <td>
        {left === null ? (
          "…"
        ) : left > 0n ? (
          fromMicros(left)
        ) : (
          <>
            {left < 0n && `${fromMicros(left)} `}
            <Badge tone="success">{t("tord.fullyInvoicedBadge")}</Badge>
          </>
        )}
      </td>
      <td>{decimal(quantities.credited.get(line.lineId))}</td>
      <td>{decimal(line.unitPrice)}</td>
      <td>{decimal(line.discountPercent)}</td>
      {amountKeys.map((key) => (
        <td key={key}>{money(line[key])}</td>
      ))}
    </tr>
  );
}

function OrderLinesTotal({ order, money, t }: { order: Order; money: Money; t: T }) {
  return (
    <tr className="tord-total">
      <th scope="row" colSpan={TOTAL_LABEL_COLUMNS}>
        {t("tord.total")}
      </th>
      {amountKeys.map((key) => (
        <td key={key}>{money(orderTotal(order, key))}</td>
      ))}
    </tr>
  );
}

export function OrderLinesTable({
  order,
  quantities,
  language,
  money,
  t,
}: {
  order: Order;
  quantities: InvoicedQuantities;
  language: Language;
  money: Money;
  t: T;
}) {
  return (
    <div className="grid-wrap">
      <table className="grid tord-amounts" aria-label={`${t("tord.lines")} ${order.orderId}`}>
        <OrderLinesHead t={t} />
        <tbody>
          {order.lines.map((line) => (
            <OrderLineRow
              key={line.lineId}
              line={line}
              quantities={quantities}
              language={language}
              money={money}
              t={t}
            />
          ))}
          <OrderLinesTotal order={order} money={money} t={t} />
        </tbody>
      </table>
    </div>
  );
}

import type { TradeOrderPageDto } from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import { Badge } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";

type OrderRowDto = TradeOrderPageDto["items"][number];

const invoicingTone = { none: "warning", partial: "info", full: "success" } as const;

function OrderTableHead({ t }: { t: T }) {
  return (
    <thead>
      <tr>
        <th scope="col">{t("tord.orderId")}</th>
        <th scope="col">{t("tord.side")}</th>
        <th scope="col">{t("tord.party")}</th>
        <th scope="col">{t("tord.orderDate")}</th>
        <th scope="col">{t("tord.currency")}</th>
        <th scope="col" className="num">
          {t("tord.lineCountColumn")}
        </th>
        <th scope="col" className="num">
          {t("tord.gross")}
        </th>
        <th scope="col">{t("tord.invoicing")}</th>
      </tr>
    </thead>
  );
}

export function OrderTable({
  language,
  money,
  t,
  rows,
  onOpen,
}: {
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
  rows: OrderRowDto[];
  onOpen: (orderId: string) => void;
}) {
  return (
    <div className="grid-wrap">
      <table className="grid tord-list" aria-label={t("tord.list")}>
        <OrderTableHead t={t} />
        <tbody>
          {rows.map((row) => (
            <tr key={row.orderId}>
              <td>
                <button type="button" className="cell-link" onClick={() => onOpen(row.orderId)}>
                  {row.orderId}
                </button>
              </td>
              <td>{label(language, `trade.${row.side}`)}</td>
              <td>{row.party}</td>
              <td>{row.orderDate}</td>
              <td>{row.currency}</td>
              <td className="num">{row.lineCount}</td>
              <td className="num">{money(row.gross)}</td>
              <td className="tord-invoicing">
                <Badge tone={invoicingTone[row.invoicing]}>
                  {t(`tord.invoicing.${row.invoicing}`)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

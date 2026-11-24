import type { TradeSettlementPreviewDto, TradeSettlementReceiptDto } from "@erp/core/contracts";
import { FastTab } from "../ui/components/index.tsx";
import type { Money, T } from "./settlement-model.ts";
import { SettlementKpis, SettlementTableHead } from "./settlement-table-parts.tsx";

type SettlementResultTabProps = {
  t: T;
  money: Money;
  result: TradeSettlementPreviewDto | TradeSettlementReceiptDto;
};

export function SettlementResultTab({ t, money, result }: SettlementResultTabProps) {
  return (
    <FastTab id="tset-result" title={t("tset.result")}>
      <section className="tset-result" aria-label={t("tset.result")}>
        <SettlementKpis
          t={t}
          money={money}
          entries={[
            ["tset.amount", result.gross],
            ["tset.cash", result.cash],
            ["tset.discountAmount", result.discount],
          ]}
        />
        <div className="grid-wrap">
          <table className="grid">
            <SettlementTableHead
              t={t}
              keys={["tset.item", "tinv.net", "tinv.tax", "tset.settled", "tset.remaining"]}
            />
            <tbody>
              {result.allocations.map((a) => (
                <tr key={a.itemId}>
                  <td>{a.itemId}</td>
                  <td>{money(a.net)}</td>
                  <td>{money(a.tax)}</td>
                  <td>{money(a.settledGross)}</td>
                  <td>{money(a.remainingGross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </FastTab>
  );
}

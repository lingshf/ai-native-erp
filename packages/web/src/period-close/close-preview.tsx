import { Link } from "react-router-dom";
import type { ClosePreviewDto } from "@erp/core/contracts";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { FastTab, MessageBar } from "../ui/components/index.tsx";
import type { Pending } from "./close-commands.ts";
import type { CloseText } from "./close-text.ts";

type AmountProps = {
  pending: Pending | null;
  fmt: (value: number) => string;
  source: (account?: string) => string;
};

export function ClosePreviewCard({
  t,
  preview,
  ...amount
}: AmountProps & { t: CloseText; preview: ClosePreviewDto }) {
  return (
    <FastTab
      id="close-preview"
      title={t(preview.action === "freeze" ? "close.freeze" : "close.transfer")}
    >
      <dl className="kpis">
        <div className="kpi emphasis">
          <dt className="label">{t("close.net")}</dt>
          <dd className="value">
            <DrillAmount {...amount} value={preview.netProfit} />
          </dd>
        </div>
      </dl>
      {preview.blockers.map((blocker) => (
        <MessageBar tone="danger" role="alert" key={blocker}>
          {t(`close.block.${blocker}`)}
        </MessageBar>
      ))}
      <div className="card">
        <VirtualRows
          items={preview.lines}
          title={t("close.lines")}
          header={[t("ledger.account"), t("ledger.debit"), t("ledger.credit")]}
          render={(line) => (
            <>
              <th>{line.account}</th>
              {[line.debit, line.credit].map((value, index) => (
                <td key={index === 0 ? "debit" : "credit"}>
                  <DrillAmount {...amount} value={value} account={line.account} />
                </td>
              ))}
            </>
          )}
        />
      </div>
    </FastTab>
  );
}

function DrillAmount({
  pending,
  fmt,
  source,
  value,
  account,
}: AmountProps & { value: number; account?: string }) {
  return pending ? fmt(value) : <Link to={source(account)}>{fmt(value)}</Link>;
}

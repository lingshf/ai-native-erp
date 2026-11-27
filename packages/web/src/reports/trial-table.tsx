import { Link } from "react-router-dom";
import type { LegacyTrialResponse, LegacyTrialStage } from "@erp/core/contracts";
import { MessageBar } from "../ui/components/index.tsx";
import type { Language } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import type { Translate } from "./report-label.ts";
import { ScrollTable } from "./scroll-table.tsx";

export function TrialBalanceCard({
  data,
  month,
  stage,
  t,
  language,
  search,
}: {
  data: LegacyTrialResponse["trialBalances"][LegacyTrialStage];
  month: string;
  stage: LegacyTrialStage;
  t: Translate;
  language: Language;
  search: string;
}) {
  return (
    <>
      {data.debit !== data.credit && (
        <MessageBar tone="warning">{t("reports.unbalanced")}</MessageBar>
      )}
      <div className="card">
        <header>
          <h3>{t("reports.trial")}</h3>
          <span className="summary">
            {month} · {t(`reports.${stage}`)}
          </span>
        </header>
        {data.rows.length === 0 && <p className="empty-state">{t("reports.emptyTrial")}</p>}
        <ScrollTable name={t("reports.trialScroll")}>
          <table className="grid">
            <caption className="visually-hidden">
              {t("reports.trial")} · {month} · {t(`reports.${stage}`)}
            </caption>
            <thead>
              <tr>
                {(["code", "name", "debit", "credit"] as const).map((key) => (
                  <th
                    scope="col"
                    key={key}
                    className={key === "debit" || key === "credit" ? "num" : undefined}
                  >
                    {t(`reports.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.code}>
                  <th scope="row">
                    <Link
                      to={`/reports/ledger/${row.code}?${search}`}
                      aria-label={`${row.code} ${row.name}`}
                    >
                      {row.code}
                    </Link>
                  </th>
                  <td>{row.name}</td>
                  <td className="num">{formatMinor(row.debit, language)}</td>
                  <td className="num">{formatMinor(row.credit, language)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  {t("reports.total")}
                </th>
                <td className="num">{formatMinor(data.debit, language)}</td>
                <td className="num">{formatMinor(data.credit, language)}</td>
              </tr>
            </tfoot>
          </table>
        </ScrollTable>
      </div>
    </>
  );
}

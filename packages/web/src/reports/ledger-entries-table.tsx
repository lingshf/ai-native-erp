import type { LegacyLedgerResponse } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import type { Translate } from "./report-label.ts";
import { ScrollTable } from "./scroll-table.tsx";

const kinds = {
  normal: "reports.normal",
  adjusting: "reports.adjusting",
  reversal: "reports.reversal",
  closing: "reports.closingKind",
} as const;

export function LedgerEntriesTable({
  entries,
  account,
  month,
  t,
  language,
}: {
  entries: LegacyLedgerResponse["entries"];
  account: string;
  month: string;
  t: Translate;
  language: Language;
}) {
  return (
    <ScrollTable name={t("reports.ledgerScroll")}>
      <table className="grid">
        <caption className="visually-hidden">
          {t("reports.ledger")} · {account} · {month}
        </caption>
        <thead>
          <tr>
            {(
              [
                "date",
                "journal",
                "line",
                "memo",
                "kind",
                "reversalOf",
                "sourceKind",
                "dimensions",
                "debit",
                "credit",
                "balance",
              ] as const
            ).map((field) => (
              <th
                scope="col"
                key={field}
                className={
                  field === "debit" || field === "credit" || field === "balance" ? "num" : undefined
                }
              >
                {t(`reports.${field}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.lineId}>
              <td>{entry.date}</td>
              <td>{entry.id}</td>
              <th scope="row">{entry.lineId}</th>
              <td>{entry.memo}</td>
              <td>{t(kinds[entry.kind])}</td>
              <td>{entry.reversal_of ?? t("reports.none")}</td>
              <td>{entry.source_kind ? t(kinds[entry.source_kind]) : t("reports.none")}</td>
              <td>
                {entry.dimensions && Object.keys(entry.dimensions).length > 0
                  ? Object.entries(entry.dimensions).map(([name, value]) => (
                      <div key={name}>
                        {name}: {value}
                      </div>
                    ))
                  : t("reports.none")}
              </td>
              <td className="num">{formatMinor(entry.debit, language)}</td>
              <td className="num">{formatMinor(entry.credit, language)}</td>
              <td className="num">{formatMinor(entry.balance, language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

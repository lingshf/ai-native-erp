import type { TradeInvoicePreviewDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { Badge } from "../ui/components/index.tsx";
import { poMatchTone } from "../trade-invoice-status.ts";
import { formatDecimal } from "../decimal-format.ts";
import type { T } from "./invoice-model.ts";

export function PreviewPanel({
  preview,
  money,
  language,
  t,
}: {
  preview: TradeInvoicePreviewDto;
  money: (value: number) => string;
  language: Language;
  t: T;
}) {
  const calc = preview.calculation;
  const amountKeys = ["net", "tax", "gross", "deductibleTax", "expense"] as const;
  return (
    <section className="tinv-preview" aria-label={t("tinv.previewTitle")}>
      <dl className="kpis">
        {(["net", "tax", "gross", "deductibleTax"] as const).map((key) => (
          <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
            <dt className="label">{t(`tinv.${key}`)}</dt>
            <dd className="value">{money(calc[key])}</dd>
          </div>
        ))}
      </dl>
      <dl className="tinv-facts">
        <div>
          <dt>{t("tinv.dueDate")}</dt>
          <dd>{preview.dueDate}</dd>
        </div>
        <div>
          <dt>{t("tinv.discountDate")}</dt>
          <dd>{preview.discountDate}</dd>
        </div>
        <div>
          <dt>{t("tinv.controlAccount")}</dt>
          <dd>{preview.controlAccount}</dd>
        </div>
        <div>
          <dt>{t("tinv.poMatch")}</dt>
          <dd>
            <Badge tone={poMatchTone[preview.poMatch]}>{t(`tinv.${preview.poMatch}`)}</Badge>
          </dd>
        </div>
      </dl>
      <div className="grid-wrap">
        <table className="grid" aria-label={t("tinv.previewTitle")}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("tinv.taxCode")}</th>
              {amountKeys.map((key) => (
                <th key={key} scope="col">
                  {t(`tinv.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calc.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.id}</td>
                <td>{line.taxCode}</td>
                {amountKeys.map((key) => (
                  <td key={key}>{money(line[key])}</td>
                ))}
              </tr>
            ))}
            <tr className="tinv-total">
              <th scope="row" colSpan={2}>
                Σ
              </th>
              {amountKeys.map((key) => (
                <td key={key}>{money(calc[key])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="tinv-split">
        <div className="grid-wrap">
          <table className="grid" aria-label="GL">
            <caption>{t("tinv.postingPreview")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("tinv.account")}</th>
                <th scope="col">{t("tinv.debit")}</th>
                <th scope="col">{t("tinv.credit")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.journal.journals.flatMap((journal, j) =>
                journal.lines.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Plan lines have no identity beyond position.
                  <tr key={`${j}:${i}`}>
                    <td>{line.account}</td>
                    <td>{line.debit ? money(line.debit) : ""}</td>
                    <td>{line.credit ? money(line.credit) : ""}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {preview.matches.length > 0 && (
          <div className="grid-wrap">
            <table className="grid" aria-label={t("tinv.poMatch")}>
              <caption>{t("tinv.poMatch")}</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t("tinv.orderLineId")}</th>
                  <th scope="col">{t("tinv.quantity")}</th>
                  <th scope="col">{t("tinv.expectedNet")}</th>
                  <th scope="col">{t("tinv.net")}</th>
                  <th scope="col">{t("tinv.variance")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.matches.map((match) => (
                  <tr key={match.lineId}>
                    <td>{match.lineId}</td>
                    <td>{match.orderLineId}</td>
                    <td>{formatDecimal(match.quantity, language)}</td>
                    <td>{money(match.expectedNet)}</td>
                    <td>{money(match.invoiceNet)}</td>
                    <td>
                      {match.variance < 0 ? "-" : ""}
                      {money(Math.abs(match.variance))}
                      {match.withinTolerance ? "" : " ⚠"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

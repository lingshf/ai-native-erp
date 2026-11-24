import { Link } from "react-router-dom";
import type { CompanyDto, TradeItemDetailDto } from "@erp/core/contracts";
import { formatMinor } from "../reports-data.ts";
import { label, type Preferences } from "../ui/index.ts";
function ItemDetail({
  detail,
  preferences,
  company,
}: {
  detail: TradeItemDetailDto;
  preferences: Preferences;
  company: CompanyDto;
}) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const money = (n: number) => formatMinor(n, preferences.language, company.scale);
  const row = detail.selected;
  const journal = (id: string) => `/journals?${new URLSearchParams({ company: company.code, id })}`;
  return (
    <section className="card trpt-detail" aria-label={t("trpt.detail")}>
      <header>
        <h3>
          {t("trpt.detail")}: {row.externalNo}
        </h3>
        <span className="summary">
          <Link to={journal(row.journalId)}>{t("journal.title")}</Link>
        </span>
      </header>
      <div className="body">
        <dl className="trpt-facts">
          {(
            [
              ["source", row.sourceReference],
              [
                "document",
                `${row.documentId} · ${row.accountingDate} · ${row.documentDate} · ${row.controlAccount}`,
              ],
              ["version", `${row.version} / ${row.currentVersion}`],
              ["gross", money(row.remainingGrossMinor)],
              ["currentBalance", money(detail.current.remainingGross)],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt>{t(`trpt.${key}`)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {detail.originalDocumentId && (
          <p>
            <Link
              to={`/trade-reports?${new URLSearchParams({
                company: company.code,
                item: detail.originalDocumentId,
                ...(detail.asOf ? { month: detail.asOf.slice(0, 7) } : {}),
              })}`}
            >
              {t("trpt.original")}
            </Link>
          </p>
        )}
        {detail.document && (
          <div className="grid-wrap">
            <table className="grid" aria-label={t("trpt.document")}>
              <thead>
                <tr>
                  <th>{t("tinv.product")}</th>
                  <th className="num">{t("tinv.quantity")}</th>
                  <th className="num">{t("tinv.net")}</th>
                  <th className="num">{t("tinv.tax")}</th>
                  <th className="num">{t("tinv.gross")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.document.lines.map((line) => (
                  <tr key={line.lineId}>
                    <td>{line.product}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{money(line.net)}</td>
                    <td className="num">{money(line.tax)}</td>
                    <td className="num">{money(line.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h4>{t("trpt.settlements")}</h4>
        <ul className="trpt-events">
          {detail.settlements.map((s) => (
            <li key={s.paymentId}>
              <span>{s.sourceRef}</span>
              <span className="num">
                {money(s.allocations.find((a) => a.itemId === row.documentId)?.gross ?? 0)}
              </span>
              {s.journalIds.map((id) => (
                <Link key={id} to={journal(id)}>
                  {t("journal.title")}
                </Link>
              ))}
            </li>
          ))}
          {detail.actions.map((a) => (
            <li key={a.command.actionId}>
              <span>{a.receipt.sourceRef}</span>
              <span>{a.command.accountingDate}</span>
              {a.receipt.journalIds.map((id) => (
                <Link key={id} to={journal(id)}>
                  {t("journal.title")}
                </Link>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
export { ItemDetail };

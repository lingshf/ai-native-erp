import { Link } from "react-router-dom";
import type { ReportDto } from "@erp/core/contracts";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { Badge, MessageBar } from "../ui/components/index.tsx";
import type { Format, T, View } from "./types.ts";

type Group = ReportDto["groups"][number];

export function isReportCategory(view: View, category: string) {
  return view === "income"
    ? ["REVENUE", "EXPENSE"].includes(category)
    : view === "balance-sheet"
      ? ["ASSET", "LIABILITY", "EQUITY"].includes(category)
      : true;
}

function CardHeader({ title, summary }: { title: string; summary: string }) {
  return (
    <header>
      <h3>{title}</h3>
      <span className="summary">{summary}</span>
    </header>
  );
}

export function ReconciliationReport({
  checks,
  summary,
  fmt,
  t,
}: {
  checks: ReportDto["reconciliation"]["checks"];
  summary: string;
  fmt: Format;
  t: T;
}) {
  return (
    <>
      <MessageBar tone="info">{t("ledger.reconciliationScope")}</MessageBar>
      <div className="card">
        <CardHeader title={t("ledger.reconciliation")} summary={summary} />
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>{t("ledger.reconciliation")}</th>
                <th className="num">{t("ledger.left")}</th>
                <th className="num">{t("ledger.right")}</th>
                <th className="num">{t("ledger.difference")}</th>
                <th>{t("ledger.result")}</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id}>
                  <th scope="row">{t(`ledger.check.${check.id}`)}</th>
                  <td className="num">{fmt(check.left)}</td>
                  <td className="num">{fmt(check.right)}</td>
                  <td className="num">{fmt(check.difference)}</td>
                  <td>
                    <Badge tone={check.pass ? "success" : "danger"}>
                      {t(check.pass ? "ledger.pass" : "ledger.fail")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function GroupTable({
  groups,
  view,
  group,
  pinnedSearch,
  summary,
  groupValue,
  fmt,
  onReselect,
  t,
}: {
  groups: Group[];
  view: View;
  group: string | null;
  pinnedSearch: URLSearchParams;
  summary: string;
  groupValue: (row: Group) => number;
  fmt: Format;
  onReselect: () => void;
  t: T;
}) {
  return (
    <div className="card">
      <CardHeader title={t("ledger.group")} summary={summary} />
      <div className="grid-wrap">
        <table className="grid" aria-label={t("ledger.group")}>
          <thead>
            <tr>
              <th>{t("ledger.group")}</th>
              <th className="num">{t(view === "income" ? "ledger.activity" : "ledger.closing")}</th>
            </tr>
          </thead>
          <tbody>
            {groups
              .filter((row) => isReportCategory(view, row.category))
              .map((row) => (
                <tr
                  key={row.reportGroup}
                  className={row.reportGroup === group ? "selected" : undefined}
                >
                  <th scope="row">{t(`master.report.${row.reportGroup}`)}</th>
                  <td className="num">
                    <Link
                      onClick={() => {
                        if (group === row.reportGroup) onReselect();
                      }}
                      to={`/ledger-reports?${pinnedSearch}&view=${view}&group=${row.reportGroup}`}
                    >
                      {fmt(groupValue(row))}
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccountTable({
  title,
  incomeGroup,
  rows,
  view,
  toLedger,
  fmt,
  t,
}: {
  title: string;
  incomeGroup: Group | undefined;
  rows: ReportDto["trial"]["rows"];
  view: View;
  toLedger: (code: string, operating?: boolean) => string;
  fmt: Format;
  t: T;
}) {
  return (
    <div className="card ledger-accounts">
      <header>
        <h3>{title}</h3>
        {incomeGroup && (
          <span className="summary">
            {t("ledger.reportActivity")}: {fmt(incomeGroup.activity)}
          </span>
        )}
      </header>
      <VirtualRows
        items={rows}
        title={title}
        header={[
          t("ledger.account"),
          ...(view === "income" ? [t("ledger.reportActivity")] : []),
          t("ledger.opening"),
          t("ledger.debit"),
          t("ledger.credit"),
          t("ledger.closing"),
        ]}
        render={(row) => (
          <>
            <th scope="row">
              {row.code} · {row.name}
              {row.abnormal && ` · ${t("ledger.abnormal")}`}
            </th>
            {view === "income" && (
              <td className="num">
                <Link to={toLedger(row.code, true)}>
                  {fmt(row.category === "REVENUE" ? -row.incomeNet : row.incomeNet)}
                </Link>
              </td>
            )}
            {[row.opening, row.debit, row.credit, row.closing].map((n, index) => (
              <td key={["opening", "debit", "credit", "closing"][index]} className="num">
                <Link to={toLedger(row.code)}>{fmt(n)}</Link>
              </td>
            ))}
          </>
        )}
      />
    </div>
  );
}

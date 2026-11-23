import { type ReactNode, useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  tradeReportSchema,
  tradeReconciliationSchema,
  tradeItemDetailSchema,
  type CompanyDto,
  type TradeItemDetailDto,
} from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { useInvoiceLeaveGuard } from "./trade-invoices/use-invoice-leave-guard.ts";
import { VirtualRows } from "./journals/virtual-rows.tsx";
import { Badge, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/trade-reports.css";

export function TradeReports({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams();
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = rows.find((row) => row.code === (params.get("company") ?? rows[0]?.code));
  const header = (context?: ReactNode) => (
    <PageHeader title={t("trpt.title")} description={t("trpt.boundary")} context={context} />
  );
  return (
    <section className="page trade-reports">
      {company ? (
        <CompanyReports
          key={company.code}
          company={company}
          companies={rows}
          preferences={preferences}
          header={header}
          changeCompany={(code) => setParams({ company: code })}
          loadCompanies={companies.hasNextPage ? () => void companies.fetchNextPage() : undefined}
        />
      ) : (
        <>
          {header()}
          <TeachingTip teaching={preferences.teaching} title={t("trpt.teachingTitle")}>
            {t("trpt.teaching")}
          </TeachingTip>
        </>
      )}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void companies.refetch()}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {!companies.isPending && !company && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.invalid")}
        </MessageBar>
      )}
    </section>
  );
}
function CompanyReports({
  company,
  companies,
  preferences,
  header,
  changeCompany,
  loadCompanies,
}: {
  company: CompanyDto;
  companies: readonly CompanyDto[];
  preferences: Preferences;
  header: (context: ReactNode) => ReactNode;
  changeCompany: (company: string) => void;
  loadCompanies: (() => void) | undefined;
}) {
  const [params, setParams] = useSearchParams();
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const party = params.get("party") ?? "",
    month = params.get("month") ?? "",
    side = params.get("side") ?? "";
  const [input, setInput] = useState({ party, month, side });
  useEffect(() => setInput({ party, month, side }), [party, month, side]);
  const dirty = input.party !== party || input.month !== month || input.side !== side;
  useInvoiceLeaveGuard({ busy: false, unsaved: dirty }, t("trade.leaveConfirm"));
  const view = params.get("view") ?? "openItems";
  const valid =
    (!month || /^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) &&
    (!party || /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u.test(party)) &&
    ["", "AP", "AR"].includes(side) &&
    ["openItems", "ageing", "reconciliation"].includes(view);
  const scope = new URLSearchParams({ company: company.code });
  if (month) scope.set("month", month);
  const filtered = new URLSearchParams(scope);
  if (party) filtered.set("party", party);
  if (side) filtered.set("side", side);
  const page = useInfiniteQuery({
    queryKey: ["tradeReport", company.code, month, side, party],
    enabled: valid && view !== "reconciliation",
    initialPageParam: { cursor: "", snapshot: "" },
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/reports/open-items?${filtered}&limit=100${pageParam.cursor ? `&cursor=${pageParam.cursor}&snapshot=${pageParam.snapshot}` : ""}`,
        tradeReportSchema,
        { signal },
      ),
    getNextPageParam: (page) =>
      page.nextCursor ? { cursor: page.nextCursor, snapshot: page.snapshot } : undefined,
  });
  const reconciliation = useQuery({
    queryKey: ["tradeReconciliation", company.code, month],
    enabled: valid && view === "reconciliation",
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(`/api/v1/trade/reports/reconciliation?${scope}`, tradeReconciliationSchema, {
        signal,
      }),
  });
  const id = params.get("item");
  const detail = useQuery({
    queryKey: ["tradeItemDetail", company.code, month, id],
    enabled: valid && !!id,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/reports/open-items/${encodeURIComponent(id ?? "")}?${scope}`,
        tradeItemDetailSchema,
        { signal },
      ),
  });
  const rows = page.data?.pages.flatMap((p) => p.items) ?? [],
    totals = page.data?.pages[0]?.totals;
  function change(fields: Record<string, string>) {
    setParams({ ...Object.fromEntries(params), company: company.code, ...fields, item: "" });
  }
  const failure =
    (view === "reconciliation" ? reconciliation.error : page.error) ?? (id ? detail.error : null);
  const refresh = () => {
    if (view === "reconciliation") void reconciliation.refetch();
    else void page.refetch();
    if (id) void detail.refetch();
  };
  return (
    <>
      {header(
        <>
          <div className="field">
            <label htmlFor="trpt-company">{t("master.company")}</label>
            <select
              id="trpt-company"
              value={company.code}
              disabled={dirty}
              onChange={(e) => changeCompany(e.target.value)}
            >
              {companies.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
          </div>
          {loadCompanies && (
            <button type="button" className="btn btn-subtle" onClick={loadCompanies}>
              {t("master.loadMore")}
            </button>
          )}
        </>,
      )}
      <TeachingTip teaching={preferences.teaching} title={t("trpt.teachingTitle")}>
        {t("trpt.teaching")}
      </TeachingTip>
      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          change(input);
        }}
      >
        <div className="field">
          <label htmlFor="trpt-month">{t("trpt.month")}</label>
          <input
            id="trpt-month"
            type="month"
            value={input.month}
            onChange={(e) => setInput({ ...input, month: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="trpt-party">{t("trpt.party")}</label>
          <input
            id="trpt-party"
            value={input.party}
            maxLength={60}
            onChange={(e) => setInput({ ...input, party: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="trpt-side">{t("tinv.side")}</label>
          <select
            id="trpt-side"
            value={input.side}
            onChange={(e) => setInput({ ...input, side: e.target.value })}
          >
            <option value="">{t("trpt.all")}</option>
            <option>AP</option>
            <option>AR</option>
          </select>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary">
            {t("trpt.apply")}
          </button>
          <button
            type="button"
            className="btn btn-subtle"
            onClick={() => setInput({ party, month, side })}
          >
            {t("trpt.clear")}
          </button>
        </div>
      </form>
      <div className="toolbar-row">
        <nav className="segmented" aria-label={t("trpt.title")}>
          {(["openItems", "ageing", "reconciliation"] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={dirty}
              aria-pressed={view === value}
              onClick={() => change({ view: value })}
            >
              {t(`trpt.${value}`)}
            </button>
          ))}
        </nav>
        <button type="button" className="btn btn-secondary" disabled={dirty} onClick={refresh}>
          {t("trpt.refresh")}
        </button>
      </div>
      {!valid && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}
        </MessageBar>
      )}
      {failure && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}{" "}
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {(view === "reconciliation" ? reconciliation.isFetching : page.isFetching) && (
        <p role="status">{t("master.loading")}</p>
      )}
      {valid && view !== "reconciliation" && !page.isError && totals && (
        <>
          <dl className="kpis">
            {(Object.keys(totals) as (keyof typeof totals)[]).map((key) => (
              <div key={key} className={key === "invoiceGrossMinor" ? "kpi emphasis" : "kpi"}>
                <dt className="label">{t(`trpt.${key}`)}</dt>
                <dd className="value">{money(totals[key])}</dd>
                {(key === "creditGrossMinor" || key === "advanceGrossMinor") && (
                  <dd className="sub">{t("trpt.notNetted")}</dd>
                )}
              </div>
            ))}
          </dl>
          <div className="card trpt-items">
            <header>
              <h3>{t(view === "ageing" ? "trpt.ageing" : "trpt.openItems")}</h3>
              <span className="summary">
                {month ? page.data?.pages[0]?.asOf : t("trpt.current")} · {company.currency}
              </span>
            </header>
            <VirtualRows
              items={rows}
              title={t(view === "ageing" ? "trpt.ageing" : "trpt.openItems")}
              header={(
                [
                  "document",
                  "kind",
                  "party",
                  "net",
                  "tax",
                  "gross",
                  "due",
                  "days",
                  "ageing",
                  "version",
                ] as const
              ).map((key) => t(`trpt.${key}`))}
              render={(row) => (
                <>
                  <td>
                    <button
                      type="button"
                      className="cell-link"
                      disabled={dirty}
                      onClick={() =>
                        setParams({
                          ...Object.fromEntries(params),
                          company: company.code,
                          item: row.documentId,
                        })
                      }
                    >
                      {row.externalNo}
                    </button>
                  </td>
                  <td>
                    {row.side} · {t(`trpt.${row.kind}`)}
                  </td>
                  <td>{row.party}</td>
                  <td className="num">{money(row.remainingNetMinor)}</td>
                  <td className="num">{money(row.remainingTaxMinor)}</td>
                  <td className="num strong">{money(row.remainingGrossMinor)}</td>
                  <td>{row.dueDate ?? t("trpt.none")}</td>
                  <td className="num">{row.overdueDays ?? t("trpt.none")}</td>
                  <td>
                    {row.ageingBucket ? (
                      <Badge
                        tone={
                          row.ageingBucket === "notDue"
                            ? "success"
                            : /61|91/u.test(row.ageingBucket)
                              ? "danger"
                              : "warning"
                        }
                      >
                        {t(`trpt.${row.ageingBucket}`)}
                      </Badge>
                    ) : (
                      t("trpt.none")
                    )}
                  </td>
                  <td>
                    {row.version} / {row.currentVersion}
                  </td>
                </>
              )}
            />
            {rows.length === 0 && <p className="empty-state">{t("trpt.empty")}</p>}
            {page.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary trpt-more"
                disabled={page.isFetchingNextPage}
                onClick={() => void page.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </div>
        </>
      )}
      {valid && view === "reconciliation" && (
        <>
          <MessageBar tone="info">{t("trpt.reconcileNote")}</MessageBar>
          {reconciliation.data && !reconciliation.isError && (
            <div className="card trpt-reconciliation">
              <header>
                <h3>{t("trpt.reconciliation")}</h3>
                <span className="summary">
                  {month || t("trpt.current")} · {company.currency}
                </span>
              </header>
              <VirtualRows
                items={reconciliation.data.rows}
                title={t("trpt.reconciliation")}
                header={[
                  t("journal.account"),
                  ...(
                    [
                      "subledger",
                      "tradeGl",
                      "opening",
                      "other",
                      "gl",
                      "tradeDifference",
                      "difference",
                    ] as const
                  ).map((key) => t(`trpt.${key}`)),
                ]}
                render={(row) => (
                  <>
                    <td>
                      {month ? (
                        <Link
                          to={`/ledger?${new URLSearchParams({ company: company.code, month, account: row.account })}`}
                        >
                          {row.account}
                        </Link>
                      ) : (
                        row.account
                      )}
                    </td>
                    {[
                      row.subledgerMinor,
                      row.tradeGlMinor,
                      row.openingGlMinor,
                      row.otherSourceMinor,
                      row.glMinor,
                      row.tradeDifferenceMinor,
                      row.differenceMinor,
                    ].map((n, i) => (
                      <td
                        key={
                          [
                            "subledger",
                            "trade",
                            "opening",
                            "other",
                            "gl",
                            "tradeDifference",
                            "difference",
                          ][i]
                        }
                        className="num"
                      >
                        {money(n)}
                      </td>
                    ))}
                  </>
                )}
              />
            </div>
          )}
        </>
      )}
      {detail.data && !detail.isError && id && (
        <ItemDetail detail={detail.data} preferences={preferences} company={company} />
      )}
    </>
  );
}
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

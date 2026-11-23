import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  periodsPageSchema,
  accountSchema,
  reportSchema,
  ledgerSchema,
  reportWatermarkQuerySchema,
  type CompanyDto,
  type ReportDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { VirtualRows } from "./journals/virtual-rows.tsx";
import { Badge, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/ledger.css";
type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
const views = ["trial", "income", "balance-sheet", "reconciliation"] as const;
type View = (typeof views)[number];
export function LedgerReports({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [failedSnapshot, setFailedSnapshot] = useState<{
    scope: string;
    error: MasterDataFailure;
  } | null>(null);
  const t: T = (key) => label(preferences.language, key);
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
  const items = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const code = params.get("company") ?? items[0]?.code;
  const company = items.find((item) => item.code === code);
  const scope = `${code}:${location.pathname}:${params.get("watermark")}:${params.get("accountRevision")}`;
  const conflict = failedSnapshot?.scope === scope ? failedSnapshot.error : null;
  const setConflict = useCallback(
    (error: MasterDataFailure | null) => setFailedSnapshot(error ? { scope, error } : null),
    [scope],
  );
  return (
    <section className="page ledger-page">
      <PageHeader
        title={t(location.pathname === "/ledger" ? "ledger.detail" : "ledger.title")}
        description={t("ledger.live")}
        context={
          <>
            <div className="field">
              <label htmlFor="ledger-company">{t("master.company")}</label>
              <select
                id="ledger-company"
                disabled={conflict !== null}
                value={company?.code ?? ""}
                onChange={(event) => setParams({ company: event.target.value })}
              >
                {items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </div>
            {companies.hasNextPage && (
              <button
                type="button"
                className="btn btn-subtle"
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("ledger.teachingTitle")}>
        {t("ledger.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <ErrorBox error={companies.error} retry={() => void companies.refetch()} t={t} />
      )}
      {code && !company && !companies.isPending && !companies.hasNextPage && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.invalid")}
        </MessageBar>
      )}
      {company && (
        <CompanyReports
          key={`${company.code}:${location.pathname}`}
          company={company}
          preferences={preferences}
          conflict={conflict}
          setConflict={setConflict}
        />
      )}
    </section>
  );
}
function ErrorBox({ error, retry, t }: { error: unknown; retry: () => void; t: T }) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("ledger.error")}{" "}
      {error instanceof MasterDataFailure &&
        error.detail?.code === "CONFLICT" &&
        t("ledger.snapshotUnavailable")}{" "}
      {error instanceof MasterDataFailure &&
        (error.kind === "network" ? (
          t("reports.networkError")
        ) : error.kind === "invalid" ? (
          t("reports.invalidResponse")
        ) : (
          <code>
            HTTP {error.status} · {error.detail?.code} · {error.detail?.requestId}
          </code>
        ))}{" "}
      <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}
function CompanyReports({
  company,
  preferences,
  conflict,
  setConflict,
}: {
  company: CompanyDto;
  preferences: Preferences;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
}) {
  const [params, setParams] = useSearchParams(),
    location = useLocation(),
    client = useQueryClient();
  const t: T = (key) => label(preferences.language, key);
  const periods = useInfiniteQuery({
    queryKey: ["ledger-periods", company.code],
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/periods?company=${encodeURIComponent(company.code)}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        periodsPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const months = periods.data?.pages.flatMap((page) => page.items) ?? [];
  const month = params.get("month") ?? months.at(-1)?.month;
  const requestedMonth = params.get("month");
  const previousMonth = useRef(requestedMonth);
  useEffect(() => {
    const changed = previousMonth.current !== requestedMonth;
    previousMonth.current = requestedMonth;
    if (changed && requestedMonth && !months.some((item) => item.month === requestedMonth))
      void periods.refetch();
  }, [requestedMonth, months, periods.refetch]);
  const view = params.get("view") ?? "trial",
    stage = params.get("stage") ?? "adjusted",
    account = params.get("account") ?? "1000";
  const valid =
    months.some((item) => item.month === month) &&
    views.some((item) => item === view) &&
    ["unadjusted", "adjusted", "postClosing"].includes(stage) &&
    /^[1-9]\d{3}$/u.test(account) &&
    [...params.keys()].every(
      (key) =>
        [
          "company",
          "month",
          "view",
          "stage",
          "account",
          "group",
          "dimension",
          "value",
          "watermark",
          "accountRevision",
        ].includes(key) && params.getAll(key).length === 1,
    ) &&
    params.has("dimension") === params.has("value") &&
    params.has("watermark") === params.has("accountRevision") &&
    (!params.has("watermark") ||
      reportWatermarkQuerySchema.safeParse(params.get("watermark")).success) &&
    (!params.has("accountRevision") ||
      reportWatermarkQuerySchema.safeParse(params.get("accountRevision")).success) &&
    (!params.get("group") ||
      accountSchema.shape.reportGroup.safeParse(params.get("group")).success);
  const search = new URLSearchParams({ company: company.code, month: month ?? "", stage });
  if (params.has("watermark")) search.set("watermark", params.get("watermark") ?? "");
  if (params.has("accountRevision"))
    search.set("accountRevision", params.get("accountRevision") ?? "");
  const change = (fields: Record<string, string>) =>
    setParams({
      ...Object.fromEntries(params),
      company: company.code,
      month: month ?? "",
      ...fields,
    });
  const ledger = location.pathname === "/ledger";
  return (
    <>
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="ledger-month">{t("ledger.period")}</label>
          <select
            id="ledger-month"
            disabled={ledger && conflict !== null}
            value={month ?? ""}
            onChange={(event) => change({ month: event.target.value })}
          >
            {months.map((item) => (
              <option key={item.month}>{item.month}</option>
            ))}
          </select>
        </div>
        {periods.hasNextPage && (
          <button
            type="button"
            className="btn btn-subtle"
            onClick={() => void periods.fetchNextPage()}
          >
            {t("master.loadMore")}
          </button>
        )}
        {!ledger && (
          <>
            <div className="field">
              <label htmlFor="ledger-view">{t("ledger.view")}</label>
              <select
                id="ledger-view"
                value={view}
                onChange={(event) => change({ view: event.target.value, group: "" })}
              >
                {views.map((item) => (
                  <option key={item} value={item}>
                    {t(`ledger.${item}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ledger-stage">{t("ledger.stage")}</label>
              <select
                id="ledger-stage"
                value={stage}
                onChange={(event) => change({ stage: event.target.value })}
              >
                {(["unadjusted", "adjusted", "postClosing"] as const).map((item) => (
                  <option key={item} value={item}>
                    {t(`ledger.${item}`)}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setConflict(null);
              void client.resetQueries({ queryKey: ["ledger-live", company.code] });
              void client.invalidateQueries({ queryKey: ["ledger-periods", company.code] });
              const next = new URLSearchParams(params);
              next.delete("watermark");
              next.delete("accountRevision");
              setParams(next);
            }}
          >
            {t("ledger.refresh")}
          </button>
        </div>
      </div>
      {periods.isError && (
        <ErrorBox error={periods.error} retry={() => void periods.refetch()} t={t} />
      )}
      {!periods.isPending && !periods.isFetching && !valid && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.invalid")}{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setParams({ company: company.code })}
          >
            {t("reports.reload")}
          </button>
        </MessageBar>
      )}
      {valid &&
        month &&
        (ledger ? (
          params.has("watermark") ? (
            <LedgerGrid
              key={`${search}:${account}:${params.get("dimension")}:${params.get("value")}`}
              company={company}
              month={month}
              account={account}
              params={params}
              preferences={preferences}
              conflict={conflict}
              setConflict={setConflict}
              t={t}
            />
          ) : (
            <LedgerSnapshot
              scope={ledgerFilters(company.code, month, account, params)}
              conflict={conflict}
              setConflict={setConflict}
              t={t}
            />
          )
        ) : (
          <FinancialReport
            company={company}
            month={month}
            stage={stage}
            view={view as View}
            group={params.get("group")}
            search={search}
            preferences={preferences}
            t={t}
          />
        ))}
    </>
  );
}
function FinancialReport({
  company,
  month,
  stage,
  view,
  group,
  search,
  preferences,
  t,
}: {
  company: CompanyDto;
  month: string;
  stage: string;
  view: View;
  group: string | null;
  search: URLSearchParams;
  preferences: Preferences;
  t: T;
}) {
  const query = useQuery({
    queryKey: [
      "ledger-live",
      company.code,
      month,
      stage,
      view,
      search.get("watermark"),
      search.get("accountRevision"),
      group,
    ],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const report = await masterRequest(`/api/v1/reports/${view}?${search}`, reportSchema, {
        signal,
      });
      if (
        search.has("watermark") &&
        (report.watermark !== Number(search.get("watermark")) ||
          report.accountRevision !== Number(search.get("accountRevision")))
      )
        throw new MasterDataFailure("invalid");
      return report;
    },
  });
  if (query.isPending || query.isFetching) return <p role="status">{t("master.loading")}</p>;
  if (query.isError)
    return <ErrorBox error={query.error} retry={() => void query.refetch()} t={t} />;
  const report = query.data,
    fmt = (n: number) => formatMinor(n, preferences.language, company.scale);
  const pinnedSearch = new URLSearchParams(search);
  pinnedSearch.set("watermark", String(report.watermark));
  pinnedSearch.set("accountRevision", String(report.accountRevision));
  const toLedger = (code: string, operating = false) => {
    const target = new URLSearchParams(pinnedSearch);
    if (operating && report.stage === "postClosing") target.set("stage", "adjusted");
    target.set("account", code);
    return `/ledger?${target}`;
  };
  const selected = report.trial.rows.filter(
    (row) =>
      (!group || row.reportGroup === group) &&
      (view === "income"
        ? ["REVENUE", "EXPENSE"].includes(row.category)
        : view === "balance-sheet"
          ? ["ASSET", "LIABILITY", "EQUITY"].includes(row.category)
          : true),
  );
  const groupValue = (row: ReportDto["groups"][number]) =>
    view === "income" ? row.activity : row.closing;
  const incomeGroup =
    view === "income" ? report.groups.find((row) => row.reportGroup === group) : undefined;
  const kpis: [string, number, boolean?][] =
    view === "income"
      ? [
          [t("ledger.revenue"), report.income.month.revenue],
          [t("ledger.expense"), report.income.month.expense],
          [t("ledger.profit"), report.income.month.profit, true],
          [`${t("ledger.profit")} · ${t("ledger.year")}`, report.income.ytd.profit],
        ]
      : view === "balance-sheet"
        ? [
            [t("ledger.assets"), report.balanceSheet.assets, true],
            [t("ledger.liabilities"), report.balanceSheet.liabilities],
            [t("ledger.equity"), report.balanceSheet.equity],
          ]
        : [
            [t("journal.debit"), report.trial.debit],
            [t("journal.credit"), report.trial.credit],
          ];
  const summary = `${month} · ${company.currency}`;
  const accountsTitle = t(view === "income" ? "ledger.incomeAccounts" : "ledger.trial");
  return (
    <section className="ledger-stack" aria-label={t(`ledger.${view}`)}>
      <p className="ledger-meta">
        {t("ledger.watermark")}: {report.watermark}
        {" · "}
        {t("ledger.accountRevision")}: {report.accountRevision}
      </p>
      {view === "reconciliation" ? (
        <>
          <MessageBar tone="info">{t("ledger.reconciliationScope")}</MessageBar>
          <div className="card">
            <header>
              <h3>{t("ledger.reconciliation")}</h3>
              <span className="summary">{summary}</span>
            </header>
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
                  {report.reconciliation.checks.map((check) => (
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
      ) : (
        <>
          <dl className="kpis">
            {kpis.map(([name, value, emphasis]) => (
              <div key={name} className={emphasis ? "kpi emphasis" : "kpi"}>
                <dt className="label">{name}</dt>
                <dd className="value">{fmt(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="card">
            <header>
              <h3>{t("ledger.group")}</h3>
              <span className="summary">{summary}</span>
            </header>
            <div className="grid-wrap">
              <table className="grid" aria-label={t("ledger.group")}>
                <thead>
                  <tr>
                    <th>{t("ledger.group")}</th>
                    <th className="num">
                      {t(view === "income" ? "ledger.activity" : "ledger.closing")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups
                    .filter((row) =>
                      view === "income"
                        ? ["REVENUE", "EXPENSE"].includes(row.category)
                        : view === "balance-sheet"
                          ? ["ASSET", "LIABILITY", "EQUITY"].includes(row.category)
                          : true,
                    )
                    .map((row) => (
                      <tr
                        key={row.reportGroup}
                        className={row.reportGroup === group ? "selected" : undefined}
                      >
                        <th scope="row">{t(`master.report.${row.reportGroup}`)}</th>
                        <td className="num">
                          <Link
                            onClick={() => {
                              if (group === row.reportGroup) void query.refetch();
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
          <div className="card ledger-accounts">
            <header>
              <h3>{accountsTitle}</h3>
              {incomeGroup && (
                <span className="summary">
                  {t("ledger.reportActivity")}: {fmt(incomeGroup.activity)}
                </span>
              )}
            </header>
            <VirtualRows
              items={selected}
              title={accountsTitle}
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
        </>
      )}
    </section>
  );
}
function ledgerFilters(company: string, month: string, account: string, params: URLSearchParams) {
  const filters = new URLSearchParams({
    company,
    month,
    account,
    limit: "500",
    stage: params.get("stage") ?? "adjusted",
  });
  for (const key of ["dimension", "value", "watermark", "accountRevision"]) {
    if (params.has(key)) filters.set(key, params.get(key) ?? "");
  }
  return filters;
}
function ledgerKey(filters: URLSearchParams) {
  return [
    "ledger-live",
    ...[
      "company",
      "month",
      "account",
      "stage",
      "dimension",
      "value",
      "watermark",
      "accountRevision",
    ].map((key) => filters.get(key)),
  ];
}
function useLedgerConflict(error: unknown, setConflict: (error: MasterDataFailure | null) => void) {
  useEffect(() => {
    if (error instanceof MasterDataFailure && error.status === 409) setConflict(error);
  }, [error, setConflict]);
}
function LedgerSnapshot({
  scope,
  conflict,
  setConflict,
  t,
}: {
  scope: URLSearchParams;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
  t: T;
}) {
  const [, setParams] = useSearchParams(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["ledger-live", scope.get("company"), "snapshot", scope.toString()],
    enabled: conflict === null,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      if (conflict) throw conflict;
      return masterRequest(`/api/v1/ledger?${scope}`, ledgerSchema, { signal });
    },
  });
  useLedgerConflict(query.error, setConflict);
  useEffect(() => {
    if (!query.data || query.isError || query.isFetching || conflict) return;
    const next = new URLSearchParams(scope);
    next.delete("limit");
    next.set("watermark", String(query.data.watermark));
    next.set("accountRevision", String(query.data.accountRevision));
    client.setQueryData(ledgerKey(next), { pages: [query.data], pageParams: [""] });
    setParams(next, { replace: true });
  }, [query.data, query.isError, query.isFetching, conflict, scope, client, setParams]);
  if (conflict)
    return (
      <MessageBar tone="danger" role="alert">
        {t("ledger.snapshotUnavailable")}
      </MessageBar>
    );
  if (query.isError)
    return <ErrorBox error={query.error} retry={() => void query.refetch()} t={t} />;
  return <p role="status">{t("master.loading")}</p>;
}
function LedgerGrid({
  company,
  month,
  account,
  params,
  preferences,
  conflict,
  setConflict,
  t,
}: {
  company: CompanyDto;
  month: string;
  account: string;
  params: URLSearchParams;
  preferences: Preferences;
  conflict: MasterDataFailure | null;
  setConflict: (error: MasterDataFailure | null) => void;
  t: T;
}) {
  const [, setParams] = useSearchParams();
  const [code, setCode] = useState(account),
    [dimension, setDimension] = useState(params.get("dimension") ?? ""),
    [value, setValue] = useState(params.get("value") ?? "");
  const filters = ledgerFilters(company.code, month, account, params);
  const query = useInfiniteQuery({
    queryKey: ledgerKey(filters),
    enabled: conflict === null,
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: "",
    queryFn: async ({ pageParam, signal }) => {
      if (conflict) throw conflict;
      if (!filters.has("watermark") || !filters.has("accountRevision"))
        throw new MasterDataFailure("invalid");
      const page = await masterRequest(
        `/api/v1/ledger?${filters}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        ledgerSchema,
        { signal },
      );
      if (
        page.watermark !== Number(filters.get("watermark")) ||
        page.accountRevision !== Number(filters.get("accountRevision"))
      )
        throw new MasterDataFailure("invalid");
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  useLedgerConflict(query.error, setConflict);
  const data = conflict || query.isError || query.isRefetching ? undefined : query.data;
  const rows = data?.pages.flatMap((page) => page.items) ?? [],
    first = data?.pages[0],
    fmt = (n: number) => formatMinor(n, preferences.language, company.scale);
  return (
    <div className="ledger-stack">
      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          if (conflict) return;
          if (
            code === account &&
            dimension === (params.get("dimension") ?? "") &&
            value === (params.get("value") ?? "")
          )
            void query.refetch();
          setParams({
            company: company.code,
            month,
            account: code,
            stage: params.get("stage") ?? "adjusted",
            watermark: params.get("watermark") ?? "",
            accountRevision: params.get("accountRevision") ?? "",
            ...(dimension ? { dimension, value } : value ? { value } : {}),
          });
        }}
      >
        <div className="field">
          <label htmlFor="ledger-account">{t("ledger.account")}</label>
          <input
            id="ledger-account"
            disabled={conflict !== null}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ledger-dimension">{t("ledger.dimension")}</label>
          <input
            id="ledger-dimension"
            disabled={conflict !== null}
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ledger-value">{t("ledger.value")}</label>
          <input
            id="ledger-value"
            disabled={conflict !== null}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={conflict !== null}>
            {t("ledger.apply")}
          </button>
        </div>
      </form>
      <MessageBar tone="info">{t("ledger.snapshot")}</MessageBar>
      {!conflict && (query.isPending || query.isRefetching) && (
        <p className="ledger-meta" role="status">
          {t("master.loading")}
        </p>
      )}
      {conflict && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.snapshotUnavailable")}
        </MessageBar>
      )}
      {!conflict && query.isError && (
        <ErrorBox
          error={query.error}
          retry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
          t={t}
        />
      )}
      {first && (
        <ul className="ledger-totals">
          <li>
            {t("ledger.opening")}: {fmt(first.opening)}
          </li>
          <li>
            {t("ledger.debit")}: {fmt(first.debit)}
          </li>
          <li>
            {t("ledger.credit")}: {fmt(first.credit)}
          </li>
          <li className="emphasis">
            {t("ledger.closing")}: {fmt(first.closing)}
          </li>
          <li>
            {t("ledger.total")}: {first.total}
          </li>
          <li>
            {t("ledger.watermark")}: {first.watermark}
          </li>
          <li>
            {t("ledger.accountRevision")}: {first.accountRevision}
          </li>
        </ul>
      )}
      {first && !rows.length && <p className="empty-state">{t("ledger.empty")}</p>}
      <div
        className="card ledger-detail"
        onScrollCapture={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.scrollHeight - target.scrollTop - target.clientHeight < 600 &&
            query.hasNextPage &&
            !query.isFetching &&
            !query.isError &&
            !conflict
          )
            void query.fetchNextPage({ cancelRefetch: false });
        }}
      >
        <VirtualRows
          forceVirtual
          items={rows}
          title={t("ledger.detail")}
          header={[
            t("ledger.date"),
            t("ledger.source"),
            t("ledger.debit"),
            t("ledger.credit"),
            t("ledger.balance"),
            t("journal.dimensions"),
          ]}
          render={(row) => (
            <>
              <td>{row.date}</td>
              <td>
                <Link
                  to={`/journals?${new URLSearchParams({ company: company.code, id: row.entryId })}`}
                >
                  {row.sourceRef} / {row.lineNo}
                </Link>
              </td>
              <td className="num">{fmt(row.debit)}</td>
              <td className="num">{fmt(row.credit)}</td>
              <td className="num">{fmt(row.balance)}</td>
              <td>
                {Object.entries(row.dimensions)
                  .map(([key, value]) => `${key}=${value ?? "~"}`)
                  .join(" · ")}
              </td>
            </>
          )}
        />
      </div>
      {query.hasNextPage && !query.isError && !conflict && (
        <div>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t("master.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}

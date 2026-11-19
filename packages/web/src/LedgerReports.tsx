import { useCallback, useEffect, useState } from "react";
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
import { VirtualRows } from "./Journals.tsx";
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
    <section>
      <h2>{t(location.pathname === "/ledger" ? "ledger.detail" : "ledger.title")}</h2>
      <p>{t("ledger.live")}</p>
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
      {companies.hasNextPage && (
        <button type="button" onClick={() => void companies.fetchNextPage()}>
          {t("master.loadMore")}
        </button>
      )}
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <ErrorBox error={companies.error} retry={() => void companies.refetch()} t={t} />
      )}
      {code && !company && !companies.isPending && !companies.hasNextPage && (
        <p role="alert">{t("ledger.invalid")}</p>
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
      {preferences.teaching && <p className="teaching">{t("ledger.teaching")}</p>}
    </section>
  );
}
function ErrorBox({ error, retry, t }: { error: unknown; retry: () => void; t: T }) {
  return (
    <p role="alert">
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
      <button type="button" onClick={retry}>
        {t("master.retry")}
      </button>
    </p>
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
      {periods.hasNextPage && (
        <button type="button" onClick={() => void periods.fetchNextPage()}>
          {t("master.loadMore")}
        </button>
      )}
      {periods.isError && (
        <ErrorBox error={periods.error} retry={() => void periods.refetch()} t={t} />
      )}
      {!ledger && (
        <>
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
        </>
      )}
      <button
        type="button"
        onClick={() => {
          setConflict(null);
          void client.resetQueries({ queryKey: ["ledger-live", company.code] });
          const next = new URLSearchParams(params);
          next.delete("watermark");
          next.delete("accountRevision");
          setParams(next);
        }}
      >
        {t("ledger.refresh")}
      </button>
      {!periods.isPending && !valid && (
        <p role="alert">
          {t("ledger.invalid")}{" "}
          <button type="button" onClick={() => setParams({ company: company.code })}>
            {t("reports.reload")}
          </button>
        </p>
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
  const toLedger = (code: string) => `/ledger?${pinnedSearch}&account=${code}`;
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
  return (
    <section aria-label={t(`ledger.${view}`)}>
      <p>
        {t("ledger.watermark")}: {report.watermark}
        {" · "}
        {t("ledger.accountRevision")}: {report.accountRevision}
      </p>
      {view === "reconciliation" && (
        <p className="report-boundary">{t("ledger.reconciliationScope")}</p>
      )}
      {view === "reconciliation" ? (
        <table>
          <thead>
            <tr>
              <th>{t("ledger.reconciliation")}</th>
              <th>{t("ledger.left")}</th>
              <th>{t("ledger.right")}</th>
              <th>{t("ledger.difference")}</th>
              <th>{t("ledger.result")}</th>
            </tr>
          </thead>
          <tbody>
            {report.reconciliation.checks.map((check) => (
              <tr key={check.id}>
                <th>{t(`ledger.check.${check.id}`)}</th>
                <td>{fmt(check.left)}</td>
                <td>{fmt(check.right)}</td>
                <td>{fmt(check.difference)}</td>
                <td>{t(check.pass ? "ledger.pass" : "ledger.fail")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          {view === "income" && (
            <p>
              {t("ledger.revenue")}: {fmt(report.income.month.revenue)} / {t("ledger.expense")}:{" "}
              {fmt(report.income.month.expense)} / {t("ledger.profit")}:{" "}
              {fmt(report.income.month.profit)} · {t("ledger.year")}:{" "}
              {fmt(report.income.ytd.profit)}
            </p>
          )}
          {view === "balance-sheet" && (
            <p>
              {t("ledger.assets")}: {fmt(report.balanceSheet.assets)} / {t("ledger.liabilities")}:{" "}
              {fmt(report.balanceSheet.liabilities)} / {t("ledger.equity")}:{" "}
              {fmt(report.balanceSheet.equity)}
            </p>
          )}
          {view === "trial" && (
            <p>
              {t("journal.debit")}: {fmt(report.trial.debit)} / {t("journal.credit")}:{" "}
              {fmt(report.trial.credit)}
            </p>
          )}
          <table aria-label={t("ledger.group")}>
            <thead>
              <tr>
                <th>{t("ledger.group")}</th>
                <th>{t(view === "income" ? "ledger.activity" : "ledger.closing")}</th>
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
                  <tr key={row.reportGroup}>
                    <th>{t(`master.report.${row.reportGroup}`)}</th>
                    <td>
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
          {incomeGroup && (
            <p>
              {t("ledger.reportActivity")}: {fmt(incomeGroup.activity)}
            </p>
          )}
          <VirtualRows
            items={selected}
            title={t(view === "income" ? "ledger.incomeAccounts" : "ledger.trial")}
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
                  <td className="amount">
                    <Link to={toLedger(row.code)}>
                      {fmt(row.category === "REVENUE" ? -row.incomeNet : row.incomeNet)}
                    </Link>
                  </td>
                )}
                {[row.opening, row.debit, row.credit, row.closing].map((n, index) => (
                  <td key={["opening", "debit", "credit", "closing"][index]} className="amount">
                    <Link to={toLedger(row.code)}>{fmt(n)}</Link>
                  </td>
                ))}
              </>
            )}
          />
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
  if (conflict) return <p role="alert">{t("ledger.snapshotUnavailable")}</p>;
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
    <>
      <form
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
        <label htmlFor="ledger-account">{t("ledger.account")}</label>
        <input
          id="ledger-account"
          disabled={conflict !== null}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <label htmlFor="ledger-dimension">{t("ledger.dimension")}</label>
        <input
          id="ledger-dimension"
          disabled={conflict !== null}
          value={dimension}
          onChange={(event) => setDimension(event.target.value)}
        />
        <label htmlFor="ledger-value">{t("ledger.value")}</label>
        <input
          id="ledger-value"
          disabled={conflict !== null}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" disabled={conflict !== null}>
          {t("ledger.apply")}
        </button>
      </form>
      <p>{t("ledger.snapshot")}</p>
      {!conflict && (query.isPending || query.isRefetching) && (
        <p role="status">{t("master.loading")}</p>
      )}
      {conflict && <p role="alert">{t("ledger.snapshotUnavailable")}</p>}
      {!conflict && query.isError && (
        <ErrorBox
          error={query.error}
          retry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
          t={t}
        />
      )}
      {first && (
        <p>
          {t("ledger.watermark")}: {first.watermark} · {t("ledger.opening")}: {fmt(first.opening)} /{" "}
          {t("ledger.debit")}: {fmt(first.debit)} / {t("ledger.credit")}: {fmt(first.credit)} /{" "}
          {t("ledger.closing")}: {fmt(first.closing)} · {t("ledger.total")}: {first.total}
        </p>
      )}
      {first && (
        <p>
          {t("ledger.accountRevision")}: {first.accountRevision}
        </p>
      )}
      {first && !rows.length && <p>{t("ledger.empty")}</p>}
      <div
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
              <td className="amount">{fmt(row.debit)}</td>
              <td className="amount">{fmt(row.credit)}</td>
              <td className="amount">{fmt(row.balance)}</td>
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
        <button
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
    </>
  );
}

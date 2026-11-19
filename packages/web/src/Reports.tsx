import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Link, Navigate, useLocation, useMatch, useSearchParams } from "react-router-dom";
import {
  legacyTrialStages,
  type LegacyLedgerResponse,
  type LegacyTrialStage,
} from "@erp/core/contracts";
import { label, type LabelKey, type Language, type Preferences } from "./ui/index.ts";
import {
  formatMinor,
  parseContext,
  parseLedgerPage,
  parseTrial,
  readReport,
  ReportFailure,
  type ReportScope,
} from "./reports-data.ts";

type SimpleLabel = Exclude<LabelKey, "shell.httpError">;
type Translate = (key: SimpleLabel) => string;
const pageLimit = "100";
const isConflict = (error: unknown) =>
  error instanceof ReportFailure && error.status === 409 && error.detail?.code === "CONFLICT";
const errorLabels = {
  INVALID_REQUEST: ["api.error.invalidRequest", "reports.invalidRequest"],
  FORBIDDEN: ["api.error.forbidden", "reports.forbidden"],
  NOT_FOUND: ["api.error.notFound", "reports.notFound"],
  CONFLICT: ["api.error.conflict", "reports.conflict"],
  UNAVAILABLE: ["api.error.unavailable", "reports.unavailable"],
  INTERNAL_ERROR: ["api.error.internal", "reports.internal"],
  METHOD_NOT_ALLOWED: ["api.error.methodNotAllowed", "reports.httpError"],
  UNSUPPORTED_MEDIA_TYPE: ["api.error.unsupportedMediaType", "reports.httpError"],
} as const;
function failureLabel(error: unknown): SimpleLabel {
  if (!(error instanceof ReportFailure) || error.kind === "invalid")
    return "reports.invalidResponse";
  if (error.kind === "network") return "reports.networkError";
  const known = Object.entries(errorLabels).find(([code]) => code === error.detail?.code)?.[1];
  return known && known[0] === error.detail?.messageKey ? known[1] : "reports.httpError";
}
function Failure({
  error,
  retry,
  reload,
  t,
}: {
  error: unknown;
  retry: () => void;
  reload: () => void;
  t: Translate;
}) {
  return (
    <section role="alert" className="error">
      <p>
        <span aria-hidden="true">⚠ </span>
        {t(isConflict(error) ? "reports.conflict" : failureLabel(error))}
      </p>
      <button type="button" onClick={isConflict(error) ? reload : retry}>
        {t(isConflict(error) ? "reports.reload" : "reports.retry")}
      </button>
    </section>
  );
}
function ScrollTable({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/noNoninteractiveTabindex: Named scroll regions must stay keyboard-focusable.
    <div className="report-scroll" role="region" aria-label={name} tabIndex={0}>
      {children}
    </div>
  );
}

export function Reports({ preferences }: { preferences: Preferences }) {
  const client = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [params, setParams] = useSearchParams();
  const trialRoute = useMatch("/reports/trial");
  const ledgerRoute = useMatch("/reports/ledger/:account");
  const { language } = preferences;
  const t: Translate = (key) => label(language, key);
  const context = useQuery({
    queryKey: ["legacy", "context", generation],
    queryFn: ({ signal }) => readReport("/api/v1/legacy/context", signal, parseContext),
    enabled: !reloading,
  });
  const source = context.data?.source;
  const periods = context.data?.periods ?? [];
  const selectedSource = params.has("source") ? params.get("source")! : source?.snapshotSha256;
  const month = params.has("month") ? params.get("month")! : periods.at(-1)?.month;
  const stage = params.get("stage") ?? "adjusted";
  const invalid =
    !!context.data &&
    ([...params.keys()].some(
      (key) => !["source", "month", "stage"].includes(key) || params.getAll(key).length !== 1,
    ) ||
      selectedSource !== source?.snapshotSha256 ||
      ((params.has("month") || periods.length > 0) &&
        !periods.some((period) => period.month === month)) ||
      !legacyTrialStages.some((value) => value === stage));
  useEffect(() => {
    if (!source || invalid || !month || reloading) return;
    if (!params.has("source") || !params.has("month") || !params.has("stage")) {
      setParams({ source: source.snapshotSha256, month, stage }, { replace: true });
    }
  }, [source, month, stage, invalid, params, setParams, reloading]);

  async function reload() {
    if (reloading) return;
    setReloading(true);
    await client.cancelQueries({ queryKey: ["legacy"] });
    client.removeQueries({ queryKey: ["legacy"] });
    setParams({}, { replace: true });
    setGeneration((value) => value + 1);
    setReloading(false);
  }
  if (reloading || context.isPending) return <p role="status">{t("reports.loading")}</p>;
  if (context.isError)
    return (
      <Failure
        error={context.error}
        t={t}
        retry={() => {
          void context.refetch();
        }}
        reload={() => {
          void reload();
        }}
      />
    );
  if (!source) return null;
  const search = new URLSearchParams({
    source: source.snapshotSha256,
    month: month ?? "",
    stage,
  }).toString();
  const scope = { source, month: month ?? "" };
  const account = ledgerRoute?.params.account;
  return (
    <section className="reports">
      <h2>{t("reports.group")}</h2>
      <p className="snapshot-boundary">{t("reports.snapshot")}</p>
      <details className="snapshot-identity">
        <summary>{t("reports.source")}</summary>
        <code>{source.snapshotSha256}</code>
      </details>
      <label htmlFor="report-period">{t("reports.period")}</label>
      <select
        id="report-period"
        value={invalid || !month ? "" : month}
        disabled={periods.length === 0 || selectedSource !== source.snapshotSha256}
        onChange={(event) => {
          const next = event.target.value;
          if (periods.some((period) => period.month === next)) {
            setParams({
              source: source.snapshotSha256,
              month: next,
              stage: legacyTrialStages.some((value) => value === stage) ? stage : "adjusted",
            });
          }
        }}
      >
        <option value="" disabled>
          {t("reports.choosePeriod")}
        </option>
        {periods.map((period) => (
          <option value={period.month} key={period.month}>
            {period.month} · {t(`reports.${period.status}`)}
          </option>
        ))}
      </select>
      <p className="report-boundary">{t("reports.sign")}</p>
      {preferences.teaching && <p className="teaching">{t("reports.teaching")}</p>}
      {invalid ? (
        <section role="alert" className="error">
          <p>
            <span aria-hidden="true">⚠ </span>
            {t("reports.invalidSelection")}
          </p>
          <button
            type="button"
            onClick={() => {
              void reload();
            }}
          >
            {t("reports.reload")}
          </button>
        </section>
      ) : periods.length === 0 ? (
        <p>{t("reports.noPeriods")}</p>
      ) : trialRoute ? (
        <Trial
          key={`${source.snapshotSha256}:${month}`}
          scope={scope}
          stage={stage as LegacyTrialStage}
          t={t}
          language={language}
          search={search}
          onStage={(next) =>
            setParams({ source: source.snapshotSha256, month: month!, stage: next })
          }
          reload={() => {
            void reload();
          }}
        />
      ) : ledgerRoute && account && /^[1-9][0-9]{3}$/u.test(account) ? (
        <Ledger
          key={`${source.snapshotSha256}:${month}:${account}`}
          scope={{ ...scope, account }}
          t={t}
          language={language}
          search={search}
          reload={() => {
            void reload();
          }}
        />
      ) : (
        <p role="alert">
          <span aria-hidden="true">⚠ </span>
          {t("reports.routeMissing")}
        </p>
      )}
    </section>
  );
}

function Trial({
  scope,
  stage,
  t,
  language,
  search,
  onStage,
  reload,
}: {
  scope: ReportScope;
  stage: LegacyTrialStage;
  t: Translate;
  language: Language;
  search: string;
  onStage: (stage: LegacyTrialStage) => void;
  reload: () => void;
}) {
  const query = useQuery({
    queryKey: ["legacy", "trial", scope.source.snapshotSha256, scope.month],
    queryFn: ({ signal }) =>
      readReport(
        `/api/v1/legacy/trial?${new URLSearchParams({
          snapshot: scope.source.snapshotSha256,
          month: scope.month,
        })}`,
        signal,
        (body) => parseTrial(body, scope),
      ),
  });
  const data = query.data?.trialBalances[stage];
  return (
    <section className="report-card">
      <h3>{t("reports.trial")}</h3>
      <label htmlFor="trial-stage">{t("reports.stage")}</label>
      <select
        id="trial-stage"
        value={stage}
        onChange={(event) => {
          const next = legacyTrialStages.find((value) => value === event.target.value);
          if (next) onStage(next);
        }}
      >
        {legacyTrialStages.map((value) => (
          <option key={value} value={value}>
            {t(`reports.${value}`)}
          </option>
        ))}
      </select>
      {query.isPending ? (
        <p role="status">{t("reports.loading")}</p>
      ) : query.isError ? (
        <Failure
          error={query.error}
          t={t}
          retry={() => {
            void query.refetch();
          }}
          reload={reload}
        />
      ) : (
        data && (
          <>
            {data.debit !== data.credit && (
              <p className="warning">
                <span aria-hidden="true">⚠ </span>
                {t("reports.unbalanced")}
              </p>
            )}
            {data.rows.length === 0 && <p>{t("reports.emptyTrial")}</p>}
            <ScrollTable name={t("reports.trialScroll")}>
              <table>
                <caption>
                  {t("reports.trial")} · {scope.month} · {t(`reports.${stage}`)}
                </caption>
                <thead>
                  <tr>
                    {(["code", "name", "debit", "credit"] as const).map((key) => (
                      <th scope="col" key={key}>
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
                      <td className="amount">{formatMinor(row.debit, language)}</td>
                      <td className="amount">{formatMinor(row.credit, language)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      {t("reports.total")}
                    </th>
                    <td className="amount">{formatMinor(data.debit, language)}</td>
                    <td className="amount">{formatMinor(data.credit, language)}</td>
                  </tr>
                </tfoot>
              </table>
            </ScrollTable>
          </>
        )
      )}
    </section>
  );
}

function Ledger({
  scope,
  t,
  language,
  search,
  reload,
}: {
  scope: ReportScope & { account: string };
  t: Translate;
  language: Language;
  search: string;
  reload: () => void;
}) {
  const client = useQueryClient();
  const lock = useRef(false);
  const key = [
    "legacy",
    "ledger",
    scope.source.snapshotSha256,
    scope.month,
    scope.account,
    pageLimit,
  ] as const;
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const cached =
        client.getQueryData<InfiniteData<LegacyLedgerResponse, string | undefined>>(key)?.pages ??
        [];
      const priorIndex = cached.findIndex((page) => page.nextCursor === pageParam);
      const previous = pageParam === undefined ? [] : cached.slice(0, priorIndex + 1);
      const params = new URLSearchParams({
        snapshot: scope.source.snapshotSha256,
        month: scope.month,
        account: scope.account,
        limit: pageLimit,
      });
      if (pageParam !== undefined) params.set("cursor", pageParam);
      return readReport(`/api/v1/legacy/ledger?${params}`, signal, (body) =>
        parseLedgerPage(body, scope, previous, pageParam),
      );
    },
    getNextPageParam: (last: LegacyLedgerResponse) => last.nextCursor,
  });
  async function more() {
    if (lock.current || query.isFetching || !query.hasNextPage) return;
    lock.current = true;
    try {
      await query.fetchNextPage({ cancelRefetch: false });
    } finally {
      lock.current = false;
    }
  }
  const first = query.data?.pages[0];
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];
  const kinds = {
    normal: "reports.normal",
    adjusting: "reports.adjusting",
    reversal: "reports.reversal",
    closing: "reports.closingKind",
  } as const;
  return (
    <section className="report-card">
      <h3>
        {t("reports.ledger")} · {scope.account}
      </h3>
      <Link to={`/reports/trial?${search}`}>{t("reports.back")}</Link>
      <p className="report-boundary">{t("reports.fullMonth")}</p>
      {query.isPending ? (
        <p role="status">{t("reports.loading")}</p>
      ) : isConflict(query.error) || !first ? (
        <Failure
          error={query.error}
          t={t}
          retry={() => {
            void query.refetch();
          }}
          reload={reload}
        />
      ) : (
        <>
          <dl className="report-totals">
            {(["opening", "debit", "credit", "closing"] as const).map((field) => (
              <div key={field}>
                <dt>{t(`reports.${field}`)}</dt>
                <dd>{formatMinor(first[field], language)}</dd>
              </div>
            ))}
            <div>
              <dt>{t("reports.totalEntries")}</dt>
              <dd>{first.totalEntries}</dd>
            </div>
          </dl>
          {entries.length === 0 && <p>{t("reports.emptyLedger")}</p>}
          <ScrollTable name={t("reports.ledgerScroll")}>
            <table>
              <caption>
                {t("reports.ledger")} · {scope.account} · {scope.month}
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
                    <th scope="col" key={field}>
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
                    <td className="amount">{formatMinor(entry.debit, language)}</td>
                    <td className="amount">{formatMinor(entry.credit, language)}</td>
                    <td className="amount">{formatMinor(entry.balance, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
          {query.isFetchNextPageError ? (
            <>
              <p className="warning">
                <span aria-hidden="true">⚠ </span>
                {t("reports.incomplete")}
              </p>
              <Failure
                error={query.error}
                t={t}
                retry={() => {
                  void more();
                }}
                reload={reload}
              />
            </>
          ) : (
            <p role="status">{t(query.hasNextPage ? "reports.partial" : "reports.complete")}</p>
          )}
          {query.hasNextPage && !query.isFetchNextPageError && (
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => {
                void more();
              }}
            >
              {t(query.isFetchingNextPage ? "reports.loadingMore" : "reports.more")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function ReportIndex() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/reports/trial", search }} replace />;
}

import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  label,
  loadPreferences,
  persistPreferences,
  type LabelKey,
  type Preferences,
  type PreferenceIssue,
} from "./ui/index.ts";
import { useHealth } from "./health.ts";
import { ReportIndex, Reports } from "./Reports.tsx";
import "./styles.css";

const storage = () => window.localStorage;
const TradeInvoices = lazy(() =>
  import("./TradeInvoices.tsx").then((module) => ({ default: module.TradeInvoices })),
);
const TradeMaster = lazy(() =>
  import("./TradeMaster.tsx").then((module) => ({ default: module.TradeMaster })),
);
const Accounts = lazy(() =>
  import("./Accounts.tsx").then((module) => ({ default: module.Accounts })),
);
const Dimensions = lazy(() =>
  import("./Dimensions.tsx").then((module) => ({ default: module.Dimensions })),
);
const Journals = lazy(() =>
  import("./Journals.tsx").then((module) => ({ default: module.Journals })),
);
const BusinessEvents = lazy(() =>
  import("./BusinessEvents.tsx").then((module) => ({ default: module.BusinessEvents })),
);
const PeriodClose = lazy(() =>
  import("./PeriodClose.tsx").then((module) => ({ default: module.PeriodClose })),
);
const LedgerReports = lazy(() =>
  import("./LedgerReports.tsx").then((module) => ({ default: module.LedgerReports })),
);

export function App() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            gcTime: Infinity,
            retry: false,
            retryOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchInterval: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <HashRouter>
        <Workspace />
      </HashRouter>
    </QueryClientProvider>
  );
}

function Workspace() {
  const { pathname, search } = useLocation();
  const reportSearch = pathname === "/reports" || pathname.startsWith("/reports/") ? search : "";
  const [initial] = useState(() => loadPreferences(storage));
  const [preferences, setPreferences] = useState(initial.preferences);
  const [issues, setIssues] = useState(initial.issues);
  const language = preferences.language;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(language, key);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = label(language, "shell.documentTitle");
  }, [language]);

  function changePreferences(next: Preferences) {
    const issue = persistPreferences(storage, next);
    if (issue) {
      setIssues((previous) => (previous.includes(issue) ? previous : [...previous, issue]));
    } else {
      setPreferences(next);
      setIssues((previous) => previous.filter((current) => current !== "storageWrite"));
    }
  }

  const issueLabels = {
    storageRead: "shell.storageRead",
    storageCorrupt: "shell.storageCorrupt",
    storageWrite: "shell.storageWrite",
  } as const satisfies Record<PreferenceIssue, LabelKey>;

  return (
    <div className="workspace" data-theme={preferences.theme}>
      {/* biome-ignore lint/a11y/useValidAnchor: Skip links move focus without changing the HashRouter fragment. */}
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-main")?.focus();
        }}
      >
        {t("shell.skip")}
      </a>
      <header className="workspace-header">
        <h1>{t("shell.title")}</h1>
      </header>
      <div className="workspace-layout">
        <aside>
          <nav aria-label={t("shell.navigation")}>
            <NavLink to="/" end>
              {t("shell.overview")}
            </NavLink>
            <div className="navigation-group">
              <span>{t("master.group")}</span>
              <NavLink to="/accounts">{t("master.title")}</NavLink>
              <NavLink to="/dimensions">{t("dim.title")}</NavLink>
              <NavLink to="/trade">{t("trade.title")}</NavLink>
            </div>
            <div className="navigation-group">
              <span>{t("journal.group")}</span>
              <NavLink to="/journals">{t("journal.title")}</NavLink>
              <NavLink to="/events">{t("business.title")}</NavLink>
              <NavLink to="/trade-invoices">{t("tinv.title")}</NavLink>
              <NavLink to="/ledger-reports">{t("ledger.title")}</NavLink>
              <NavLink to="/ledger">{t("ledger.detail")}</NavLink>
              <NavLink to="/period-close">{t("close.title")}</NavLink>
            </div>
            <div className="navigation-group">
              <span>{t("reports.group")}</span>
              <NavLink to={{ pathname: "/reports/trial", search: reportSearch }}>
                {t("reports.trial")}
              </NavLink>
            </div>
          </nav>
          <fieldset className="preferences">
            <legend>{t("shell.preferences")}</legend>
            <label htmlFor="workspace-language">{t("shell.language")}</label>
            <select
              id="workspace-language"
              value={language}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "zh" || next === "en")
                  changePreferences({ ...preferences, language: next });
              }}
            >
              <option value="zh">{t("shell.languageZh")}</option>
              <option value="en">{t("shell.languageEn")}</option>
            </select>
            <label htmlFor="workspace-theme">{t("shell.theme")}</label>
            <select
              id="workspace-theme"
              value={preferences.theme}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "red" || next === "green")
                  changePreferences({ ...preferences, theme: next });
              }}
            >
              <option value="red">{t("shell.themeRed")}</option>
              <option value="green">{t("shell.themeGreen")}</option>
            </select>
            <label className="checkbox-label" htmlFor="workspace-teaching">
              <input
                id="workspace-teaching"
                type="checkbox"
                checked={preferences.teaching}
                onChange={(event) =>
                  changePreferences({ ...preferences, teaching: event.target.checked })
                }
              />
              {t("shell.showTeachingExplanations")}
            </label>
          </fieldset>
          {issues.length > 0 && (
            <section className="warning" role="alert" aria-labelledby="preference-warning">
              <h2 id="preference-warning">
                <span aria-hidden="true">⚠ </span>
                {t("shell.preferenceErrors")}
              </h2>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{t(issueLabels[issue])}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
        <main id="workspace-main" tabIndex={-1}>
          <Routes>
            <Route
              path="/trade"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <TradeMaster preferences={preferences} />
                </Suspense>
              }
            />
            <Route
              path="/trade-invoices"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <TradeInvoices preferences={preferences} />
                </Suspense>
              }
            />
            <Route
              path="/period-close"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <PeriodClose preferences={preferences} />
                </Suspense>
              }
            />
            {["/ledger-reports", "/ledger"].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <LedgerReports preferences={preferences} />
                  </Suspense>
                }
              />
            ))}
            <Route
              path="/events"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <BusinessEvents preferences={preferences} />
                </Suspense>
              }
            />
            <Route
              path="/dimensions"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <Dimensions preferences={preferences} />
                </Suspense>
              }
            />
            <Route
              path="/journals"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <Journals preferences={preferences} />
                </Suspense>
              }
            />
            <Route
              path="/accounts"
              element={
                <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                  <Accounts preferences={preferences} />
                </Suspense>
              }
            />
            <Route path="/" element={<Overview preferences={preferences} />} />
            <Route path="/reports" element={<ReportIndex />} />
            <Route path="/reports/*" element={<Reports preferences={preferences} />} />
            <Route
              path="*"
              element={
                <p role="alert">
                  <span aria-hidden="true">⚠ </span>
                  {t("reports.routeMissing")}
                </p>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Overview({ preferences }: { preferences: Preferences }) {
  const [attempt, setAttempt] = useState(0);
  const health = useHealth(attempt);
  const language = preferences.language;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(language, key);
  return (
    <>
      <p className="intro">{t("shell.intro")}</p>
      <section className="status-card" aria-labelledby="health-heading">
        <h2 id="health-heading">{t("shell.healthHeading")}</h2>
        <div role="status" aria-live="polite" aria-atomic="true">
          {health.kind === "loading" && <p>{t("shell.healthLoading")}</p>}
          {health.kind === "ready" && (
            <>
              <p className="connected">{t("shell.connected")}</p>
              <dl>
                <dt>{t("shell.service")}</dt>
                <dd>{health.health.service}</dd>
                <dt>{t("shell.contract")}</dt>
                <dd>{health.health.contractVersion}</dd>
                <dt>{t("shell.profile")}</dt>
                <dd>{t("shell.local")}</dd>
                <dt>{t("shell.data")}</dt>
                <dd>
                  {t(
                    health.health.data === "configured" ? "shell.configured" : "shell.unconfigured",
                  )}
                </dd>
              </dl>
            </>
          )}
          {(health.kind === "networkError" || health.kind === "invalidResponse") && (
            <p className="error">
              <span aria-hidden="true">⚠ </span>
              {t(`shell.${health.kind}`)}
            </p>
          )}
          {health.kind === "httpError" && (
            <p className="error">
              <span aria-hidden="true">⚠ </span>
              {label(language, "shell.httpError", { status: health.status })}
            </p>
          )}
        </div>
        {health.kind !== "loading" && health.kind !== "ready" && (
          <button type="button" onClick={() => setAttempt((previous) => previous + 1)}>
            {t("shell.retry")}
          </button>
        )}
      </section>
      {!(health.kind === "ready" && health.health.data === "configured") && (
        <section className="warning data-warning" aria-label={t("shell.data")}>
          <p>
            <span aria-hidden="true">⚠ </span>
            {t("shell.dataWarning")}
          </p>
        </section>
      )}
      {preferences.teaching && <p className="teaching">{t("shell.teachingNote")}</p>}
    </>
  );
}

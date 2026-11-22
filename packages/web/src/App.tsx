import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
// The resident Back/Forward gate, before HashRouter registers its popstate listener (D280).
import "./leave-guard-gate.ts";
import {
  label,
  loadPreferences,
  persistPreferences,
  type LabelKey,
  type Preferences,
  type PreferenceIssue,
} from "./ui/index.ts";
import type { Badge, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { MessageBar } from "./ui/components/message-bar.tsx";
import { useHealth } from "./health.ts";
import "./pages/overview.css";

const storage = () => window.localStorage;
const Migration = lazy(() =>
  import("./Migration.tsx").then((module) => ({ default: module.Migration })),
);
const TradeReports = lazy(() =>
  import("./TradeReports.tsx").then((module) => ({ default: module.TradeReports })),
);
const TradeAdjustments = lazy(() =>
  import("./TradeAdjustments.tsx").then((module) => ({ default: module.TradeAdjustments })),
);
const TradeSettlements = lazy(() =>
  import("./TradeSettlements.tsx").then((module) => ({ default: module.TradeSettlements })),
);
const TradeInvoices = lazy(() =>
  import("./TradeInvoices.tsx").then((module) => ({ default: module.TradeInvoices })),
);
const TradeOrders = lazy(() =>
  import("./TradeOrders.tsx").then((module) => ({ default: module.TradeOrders })),
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
const Reports = lazy(() => import("./Reports.tsx").then((module) => ({ default: module.Reports })));
const ReportIndex = lazy(() =>
  import("./Reports.tsx").then((module) => ({ default: module.ReportIndex })),
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

  // On narrow screens the navigation is a horizontal strip; keep the current page in view.
  const navigation = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: aria-current moves when the route changes.
  useEffect(() => {
    const nav = navigation.current;
    const current = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 8;
  }, [pathname]);

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
      <header className="appbar">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <h1>{t("shell.title")}</h1>
        <fieldset className="appbar-prefs">
          <legend>{t("shell.preferences")}</legend>
          <div className="appbar-pref">
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
          </div>
          <div className="appbar-pref">
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
          </div>
          <label className="checkbox-label" htmlFor="workspace-teaching">
            <input
              id="workspace-teaching"
              type="checkbox"
              checked={preferences.teaching}
              onChange={(event) =>
                changePreferences({ ...preferences, teaching: event.target.checked })
              }
            />
            <span>{t("shell.showTeachingExplanations")}</span>
          </label>
        </fieldset>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <nav className="nav" ref={navigation} aria-label={t("shell.navigation")}>
            <div className="nav-group">
              <NavLink to="/" end>
                {t("shell.overview")}
              </NavLink>
              <NavLink to="/migration">{t("migration.title")}</NavLink>
            </div>
            {/* biome-ignore-start lint/a11y/useSemanticElements: UI-14 link groups; fieldset is for form controls and would need new CSS. */}
            <div className="nav-group" role="group" aria-labelledby="nav-group-master">
              <span id="nav-group-master">{t("master.group")}</span>
              <NavLink to="/accounts">{t("master.title")}</NavLink>
              <NavLink to="/dimensions">{t("dim.title")}</NavLink>
              <NavLink to="/trade">{t("trade.title")}</NavLink>
            </div>
            <div className="nav-group" role="group" aria-labelledby="nav-group-posting">
              <span id="nav-group-posting">{t("shell.nav.posting")}</span>
              <NavLink to="/journals">{t("journal.title")}</NavLink>
              <NavLink to="/events">{t("business.title")}</NavLink>
            </div>
            <div className="nav-group" role="group" aria-labelledby="nav-group-trade">
              <span id="nav-group-trade">{t("shell.nav.trade")}</span>
              <NavLink to="/trade-orders">{t("shell.tradeOrders")}</NavLink>
              <NavLink to="/trade-invoices">{t("tinv.title")}</NavLink>
              <NavLink to="/trade-settlements">{t("tset.title")}</NavLink>
              <NavLink to="/trade-adjustments">{t("tadj.title")}</NavLink>
              <NavLink to="/trade-reports">{t("trpt.title")}</NavLink>
            </div>
            <div className="nav-group" role="group" aria-labelledby="nav-group-ledger">
              <span id="nav-group-ledger">{t("shell.nav.ledger")}</span>
              <NavLink to="/ledger-reports">{t("ledger.title")}</NavLink>
              <NavLink to="/ledger">{t("ledger.detail")}</NavLink>
              <NavLink to="/period-close">{t("close.title")}</NavLink>
            </div>
            <div className="nav-group" role="group" aria-labelledby="nav-group-reports">
              <span id="nav-group-reports">{t("reports.group")}</span>
              <NavLink to={{ pathname: "/reports/trial", search: reportSearch }}>
                {t("reports.trial")}
              </NavLink>
            </div>
            {/* biome-ignore-end lint/a11y/useSemanticElements: UI-14 link groups. */}
          </nav>
        </aside>
        <div className="shell-body">
          {issues.length > 0 && (
            <MessageBar tone="warning" role="alert" labelledBy="preference-warning">
              <h2 id="preference-warning">{t("shell.preferenceErrors")}</h2>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{t(issueLabels[issue])}</li>
                ))}
              </ul>
            </MessageBar>
          )}
          <main id="workspace-main" tabIndex={-1}>
            <Routes>
              <Route
                path="/migration"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <Migration preferences={preferences} />
                  </Suspense>
                }
              />
              <Route
                path="/trade-adjustments"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <TradeAdjustments preferences={preferences} />
                  </Suspense>
                }
              />
              <Route
                path="/trade"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <TradeMaster preferences={preferences} />
                  </Suspense>
                }
              />
              <Route
                path="/trade-reports"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <TradeReports preferences={preferences} />
                  </Suspense>
                }
              />
              <Route
                path="/trade-orders"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <TradeOrders preferences={preferences} />
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
                path="/trade-settlements"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <TradeSettlements preferences={preferences} />
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
              <Route
                path="/reports"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <ReportIndex />
                  </Suspense>
                }
              />
              <Route
                path="/reports/*"
                element={
                  <Suspense fallback={<p role="status">{t("master.loading")}</p>}>
                    <Reports preferences={preferences} />
                  </Suspense>
                }
              />
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
    </div>
  );
}

type SharedUi = {
  Badge: typeof Badge;
  MessageBar: typeof MessageBar;
  PageHeader: typeof PageHeader;
  TeachingTip: typeof TeachingTip;
};
// The shared components stay in their own chunk (D39): a static import here would fold them and
// components.css into the entry. Until that chunk arrives Overview keeps its final DOM in place
// but transparent, inert and aria-hidden (the status region inside is never replaced); only the
// loading note is visible and exposed. Nothing becomes operable before the final layout. If the
// chunk fails, the same content is shown with these plain stand-ins and a visible reload notice.
const Plain = ({ children }: { children?: ReactNode }) => <>{children}</>;
const plainUi: SharedUi = {
  Badge: Plain,
  MessageBar: Plain,
  PageHeader: ({ title }) => <h2>{title}</h2>,
  TeachingTip: ({ teaching, children }) => (teaching ? <p>{children}</p> : null),
};

type SharedUiState = "pending" | "ready" | "failed";
let loadedUi: SharedUi | undefined;

function Overview({ preferences }: { preferences: Preferences }) {
  const [attempt, setAttempt] = useState(0);
  const loaded = useHealth(attempt);
  const [uiState, setUiState] = useState<SharedUiState>(loadedUi ? "ready" : "pending");
  useEffect(() => {
    if (loadedUi) return;
    // Awaited as a whole: Vite wraps this import() with a CSS preload whose failure would
    // otherwise escape a .then() chained onto the bare import().
    (async () => {
      try {
        loadedUi = await import("./ui/components/index.tsx");
        setUiState("ready");
      } catch {
        setUiState("failed");
      }
    })();
  }, []);
  const { Badge, MessageBar, PageHeader, TeachingTip } = loadedUi ?? plainUi;
  const pending = uiState === "pending";
  const health: typeof loaded = pending ? { kind: "loading" } : loaded;
  const language = preferences.language;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(language, key);
  const configured = health.kind === "ready" && health.health.data === "configured";
  const unhealthy = health.kind !== "loading" && health.kind !== "ready";
  return (
    <div className={`page overview-page overview-${uiState}`}>
      {pending && <p role="status">{t("shell.uiLoading")}</p>}
      {uiState === "failed" && (
        <div className="overview-ui-error" role="alert">
          <p>{t("shell.uiFailed")}</p>
          <button type="button" onClick={() => location.reload()}>
            {t("shell.uiReload")}
          </button>
        </div>
      )}
      {/* Always present so the status region below is never replaced; only a placeholder while pending. */}
      <div className="overview-content" inert={pending} aria-hidden={pending || undefined}>
        <PageHeader title={t("shell.overview")} description={t("shell.intro")} />
        <TeachingTip teaching={preferences.teaching} title={t("shell.teachingTitle")}>
          {t("shell.teachingNote")}
        </TeachingTip>
        <section className="card" aria-labelledby="health-heading">
          <header>
            <h3 id="health-heading">{t("shell.healthHeading")}</h3>
          </header>
          <div className="body">
            <div className="overview-status" role="status" aria-live="polite" aria-atomic="true">
              {health.kind === "loading" && <p>{t("shell.healthLoading")}</p>}
              {health.kind === "ready" && (
                <>
                  <p>
                    <Badge tone="success">{t("shell.connected")}</Badge>
                  </p>
                  <dl className="overview-facts">
                    <div>
                      <dt>{t("shell.service")}</dt>
                      <dd>{health.health.service}</dd>
                    </div>
                    <div>
                      <dt>{t("shell.contract")}</dt>
                      <dd>
                        <span>{health.health.contractVersion}</span>
                        <Badge tone="success">{t("shell.compatible")}</Badge>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("shell.profile")}</dt>
                      <dd>{t("shell.local")}</dd>
                    </div>
                    <div>
                      <dt>{t("shell.data")}</dt>
                      <dd>
                        <Badge tone={configured ? "success" : "warning"}>
                          {t(configured ? "shell.configured" : "shell.unconfigured")}
                        </Badge>
                      </dd>
                    </div>
                  </dl>
                </>
              )}
              {unhealthy && (
                <MessageBar tone="danger">
                  {health.kind === "httpError"
                    ? label(language, "shell.httpError", { status: health.status })
                    : t(`shell.${health.kind}`)}
                </MessageBar>
              )}
            </div>
            {unhealthy && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAttempt((previous) => previous + 1)}
              >
                {t("shell.retry")}
              </button>
            )}
          </div>
        </section>
        {!configured && (
          <section aria-label={t("shell.data")}>
            <MessageBar tone="warning">{t("shell.dataWarning")}</MessageBar>
          </section>
        )}
      </div>
    </div>
  );
}

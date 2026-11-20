import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import type { Badge, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
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
            <div className="nav-group">
              <span>{t("master.group")}</span>
              <NavLink to="/accounts">{t("master.title")}</NavLink>
              <NavLink to="/dimensions">{t("dim.title")}</NavLink>
              <NavLink to="/trade">{t("trade.title")}</NavLink>
            </div>
            <div className="nav-group">
              <span>{t("journal.group")}</span>
              <NavLink to="/journals">{t("journal.title")}</NavLink>
              <NavLink to="/events">{t("business.title")}</NavLink>
              <NavLink to="/trade-invoices">{t("tinv.title")}</NavLink>
              <NavLink to="/trade-settlements">{t("tset.title")}</NavLink>
              <NavLink to="/trade-adjustments">{t("tadj.title")}</NavLink>
              <NavLink to="/trade-reports">{t("trpt.title")}</NavLink>
              <NavLink to="/ledger-reports">{t("ledger.title")}</NavLink>
              <NavLink to="/ledger">{t("ledger.detail")}</NavLink>
              <NavLink to="/period-close">{t("close.title")}</NavLink>
            </div>
            <div className="nav-group">
              <span>{t("reports.group")}</span>
              <NavLink to={{ pathname: "/reports/trial", search: reportSearch }}>
                {t("reports.trial")}
              </NavLink>
            </div>
          </nav>
        </aside>
        <div className="shell-body">
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
// but transparent and inert (only the loading text inside the stable status region), so nothing
// becomes operable before the final layout. If the chunk fails, the same content is shown with
// these plain stand-ins and a visible reload notice.
const plainUi: SharedUi = {
  Badge: ({ children }) => <span>{children}</span>,
  MessageBar: ({ children }) => <div>{children}</div>,
  PageHeader: ({ title, description }) => (
    <div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  ),
  TeachingTip: ({ teaching, title, children }) =>
    teaching ? (
      <aside aria-label={title}>
        <strong>{title}</strong>
        <p>{children}</p>
      </aside>
    ) : null,
};

type SharedUiState = "pending" | "ready" | "failed";
let loadedUi: SharedUi | undefined;

function useSharedUi(): [SharedUiState, SharedUi] {
  const [state, setState] = useState<SharedUiState>(loadedUi ? "ready" : "pending");
  useEffect(() => {
    if (loadedUi) return;
    let active = true;
    // Awaited as a whole: Vite wraps this import() with a CSS preload whose failure would
    // otherwise escape a .then() chained onto the bare import().
    const load = async () => {
      try {
        const module = await import("./ui/components/index.tsx");
        loadedUi = module;
        if (active) setState("ready");
      } catch {
        if (active) setState("failed");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);
  return [state, state === "ready" && loadedUi ? loadedUi : plainUi];
}

function Overview({ preferences }: { preferences: Preferences }) {
  const [attempt, setAttempt] = useState(0);
  const loaded = useHealth(attempt);
  const [uiState, { Badge, MessageBar, PageHeader, TeachingTip }] = useSharedUi();
  const pending = uiState === "pending";
  const health: typeof loaded = pending ? { kind: "loading" } : loaded;
  const language = preferences.language;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(language, key);
  const configured = health.kind === "ready" && health.health.data === "configured";
  return (
    <div
      className={`page overview-page${pending ? " overview-pending" : ""}${uiState === "failed" ? " overview-degraded" : ""}`}
      aria-busy={pending || undefined}
    >
      {pending && (
        <p className="overview-pending-note" aria-hidden="true">
          {t("shell.uiLoading")}
        </p>
      )}
      {uiState === "failed" && (
        <div className="overview-ui-error" role="alert">
          <p>{t("shell.uiFailed")}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {t("shell.uiReload")}
          </button>
        </div>
      )}
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
            {health.kind === "loading" && (
              <p className="overview-loading">{t("shell.healthLoading")}</p>
            )}
            {health.kind === "ready" && (
              <>
                <p className="overview-connection">
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
            {(health.kind === "networkError" || health.kind === "invalidResponse") && (
              <MessageBar tone="danger">{t(`shell.${health.kind}`)}</MessageBar>
            )}
            {health.kind === "httpError" && (
              <MessageBar tone="danger">
                {label(language, "shell.httpError", { status: health.status })}
              </MessageBar>
            )}
          </div>
          {health.kind !== "loading" && health.kind !== "ready" && (
            <div className="overview-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAttempt((previous) => previous + 1)}
              >
                {t("shell.retry")}
              </button>
            </div>
          )}
        </div>
      </section>
      {!configured && (
        <section aria-label={t("shell.data")}>
          <MessageBar tone="warning">{t("shell.dataWarning")}</MessageBar>
        </section>
      )}
    </div>
  );
}

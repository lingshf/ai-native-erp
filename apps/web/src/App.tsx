import { useEffect, useState } from "react";
import {
  label, loadPreferences, persistPreferences,
  type LabelKey, type Preferences, type PreferenceIssue
} from "@erp/ui";
import { useHealth } from "./health.js";
import "./styles.css";

const storage = () => window.localStorage;

export function App() {
  const [initial] = useState(() => loadPreferences(storage));
  const [preferences, setPreferences] = useState(initial.preferences);
  const [issues, setIssues] = useState(initial.issues);
  const [attempt, setAttempt] = useState(0);
  const health = useHealth(attempt);
  const language = preferences.language;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(language, key);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = label(language, "shell.documentTitle");
  }, [language]);

  function changePreferences(next: Preferences) {
    const issue = persistPreferences(storage, next);
    if (issue) {
      setIssues(previous => previous.includes(issue) ? previous : [...previous, issue]);
    } else {
      setPreferences(next);
      setIssues(previous => previous.filter(current => current !== "storageWrite"));
    }
  }

  const issueLabels = {
    storageRead: "shell.storageRead",
    storageCorrupt: "shell.storageCorrupt",
    storageWrite: "shell.storageWrite"
  } as const satisfies Record<PreferenceIssue, LabelKey>;

  return (
    <div className="workspace" data-theme={preferences.theme}>
      <a className="skip-link" href="#workspace-main">{t("shell.skip")}</a>
      <header className="workspace-header">
        <h1>{t("shell.title")}</h1>
        <nav aria-label={t("shell.navigation")}>
          <a href="#workspace-main" aria-current="page">{t("shell.overview")}</a>
        </nav>
      </header>
      <div className="workspace-layout">
        <aside>
          <fieldset className="preferences">
            <legend>{t("shell.preferences")}</legend>
            <label htmlFor="workspace-language">{t("shell.language")}</label>
            <select id="workspace-language" value={language}
              onChange={event => {
                const next = event.target.value;
                if (next === "zh" || next === "en") changePreferences({ ...preferences, language: next });
              }}>
              <option value="zh">{t("shell.languageZh")}</option>
              <option value="en">{t("shell.languageEn")}</option>
            </select>
            <label htmlFor="workspace-theme">{t("shell.theme")}</label>
            <select id="workspace-theme" value={preferences.theme}
              onChange={event => {
                const next = event.target.value;
                if (next === "red" || next === "green") changePreferences({ ...preferences, theme: next });
              }}>
              <option value="red">{t("shell.themeRed")}</option>
              <option value="green">{t("shell.themeGreen")}</option>
            </select>
            <label className="checkbox-label" htmlFor="workspace-teaching">
              <input id="workspace-teaching" type="checkbox" checked={preferences.teaching}
                onChange={event => changePreferences({ ...preferences, teaching: event.target.checked })} />
              {t("shell.showTeachingExplanations")}
            </label>
          </fieldset>
          {issues.length > 0 && (
            <section className="warning" role="alert" aria-labelledby="preference-warning">
              <h2 id="preference-warning"><span aria-hidden="true">⚠ </span>{t("shell.preferenceErrors")}</h2>
              <ul>{issues.map(issue => <li key={issue}>{t(issueLabels[issue])}</li>)}</ul>
            </section>
          )}
        </aside>
        <main id="workspace-main" tabIndex={-1}>
          <p className="intro">{t("shell.intro")}</p>
          <section className="status-card" aria-labelledby="health-heading">
            <h2 id="health-heading">{t("shell.healthHeading")}</h2>
            <div role="status" aria-live="polite" aria-atomic="true">
              {health.kind === "loading" && <p>{t("shell.healthLoading")}</p>}
              {health.kind === "ready" && (
                <>
                  <p className="connected">{t("shell.connected")}</p>
                  <dl>
                    <dt>{t("shell.service")}</dt><dd>{health.health.service}</dd>
                    <dt>{t("shell.contract")}</dt><dd>{health.health.contractVersion}</dd>
                    <dt>{t("shell.profile")}</dt><dd>{t("shell.local")}</dd>
                    <dt>{t("shell.data")}</dt><dd>{t("shell.unconfigured")}</dd>
                  </dl>
                </>
              )}
              {(health.kind === "networkError" || health.kind === "invalidResponse") &&
                <p className="error"><span aria-hidden="true">⚠ </span>{t(`shell.${health.kind}`)}</p>}
              {health.kind === "httpError" &&
                <p className="error"><span aria-hidden="true">⚠ </span>
                  {label(language, "shell.httpError", { status: health.status })}</p>}
            </div>
            {health.kind !== "loading" && health.kind !== "ready" &&
              <button type="button" onClick={() => setAttempt(previous => previous + 1)}>{t("shell.retry")}</button>}
          </section>
          <section className="warning data-warning" aria-label={t("shell.data")}>
            <p><span aria-hidden="true">⚠ </span>{t("shell.dataWarning")}</p>
          </section>
          {preferences.teaching && <p className="teaching">{t("shell.teachingNote")}</p>}
        </main>
      </div>
    </div>
  );
}

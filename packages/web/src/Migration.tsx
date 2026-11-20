import { useQuery } from "@tanstack/react-query";
import { migrationStatusSchema } from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { label, type Preferences } from "./ui/index.ts";
import "./theme/components.css";
import "./pages/migration.css";

export function Migration({ preferences }: { preferences: Preferences }) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const query = useQuery({
    queryKey: ["migration"],
    queryFn: ({ signal }) => masterRequest("/api/v1/migration", migrationStatusSchema, { signal }),
  });
  const run = query.data?.run;
  const report = run?.report;
  const compare = (expected: unknown, actual: unknown) => (
    <>
      <h4>{t("migration.expected")}</h4>
      <pre>{JSON.stringify(expected, null, 2)}</pre>
      <h4>{t("migration.actual")}</h4>
      <pre>{JSON.stringify(actual, null, 2)}</pre>
    </>
  );
  return (
    <section aria-labelledby="migration-title" className="migration-page">
      <h2 id="migration-title">{t("migration.title")}</h2>
      <p>{t("migration.readonly")}</p>
      {query.isPending && <p role="status">{t("master.loading")}</p>}
      {query.isError && (
        <p role="alert" className="message-bar danger">
          {t("master.error")}
        </p>
      )}
      {query.data && !run && <p className="card empty-state">{t("migration.empty")}</p>}
      {run && (
        <>
          <div className="card">
            <h3>{t("migration.run")}</h3>
            <span className="badge" data-tone={run.status}>
              {t(`migration.${run.status}`)}
            </span>
            <p>
              {run.id} · {run.createdAt}
            </p>
            <dl>
              <dt>{t("migration.baseline")}</dt>
              <dd>{run.baseline ?? "—"}</dd>
              <dt>{t("migration.reportSha")}</dt>
              <dd>{run.reportSha256 ?? "—"}</dd>
              <dt>{t("migration.confirmationSha")}</dt>
              <dd>{run.confirmationSha256 ?? "—"}</dd>
            </dl>
          </div>
          {!report ? (
            <p className="card empty-state">{t("migration.noReport")}</p>
          ) : (
            <>
              <h3 role="status" className="kpi" data-tone={report.verdict}>
                {t(`migration.${report.verdict}`)}
              </h3>
              {report.blockers.map((blocker) => (
                <p
                  role="alert"
                  className="message-bar danger"
                  key={`${blocker.company}:${blocker.account}`}
                >
                  {blocker.company} · {blocker.account} · {t("migration.openingRequired")}
                </p>
              ))}
              {report.differences.map((difference) => (
                <details key={`${difference.section}:${difference.key}`}>
                  <summary>
                    {t("migration.difference")} · {difference.section} · {difference.key}
                  </summary>
                  {compare(difference.expected, difference.actual)}
                </details>
              ))}
              <div className="card">
                <h3>{t("migration.known")}</h3>
                <dl>
                  <dt>{t("migration.knownSha")}</dt>
                  <dd>{report.knownDifferencesSha256}</dd>
                </dl>
                {report.knownDifferences.map((group) => (
                  <details
                    key={`${group.source}:${group.object}:${group.disposition}:${group.reasons.join()}`}
                  >
                    <summary>
                      {group.source} · {group.object} · {group.disposition} ({group.count})
                    </summary>
                    <p>{group.reasons.join(", ")}</p>
                    <pre>{group.legacyRefs.join("\n")}</pre>
                  </details>
                ))}
              </div>
              <div className="card">
                <h3>{t("migration.checks")}</h3>
                {report.checks.map((check) => (
                  <details key={check.section}>
                    <summary>{check.section}</summary>
                    {compare(check.expected, check.actual)}
                  </details>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

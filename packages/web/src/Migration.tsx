import { useQuery } from "@tanstack/react-query";
import { migrationStatusSchema } from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { label, type Preferences } from "./ui/index.ts";

export function Migration({ preferences }: { preferences: Preferences }) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const query = useQuery({
    queryKey: ["migration"],
    queryFn: ({ signal }) => masterRequest("/api/v1/migration", migrationStatusSchema, { signal }),
  });
  const run = query.data?.run;
  return (
    <section aria-labelledby="migration-title">
      <h2 id="migration-title">{t("migration.title")}</h2>
      <p>{t("migration.readonly")}</p>
      {query.isPending && <p role="status">{t("master.loading")}</p>}
      {query.isError && <p role="alert">{t("master.error")}</p>}
      {query.data && !run && <p>{t("migration.empty")}</p>}
      {run && (
        <>
          <h3>{t("migration.run")}</h3>
          <p>
            {run.id} · {run.createdAt} · {t(`migration.${run.status}`)}
          </p>
          <dl>
            <dt>{t("migration.baseline")}</dt>
            <dd>{run.baseline ?? "—"}</dd>
            <dt>{t("migration.reportSha")}</dt>
            <dd>{run.reportSha256 ?? "—"}</dd>
            <dt>{t("migration.confirmationSha")}</dt>
            <dd>{run.confirmationSha256 ?? "—"}</dd>
          </dl>
          {!run.report ? (
            <p>{t("migration.noReport")}</p>
          ) : (
            <>
              <h3 role="status">{t(`migration.${run.report.verdict}`)}</h3>
              {run.report.blockers.map((blocker) => (
                <p role="alert" key={`${blocker.company}:${blocker.account}`}>
                  {blocker.company} · {blocker.account} · {t("migration.openingRequired")}
                </p>
              ))}
              <dl>
                <dt>{t("migration.knownSha")}</dt>
                <dd>{run.report.knownDifferencesSha256}</dd>
              </dl>
              {run.report.differences.map((difference) => (
                <details key={`${difference.section}:${difference.key}`}>
                  <summary>
                    {t("migration.difference")} · {difference.section} · {difference.key}
                  </summary>
                  <h4>{t("migration.expected")}</h4>
                  <pre>{JSON.stringify(difference.expected, null, 2)}</pre>
                  <h4>{t("migration.actual")}</h4>
                  <pre>{JSON.stringify(difference.actual, null, 2)}</pre>
                </details>
              ))}
              <h3>{t("migration.known")}</h3>
              {run.report.knownDifferences.map((group) => (
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
              <h3>{t("migration.checks")}</h3>
              {run.report.checks.map((check) => (
                <details key={check.section}>
                  <summary>{check.section}</summary>
                  <h4>{t("migration.expected")}</h4>
                  <pre>{JSON.stringify(check.expected, null, 2)}</pre>
                  <h4>{t("migration.actual")}</h4>
                  <pre>{JSON.stringify(check.actual, null, 2)}</pre>
                </details>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

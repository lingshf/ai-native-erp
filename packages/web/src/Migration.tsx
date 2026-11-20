import { useQuery } from "@tanstack/react-query";
import { migrationStatusSchema } from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { label, type Preferences } from "./ui/index.ts";
import { PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { migrationDetail } from "./ui/migration-detail-labels.ts";
import "./theme/components.css";
import "./pages/migration.css";

type Row = Readonly<Record<string, string | number | null>>;
// null: the report says the row is absent; undefined: a check row shown without a counterpart.
type Pair = readonly [Row | null | undefined, Row | null | undefined];
// Only amount / quantity fields get a 差额; identifiers such as account codes keep "—".
const measure = /Minor$|_minor$|^(count|debit|credit)$/;
const integer = /^-?\d+$/;
const delta = (field: string, a: unknown, b: unknown) =>
  !measure.test(field)
    ? undefined
    : typeof a === "number" && typeof b === "number"
      ? b - a
      : typeof a === "string" && typeof b === "string" && integer.test(a) && integer.test(b)
        ? BigInt(b) - BigInt(a)
        : undefined;
const show = (value: unknown) => (value === undefined ? "—" : String(value));
// The response carries no business keys for check rows, so the two sides are listed one by one,
// never paired by position; only server-reported differences (same key) are compared.
const listChecks = (expected: Row[], actual: Row[]): Pair[] => [
  ...expected.map((row) => [row, undefined] as const),
  ...actual.map((row) => [undefined, row] as const),
];

export function Migration({ preferences }: { preferences: Preferences }) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const d = migrationDetail[preferences.language];
  const query = useQuery({
    queryKey: ["migration"],
    queryFn: ({ signal }) => masterRequest("/api/v1/migration", migrationStatusSchema, { signal }),
  });
  const run = query.data?.run;
  const report = run?.report;
  const compare = (expected: unknown, actual: unknown, pairs: Pair[]) => (
    <>
      {pairs.length > 0 && (
        <div className="grid-wrap scroll-hint">
          <table className="kv">
            <thead>
              <tr>
                <th>{d.field}</th>
                <th>{t("migration.expected")}</th>
                <th>{t("migration.actual")}</th>
                <th>{t("ledger.difference")}</th>
              </tr>
            </thead>
            {pairs.map(([left, right], index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows of one immutable report, never reordered
              <tbody key={index}>
                {[...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].map(
                  (field) => {
                    const a = left?.[field],
                      b = right?.[field],
                      change = delta(field, a, b),
                      off = a !== b && left !== undefined && right !== undefined;
                    return (
                      <tr key={field} data-mismatch={off || undefined}>
                        <th scope="row">
                          {field} {off && <strong className="mismatch">{d.mismatch}</strong>}
                        </th>
                        <td>{show(a)}</td>
                        <td>{show(b)}</td>
                        <td>
                          {change === undefined ? "—" : change > 0 ? `+${change}` : `${change}`}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <details>
        <summary>{d.raw}</summary>
        <h4>{t("migration.expected")}</h4>
        <pre>{JSON.stringify(expected, null, 2)}</pre>
        <h4>{t("migration.actual")}</h4>
        <pre>{JSON.stringify(actual, null, 2)}</pre>
      </details>
    </>
  );
  return (
    <section aria-label={t("migration.title")} className="migration-page">
      <PageHeader title={t("migration.title")} description={t("migration.readonly")} />
      <TeachingTip teaching={preferences.teaching} title={t("shell.teachingTitle")}>
        {d.teaching}
      </TeachingTip>
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
                  {compare(difference.expected, difference.actual, [
                    [difference.expected, difference.actual],
                  ])}
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
                    {compare(
                      check.expected,
                      check.actual,
                      listChecks(check.expected, check.actual),
                    )}
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

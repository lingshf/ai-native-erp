import type { AiDraftResultDto, JournalDraftDto } from "@erp/core/contracts";
import { resources, type Language } from "../ui/index.ts";
import { Badge, MessageBar, TeachingTip } from "../ui/components/index.tsx";
import type { T } from "./ai-text.ts";

type Issue = Extract<AiDraftResultDto, { status: "invalid" }>["issues"][number];

export function AiCandidate({
  t,
  language,
  teaching,
  disabled,
  candidate,
  lineKeys,
  adopt,
  dismiss,
}: {
  t: T;
  language: Language;
  teaching: boolean;
  disabled: boolean;
  candidate: AiDraftResultDto;
  lineKeys: string[];
  adopt: (draft: JournalDraftDto) => void;
  dismiss: () => void;
}) {
  function issueText(key: string) {
    if (key === "api.error.ai.candidate") return t("ai.candidate");
    if (key === "api.error.ai.explicitDimensions") return t("ai.explicitDimensions");
    const mapped = key.startsWith("api.error.dimensions.")
      ? "journal.rule.dimensions"
      : `journal.rule.${key.split(".").at(-1)}`;
    return (
      Object.entries(resources[language]).find(([name]) => name === mapped)?.[1] ?? t("ai.invalid")
    );
  }
  return (
    <article className="ai-result">
      <header>
        {candidate.draft && (
          <h4>
            {candidate.draft.date} · {candidate.draft.memo}
          </h4>
        )}
        {candidate.status === "candidate" ? (
          <Badge tone="info">{t("ai.candidateBadge")}</Badge>
        ) : (
          <Badge tone="danger">{t("ai.invalidBadge")}</Badge>
        )}
      </header>
      {candidate.status === "invalid" && (
        <CandidateIssues t={t} issues={candidate.issues} issueText={issueText} />
      )}
      {candidate.draft && <CandidateDraftTable t={t} draft={candidate.draft} lineKeys={lineKeys} />}
      <TeachingTip teaching={teaching} title={t("ai.rationale")}>
        {candidate.rationale}
      </TeachingTip>
      <MessageBar tone="info">{t("ai.replace")}</MessageBar>
      <div className="ui-form-actions">
        {candidate.status === "candidate" && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled}
            onClick={() => {
              adopt(candidate.draft);
              dismiss();
            }}
          >
            {t("ai.adopt")}
          </button>
        )}
        <button type="button" className="btn btn-subtle" onClick={dismiss}>
          {t("ai.discard")}
        </button>
      </div>
    </article>
  );
}

function CandidateIssues({
  t,
  issues,
  issueText,
}: {
  t: T;
  issues: Issue[];
  issueText: (key: string) => string;
}) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("ai.invalid")}
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.messageKey}`}>
            {issue.path}: {issueText(issue.messageKey)}
          </li>
        ))}
      </ul>
    </MessageBar>
  );
}

function CandidateDraftTable({
  t,
  draft,
  lineKeys,
}: {
  t: T;
  draft: JournalDraftDto;
  lineKeys: string[];
}) {
  return (
    <div className="grid-wrap">
      <table className="grid" aria-label={t("ai.draft")}>
        <thead>
          <tr>
            {(
              ["journal.account", "journal.debit", "journal.credit", "journal.dimensions"] as const
            ).map((key) => (
              <th
                key={key}
                scope="col"
                className={key === "journal.debit" || key === "journal.credit" ? "num" : undefined}
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, index) => (
            <tr key={lineKeys[index]}>
              <td>{line.account}</td>
              <td className="num">{line.debit}</td>
              <td className="num">{line.credit}</td>
              <td>
                {Object.entries(line.dimensions)
                  .map(([code, value]) => `${code}=${value}`)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

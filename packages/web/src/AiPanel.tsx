import { useEffect, useRef, useState } from "react";
import {
  aiDraftResultSchema,
  aiExplainResultSchema,
  type AiDraftResultDto,
  type JournalDraftDto,
} from "@erp/core/contracts";
import { label, resources, type LabelKey, type Language } from "./ui/index.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { Badge, MessageBar, TeachingTip } from "./ui/components/index.tsx";
export function AiPanel({
  company,
  month,
  language,
  teaching,
  disabled,
  adopt,
}: {
  company: string;
  month: string;
  language: Language;
  teaching: boolean;
  disabled: boolean;
  adopt: (draft: JournalDraftDto) => void;
}) {
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(language, key);
  const [prompt, setPrompt] = useState(""),
    [mode, setMode] = useState<"draft" | "explain">("draft");
  const [candidate, setCandidate] = useState<AiDraftResultDto | null>(null),
    [explanation, setExplanation] = useState<string | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(),
    [cancelled, setCancelled] = useState(false);
  const active = useRef<AbortController | null>(null);
  const lineKeys = useRef<string[]>([]);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  useEffect(() => {
    if (disabled || (!teaching && mode === "explain")) {
      active.current?.abort();
      active.current = null;
      setPending(false);
      setExplanation(null);
      setCandidate(null);
      if (!teaching) setMode("draft");
    }
  }, [disabled, teaching, mode]);
  function cancel() {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setCancelled(true);
  }
  async function send() {
    if (active.current || disabled || !/^\d{4}-\d\d$/u.test(month) || !prompt.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    setCancelled(false);
    setCandidate(null);
    setExplanation(null);
    try {
      const body = { company, month, prompt };
      if (mode === "draft") {
        const result = await masterRequest("/api/v1/ai/draft", aiDraftResultSchema, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        if (active.current === controller) {
          lineKeys.current = result.draft?.lines.map(() => crypto.randomUUID()) ?? [];
          setCandidate(result);
        }
      } else {
        const result = await masterRequest("/api/v1/ai/explain", aiExplainResultSchema, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        if (active.current === controller) setExplanation(result.text);
      }
    } catch (error) {
      if (active.current === controller) setError(error);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  const reason =
    error instanceof MasterDataFailure ? error.detail?.messageKey.split(".").at(-1) : undefined;
  const errorKey = (
    ["unavailable", "timeout", "cancelled", "busy", "response", "cleanup"] as const
  ).find((item) => item === reason);
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
  const idle = !pending && !cancelled && error === undefined && !candidate && explanation === null;
  return (
    <section className="card ai-panel" aria-label={t("ai.title")}>
      <header>
        <h3>{t("ai.title")}</h3>
      </header>
      <div className="body">
        <MessageBar tone="info">
          <strong>{t("ai.boundary")}</strong> {t("ai.disclosure")}
        </MessageBar>
        <div className="ai-form">
          <label className="ui-field">
            <span className="label">{t("ai.mode")}</span>
            <select
              disabled={pending || disabled}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value === "explain" ? "explain" : "draft");
                setCandidate(null);
                setExplanation(null);
                setError(undefined);
              }}
            >
              <option value="draft">{t("ai.draft")}</option>
              {teaching && <option value="explain">{t("ai.explain")}</option>}
            </select>
          </label>
          <label className="ui-field">
            <span className="label">{t("ai.prompt")}</span>
            <textarea
              maxLength={4000}
              value={prompt}
              disabled={pending || disabled}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
        </div>
        {!/^\d{4}-\d\d$/u.test(month) && <p className="jv-hint">{t("ai.month")}</p>}
        <div className="ui-form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || disabled || !prompt.trim() || !/^\d{4}-\d\d$/u.test(month)}
            onClick={() => void send()}
          >
            {t("ai.send")}
          </button>
          {pending && (
            <button type="button" className="btn btn-subtle" onClick={cancel}>
              {t("ai.cancel")}
            </button>
          )}
        </div>
        {pending && (
          <MessageBar tone="info" role="status">
            {t("ai.pending")}
          </MessageBar>
        )}
        {cancelled && (
          <MessageBar tone="info" role="status">
            {t("ai.cancelled")}
          </MessageBar>
        )}
        {error !== undefined && (
          <MessageBar tone="danger" role="alert">
            {t(errorKey ? `ai.${errorKey}` : "ai.error")}
          </MessageBar>
        )}
        {idle && <p className="empty-state">{t("ai.empty")}</p>}
        {candidate && (
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
              <MessageBar tone="danger" role="alert">
                {t("ai.invalid")}
                <ul>
                  {candidate.issues.map((issue) => (
                    <li key={`${issue.path}:${issue.messageKey}`}>
                      {issue.path}: {issueText(issue.messageKey)}
                    </li>
                  ))}
                </ul>
              </MessageBar>
            )}
            {candidate.draft && (
              <div className="grid-wrap">
                <table className="grid" aria-label={t("ai.draft")}>
                  <thead>
                    <tr>
                      {(
                        [
                          "journal.account",
                          "journal.debit",
                          "journal.credit",
                          "journal.dimensions",
                        ] as const
                      ).map((key) => (
                        <th
                          key={key}
                          scope="col"
                          className={
                            key === "journal.debit" || key === "journal.credit" ? "num" : undefined
                          }
                        >
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidate.draft.lines.map((line, index) => (
                      <tr key={lineKeys.current[index]}>
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
            )}
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
                    setCandidate(null);
                  }}
                >
                  {t("ai.adopt")}
                </button>
              )}
              <button type="button" className="btn btn-subtle" onClick={() => setCandidate(null)}>
                {t("ai.discard")}
              </button>
            </div>
          </article>
        )}
        {teaching && explanation !== null && (
          <article className="ai-result">
            <header>
              <h4>{t("ai.explain")}</h4>
            </header>
            <div className="explanation">{explanation}</div>
            <div className="ui-form-actions">
              <button type="button" className="btn btn-subtle" onClick={() => setExplanation(null)}>
                {t("ai.discard")}
              </button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

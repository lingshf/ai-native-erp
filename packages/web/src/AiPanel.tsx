import { useEffect, useRef, useState } from "react";
import {
  aiDraftResultSchema,
  aiExplainResultSchema,
  type AiDraftResultDto,
  type JournalDraftDto,
} from "@erp/core/contracts";
import { label, resources, type LabelKey, type Language } from "./ui/index.ts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
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
  return (
    <section className="ai-panel" aria-label={t("ai.title")}>
      <h3>{t("ai.title")}</h3>
      <p>{t("ai.disclosure")}</p>
      <label>
        {t("ai.mode")}
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
      <label>
        {t("ai.prompt")}
        <textarea
          maxLength={4000}
          value={prompt}
          disabled={pending || disabled}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      {!/^\d{4}-\d\d$/u.test(month) && <p>{t("ai.month")}</p>}
      <button
        type="button"
        disabled={pending || disabled || !prompt.trim() || !/^\d{4}-\d\d$/u.test(month)}
        onClick={() => void send()}
      >
        {t("ai.send")}
      </button>
      {pending && (
        <>
          <p role="status">{t("ai.pending")}</p>
          <button type="button" onClick={cancel}>
            {t("ai.cancel")}
          </button>
        </>
      )}
      {cancelled && <p role="status">{t("ai.cancelled")}</p>}
      {error !== undefined && <p role="alert">{t(errorKey ? `ai.${errorKey}` : "ai.error")}</p>}
      {candidate && (
        <div>
          {candidate.status === "invalid" && (
            <>
              <p role="alert">{t("ai.invalid")}</p>
              {candidate.issues.map((issue) => (
                <p key={`${issue.path}:${issue.messageKey}`}>
                  {issue.path}: {issueText(issue.messageKey)}
                </p>
              ))}
            </>
          )}
          {candidate.draft && (
            <>
              <h4>
                {candidate.draft.date} · {candidate.draft.memo}
              </h4>
              <table aria-label={t("ai.draft")}>
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
                      <th key={key} scope="col">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidate.draft.lines.map((line, index) => (
                    <tr key={lineKeys.current[index]}>
                      <td>{line.account}</td>
                      <td>{line.debit}</td>
                      <td>{line.credit}</td>
                      <td>
                        {Object.entries(line.dimensions)
                          .map(([code, value]) => `${code}=${value}`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {teaching && <p className="explanation">{candidate.rationale}</p>}
          <p>{t("ai.replace")}</p>
          {candidate.status === "candidate" && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                adopt(candidate.draft);
                setCandidate(null);
              }}
            >
              {t("ai.adopt")}
            </button>
          )}
          <button type="button" onClick={() => setCandidate(null)}>
            {t("ai.discard")}
          </button>
        </div>
      )}
      {teaching && explanation !== null && (
        <div className="explanation">
          {explanation}
          <button type="button" onClick={() => setExplanation(null)}>
            {t("ai.discard")}
          </button>
        </div>
      )}
    </section>
  );
}

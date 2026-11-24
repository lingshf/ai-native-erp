import type { T } from "./ai-text.ts";

export function AiExplanation({
  t,
  explanation,
  dismiss,
}: {
  t: T;
  explanation: string;
  dismiss: () => void;
}) {
  return (
    <article className="ai-result">
      <header>
        <h4>{t("ai.explain")}</h4>
      </header>
      <div className="explanation">{explanation}</div>
      <div className="ui-form-actions">
        <button type="button" className="btn btn-subtle" onClick={dismiss}>
          {t("ai.discard")}
        </button>
      </div>
    </article>
  );
}

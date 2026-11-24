import type { JournalDraftDto } from "@erp/core/contracts";
import { label, type LabelKey, type Language } from "./ui/index.ts";
import { MessageBar } from "./ui/components/index.tsx";
import { AiCandidate } from "./ai-panel/ai-candidate.tsx";
import { AiExplanation } from "./ai-panel/ai-explanation.tsx";
import { AiForm, AiSendActions } from "./ai-panel/ai-form.tsx";
import { AiErrorBar, AiStatusBar } from "./ai-panel/ai-status-bars.tsx";
import { useAiRequest } from "./ai-panel/use-ai-request.ts";

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
  const ai = useAiRequest({ company, month, teaching, disabled });
  const idle =
    !ai.pending &&
    !ai.cancelled &&
    ai.error === undefined &&
    !ai.candidate &&
    ai.explanation === null;
  return (
    <section className="card ai-panel" aria-label={t("ai.title")}>
      <header>
        <h3>{t("ai.title")}</h3>
      </header>
      <div className="body">
        <MessageBar tone="info">
          <strong>{t("ai.boundary")}</strong> {t("ai.disclosure")}
        </MessageBar>
        <AiForm
          t={t}
          teaching={teaching}
          disabled={ai.pending || disabled}
          mode={ai.mode}
          prompt={ai.prompt}
          changeMode={ai.changeMode}
          changePrompt={ai.setPrompt}
        />
        {!ai.monthValid && <p className="jv-hint">{t("ai.month")}</p>}
        <AiSendActions
          t={t}
          pending={ai.pending}
          sendDisabled={ai.pending || disabled || !ai.prompt.trim() || !ai.monthValid}
          send={ai.send}
          cancel={ai.cancel}
        />
        {ai.pending && <AiStatusBar>{t("ai.pending")}</AiStatusBar>}
        {ai.cancelled && <AiStatusBar>{t("ai.cancelled")}</AiStatusBar>}
        {ai.error !== undefined && <AiErrorBar t={t} error={ai.error} />}
        {idle && <p className="empty-state">{t("ai.empty")}</p>}
        {ai.candidate && (
          <AiCandidate
            t={t}
            language={language}
            teaching={teaching}
            disabled={disabled}
            candidate={ai.candidate}
            lineKeys={ai.lineKeys.current}
            adopt={adopt}
            dismiss={() => ai.setCandidate(null)}
          />
        )}
        {teaching && ai.explanation !== null && (
          <AiExplanation
            t={t}
            explanation={ai.explanation}
            dismiss={() => ai.setExplanation(null)}
          />
        )}
      </div>
    </section>
  );
}

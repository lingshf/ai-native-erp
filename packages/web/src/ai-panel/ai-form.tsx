import type { T } from "./ai-text.ts";

type AiMode = "draft" | "explain";

export function AiForm({
  t,
  teaching,
  disabled,
  mode,
  prompt,
  changeMode,
  changePrompt,
}: {
  t: T;
  teaching: boolean;
  disabled: boolean;
  mode: AiMode;
  prompt: string;
  changeMode: (mode: AiMode) => void;
  changePrompt: (prompt: string) => void;
}) {
  return (
    <div className="ai-form">
      <label className="ui-field">
        <span className="label">{t("ai.mode")}</span>
        <select
          disabled={disabled}
          value={mode}
          onChange={(event) => changeMode(event.target.value === "explain" ? "explain" : "draft")}
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
          disabled={disabled}
          onChange={(event) => changePrompt(event.target.value)}
        />
      </label>
    </div>
  );
}

export function AiSendActions({
  t,
  pending,
  sendDisabled,
  send,
  cancel,
}: {
  t: T;
  pending: boolean;
  sendDisabled: boolean;
  send: () => Promise<void>;
  cancel: () => void;
}) {
  return (
    <div className="ui-form-actions">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={sendDisabled}
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
  );
}

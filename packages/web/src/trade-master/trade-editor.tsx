import { FastTab } from "../ui/components/index.tsx";
import { TradeEditorActions } from "./trade-editor-actions.tsx";
import { TradeField } from "./trade-field.tsx";
import type { TradeEditorProps } from "./trade-master-types.ts";
import { useTradeEditor } from "./use-trade-editor.ts";

export function TradeEditor(props: TradeEditorProps) {
  const { kind, initial, t } = props;
  const editor = useTradeEditor(props);
  const { error, busy, uncertain } = editor;
  return (
    <form className="ui-master-editor" onSubmit={editor.submit}>
      <FastTab
        id="trade-editor"
        title={t("trade.editor")}
        summary={initial ? `${t("trade.edit")} · ${initial.code}` : t("trade.new")}
      >
        <p className="ui-hint">{t("trade.nullHint")}</p>
        {kind === "tradeProfile" && <p className="ui-hint">{t("trade.discountHint")}</p>}
        {kind === "taxCode" && <p className="ui-hint">{t("trade.rateHint")}</p>}
        {(busy || uncertain) && (
          <p role="status">{t(uncertain ? "trade.uncertain" : "master.saving")}</p>
        )}
        {uncertain && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={editor.reconcile}
          >
            {t("trade.reconcile")}
          </button>
        )}
        <fieldset disabled={busy || uncertain} className="ui-form-grid">
          <div className="ui-field">
            <label htmlFor="trade-code">{t("trade.code")}</label>
            <input
              id="trade-code"
              value={editor.code}
              disabled={Boolean(initial)}
              required
              onChange={(event) => editor.setCode(event.target.value)}
            />
          </div>
          {editor.fields.map((field) => (
            <TradeField
              key={field}
              field={field}
              draft={editor.draft}
              setDraft={editor.setDraft}
              error={error}
              t={t}
            />
          ))}
          <label className="ui-check" htmlFor="trade-active">
            <input
              id="trade-active"
              type="checkbox"
              checked={editor.active}
              onChange={(event) => editor.setActive(event.target.checked)}
            />
            {t("master.active")}
          </label>
          {error && (
            <p role="alert" id="trade-error" className="ui-master-error ui-master-wide">
              {error.path}: {t(error.key)}
            </p>
          )}
          <TradeEditorActions error={error} reload={editor.reload} cancel={editor.cancel} t={t} />
        </fieldset>
      </FastTab>
    </form>
  );
}

import { FastTab } from "../ui/components/index.tsx";
import { DraftField, type ActionView } from "./action-fields.tsx";

const kinds = ["advance", "credit", "apply", "cancel", "reverse"] as const;
const dates = ["accountingDate", "documentDate", "taxDate"] as const;

export function ActionGeneralTab({ view, locked }: { view: ActionView; locked: boolean }) {
  const { t, draft, change } = view;
  return (
    <FastTab id="tadj-general" title={t("master.general")}>
      <fieldset disabled={locked} className="ui-form-grid">
        <div className="ui-field">
          <label htmlFor="tadj-kind">{t("tadj.kind")}</label>
          <select
            id="tadj-kind"
            value={draft.kind}
            onChange={(e) => {
              const kind = kinds.find((kind) => kind === e.target.value);
              if (kind)
                change({
                  kind,
                  actionId: crypto.randomUUID(),
                  sourceId: "",
                  targetId: "",
                });
            }}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`tadj.${kind}`)}
              </option>
            ))}
          </select>
        </div>
        {dates.map((field) => (
          <DraftField
            key={field}
            view={view}
            field={field}
            label={t(`tinv.${field}`)}
            type="date"
          />
        ))}
        {draft.kind === "advance" && (
          <>
            <div className="ui-field">
              <label htmlFor="tadj-side">{t("trade.side")}</label>
              <select
                id="tadj-side"
                value={draft.side}
                onChange={(e) => change({ side: e.target.value === "AR" ? "AR" : "AP" })}
              >
                <option value="AP">{t("trade.AP")}</option>
                <option value="AR">{t("trade.AR")}</option>
              </select>
            </div>
            <DraftField view={view} field="party" label={t("tinv.party")} />
          </>
        )}
      </fieldset>
    </FastTab>
  );
}

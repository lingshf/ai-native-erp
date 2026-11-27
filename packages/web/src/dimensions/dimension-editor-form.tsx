import type { DimensionDto } from "@erp/core/contracts";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { FastTab, MessageBar } from "../ui/components/index.tsx";
import { type Draft, type DraftField, jsonFields } from "./dimension-draft.ts";
import { DimensionField } from "./dimension-field.tsx";
import type { Failure } from "./dimension-failure.tsx";
import type { Kind, T } from "./dimension-types.ts";

type EditorFormProps = {
  fields: readonly DraftField[];
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  error: Failure | null;
  busy: boolean;
  kind: Kind;
  initial: DimensionDto | null;
  t: T;
  close: () => void;
  onSubmit: (event: FormEvent) => void;
  onReload: () => void;
};

export function DimensionEditorForm({
  fields,
  draft,
  setDraft,
  error,
  busy,
  kind,
  initial,
  t,
  close,
  onSubmit,
  onReload,
}: EditorFormProps) {
  return (
    <form className="ui-master-editor" onSubmit={onSubmit}>
      <FastTab
        id="dim-editor"
        title={t("dim.editor")}
        summary={initial ? `${t("dim.edit")} · ${initial.code}` : t("dim.new")}
      >
        <fieldset disabled={busy} className="ui-form-grid">
          {fields.map((field) => (
            <DimensionField
              key={field}
              field={field}
              fieldValue={draft[field]}
              setDraft={setDraft}
              error={error}
              kind={kind}
              initial={initial}
              t={t}
            />
          ))}
          <label className="ui-check">
            <input
              type="checkbox"
              checked={draft.active === "true"}
              onChange={(event) =>
                setDraft((value) => ({ ...value, active: String(event.target.checked) }))
              }
            />
            {t("master.active")}
          </label>
          {fields.some((field) => jsonFields.has(field)) && (
            <p className="ui-hint ui-master-wide">{t("dim.jsonHint")}</p>
          )}
          <div className="ui-form-actions ui-master-wide">
            <button type="submit" className="btn btn-primary">
              {t(busy ? "master.saving" : "dim.save")}
            </button>
          </div>
        </fieldset>
        <div className="ui-form-actions">
          <button type="button" className="btn btn-subtle" onClick={close}>
            {t("master.cancel")}
          </button>
          {error?.conflict && (
            <button type="button" className="btn btn-secondary" onClick={onReload}>
              {t("master.reload")}
            </button>
          )}
        </div>
        {error && !fields.some((field) => field === error.path.split(".")[0]) && (
          <MessageBar tone="danger" role="alert">
            {error.path}: {t(error.key)}
          </MessageBar>
        )}
      </FastTab>
    </form>
  );
}

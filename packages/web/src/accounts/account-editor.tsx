import type { AccountCommand } from "@erp/core/contracts";
import { FastTab, MessageBar } from "../ui/components/index.tsx";
import { AccountFields } from "./account-fields.tsx";
import { failure, type T } from "./account-messages.ts";
import { useAccountEditor } from "./use-account-editor.ts";

export function AccountEditor({
  initial,
  t,
  cancel,
  saved,
}: {
  initial: AccountCommand;
  t: T;
  cancel: () => void;
  saved: () => void;
}) {
  const { draft, error, busy, patch, submit, changeChoice } = useAccountEditor(initial, saved);
  return (
    <FastTab
      id="account-editor"
      title={t("master.general")}
      summary={initial.revision === 0 ? t("master.new") : `${initial.code} · ${initial.name}`}
    >
      <form className="acct-form" onSubmit={(event) => void submit(event)}>
        <AccountFields
          busy={busy}
          draft={draft}
          error={error}
          patch={patch}
          changeChoice={changeChoice}
          revision={initial.revision}
          t={t}
        />
        <AccountEditorActions busy={busy} cancel={cancel} t={t} />
        {error !== undefined && <AccountSaveError error={error} saved={saved} t={t} />}
      </form>
    </FastTab>
  );
}
function AccountEditorActions({ busy, cancel, t }: { busy: boolean; cancel: () => void; t: T }) {
  return (
    <div className="ui-form-actions">
      {/* Outside the fieldset only for layout; still disabled exactly while busy. */}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {t(busy ? "master.saving" : "master.save")}
      </button>
      <button type="button" className="btn btn-subtle" onClick={cancel}>
        {t("master.cancel")}
      </button>
    </div>
  );
}
function AccountSaveError({ error, saved, t }: { error: unknown; saved: () => void; t: T }) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{t(failure(error))}</p>
      {failure(error) === "master.conflict" && (
        <button type="button" className="btn btn-secondary" onClick={saved}>
          {t("master.reload")}
        </button>
      )}
    </MessageBar>
  );
}

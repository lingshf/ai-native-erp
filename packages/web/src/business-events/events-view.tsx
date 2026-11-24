import type { Language } from "../ui/index.ts";
import { fresh, openEvent, preview } from "./event-commands.ts";
import { EventEditor } from "./editors.tsx";
import { PageTable, pageKey } from "./list.tsx";
import type { T } from "./types.ts";
import type { CompanyEventsState } from "./use-company-events.ts";
type ViewProps = { state: CompanyEventsState; t: T };
export function ViewSwitch({ state, t }: ViewProps) {
  const { view, setView, setError, editing, busy } = state;
  return (
    <div className="toolbar-row">
      <div className="segmented">
        {(["events", "settings", "queue"] as const).map((item) => (
          <button
            key={item}
            type="button"
            disabled={editing || busy}
            aria-pressed={view === item}
            onClick={() => {
              setView(item);
              setError(undefined);
            }}
          >
            {t(item === "events" ? "business.title" : `business.${item}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
export function EventsView({ state, t, language }: ViewProps & { language: Language }) {
  const { company, listing, draft, setDraft, review, setError, editing, busy, dimensionKeys } =
    state;
  return (
    <>
      <div className="toolbar-row">
        {(["cash_service", "statistics", "clearing.match"] as const).map((operation) => (
          <button
            type="button"
            className="btn btn-secondary"
            key={operation}
            disabled={editing || busy}
            onClick={() => fresh(state, operation)}
          >
            {t("business.new")} · {t(`business.${operation}`)}
          </button>
        ))}
      </div>
      <PageTable
        page={listing}
        t={t}
        refreshKey={pageKey(company.code, "events")}
        title={t("business.title")}
        header={[t("journal.sourceRef"), t("journal.date"), t("business.title"), ""]}
        render={(item) => (
          <>
            <td>{item.sourceRef}</td>
            <td>{item.date}</td>
            <td>
              {t(`business.${item.operation}`)} · {t(`business.${item.status}`)}
            </td>
            <td>
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                disabled={editing || busy}
                onClick={() => void openEvent(state, item.id)}
              >
                {t("journal.view")}
              </button>
            </td>
          </>
        )}
      />
      {draft && (
        <EventEditor
          event={draft}
          company={company}
          t={t}
          language={language}
          dimensionKeys={dimensionKeys}
          change={setDraft}
          busy={busy || Boolean(review)}
          preview={() => void preview(state)}
          close={() => {
            setDraft(null);
            setError(undefined);
          }}
        />
      )}
    </>
  );
}

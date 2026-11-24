import type { CompanyDto } from "@erp/core/contracts";
import { label, type Language } from "../ui/index.ts";
import { BusinessError } from "./business-error.tsx";
import { EventDetail } from "./event-detail.tsx";
import { ReviewDialog, WithdrawDialog } from "./event-dialogs.tsx";
import { EventsView, ViewSwitch } from "./events-view.tsx";
import { PageControls } from "./list.tsx";
import { QueueView } from "./queue-view.tsx";
import { BusinessSettings } from "./settings.tsx";
import type { T } from "./types.ts";
import { useCompanyEvents } from "./use-company-events.ts";
export function CompanyEvents({
  company,
  language,
  lock,
  initialId,
  initialQueue,
}: {
  company: CompanyDto;
  language: Language;
  lock: (value: boolean) => void;
  initialId: string | null;
  initialQueue: boolean;
}) {
  const t: T = (key) => label(language, key),
    state = useCompanyEvents({ company, lock, initialId, initialQueue });
  const { view, review, detail, withdraw, busy, error, dimensions } = state;
  return (
    <>
      <ViewSwitch state={state} t={t} />
      {error !== undefined && !review && !withdraw && <BusinessError error={error} t={t} />}
      {busy && <p role="status">{t("journal.pending")}</p>}
      {view === "settings" && (
        <BusinessSettings
          company={company}
          t={t}
          dimensionKeys={state.dimensionKeys}
          lock={state.setConfigEditing}
        />
      )}
      {view === "events" && <EventsView state={state} t={t} language={language} />}
      {view === "queue" && <QueueView state={state} t={t} />}
      {detail && <EventDetail detail={detail} state={state} t={t} language={language} />}
      {review && <ReviewDialog review={review} state={state} t={t} language={language} />}
      {withdraw && <WithdrawDialog withdraw={withdraw} state={state} t={t} />}
      <PageControls page={dimensions} t={t} />
    </>
  );
}

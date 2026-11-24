import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { TradePeriodAdmission } from "./TradePeriodAdmission.tsx";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { CloseWizard } from "./period-close/close-wizard.tsx";
import { usePeriodSelection } from "./period-close/use-period-selection.ts";
import { PeriodPicker } from "./period-close/period-picker.tsx";
import {
  AdmissionSavedNotice,
  InvalidSelectionNotice,
  PeriodLoadError,
} from "./period-close/period-notices.tsx";
import { PeriodTable } from "./period-close/period-table.tsx";
import "./pages/period-close.css";
export function PeriodClose({ preferences }: { preferences: Preferences }) {
  const selection = usePeriodSelection();
  const { setParams, companies, company, periods, months, period, held, error } = selection;
  const { locked, admissionLocked, setAdmissionLocked, admissionSaved, setAdmissionSaved } =
    selection;
  const { lock, selectedCompany, selectedPeriod } = selection;
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(preferences.language, key);
  return (
    <section className="page period-close">
      <PageHeader
        title={t("close.title")}
        description={t("close.description")}
        context={<PeriodPicker t={t} selection={selection} />}
      />
      <MessageBar tone="info">{t("close.note")}</MessageBar>
      {error && <PeriodLoadError t={t} companies={companies} periods={periods} />}
      {!held && !companies.isPending && (!company || (!periods.isPending && !period)) && (
        <InvalidSelectionNotice t={t} />
      )}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("close.teaching")}
      </TeachingTip>
      {selectedCompany && selectedPeriod && (
        <fieldset disabled={admissionLocked} aria-label={t("close.title")}>
          <CloseWizard
            key={`${selectedCompany.code}:${selectedPeriod.month}`}
            company={selectedCompany}
            period={selectedPeriod}
            preferences={preferences}
            setLocked={lock}
            next={(month) => {
              lock(false);
              setParams({ company: selectedCompany.code, month });
            }}
          />
        </fieldset>
      )}
      {selectedCompany && selectedPeriod && (
        <TradePeriodAdmission
          key={`admission:${selectedCompany.code}:${selectedPeriod.month}:${selectedPeriod.revision}`}
          company={selectedCompany.code}
          period={selectedPeriod}
          preferences={preferences}
          lock={setAdmissionLocked}
          disabled={locked}
          onSaved={() =>
            setAdmissionSaved({ company: selectedCompany.code, month: selectedPeriod.month })
          }
        />
      )}
      {!admissionLocked &&
        admissionSaved?.company === selectedCompany?.code &&
        admissionSaved?.month === selectedPeriod?.month && <AdmissionSavedNotice t={t} />}
      {months.length > 0 && <PeriodTable t={t} months={months} selectedPeriod={selectedPeriod} />}
    </section>
  );
}

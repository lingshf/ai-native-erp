import type { BusinessMasterDto, CompanyDto } from "@erp/core/contracts";
import { EventField, type EventFieldsProps, type EventOf } from "./event-editor-fields.tsx";
import { PageControls, type usePage } from "./list.tsx";
type MastersPage = ReturnType<typeof usePage<BusinessMasterDto>>;
export function CashServiceFields({
  event,
  t,
  change,
  company,
  services,
  parties,
}: EventFieldsProps<EventOf<"cash_service">> & {
  company: CompanyDto;
  services: MastersPage;
  parties: MastersPage;
}) {
  return (
    <>
      <EventField label={t("business.direction")}>
        <select
          value={event.direction}
          onChange={(e) => {
            if (e.target.value === "receive" || e.target.value === "pay")
              change({ ...event, direction: e.target.value });
          }}
        >
          <option value="receive">{t("business.receive")}</option>
          <option value="pay">{t("business.pay")}</option>
        </select>
      </EventField>
      <EventField label={t("business.service")}>
        <input
          required
          list="business-services"
          value={event.service}
          onChange={(e) => change({ ...event, service: e.target.value })}
        />
      </EventField>
      <datalist id="business-services">
        {services.data?.pages
          .flatMap((p) => p.items)
          .map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
      </datalist>
      <PageControls page={services} t={t} />
      <EventField label={t("business.party")}>
        <input
          list="business-parties"
          value={event.party ?? ""}
          onChange={(e) => change({ ...event, party: e.target.value || null })}
        />
      </EventField>
      <datalist id="business-parties">
        {parties.data?.pages
          .flatMap((p) => p.items)
          .map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
      </datalist>
      <PageControls page={parties} t={t} />
      <EventField
        label={
          <>
            {t("business.amount")} · {company.currency}
          </>
        }
      >
        <input
          required
          inputMode="decimal"
          maxLength={40}
          value={event.amount}
          onChange={(e) => change({ ...event, amount: e.target.value })}
        />
      </EventField>
    </>
  );
}

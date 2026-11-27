import type { ReactNode } from "react";
import type { BusinessEventDto } from "@erp/core/contracts";
import { DimensionFields } from "../journals/dialogs.tsx";
import type { T } from "./types.ts";
export type EventOf<Operation extends BusinessEventDto["operation"]> = Extract<
  BusinessEventDto,
  { operation: Operation }
>;
export type EventFieldsProps<Event extends BusinessEventDto> = {
  event: Event;
  t: T;
  change: (event: BusinessEventDto) => void;
};
export function EventField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: every caller nests its input or select as children
    <label className="ui-field">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
export function EventCommonFields({ event, t, change }: EventFieldsProps<BusinessEventDto>) {
  return (
    <>
      <EventField label={t("journal.sourceRef")}>
        <input
          required
          maxLength={100}
          value={event.sourceRef}
          onChange={(e) => change({ ...event, sourceRef: e.target.value })}
        />
      </EventField>
      <EventField label={t("journal.date")}>
        <input
          required
          type="date"
          value={event.date}
          onChange={(e) => change({ ...event, date: e.target.value })}
        />
      </EventField>
      <EventField label={t("journal.memo")}>
        <input
          required
          maxLength={200}
          value={event.memo}
          onChange={(e) => change({ ...event, memo: e.target.value })}
        />
      </EventField>
    </>
  );
}
export function StatisticsFields({ event, t, change }: EventFieldsProps<EventOf<"statistics">>) {
  return (
    <>
      <EventField label={t("business.code")}>
        <input
          required
          value={event.code}
          onChange={(e) => change({ ...event, code: e.target.value })}
        />
      </EventField>
      <EventField label={t("business.quantity")}>
        <input
          required
          inputMode="decimal"
          maxLength={40}
          value={event.quantity}
          onChange={(e) => change({ ...event, quantity: e.target.value })}
        />
      </EventField>
      <EventField label={t("business.unit")}>
        <input
          required
          maxLength={40}
          value={event.unit}
          onChange={(e) => change({ ...event, unit: e.target.value })}
        />
      </EventField>
    </>
  );
}
export function EventDimensions({
  event,
  t,
  change,
  dimensionKeys,
}: EventFieldsProps<EventOf<"cash_service" | "statistics">> & {
  dimensionKeys: string[];
}) {
  return (
    <>
      <p className="jv-hint">{t("journal.dimensionHelp")}</p>
      <DimensionFields
        title={t("journal.dimensions")}
        keys={[...new Set([...dimensionKeys, ...Object.keys(event.dimensions)])]}
        value={event.dimensions}
        change={(dimensions) => change({ ...event, dimensions })}
      />
    </>
  );
}
export function ReversalOriginal({ event, t }: { event: EventOf<"cash_service.cancel">; t: T }) {
  return (
    <p>
      {t("business.original")}: {event.originalId}
    </p>
  );
}
export function EventActions({ t, close }: { t: T; close: () => void }) {
  return (
    <div className="ui-form-actions">
      <button type="submit" className="btn btn-primary">
        {t("journal.preview")}
      </button>
      <button type="button" className="btn btn-subtle" onClick={close}>
        {t("journal.cancel")}
      </button>
    </div>
  );
}

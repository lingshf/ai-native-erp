import { useEffect, useRef } from "react";
import {
  businessMastersPageSchema,
  type CompanyDto,
  type BusinessEventDto,
} from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { ClearingEditor } from "./clearing-editor.tsx";
import { CashServiceFields } from "./event-editor-cash.tsx";
import {
  EventActions,
  EventCommonFields,
  EventDimensions,
  ReversalOriginal,
  StatisticsFields,
} from "./event-editor-fields.tsx";
import { usePage } from "./list.tsx";
import type { T } from "./types.ts";
type EventEditorProps = {
  event: BusinessEventDto;
  company: CompanyDto;
  t: T;
  language: Language;
  dimensionKeys: string[];
  change: (event: BusinessEventDto) => void;
  busy: boolean;
  preview: () => void;
  close: () => void;
};
export function EventEditor({
  event,
  company,
  t,
  language,
  dimensionKeys,
  change,
  busy,
  preview,
  close,
}: EventEditorProps) {
  const form = useRef<HTMLFormElement>(null);
  const services = usePage(
      "services",
      company.code,
      businessMastersPageSchema,
      "",
      event.operation === "cash_service",
    ),
    parties = usePage(
      "parties",
      company.code,
      businessMastersPageSchema,
      "",
      event.operation === "cash_service",
    );
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  return (
    <form
      ref={form}
      onSubmit={(submit) => {
        submit.preventDefault();
        if (!busy) preview();
      }}
      onKeyDown={(key) => {
        if (key.key === "Enter" && (key.ctrlKey || key.metaKey)) {
          key.preventDefault();
          if (!busy) key.currentTarget.requestSubmit();
        }
      }}
    >
      <fieldset className="ui-form-grid jv-event" disabled={busy}>
        <legend className="jv-legend">{t(`business.${event.operation}`)}</legend>
        <EventCommonFields event={event} t={t} change={change} />
        {event.operation === "cash_service" && (
          <CashServiceFields
            event={event}
            t={t}
            change={change}
            company={company}
            services={services}
            parties={parties}
          />
        )}
        {event.operation === "statistics" && (
          <StatisticsFields event={event} t={t} change={change} />
        )}
        {(event.operation === "cash_service" || event.operation === "statistics") && (
          <EventDimensions event={event} t={t} change={change} dimensionKeys={dimensionKeys} />
        )}
        {event.operation === "cash_service.cancel" && <ReversalOriginal event={event} t={t} />}
        {event.operation === "clearing.match" && (
          <ClearingEditor
            event={event}
            company={company}
            t={t}
            language={language}
            change={change}
          />
        )}
        <EventActions t={t} close={close} />
      </fieldset>
    </form>
  );
}

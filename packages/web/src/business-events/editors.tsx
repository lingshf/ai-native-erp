import { useEffect, useRef, useState } from "react";
import {
  businessMastersPageSchema,
  openClearingPageSchema,
  type CompanyDto,
  type BusinessEventDto,
} from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { DimensionFields } from "../journals/dialogs.tsx";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { formatMinor } from "../reports-data.ts";
import { PageControls, PageTable, usePage } from "./list.tsx";
import type { T } from "./types.ts";
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
}: {
  event: BusinessEventDto;
  company: CompanyDto;
  t: T;
  language: Language;
  dimensionKeys: string[];
  change: (event: BusinessEventDto) => void;
  busy: boolean;
  preview: () => void;
  close: () => void;
}) {
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
        <label className="ui-field">
          <span className="label">{t("journal.sourceRef")}</span>
          <input
            required
            maxLength={100}
            value={event.sourceRef}
            onChange={(e) => change({ ...event, sourceRef: e.target.value })}
          />
        </label>
        <label className="ui-field">
          <span className="label">{t("journal.date")}</span>
          <input
            required
            type="date"
            value={event.date}
            onChange={(e) => change({ ...event, date: e.target.value })}
          />
        </label>
        <label className="ui-field">
          <span className="label">{t("journal.memo")}</span>
          <input
            required
            maxLength={200}
            value={event.memo}
            onChange={(e) => change({ ...event, memo: e.target.value })}
          />
        </label>
        {event.operation === "cash_service" && (
          <>
            <label className="ui-field">
              <span className="label">{t("business.direction")}</span>
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
            </label>
            <label className="ui-field">
              <span className="label">{t("business.service")}</span>
              <input
                required
                list="business-services"
                value={event.service}
                onChange={(e) => change({ ...event, service: e.target.value })}
              />
            </label>
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
            <label className="ui-field">
              <span className="label">{t("business.party")}</span>
              <input
                list="business-parties"
                value={event.party ?? ""}
                onChange={(e) => change({ ...event, party: e.target.value || null })}
              />
            </label>
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
            <label className="ui-field">
              <span className="label">
                {t("business.amount")} · {company.currency}
              </span>
              <input
                required
                inputMode="decimal"
                maxLength={40}
                value={event.amount}
                onChange={(e) => change({ ...event, amount: e.target.value })}
              />
            </label>
          </>
        )}
        {event.operation === "statistics" && (
          <>
            <label className="ui-field">
              <span className="label">{t("business.code")}</span>
              <input
                required
                value={event.code}
                onChange={(e) => change({ ...event, code: e.target.value })}
              />
            </label>
            <label className="ui-field">
              <span className="label">{t("business.quantity")}</span>
              <input
                required
                inputMode="decimal"
                maxLength={40}
                value={event.quantity}
                onChange={(e) => change({ ...event, quantity: e.target.value })}
              />
            </label>
            <label className="ui-field">
              <span className="label">{t("business.unit")}</span>
              <input
                required
                maxLength={40}
                value={event.unit}
                onChange={(e) => change({ ...event, unit: e.target.value })}
              />
            </label>
          </>
        )}
        {(event.operation === "cash_service" || event.operation === "statistics") && (
          <>
            <p className="jv-hint">{t("journal.dimensionHelp")}</p>
            <DimensionFields
              title={t("journal.dimensions")}
              keys={[...new Set([...dimensionKeys, ...Object.keys(event.dimensions)])]}
              value={event.dimensions}
              change={(dimensions) => change({ ...event, dimensions })}
            />
          </>
        )}
        {event.operation === "cash_service.cancel" && (
          <p>
            {t("business.original")}: {event.originalId}
          </p>
        )}
        {event.operation === "clearing.match" && (
          <ClearingEditor
            event={event}
            company={company}
            t={t}
            language={language}
            change={change}
          />
        )}
        <div className="ui-form-actions">
          <button type="submit" className="btn btn-primary">
            {t("journal.preview")}
          </button>
          <button type="button" className="btn btn-subtle" onClick={close}>
            {t("journal.cancel")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
function ClearingEditor({
  event,
  company,
  t,
  language,
  change,
}: {
  event: Extract<BusinessEventDto, { operation: "clearing.match" }>;
  company: CompanyDto;
  t: T;
  language: Language;
  change: (event: BusinessEventDto) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    valid = /^[1-9]\d{3}$/u.test(event.account) && /^\d{4}-\d\d-\d\d$/u.test(event.date);
  const page = usePage(
    "events/open-items",
    company.code,
    openClearingPageSchema,
    `&account=${encodeURIComponent(event.account)}&date=${encodeURIComponent(event.date)}`,
    enabled && valid,
  );
  return (
    <>
      <label>
        {t("journal.account")}
        <input
          required
          pattern="[1-9][0-9]{3}"
          value={event.account}
          onChange={(e) => change({ ...event, account: e.target.value, lines: [] })}
        />
      </label>
      <p>{t("business.clearHelp")}</p>
      <button
        className="jv-btn"
        type="button"
        disabled={!valid}
        onClick={() => {
          setEnabled(true);
          if (enabled) void page.refetch();
        }}
      >
        {t("business.openItems")}
      </button>
      {enabled && valid && (
        <PageTable
          page={page}
          t={t}
          title={t("business.openItems")}
          header={[t("journal.original"), t("journal.debit"), t("journal.credit"), ""]}
          render={(line) => (
            <>
              <td>
                {line.entryId} / {line.lineNo} · {line.date} · {line.memo}
              </td>
              <td>{formatMinor(line.debit, language, company.scale)}</td>
              <td>{formatMinor(line.credit, language, company.scale)}</td>
              <td>
                <label>
                  {t("business.select")}
                  <input
                    type="checkbox"
                    className="jv-check"
                    checked={event.lines.some(
                      (item) => item.entryId === line.entryId && item.lineNo === line.lineNo,
                    )}
                    onChange={(e) =>
                      change({
                        ...event,
                        lines: e.target.checked
                          ? [...event.lines, { entryId: line.entryId, lineNo: line.lineNo }]
                          : event.lines.filter(
                              (item) =>
                                item.entryId !== line.entryId || item.lineNo !== line.lineNo,
                            ),
                      })
                    }
                  />
                </label>
              </td>
            </>
          )}
        />
      )}
      <VirtualRows
        className="jv-rows"
        items={event.lines}
        title={t("business.selected")}
        header={[t("journal.original"), t("journal.line"), ""]}
        render={(line) => (
          <>
            <td>{line.entryId}</td>
            <td>{line.lineNo}</td>
            <td>
              <button
                className="jv-btn"
                type="button"
                onClick={() =>
                  change({
                    ...event,
                    lines: event.lines.filter(
                      (item) => item.entryId !== line.entryId || item.lineNo !== line.lineNo,
                    ),
                  })
                }
              >
                {t("journal.remove")}
              </button>
            </td>
          </>
        )}
      />
    </>
  );
}

import { useState } from "react";
import {
  openClearingPageSchema,
  type CompanyDto,
  type BusinessEventDto,
} from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { OpenItemsTable, SelectedLines } from "./clearing-editor-lines.tsx";
import { usePage } from "./list.tsx";
import type { T } from "./types.ts";
export function ClearingEditor({
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
        <OpenItemsTable
          page={page}
          event={event}
          company={company}
          t={t}
          language={language}
          change={change}
        />
      )}
      <SelectedLines event={event} t={t} change={change} />
    </>
  );
}

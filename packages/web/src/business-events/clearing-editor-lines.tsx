import type { CompanyDto, OpenClearingLineDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { formatMinor } from "../reports-data.ts";
import type { EventFieldsProps, EventOf } from "./event-editor-fields.tsx";
import { PageTable, type usePage } from "./list.tsx";
type ClearingFieldsProps = EventFieldsProps<EventOf<"clearing.match">>;
export function OpenItemsTable({
  page,
  event,
  company,
  t,
  language,
  change,
}: ClearingFieldsProps & {
  page: ReturnType<typeof usePage<OpenClearingLineDto>>;
  company: CompanyDto;
  language: Language;
}) {
  return (
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
                          (item) => item.entryId !== line.entryId || item.lineNo !== line.lineNo,
                        ),
                  })
                }
              />
            </label>
          </td>
        </>
      )}
    />
  );
}
export function SelectedLines({ event, t, change }: ClearingFieldsProps) {
  return (
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
  );
}

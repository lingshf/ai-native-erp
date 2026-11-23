import type { CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { detailLabel } from "../ui/trade-invoice-detail-labels.ts";
import { formatMinor } from "../reports-data.ts";
import { Badge } from "../ui/components/index.tsx";
import { poMatchTone } from "../trade-invoice-status.ts";
import type { T } from "./invoice-model.ts";
import { SourceOrderCell } from "./source-order.tsx";
import { INVOICE_ROW_HEIGHT, type InvoiceRowDto } from "./use-invoice-list.ts";

const headers = [
  "tinv.side",
  "tinv.party",
  "tinv.externalInvoice",
  "tinv.accountingDate",
  "tinv.dueDate",
  "tinv.poMatch",
  "tinv.sourceOrder",
  "tinv.gross",
] as const;

type RowContext = {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onOpen: (row: InvoiceRowDto) => void;
};

/** Stands in for the rows scrolled out of view above or below a virtualized window. */
function SpacerRow({ height }: { height: number }) {
  return (
    <tr>
      <td colSpan={headers.length} style={{ height, padding: 0 }} />
    </tr>
  );
}

function InvoiceRow({
  company,
  preferences,
  t,
  onOpen,
  row,
  index,
}: RowContext & { row: InvoiceRowDto; index: number }) {
  return (
    <tr aria-rowindex={index + 2} style={{ height: INVOICE_ROW_HEIGHT }}>
      <td>{t(`trade.${row.side}`)}</td>
      <td>{row.party}</td>
      <td>
        <button
          type="button"
          className="tinv-detail-trigger"
          aria-haspopup="dialog"
          aria-label={`${detailLabel(preferences.language, "tinv.detail.open")} ${row.externalNo}`}
          data-document-id={row.documentId}
          onClick={() => onOpen(row)}
        >
          {row.externalNo}
        </button>
      </td>
      <td>{row.accountingDate}</td>
      <td>{row.dueDate}</td>
      <td>
        <Badge tone={poMatchTone[row.poMatch]}>{t(`tinv.${row.poMatch}`)}</Badge>
      </td>
      <SourceOrderCell company={company.code} orderId={row.orderId} t={t} />
      <td>{formatMinor(row.gross, preferences.language, company.scale)}</td>
    </tr>
  );
}

export function InvoiceTable({
  rowCount,
  visible,
  before,
  after,
  ...context
}: RowContext & {
  rowCount: number;
  visible: { row: InvoiceRowDto | undefined; index: number }[];
  before: number;
  after: number;
}) {
  const { t } = context;
  return (
    <table className="grid" aria-label={t("tinv.list")} aria-rowcount={rowCount + 1}>
      <thead>
        <tr>
          {headers.map((key) => (
            <th
              key={key}
              scope="col"
              className={key === "tinv.sourceOrder" ? "tinv-source" : undefined}
            >
              {t(key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {before > 0 && <SpacerRow height={before} />}
        {visible.map(({ row, index }) =>
          row ? <InvoiceRow key={row.documentId} {...context} row={row} index={index} /> : null,
        )}
        {after > 0 && <SpacerRow height={after} />}
      </tbody>
    </table>
  );
}

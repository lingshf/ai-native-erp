import type { UIEventHandler } from "react";
import { Link } from "react-router-dom";
import type { LedgerDto } from "@erp/core/contracts";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import type { Format, T } from "./types.ts";

export function LedgerTotals({ first, fmt, t }: { first: LedgerDto; fmt: Format; t: T }) {
  return (
    <ul className="ledger-totals">
      <li>
        {t("ledger.opening")}: {fmt(first.opening)}
      </li>
      <li>
        {t("ledger.debit")}: {fmt(first.debit)}
      </li>
      <li>
        {t("ledger.credit")}: {fmt(first.credit)}
      </li>
      <li className="emphasis">
        {t("ledger.closing")}: {fmt(first.closing)}
      </li>
      <li>
        {t("ledger.total")}: {first.total}
      </li>
      <li>
        {t("ledger.watermark")}: {first.watermark}
      </li>
      <li>
        {t("ledger.accountRevision")}: {first.accountRevision}
      </li>
    </ul>
  );
}

export function LedgerDetailTable({
  companyCode,
  rows,
  onScrollCapture,
  fmt,
  t,
}: {
  companyCode: string;
  rows: LedgerDto["items"];
  onScrollCapture: UIEventHandler<HTMLDivElement>;
  fmt: Format;
  t: T;
}) {
  return (
    <div className="card ledger-detail" onScrollCapture={onScrollCapture}>
      <VirtualRows
        forceVirtual
        items={rows}
        title={t("ledger.detail")}
        header={[
          t("ledger.date"),
          t("ledger.source"),
          t("ledger.debit"),
          t("ledger.credit"),
          t("ledger.balance"),
          t("journal.dimensions"),
        ]}
        render={(row) => (
          <>
            <td>{row.date}</td>
            <td>
              <Link
                to={`/journals?${new URLSearchParams({ company: companyCode, id: row.entryId })}`}
              >
                {row.sourceRef} / {row.lineNo}
              </Link>
            </td>
            <td className="num">{fmt(row.debit)}</td>
            <td className="num">{fmt(row.credit)}</td>
            <td className="num">{fmt(row.balance)}</td>
            <td>
              {Object.entries(row.dimensions)
                .map(([key, value]) => `${key}=${value ?? "~"}`)
                .join(" · ")}
            </td>
          </>
        )}
      />
    </div>
  );
}

export function LedgerLoadMore({
  loading,
  onClick,
  t,
}: {
  loading: boolean;
  onClick: () => void;
  t: T;
}) {
  return (
    <div>
      <button className="btn btn-secondary" type="button" disabled={loading} onClick={onClick}>
        {t("master.loadMore")}
      </button>
    </div>
  );
}

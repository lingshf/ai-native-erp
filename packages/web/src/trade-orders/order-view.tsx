import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { tradeOrderInvoicingSchema, type CompanyDto } from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import { masterRequest } from "../master-data-client.ts";
import { formatDecimal } from "../decimal-format.ts";
import { Badge, MessageBar } from "../ui/components/index.tsx";
import type { T, Order } from "./order-model.ts";
// Exact decimal arithmetic in millionths (the contract allows at most 6 fraction digits).
const micros = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
};
const fromMicros = (value: bigint) => {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = String(abs % 1_000_000n)
    .padStart(6, "0")
    .replace(/0+$/u, "");
  return `${sign}${abs / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
};
export function OrderView({
  order,
  company,
  language,
  money,
  t,
}: {
  order: Order;
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
}) {
  // TORD-07: line decimals grouped by language; "…" while invoiced quantities are loading.
  const decimal = (value: string | undefined) =>
    value === undefined ? "…" : formatDecimal(value, language);
  const amountKeys = ["net", "tax", "gross"] as const;
  const reasonId = useId();
  // The saved / looked-up order stays the source of the detail; invoiced quantities come from one
  // extra read of the invoicing endpoint (TINV-02 decision 1), always fresh when the detail mounts.
  const invoicing = useQuery({
    queryKey: ["trade-order-invoicing", company.code, order.orderId],
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/orders/${encodeURIComponent(order.orderId)}/invoicing?company=${encodeURIComponent(company.code)}`,
        tradeOrderInvoicingSchema,
        { signal },
      ),
  });
  const known = invoicing.isSuccess && !invoicing.isFetching ? invoicing.data : null;
  const invoiced = new Map(known?.invoiced.map((row) => [row.lineId, row.invoicedQuantity]));
  const remaining = (line: Order["lines"][number]) => {
    const done = invoiced.get(line.lineId);
    return done === undefined ? null : micros(line.quantity) - micros(done);
  };
  const fullyInvoiced =
    known !== null && order.lines.every((line) => (remaining(line) ?? 1n) <= 0n);
  const invoiceLink = `/trade-invoices?${new URLSearchParams({ company: company.code, fromOrder: order.orderId })}`;
  // Totals only add up the server's per-line amounts; no tax is calculated here (PG-01).
  const total = (key: (typeof amountKeys)[number]) =>
    order.lines.reduce((sum, line) => sum + line[key], 0);
  return (
    <div className="tord-order">
      <dl className="kpis">
        {amountKeys.map((key) => (
          <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
            <dt className="label">{t(`tord.${key}`)}</dt>
            <dd className="value">{money(total(key))}</dd>
          </div>
        ))}
      </dl>
      <dl className="tord-facts">
        <div>
          <dt>{t("tord.orderId")}</dt>
          <dd>{order.orderId}</dd>
        </div>
        <div>
          <dt>{t("tord.side")}</dt>
          <dd>{label(language, `trade.${order.side}`)}</dd>
        </div>
        <div>
          <dt>{t("tord.party")}</dt>
          <dd>{order.party}</dd>
        </div>
        <div>
          <dt>{t("tord.currency")}</dt>
          <dd>{order.currency}</dd>
        </div>
        <div>
          <dt>{t("tord.orderDate")}</dt>
          <dd>{order.orderDate}</dd>
        </div>
        <div>
          <dt>{t("tord.priceIncludesTax")}</dt>
          <dd>{t(order.priceIncludesTax ? "tord.yes" : "tord.no")}</dd>
        </div>
        <div>
          <dt>{t("tord.rounding")}</dt>
          <dd>
            {t(order.rounding === "document" ? "tord.roundingDocument" : "tord.roundingLine")}
          </dd>
        </div>
        <div>
          <dt>{t("tord.recordedAt")}</dt>
          <dd>{order.recordedAt}</dd>
        </div>
      </dl>
      <div className="grid-wrap">
        <table className="grid tord-amounts" aria-label={`${t("tord.lines")} ${order.orderId}`}>
          <thead>
            <tr>
              <th scope="col">{t("tord.lineNo")}</th>
              <th scope="col">{t("tord.lineId")}</th>
              <th scope="col">{t("tord.product")}</th>
              <th scope="col">{t("tord.taxCode")}</th>
              <th scope="col">{t("tord.quantity")}</th>
              <th scope="col">{t("tord.invoicedQuantity")}</th>
              <th scope="col">{t("tord.uninvoicedQuantity")}</th>
              <th scope="col">{t("tord.unitPrice")}</th>
              <th scope="col">{t("tord.discountPercent")}</th>
              {amountKeys.map((key) => (
                <th key={key} scope="col">
                  {t(`tord.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const left = remaining(line);
              return (
                <tr key={line.lineId}>
                  <td>{line.lineNo}</td>
                  <td>{line.lineId}</td>
                  <td>{line.product}</td>
                  <td>{line.taxCode}</td>
                  <td>{decimal(line.quantity)}</td>
                  <td>{decimal(invoiced.get(line.lineId))}</td>
                  <td>
                    {left === null ? (
                      "…"
                    ) : left > 0n ? (
                      fromMicros(left)
                    ) : (
                      <>
                        {left < 0n && `${fromMicros(left)} `}
                        <Badge tone="success">{t("tord.fullyInvoicedBadge")}</Badge>
                      </>
                    )}
                  </td>
                  <td>{decimal(line.unitPrice)}</td>
                  <td>{decimal(line.discountPercent)}</td>
                  {amountKeys.map((key) => (
                    <td key={key}>{money(line[key])}</td>
                  ))}
                </tr>
              );
            })}
            <tr className="tord-total">
              <th scope="row" colSpan={9}>
                {t("tord.total")}
              </th>
              {amountKeys.map((key) => (
                <td key={key}>{money(total(key))}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {invoicing.isFetching && <p role="status">{t("tord.invoicingLoading")}</p>}
      {invoicing.isError && !invoicing.isFetching && (
        <MessageBar tone="danger" role="alert">
          <p>{t("tord.invoicingFailed")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void invoicing.refetch()}
          >
            {label(language, "master.retry")}
          </button>
        </MessageBar>
      )}
      <div className="tord-invoice-actions">
        {known && !fullyInvoiced ? (
          <Link className="btn btn-primary" to={invoiceLink}>
            {t("tord.invoice")}
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled
            aria-describedby={fullyInvoiced ? reasonId : undefined}
          >
            {t("tord.invoice")}
          </button>
        )}
        {fullyInvoiced && (
          <p className="ui-hint" id={reasonId}>
            {t("tord.fullyInvoiced")}
          </p>
        )}
      </div>
    </div>
  );
}

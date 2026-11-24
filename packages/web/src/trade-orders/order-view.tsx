import { useId } from "react";
import type { CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { useOrderInvoicing } from "./use-order-invoicing.ts";
import { OrderFacts, OrderKpis } from "./order-view-facts.tsx";
import { OrderLinesTable } from "./order-view-lines.tsx";
import { OrderInvoiceActions, OrderInvoicingFailure } from "./order-view-actions.tsx";
import type { T, Order } from "./order-model.ts";
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
  const reasonId = useId();
  const { invoicing, known, fullyInvoiced, ...quantities } = useOrderInvoicing(order, company);
  const invoiceLink = `/trade-invoices?${new URLSearchParams({ company: company.code, fromOrder: order.orderId })}`;
  return (
    <div className="tord-order">
      <OrderKpis order={order} money={money} t={t} />
      <OrderFacts order={order} language={language} t={t} />
      <OrderLinesTable
        order={order}
        quantities={quantities}
        language={language}
        money={money}
        t={t}
      />
      {invoicing.isFetching && <p role="status">{t("tord.invoicingLoading")}</p>}
      {invoicing.isError && !invoicing.isFetching && (
        <OrderInvoicingFailure language={language} t={t} onRetry={() => void invoicing.refetch()} />
      )}
      <OrderInvoiceActions
        known={known}
        fullyInvoiced={fullyInvoiced}
        invoiceLink={invoiceLink}
        reasonId={reasonId}
        t={t}
      />
    </div>
  );
}

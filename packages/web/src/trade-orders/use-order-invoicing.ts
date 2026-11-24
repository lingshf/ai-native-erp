import { useQuery } from "@tanstack/react-query";
import { tradeOrderInvoicingSchema, type CompanyDto } from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import { micros } from "./order-quantity.ts";
import type { Order } from "./order-model.ts";

export type OrderLine = Order["lines"][number];

export function useOrderInvoicing(order: Order, company: CompanyDto) {
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
  const credited = new Map(known?.invoiced.map((row) => [row.lineId, row.creditedQuantity]));
  const remaining = (line: OrderLine) => {
    const done = invoiced.get(line.lineId);
    return done === undefined ? null : micros(line.quantity) - micros(done);
  };
  const fullyInvoiced =
    known !== null && order.lines.every((line) => (remaining(line) ?? 1n) <= 0n);
  return { invoicing, known, invoiced, credited, remaining, fullyInvoiced };
}

export type OrderInvoicing = ReturnType<typeof useOrderInvoicing>;
export type InvoicedQuantities = Pick<OrderInvoicing, "invoiced" | "credited" | "remaining">;

import {
  matchTradeOrderLine,
  tradeDocumentError,
  type PoMatch,
  type TradeCalculation,
  type TradeInvoiceCommand,
  type TradeLineMatch,
  type TradeOrder,
} from "@erp/core/domain";
import type { MasterDataRepository } from "./master-data.ts";

export interface InvoiceOrderMatch {
  readonly order: TradeOrder | null;
  readonly matches: readonly TradeLineMatch[];
}

/** Reads the referenced order (if any) and matches every invoice line against its order line. */
export async function matchInvoiceOrder(
  repo: MasterDataRepository,
  command: TradeInvoiceCommand,
  calculation: TradeCalculation,
): Promise<InvoiceOrderMatch> {
  if (command.orderId === null) return { order: null, matches: [] };
  const order = await invoiceOrder(repo, command, command.orderId);
  const invoiced = await invoicedByOrderLine(repo, command, order);
  return { order, matches: matchInvoiceLines(command, order, invoiced, calculation) };
}

/** The order must exist, not postdate the invoice, and agree on side, party and currency. */
async function invoiceOrder(
  repo: MasterDataRepository,
  command: TradeInvoiceCommand,
  orderId: string,
): Promise<TradeOrder> {
  const order = await repo.tradeOrder(command.company, orderId);
  if (!order) tradeDocumentError("orderId", "order");
  if (
    command.accountingDate < order.orderDate ||
    command.accountingDate < (await repo.tradeOrderLatestDate(command.company, order.orderId))
  )
    tradeDocumentError("accountingDate", "reference");
  if (
    order.side !== command.side ||
    order.party !== command.party ||
    order.currency !== command.currency
  )
    tradeDocumentError("orderId", "order");
  return order;
}

/** Quantity already invoiced per distinct referenced order line, in micros. */
async function invoicedByOrderLine(
  repo: MasterDataRepository,
  command: TradeInvoiceCommand,
  order: TradeOrder,
): Promise<ReadonlyMap<string, bigint>> {
  const referenced = [
    ...new Set(command.lines.flatMap((line) => (line.orderLineId ? [line.orderLineId] : []))),
  ];
  return new Map(
    (await repo.tradeOrderInvoiced(command.company, order.orderId, referenced)).map((row) => [
      row.orderLineId,
      row.micros,
    ]),
  );
}

function matchInvoiceLines(
  command: TradeInvoiceCommand,
  order: TradeOrder,
  invoiced: ReadonlyMap<string, bigint>,
  calculation: TradeCalculation,
): TradeLineMatch[] {
  const matches: TradeLineMatch[] = [];
  for (const [index, line] of command.lines.entries()) {
    const orderLine = order.lines.find((item) => item.lineId === line.orderLineId);
    if (!orderLine || orderLine.product !== line.product)
      tradeDocumentError(`lines.${index}.orderLineId`, "orderLine");
    matches.push(
      matchTradeOrderLine({
        lineId: line.lineId,
        path: `lines.${index}`,
        order: orderLine,
        previouslyInvoiced: invoiced.get(orderLine.lineId) ?? 0n,
        quantity: line.quantity,
        invoiceNet: calculation.lines[index].net,
      }),
    );
  }
  return matches;
}

/** A matching exception is required exactly when some line is outside tolerance. */
export function invoicePoMatch(
  command: TradeInvoiceCommand,
  order: TradeOrder | null,
  matches: readonly TradeLineMatch[],
): PoMatch {
  const outside = matches.some((match) => !match.withinTolerance);
  if (outside !== (command.matchingException !== null))
    tradeDocumentError("matchingException", outside ? "price" : "exception");
  const poMatch: PoMatch = order === null ? "notApplicable" : outside ? "exception" : "matched";
  return poMatch;
}

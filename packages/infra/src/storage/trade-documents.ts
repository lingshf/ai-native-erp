import type { TradeDocumentRepository } from "@erp/core/application";
import { tradeConfigLookups } from "./trade-document-configs.ts";
import { tradeInvoiceRecords } from "./trade-document-invoices.ts";
import {
  tradeActionPosting,
  tradeActionQueries,
  tradeItemQueries,
  tradeItemWrites,
} from "./trade-document-items.ts";
import { openItemQueries } from "./trade-document-open-items.ts";
import { tradeOrderQueries, tradeOrderRecords } from "./trade-document-orders.ts";
import { openItemSettlements, tradePaymentRecords } from "./trade-document-settlements.ts";
import type { Connection } from "./types.ts";

export { tradeOrderPageSql, tradeOrderPageStatement } from "./trade-document-order-page.ts";
export {
  tradeOrderPageInvoicedSql,
  tradeOrderInvoicingStatus,
  tradeOrderStatuses,
  refreshTradeOrderInvoicing,
} from "./trade-document-order-invoicing.ts";
export { tradeDocumentPageStatement } from "./trade-document-invoices.ts";

export function tradeDocumentRepository(db: Connection): TradeDocumentRepository {
  // Spread in the original key order, so Object.keys of the repository stays unchanged.
  return {
    ...tradeActionQueries(db),
    ...tradeItemQueries(db),
    ...tradeItemWrites(db),
    ...tradeActionPosting(db),
    ...tradePaymentRecords(db),
    ...openItemSettlements(db),
    ...tradeOrderRecords(db),
    ...tradeOrderQueries(db),
    ...tradeConfigLookups(db),
    ...tradeInvoiceRecords(db),
    ...openItemQueries(db),
  };
}

import type { TradeOrderListQuery } from "@erp/core/application";

type PageDriver = "o" | "s";
// `driver` is the alias whose (company_id, order_id) drives the page: the keyset and its order.
const tradeOrderPageSelect = (from: string, driver: PageDriver = "o") =>
  `SELECT o.order_id,o.side,o.party_id,o.order_date,o.currency,o.price_includes_tax,o.rounding_mode,o.recorded_at,s.status AS invoicing,count(*) AS line_count,sum(l.net_minor) AS net_minor,sum(l.tax_minor) AS tax_minor,sum(l.gross_minor) AS gross_minor FROM ${from} JOIN trade_order_lines l ON l.company_id=o.company_id AND l.order_id=o.order_id WHERE ${driver}.company_id=?`;
const tradeOrderPageOrder = (driver: PageDriver = "o") =>
  ` GROUP BY ${driver}.order_id ORDER BY ${driver}.order_id LIMIT ?`;
// TORD-06: the stored status joined on its primary key (one row per order). CROSS JOIN keeps the
// orders table (or, below, the status index) as the outer loop.
const joinStatus =
  " CROSS JOIN trade_order_invoicing s ON s.company_id=o.company_id AND s.order_id=o.order_id";
const statusDrivenFrom =
  "trade_order_invoicing s INDEXED BY trade_order_invoicing_status CROSS JOIN trade_orders o ON o.company_id=s.company_id AND o.order_id=s.order_id";
// TORD-03: one statement per order-list page; parameters are (company, cursor or "", limit + 1).
// Orders always have 1–100 lines, so the inner join keeps every order; every table uses its primary
// key. TORD-06: the invoicing column is the stored status (B6a), not a per-page aggregate.
export const tradeOrderPageSql = `${tradeOrderPageSelect(`trade_orders o${joinStatus}`)} AND o.order_id>?${tradeOrderPageOrder()}`;
// TORD-05: still one statement per page. The text is assembled only from fixed fragments chosen by
// which filters are present; every value is bound. With a party the statement SEARCHes
// trade_orders_party (company_id, party_id, order_id), already in order_id order. INDEXED BY is
// required: without ANALYZE statistics SQLite's default estimates prefer the primary key, which
// would walk every order of the company after the cursor. Side and date are filtered row by row
// on the primary-key range. With no filter the text is exactly tradeOrderPageSql.
// TORD-06: every variant reads the stored status. An invoicing filter without a party drives the
// page from trade_order_invoicing_status (company_id, status, order_id), also already in order_id
// order; otherwise the status is joined on its primary key and filtered row by row.
function tradeOrderPageFrom(query: TradeOrderListQuery): {
  readonly from: string;
  readonly driver: PageDriver;
} {
  if (query.invoicing !== undefined && query.party === undefined)
    return { from: statusDrivenFrom, driver: "s" };
  const orders =
    query.party === undefined ? "trade_orders o" : "trade_orders o INDEXED BY trade_orders_party";
  return { from: orders + joinStatus, driver: "o" };
}
export function tradeOrderPageStatement(
  company: string,
  query: TradeOrderListQuery,
): { readonly sql: string; readonly values: readonly (string | number)[] } {
  const { from, driver } = tradeOrderPageFrom(query);
  let sql = tradeOrderPageSelect(from, driver);
  const values: (string | number)[] = [company];
  const add = (fragment: string, value: string | undefined) => {
    if (value === undefined) return;
    sql += fragment;
    values.push(value);
  };
  add(" AND s.status=?", query.invoicing);
  add(" AND o.party_id=?", query.party);
  add(` AND ${driver}.order_id>?`, query.cursor ?? "");
  add(" AND o.side=?", query.side);
  add(" AND o.order_date>=?", query.from);
  add(" AND o.order_date<=?", query.to);
  values.push(query.limit + 1);
  return { sql: sql + tradeOrderPageOrder(driver), values };
}

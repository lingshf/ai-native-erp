// Demo v0.10.0 预置（虚构数据）：在 seed-trade.mjs 与 seed-invoicing.mjs 之后，通过真实 HTTP API 建立销售方向的数据，
// 让订单列表有销售单的“部分开票 / 已开完”，发票列表有销售（AR）发票和来源订单链接，发票列表筛选（TINV-05）能按伙伴、方向得到不同结果。
// 前提：seed-trade.mjs 已建立期间准入、税码 VAT、伙伴 PARTY / PARTY2（role both，带 AR 档案 REC）；
// 销售单需要带收入科目的服务类商品，这里按现有契约建 SERVICE（revenueAccount 4000，与 v0.7.0 的 seed-orders.mjs 同一做法）。
// SO-I1（PARTY2）：L1 数量 10 单价 30，L2 数量 4 单价 50；发票 AR-I1-1 开 L1 的 4 个 → L1 已开 4 未开 6，L2 已开 0 未开 4。
// SO-I2（PARTY2）：L1 数量 10 单价 30；发票 AR-I2-1 开 L1 的 10 个 → 全部开完。
// 订单日期与发票记账日期都取 <day>（发票记账日期不得早于订单日期）。
// 用法：node docs/demo/v0.10.0/scripts/seed-sales.mjs http://127.0.0.1:4201 2026-11-22
import { randomUUID } from "node:crypto";

const [address, day] = process.argv.slice(2);
if (!address || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: seed-sales.mjs <address> <yyyy-mm-dd>");
const span = { from: `${day.slice(0, 4)}-01-01`, to: `${day.slice(0, 4)}-12-31` };

async function send(method, path, body) {
  const response = await fetch(new URL(path, address), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  console.log(method, path, response.status);
  return JSON.parse(text);
}

await send("POST", "/api/v1/trade/tradeProduct", {
  company: "DEFAULT",
  code: "SERVICE",
  active: true,
  expectedRevision: 0,
  kind: "tradeProduct",
  data: { name: "虚构 SERVICE", ...span, type: "service", expenseAccount: null, revenueAccount: "4000", allowedTaxCodes: ["VAT"], defaultDimensions: {} },
});

const line = (lineId, quantity, unitPrice) => ({
  lineId,
  product: "SERVICE",
  taxCode: "VAT",
  quantity,
  unitPrice,
  discountPercent: "0",
  taxableCharge: "0",
});
const orders = [
  ["SO-I1", [line("L1", "10", "30"), line("L2", "4", "50")]],
  ["SO-I2", [line("L1", "10", "30")]],
];
for (const [orderId, lines] of orders)
  await send("POST", "/api/v1/trade/orders", {
    company: "DEFAULT",
    orderId,
    side: "AR",
    party: "PARTY2",
    currency: "CNY",
    orderDate: day,
    priceIncludesTax: false,
    rounding: "line",
    lines,
  });

async function invoice(orderId, external, quantity) {
  const command = {
    company: "DEFAULT",
    documentId: randomUUID(),
    side: "AR",
    party: "PARTY2",
    externalInvoice: external,
    currency: "CNY",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    orderId,
    priceIncludesTax: false,
    rounding: "line",
    headerDimensions: {},
    matchingException: null,
    lines: [{ ...line("L1", quantity, "30"), orderLineId: "L1", dimensions: {} }],
  };
  const preview = await send("POST", "/api/v1/trade/invoices/preview", command);
  await send("POST", "/api/v1/trade/invoices", {
    command,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
}
await invoice("SO-I1", "AR-I1-1", "4");
await invoice("SO-I2", "AR-I2-1", "10");

const expected = { "SO-I1": { L1: "4", L2: "0" }, "SO-I2": { L1: "10" } };
for (const [orderId, want] of Object.entries(expected)) {
  const result = await send("GET", `/api/v1/trade/orders/${orderId}/invoicing?company=DEFAULT`);
  const got = Object.fromEntries(result.invoiced.map((row) => [row.lineId, row.invoicedQuantity]));
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`readiness: ${orderId} invoiced ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
}
console.log("seed-sales ok: SO-I1 L1 4/10 L2 0/4; SO-I2 L1 10/10 (AR, PARTY2)");

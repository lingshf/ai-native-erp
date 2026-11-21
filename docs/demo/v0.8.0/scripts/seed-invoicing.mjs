// Demo v0.8.0 预置（虚构数据）：通过真实 HTTP API 建立两张采购订单，并各过账一张关联订单的发票，
// 让订单详情有“部分开票”和“全部开票”两种状态，供“从订单开票”演示。
// 前提：seed-trade.mjs 已建立期间准入、税码 VAT、伙伴 PARTY、商品 EXPENSE。
// PO-I1（PARTY）：L1 数量 10 单价 10，L2 数量 4 单价 25；发票 AP-I1-1 开 L1 的 4 个 → L1 已开 4 未开 6，L2 已开 0 未开 4。
// PO-I2（PARTY）：L1 数量 10 单价 10；发票 AP-I2-1 开 L1 的 10 个 → 全部开完。
// 订单日期与发票记账日期都取 <day>（发票记账日期不得早于订单日期）。
// 用法：node docs/demo/v0.8.0/scripts/seed-invoicing.mjs http://127.0.0.1:4200 2026-11-21
import { randomUUID } from "node:crypto";

const [address, day] = process.argv.slice(2);
if (!address || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: seed-invoicing.mjs <address> <yyyy-mm-dd>");

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

const line = (lineId, quantity, unitPrice) => ({
  lineId,
  product: "EXPENSE",
  taxCode: "VAT",
  quantity,
  unitPrice,
  discountPercent: "0",
  taxableCharge: "0",
});
const orders = [
  ["PO-I1", [line("L1", "10", "10"), line("L2", "4", "25")]],
  ["PO-I2", [line("L1", "10", "10")]],
];
for (const [orderId, lines] of orders)
  await send("POST", "/api/v1/trade/orders", {
    company: "DEFAULT",
    orderId,
    side: "AP",
    party: "PARTY",
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
    side: "AP",
    party: "PARTY",
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
    lines: [{ ...line("L1", quantity, "10"), orderLineId: "L1", dimensions: {} }],
  };
  const preview = await send("POST", "/api/v1/trade/invoices/preview", command);
  await send("POST", "/api/v1/trade/invoices", {
    command,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
}
await invoice("PO-I1", "AP-I1-1", "4");
await invoice("PO-I2", "AP-I2-1", "10");

const expected = { "PO-I1": { L1: "4", L2: "0" }, "PO-I2": { L1: "10" } };
for (const [orderId, want] of Object.entries(expected)) {
  const result = await send("GET", `/api/v1/trade/orders/${orderId}/invoicing?company=DEFAULT`);
  const got = Object.fromEntries(result.invoiced.map((row) => [row.lineId, row.invoicedQuantity]));
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`readiness: ${orderId} invoiced ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
}
console.log("seed-invoicing ok: PO-I1 L1 4/10 L2 0/4; PO-I2 L1 10/10");

// Demo v0.14.0 预置（虚构数据，DEMO-15）：Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 通过真实 HTTP API 建立“开票后部分贷项”的订单，展示 TINV-09：贷项冲减已开票数量。
// 前提：seed-trade.mjs 已建立期间准入、税码 VAT、伙伴 PARTY、商品 EXPENSE。
// PO-C1（AP / PARTY）：L1 数量 10 单价 10；发票 AP-C1-1 开 10 个 → 已开完（对照态，贷项之前）；
//   对该发票的 L1 贷项 4 → 已开票 6、未开票 4、状态变为“部分开票”（v0.13.1 及更早贷项不改状态，仍是“已开完”）。
// 订单日期、发票与贷项的日期都取 <day>。
// 用法：node docs/demo/v0.14.0/scripts/seed-credit.mjs http://127.0.0.1:4203 2026-11-23
import { randomUUID } from "node:crypto";

const [address, day] = process.argv.slice(2);
if (!address || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: seed-credit.mjs <address> <yyyy-mm-dd>");

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
await send("POST", "/api/v1/trade/orders", {
  company: "DEFAULT",
  orderId: "PO-C1",
  side: "AP",
  party: "PARTY",
  currency: "CNY",
  orderDate: day,
  priceIncludesTax: false,
  rounding: "line",
  lines: [line("L1", "10", "10")],
});

const documentId = randomUUID();
const command = {
  company: "DEFAULT",
  documentId,
  side: "AP",
  party: "PARTY",
  externalInvoice: "AP-C1-1",
  currency: "CNY",
  accountingDate: day,
  documentDate: day,
  taxDate: day,
  orderId: "PO-C1",
  priceIncludesTax: false,
  rounding: "line",
  headerDimensions: {},
  matchingException: null,
  lines: [{ ...line("L1", "10", "10"), orderLineId: "L1", dimensions: {} }],
};
const preview = await send("POST", "/api/v1/trade/invoices/preview", command);
await send("POST", "/api/v1/trade/invoices", {
  command,
  fingerprint: preview.fingerprint,
  idempotencyKey: randomUUID(),
  confirmation: "POST",
});

const status = async () =>
  (await send("GET", "/api/v1/trade/orders?company=DEFAULT&limit=100")).items.find((order) => order.orderId === "PO-C1")?.invoicing;
const quantities = async () =>
  Object.fromEntries(
    (await send("GET", "/api/v1/trade/orders/PO-C1/invoicing?company=DEFAULT")).invoiced.map((row) => [row.lineId, row.invoicedQuantity]),
  );
const before = { status: await status(), invoiced: await quantities() };
if (before.status !== "full" || before.invoiced.L1 !== "10") throw new Error(`readiness: 贷项前 PO-C1 应为 full / 10，实际 ${JSON.stringify(before)}`);

const items = await send("GET", "/api/v1/trade/open-items?company=DEFAULT&limit=100");
const invoice = items.items.find((item) => item.itemId === documentId);
if (!invoice) throw new Error("readiness: AP-C1-1 未结项不存在");
const action = {
  company: "DEFAULT",
  actionId: randomUUID(),
  accountingDate: day,
  documentDate: day,
  taxDate: day,
  kind: "credit",
  invoiceId: documentId,
  revision: invoice.revision,
  lines: [{ sourceLineId: "L1", quantity: "4" }],
};
const actionPreview = await send("POST", "/api/v1/trade/actions/preview", action);
await send("POST", "/api/v1/trade/actions", {
  command: action,
  fingerprint: actionPreview.fingerprint,
  idempotencyKey: randomUUID(),
  confirmation: "POST",
});

const after = { status: await status(), invoiced: await quantities() };
if (after.status !== "partial" || after.invoiced.L1 !== "6") throw new Error(`readiness: 贷项后 PO-C1 应为 partial / 6，实际 ${JSON.stringify(after)}`);
console.log(`seed-credit ok: PO-C1 L1 贷项前 ${before.status} ${before.invoiced.L1}/10 → 贷项 4 后 ${after.status} ${after.invoiced.L1}/10`);

// Demo v0.12.0 预置（虚构数据）：在 v0.11.0 的 seed-detail.mjs 之后，通过真实 HTTP API 再补一张“大额采购发票”，
// 用来实测 TINV-08 的千分位与 390 px 宽度下的布局（D409 延后项）。
// AP-BIG-1（PARTY2，无来源订单）：L1 数量 1234、单价 1000000.12、折扣 12.5%，不含税约 1,079,750,129.57 元，合计超过 10 亿元（readiness 里断言）。
// 数量、单价、折扣在详情行里应显示为 1,234 / 1,000,000.12 / 12.5（formatDecimal：只分组整数部分，小数原样）。
// 用法：node docs/demo/v0.12.0/scripts/seed-large.mjs http://127.0.0.1:4202 2026-11-23
import { randomUUID } from "node:crypto";

const [address, day] = process.argv.slice(2);
if (!address || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: seed-large.mjs <address> <yyyy-mm-dd>");

async function send(method, path, body) {
  const response = await fetch(new URL(path, address), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const command = {
  company: "DEFAULT",
  documentId: randomUUID(),
  side: "AP",
  party: "PARTY2",
  externalInvoice: "AP-BIG-1",
  currency: "CNY",
  accountingDate: day,
  documentDate: day,
  taxDate: day,
  orderId: null,
  priceIncludesTax: false,
  rounding: "line",
  headerDimensions: {},
  matchingException: null,
  lines: [{ lineId: "L1", product: "EXPENSE", taxCode: "VAT", quantity: "1234", unitPrice: "1000000.12", discountPercent: "12.5", taxableCharge: "0", orderLineId: null, dimensions: {} }],
};
const preview = await send("POST", "/api/v1/trade/invoices/preview", command);
await send("POST", "/api/v1/trade/invoices", { command, fingerprint: preview.fingerprint, idempotencyKey: randomUUID(), confirmation: "POST" });

const list = await send("GET", "/api/v1/trade/invoices?company=DEFAULT&party=PARTY2&side=AP&limit=100");
const big = list.items.find((item) => item.externalNo === "AP-BIG-1");
if (!big) throw new Error("readiness: AP-BIG-1 不存在");
const detail = await send("GET", `/api/v1/trade/invoices/${big.documentId}?company=DEFAULT`);
// 金额以最小单位（分）的整数表示；10 亿元 = 100,000,000,000 分
if (detail.document.gross < 100_000_000_000) throw new Error(`readiness: AP-BIG-1 合计 ${detail.document.gross} 分，应不少于 100000000000`);
const line = detail.document.lines[0];
if (line.quantity !== "1234" || line.unitPrice !== "1000000.12" || line.discountPercent !== "12.5") throw new Error(`readiness: AP-BIG-1 行 ${JSON.stringify(line)}`);
const all = (await send("GET", "/api/v1/trade/invoices?company=DEFAULT&limit=500")).items.length;
if (all !== 113) throw new Error(`readiness: DEFAULT 发票共 ${all} 张，应为 113（seed-detail 的 112 + AP-BIG-1）`);
console.log(`seed-large ok: AP-BIG-1 gross ${detail.document.gross} minor units, net ${detail.document.net}, tax ${detail.document.tax}; DEFAULT invoices ${all}`);

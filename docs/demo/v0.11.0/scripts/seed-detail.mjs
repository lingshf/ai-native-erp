// Demo v0.11.0 预置（虚构数据）：在 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs（v0.4.0 / v0.10.0 的原脚本，未改）之后，
// 通过真实 HTTP API 补齐“发票详情”（TINV-06）和“列表筛选”（TINV-05）要演示的数据：
//  1) 第二个公司 DEMO2（只有公司，没有发票；用来演示切换公司后筛选重置）。
//  2) PO-D1（PARTY2 采购单，L1 数量 5 单价 20）及发票 AP-D1-1 开满：不含税 100.00、税 13.00、合计 113.00，来源订单 PO-D1。
//  3) 三张“月初”采购发票 AP-EARLY-1..3（PARTY2，数量 1 单价 10，记账日期 <月份>-01）：记账日期筛选 <月份>-01 ～ <月份>-01 恰好 3 行。
//  4) 102 张采购发票 BULK-001..BULK-102（PARTY，数量 1 单价 1，记账日期 <day>）：伙伴 PARTY 的发票共 105 张（另有 AP-DEMO、AP-I1-1、AP-I2-1），
//     超过一页 100 行，用来演示“加载更多”；未筛选的 DEFAULT 公司共 112 张发票，第一页同样是 100 行。
//  5) 对 AR-I1-1（PARTY2，4 × 30，不含税 120.00、税 15.60、合计 135.60）做一次部分核销 50.00（不取折扣）→ 未结余额 85.60。
// 月份取 day 的月份（seed-trade.mjs 只准入这个月）；day 必须晚于该月 1 日，否则月初那三张与其它发票分不开，脚本直接失败。
// 用法：node docs/demo/v0.11.0/scripts/seed-detail.mjs http://127.0.0.1:4201 2026-11-22
import { randomUUID } from "node:crypto";

const [address, day] = process.argv.slice(2);
if (!address || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: seed-detail.mjs <address> <yyyy-mm-dd>");
const first = `${day.slice(0, 7)}-01`;
if (day <= first) throw new Error(`readiness: day ${day} 必须晚于 ${first}（月初发票要与其它发票分开）`);

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
async function confirm(path, command) {
  const preview = await send("POST", `${path}/preview`, command);
  await send("POST", path, { command, fingerprint: preview.fingerprint, idempotencyKey: randomUUID(), confirmation: "POST" });
}
const line = (quantity, unitPrice, orderLineId) => ({
  lineId: "L1",
  product: "EXPENSE",
  taxCode: "VAT",
  quantity,
  unitPrice,
  discountPercent: "0",
  taxableCharge: "0",
  orderLineId,
  dimensions: {},
});
const apInvoice = (party, external, date, quantity, unitPrice, orderId) => ({
  company: "DEFAULT",
  documentId: randomUUID(),
  side: "AP",
  party,
  externalInvoice: external,
  currency: "CNY",
  accountingDate: date,
  documentDate: date,
  taxDate: date,
  orderId,
  priceIncludesTax: false,
  rounding: "line",
  headerDimensions: {},
  matchingException: null,
  lines: [line(quantity, unitPrice, orderId ? "L1" : null)],
});
const invoices = async (query) => {
  const items = [];
  let cursor = "";
  do {
    const page = await send("GET", `/api/v1/trade/invoices?company=DEFAULT&limit=500${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    items.push(...page.items);
    cursor = page.nextCursor ?? "";
  } while (cursor);
  return items;
};

await send("POST", "/api/v1/companies", { code: "DEMO2", name: "虚构第二公司", currency: "CNY", scale: 2, year: Number(day.slice(0, 4)), closeMode: "annual" });
console.log("company DEMO2 created");

await send("POST", "/api/v1/trade/orders", {
  company: "DEFAULT",
  orderId: "PO-D1",
  side: "AP",
  party: "PARTY2",
  currency: "CNY",
  orderDate: day,
  priceIncludesTax: false,
  rounding: "line",
  lines: [{ lineId: "L1", product: "EXPENSE", taxCode: "VAT", quantity: "5", unitPrice: "20", discountPercent: "0", taxableCharge: "0" }],
});
await confirm("/api/v1/trade/invoices", apInvoice("PARTY2", "AP-D1-1", day, "5", "20", "PO-D1"));
for (const n of [1, 2, 3]) await confirm("/api/v1/trade/invoices", apInvoice("PARTY2", `AP-EARLY-${n}`, first, "1", "10", null));
for (let n = 1; n <= 102; n++) await confirm("/api/v1/trade/invoices", apInvoice("PARTY", `BULK-${String(n).padStart(3, "0")}`, day, "1", "1", null));
console.log("posted AP-D1-1, AP-EARLY-1..3, BULK-001..102");

const ar = (await invoices("&side=AR&party=PARTY2")).find((item) => item.externalNo === "AR-I1-1");
if (!ar) throw new Error("readiness: AR-I1-1 不存在（seed-sales.mjs 没有先运行？）");
const before = await send("GET", `/api/v1/trade/invoices/${ar.documentId}?company=DEFAULT`);
if (before.document.gross !== 13560 || before.openItem.remainingGross !== 13560) throw new Error(`readiness: AR-I1-1 合计 ${before.document.gross}、未结 ${before.openItem.remainingGross}，应都是 13560`);
await confirm("/api/v1/trade/settlements", {
  company: "DEFAULT",
  paymentId: randomUUID(),
  side: "AR",
  party: "PARTY2",
  currency: "CNY",
  accountingDate: day,
  documentDate: day,
  taxDate: day,
  items: [{ itemId: ar.documentId, revision: before.openItem.revision ?? 1, gross: 5000, takeDiscount: false }],
});
const after = await send("GET", `/api/v1/trade/invoices/${ar.documentId}?company=DEFAULT`);
if (after.openItem.remainingGross !== 8560) throw new Error(`readiness: AR-I1-1 核销后未结 ${after.openItem.remainingGross}，应为 8560`);
if (after.settlements.length !== 1) throw new Error(`readiness: AR-I1-1 核销记录 ${after.settlements.length} 条，应为 1`);

const counts = {
  all: (await invoices("")).length,
  party: (await invoices("&party=PARTY")).length,
  early: (await invoices(`&from=${first}&to=${first}`)).length,
};
if (counts.all !== 112 || counts.party !== 105 || counts.early !== 3) throw new Error(`readiness: 发票数 ${JSON.stringify(counts)}，应为 {"all":112,"party":105,"early":3}`);
console.log("seed-detail ok: AR-I1-1 gross 135.60 settled 50.00 open 85.60; AP-D1-1 gross 113.00 from PO-D1; invoices all 112, party PARTY 105, from=to=" + first + " 3; company DEMO2");

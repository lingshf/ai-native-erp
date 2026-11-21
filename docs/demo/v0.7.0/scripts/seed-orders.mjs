// Demo v0.7.0 订单预置（虚构数据）：通过真实 HTTP API 建立 4 张订单，供“订单列表筛选”演示。
// 前提：seed-trade.mjs 已建立伙伴 PARTY、PARTY2，商品 EXPENSE（采购用，无收入科目），税码 VAT。
// 销售单需要带收入科目的商品，这里按现有契约建服务类商品 SERVICE（revenueAccount 4000，与 seed-trade 的折扣科目同为收入类）。
// 订单：PO-F1 采购 PARTY <年>-10-05；PO-F2 采购 PARTY2 <年>-11-05；SO-F3 销售 PARTY <年>-11-12；SO-F4 销售 PARTY2 <年>-12-03。
// 用法：node docs/demo/v0.7.0/scripts/seed-orders.mjs http://127.0.0.1:4199 2026
const [address, year] = process.argv.slice(2);
if (!address || !/^\d{4}$/u.test(year ?? "")) throw new Error("usage: seed-orders.mjs <address> <yyyy>");

const span = { from: `${year}-01-01`, to: `${year}-12-31` };
const productResponse = await fetch(new URL("/api/v1/trade/tradeProduct", address), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    company: "DEFAULT",
    code: "SERVICE",
    active: true,
    expectedRevision: 0,
    kind: "tradeProduct",
    data: { name: "虚构 SERVICE", ...span, type: "service", expenseAccount: null, revenueAccount: "4000", allowedTaxCodes: ["VAT"], defaultDimensions: {} },
  }),
});
if (productResponse.status !== 201 && productResponse.status !== 200) throw new Error(`POST product SERVICE: ${productResponse.status} ${(await productResponse.text()).slice(0, 300)}`);
console.log("posted product SERVICE", productResponse.status);

const orders = [
  ["PO-F1", "AP", "PARTY", `${year}-10-05`, "100", "EXPENSE"],
  ["PO-F2", "AP", "PARTY2", `${year}-11-05`, "200", "EXPENSE"],
  ["SO-F3", "AR", "PARTY", `${year}-11-12`, "300", "SERVICE"],
  ["SO-F4", "AR", "PARTY2", `${year}-12-03`, "400", "SERVICE"],
];
for (const [orderId, side, party, orderDate, unitPrice, product] of orders) {
  const response = await fetch(new URL("/api/v1/trade/orders", address), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      company: "DEFAULT",
      orderId,
      side,
      party,
      currency: "CNY",
      orderDate,
      priceIncludesTax: false,
      rounding: "line",
      lines: [{ lineId: "L1", product, taxCode: "VAT", quantity: "1", unitPrice, discountPercent: "0", taxableCharge: "0" }],
    }),
  });
  const body = await response.text();
  if (response.status !== 201 && response.status !== 200) throw new Error(`POST order ${orderId}: ${response.status} ${body.slice(0, 300)}`);
  console.log("posted", orderId, side, party, orderDate, response.status);
}

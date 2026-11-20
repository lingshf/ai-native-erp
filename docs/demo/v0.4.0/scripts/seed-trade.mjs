// Demo v0.4.0 贸易预置（虚构数据）：通过真实 HTTP API 建立期间准入、贸易主数据，并过账两张采购发票，
// 让“预付 / 贷项 / 专用纠错”页有来自两个伙伴的未结项，凭证列表有已过账凭证。订单 PO-DEMO 不在这里建，由 GUI 录入。
// 用法：node docs/demo/v0.4.0/scripts/seed-trade.mjs http://127.0.0.1:4194 2026-11-20
import { randomUUID } from "node:crypto";

const [address, day] = process.argv.slice(2);
if (!address || !day) throw new Error("usage: seed-trade.mjs <address> <yyyy-mm-dd>");
const year = day.slice(0, 4);
const span = { from: `${year}-01-01`, to: `${year}-12-31` };

async function send(method, path, body) {
  const response = await fetch(new URL(path, address), {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
const trade = (kind, code, data) =>
  send("POST", `/api/v1/trade/${kind}`, {
    company: "DEFAULT",
    code,
    active: true,
    expectedRevision: 0,
    kind,
    data: { name: `虚构 ${code}`, ...span, ...data },
  });

await send("PUT", "/api/v1/periods", {
  company: "DEFAULT",
  month: day.slice(0, 7),
  revision: 1,
  status: "open",
  reason: "Fictional demo",
  confirmed: true,
  modules: ["trade", "tax"],
});
await trade("tradeTerms", "N30", {
  dueDays: 30,
  discountDays: 7,
  discountPercent: "1.5",
  allowPartialDiscount: true,
});
await trade("taxCode", "VAT", {
  mode: "ordinary",
  rates: [{ id: "STANDARD", ...span, ratePercent: "13" }],
  deductiblePercent: "100",
  inputAccount: "1400",
  outputAccount: "2200",
});
for (const [code, side, controlAccount, advanceAccount] of [
  ["PAY", "AP", "2100", "1250"],
  ["REC", "AR", "1300", "2300"],
])
  await trade("tradeProfile", code, {
    side,
    controlAccount,
    advanceAccount,
    cashAccount: "1000",
    discountAccount: "4000",
  });
for (const code of ["PARTY", "PARTY2"])
  await trade("tradeParty", code, {
    role: "both",
    apProfile: "PAY",
    arProfile: "REC",
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  });
await trade("tradeProduct", "EXPENSE", {
  type: "expense",
  expenseAccount: "5000",
  revenueAccount: null,
  allowedTaxCodes: ["VAT"],
  defaultDimensions: {},
});

async function invoice(party, external, quantity, unitPrice) {
  const command = {
    company: "DEFAULT",
    documentId: randomUUID(),
    side: "AP",
    party,
    externalInvoice: external,
    currency: "CNY",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    orderId: null,
    priceIncludesTax: false,
    rounding: "line",
    headerDimensions: {},
    matchingException: null,
    lines: [
      {
        lineId: "L1",
        product: "EXPENSE",
        taxCode: "VAT",
        quantity,
        unitPrice,
        discountPercent: "0",
        taxableCharge: "0",
        orderLineId: null,
        dimensions: {},
      },
    ],
  };
  const preview = await send("POST", "/api/v1/trade/invoices/preview", command);
  await send("POST", "/api/v1/trade/invoices", {
    command,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
  console.log("posted", party, external, preview.calculation.gross);
}
await invoice("PARTY", "AP-DEMO", "10", "10");
await invoice("PARTY2", "AP-DEMO2", "4", "25");

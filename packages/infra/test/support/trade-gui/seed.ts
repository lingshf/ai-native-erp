// Seed data and the HTTP replay of part 1 writes (recorded requests, generated IDs, orders).
import { randomUUID } from "node:crypto";

// `path` keeps the query string; `preview` is the server's full preview response.
export type Recorded = { method: string; path: string; body: unknown; preview?: unknown };
// The only values the GUI generates itself (crypto.randomUUID) in the part 1 writes. The replay
// reuses them instead of normalizing anything, so every other field, every ID reference and
// every server-computed preview fingerprint must match the GUI requests exactly.
type GeneratedIds = {
  documentId: string;
  paymentId: string;
  invoiceKey: string;
  settlementKey: string;
};
export function generatedIds(recorded: Recorded[]): GeneratedIds {
  const body = (path: string) => {
    const matches = recorded.filter((entry) => entry.method === "POST" && entry.path === path);
    if (matches.length !== 1)
      throw new Error(`Expected one GUI POST ${path}, got ${matches.length}`);
    return matches[0].body as { command: Record<string, unknown>; idempotencyKey: unknown };
  };
  const invoice = body("/api/v1/trade/invoices");
  const settlement = body("/api/v1/trade/settlements");
  const ids = {
    documentId: invoice.command.documentId,
    paymentId: settlement.command.paymentId,
    invoiceKey: invoice.idempotencyKey,
    settlementKey: settlement.idempotencyKey,
  };
  for (const [field, value] of Object.entries(ids))
    if (typeof value !== "string") throw new Error(`GUI request lacks generated ${field}`);
  return ids as GeneratedIds;
}
export const freshIds = (): GeneratedIds => ({
  documentId: randomUUID(),
  paymentId: randomUUID(),
  invoiceKey: randomUUID(),
  settlementKey: randomUUID(),
});
// The one server value that cannot repeat: preview fingerprints hash the order's server-side
// `recordedAt` wall-clock time. Each fingerprint must be the one its own preview returned and
// the confirmation right after it must carry exactly that value; only then are the two fields
// (`preview.fingerprint`, `body.fingerprint` of that confirmation) replaced by a shared token.
// Everything else in the preview response is compared as returned.
export function linkFingerprints(recorded: Recorded[]) {
  return recorded.map((entry, index) => {
    if (!entry.path.endsWith("/preview")) {
      const previous = recorded[index - 1];
      if (!previous?.path.endsWith("/preview")) return entry;
      const body = entry.body as Record<string, unknown>;
      const fingerprint = (previous.preview as Record<string, unknown> | undefined)?.fingerprint;
      if (
        entry.path !== previous.path.slice(0, -"/preview".length) ||
        body.fingerprint !== fingerprint
      )
        throw new Error(`${entry.path} does not confirm the preceding preview fingerprint`);
      return { ...entry, body: { ...body, fingerprint: `<preview ${index - 1}>` } };
    }
    const preview = entry.preview as Record<string, unknown> | undefined;
    if (typeof preview?.fingerprint !== "string" || !/^[0-9a-f]{64}$/u.test(preview.fingerprint))
      throw new Error(`${entry.path} returned no fingerprint`);
    return { ...entry, preview: { ...preview, fingerprint: `<preview ${index}>` } };
  });
}

const year = { from: "2026-01-01", to: "2026-12-31" };
const trade = (kind: string, code: string, data: Record<string, unknown>): Recorded => ({
  method: "POST",
  path: `/api/v1/trade/${kind}`,
  body: {
    company: "DEFAULT",
    code,
    active: true,
    expectedRevision: 0,
    kind,
    data: { name: `Fictional ${code}`, ...year, ...data },
  },
});
const day = "2026-01-20";
const dates = { currency: "CNY", accountingDate: day, documentDate: day, taxDate: day };
const seedWrites: Recorded[] = [
  {
    method: "PUT",
    path: "/api/v1/periods",
    body: {
      company: "DEFAULT",
      month: "2026-01",
      revision: 1,
      status: "open",
      reason: "Fictional GUI acceptance",
      confirmed: true,
      modules: ["trade", "tax"],
    },
  },
  trade("tradeTerms", "N30", {
    dueDays: 30,
    discountDays: 7,
    discountPercent: "1.5",
    allowPartialDiscount: true,
  }),
  trade("taxCode", "VAT", {
    mode: "ordinary",
    rates: [{ id: "STANDARD", ...year, ratePercent: "13" }],
    deductiblePercent: "100",
    inputAccount: "1400",
    outputAccount: "2200",
  }),
  ...(
    [
      ["PAY", "AP", "2100", "1250"],
      ["REC", "AR", "1300", "2300"],
    ] as const
  ).map(([code, side, controlAccount, advanceAccount]) =>
    trade("tradeProfile", code, {
      side,
      controlAccount,
      advanceAccount,
      cashAccount: "1000",
      discountAccount: "4000",
    }),
  ),
  trade("tradeParty", "PARTY", {
    role: "both",
    apProfile: "PAY",
    arProfile: "REC",
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
  ...(
    [
      ["EXPENSE", "expense", "5000", null],
      ["SERVICE", "service", null, "4000"],
    ] as const
  ).map(([code, type, expenseAccount, revenueAccount]) =>
    trade("tradeProduct", code, {
      type,
      expenseAccount,
      revenueAccount,
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    }),
  ),
  {
    method: "POST",
    path: "/api/v1/trade/orders",
    body: {
      company: "DEFAULT",
      orderId: "PO-DEMO",
      side: "AP",
      party: "PARTY",
      currency: "CNY",
      orderDate: day,
      priceIncludesTax: false,
      rounding: "line",
      lines: [
        {
          // The order page numbers lines L1, L2, … itself.
          lineId: "L1",
          product: "EXPENSE",
          taxCode: "VAT",
          quantity: "10",
          unitPrice: "10",
          discountPercent: "0",
          taxableCharge: "0",
        },
      ],
    },
  },
];
const seedInvoice = (documentId: string) => ({
  company: "DEFAULT",
  documentId,
  side: "AP",
  party: "PARTY",
  externalInvoice: "AP-DEMO",
  ...dates,
  orderId: "PO-DEMO",
  priceIncludesTax: false,
  rounding: "line",
  headerDimensions: {},
  matchingException: null,
  lines: [
    {
      lineId: "L1",
      product: "EXPENSE",
      taxCode: "VAT",
      quantity: "10",
      unitPrice: "10",
      discountPercent: "0",
      taxableCharge: "0",
      orderLineId: "L1",
      dimensions: {},
    },
  ],
});
const seedSettlement = (paymentId: string, itemId: string) => ({
  company: "DEFAULT",
  paymentId,
  side: "AP",
  party: "PARTY",
  ...dates,
  items: [{ itemId, revision: 1, gross: 5650, takeDiscount: true }],
});
type Send = (method: string, path: string, body: unknown) => Promise<Record<string, unknown>>;
export function httpSend(address: string): Send {
  return async (method, path, body) => {
    const response = await fetch(new URL(path, address), {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(`Seed ${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
    return result;
  };
}
// The longest legal order ID (companyCodeSchema: 60 characters), all wide uppercase letters,
// for the 390 px wrap check.
export const longOrderId = `SO-LONG-REFERENCE-${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(2).slice(0, 42)}`;
// TINV-04: sales orders and AR invoices posted against them, through the real HTTP API. A domain
// rejection fails here at once (httpSend throws on any non-2xx), not later as a missing row.
export async function seedSourceOrders(send: Send) {
  for (const [orderId, externalInvoice] of [
    ["SO-DEMO", "AR-FROM-SO"],
    [longOrderId, "AR-LONG-SO"],
  ] as const)
    await seedSourceOrder(send, orderId, externalInvoice);
}
async function seedSourceOrder(send: Send, orderId: string, externalInvoice: string) {
  const line = seedInvoice("").lines[0];
  await send("POST", "/api/v1/trade/orders", {
    company: "DEFAULT",
    orderId,
    side: "AR",
    party: "PARTY",
    currency: "CNY",
    orderDate: day,
    priceIncludesTax: false,
    rounding: "line",
    lines: [{ ...line, product: "SERVICE" }].map(
      ({ orderLineId: _, dimensions: __, ...rest }) => rest,
    ),
  });
  const sale = {
    ...seedInvoice(randomUUID()),
    side: "AR",
    externalInvoice,
    orderId,
    lines: [{ ...line, product: "SERVICE" }],
  };
  const preview = await send("POST", "/api/v1/trade/invoices/preview", sale);
  if (typeof preview.fingerprint !== "string")
    throw new Error(`No ${externalInvoice} preview fingerprint`);
  const receipt = await send("POST", "/api/v1/trade/invoices", {
    command: sale,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
  if (receipt.fingerprint !== preview.fingerprint)
    throw new Error(`${externalInvoice} confirmed ${String(receipt.fingerprint)}`);
}
// Part 2 starts from the exact state part 1 creates through the GUI. The same commands are
// replayed through the real HTTP API (preview, then explicit confirmation with the fingerprint
// that preview returned). Part 1 replays them against a second fresh server with the GUI's own
// generated IDs and asserts the requests and preview fingerprints equal the GUI's exactly.
export async function seedPartOne(transport: Send, ids: GeneratedIds) {
  const recorded: Recorded[] = [];
  async function send(method: string, path: string, body: unknown) {
    const entry: Recorded = { method, path, body };
    recorded.push(entry);
    const result = await transport(method, path, body);
    if (path.endsWith("/preview")) entry.preview = result;
    return result;
  }
  async function confirm(path: string, command: unknown, idempotencyKey: string) {
    const preview = await send("POST", `${path}/preview`, command);
    if (typeof preview.fingerprint !== "string") throw new Error(`No preview fingerprint: ${path}`);
    const receipt = await send("POST", path, {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey,
      confirmation: "POST",
    });
    if (receipt.fingerprint !== preview.fingerprint)
      throw new Error(`Replay ${path} confirmed ${String(receipt.fingerprint)}`);
  }
  for (const write of seedWrites) await send(write.method, write.path, write.body);
  await confirm("/api/v1/trade/invoices", seedInvoice(ids.documentId), ids.invoiceKey);
  await confirm(
    "/api/v1/trade/settlements",
    seedSettlement(ids.paymentId, ids.documentId),
    ids.settlementKey,
  );
  return { ap: { documentId: ids.documentId }, recorded };
}

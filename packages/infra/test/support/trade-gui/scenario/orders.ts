// Trade orders: entering a purchase order by keyboard, reading the order detail's invoiced
// quantities and invoicing an order from its detail (TINV-01 / TINV-02).
import { expect } from "vitest";
import { orderLabel, type TradeOrderKey } from "../../../../../web/src/ui/trade-order-labels.ts";
import { formatMinor } from "../../../../../web/src/reports-data.ts";
import { activate, type } from "../keyboard.ts";
import type { ScenarioContext } from "./context.ts";

// The purchase order the AP invoice matches, entered on the order page by keyboard. Side
// (AP), rounding (line), prices excluding tax, discount 0 and the order date (the page's
// local today under the fixed clock) stay at their defaults; the replay asserts all of them.
async function enterPurchaseOrder(scenario: ScenarioContext, orderId = "PO-DEMO") {
  const { page, language, failures, navigate } = scenario;
  const o = (key: TradeOrderKey, params?: Record<string, string>) =>
    orderLabel(language, key, params);
  // Product and tax code offer a datalist, so they are comboboxes.
  const line = (key: TradeOrderKey, role: "textbox" | "combobox" = "textbox") =>
    page.getByRole(role, { name: `${o(key)} L1`, exact: true });
  await navigate("trade-orders");
  expect(await page.locator("#tord-side").inputValue()).toBe("AP");
  expect(await page.locator("#tord-orderDate").inputValue()).toBe("2026-01-20");
  await type(page, page.locator("#tord-orderId"), orderId);
  await type(page, page.locator("#tord-party"), "PARTY");
  await type(page, line("tord.product", "combobox"), "EXPENSE");
  await type(page, line("tord.taxCode", "combobox"), "VAT");
  await type(page, line("tord.quantity"), "10");
  await type(page, line("tord.unitPrice"), "10");
  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/trade/orders" &&
      response.request().method() === "POST",
  );
  await activate(page, page.getByRole("button", { name: o("tord.save"), exact: true }));
  const response = await saving;
  const saved = await response.json();
  expect(response.status(), JSON.stringify(saved)).toBe(201);
  expect(saved).toMatchObject({
    orderId,
    side: "AP",
    party: "PARTY",
    lines: [{ lineId: "L1", net: 10000, tax: 1300, gross: 11300 }],
  });
  await page
    .getByRole("status")
    .filter({ hasText: o("tord.saved", { orderId }) })
    .waitFor();
  // Only the server's amounts are shown; the page computes no tax itself.
  const amounts = page.getByRole("table", {
    name: `${o("tord.lines")} ${orderId}`,
    exact: true,
  });
  const money = (minor: number) => formatMinor(minor, language);
  for (const row of [amounts.locator("tbody tr").first(), amounts.locator("tr.tord-total")])
    expect(
      (await row.locator("td").allTextContents()).slice(-3).map((text) => text.trim()),
    ).toEqual([money(10000), money(1300), money(11300)]);
  expect(failures).toEqual([]);
}

/** The order steps with the scenario bound, so phases call them with the order's own arguments. */
export function orderSteps(scenario: ScenarioContext) {
  return {
    purchaseOrder: (orderId?: string) => enterPurchaseOrder(scenario, orderId),
    orderQuantities: (orderId: string) => readOrderQuantities(scenario, orderId),
    openOrder: (orderId: string) => openOrderDetail(scenario, orderId),
    invoiceFromOrder: (orderId: string, external: string, gross: number, quantity?: string) =>
      invoiceOrder(scenario, orderId, external, gross, quantity),
  };
}

// TINV-02: the order detail's invoiced / not-invoiced quantities and its Invoice entry, which
// opens the invoice page with a draft carried in from the order (TINV-01 `fromOrder`).

/** The first line's quantity, invoiced and not-invoiced cells, once loaded. */
async function readOrderQuantities({ page, ordered }: ScenarioContext, orderId: string) {
  const detail = page.getByRole("table", {
    name: `${ordered("tord.lines")} ${orderId}`,
    exact: true,
  });
  const cells = async () =>
    (await detail.locator("tbody tr").first().locator("td").allTextContents())
      .slice(4, 7)
      .map((text) => text.trim());
  await expect
    .poll(async () => (await cells()).includes("\u2026"), {
      message: "Invoiced quantities must load",
      timeout: 10_000,
    })
    .toBe(false);
  return await cells();
}

async function openOrderDetail({ page, ordered, navigate }: ScenarioContext, orderId: string) {
  await navigate("trade-orders");
  const list = page.getByRole("table", { name: ordered("tord.list"), exact: true });
  await activate(page, list.getByRole("button", { name: orderId, exact: true }));
  await page.getByRole("region", { name: ordered("tord.lookupTitle"), exact: true }).waitFor();
}

/** From an open order detail: invoice its uninvoiced lines (`quantity` of L1 if given). */
async function invoiceOrder(
  scenario: ScenarioContext,
  orderId: string,
  external: string,
  gross: number,
  quantity?: string,
) {
  const { page, t, ordered, post } = scenario;
  await activate(page, page.getByRole("link", { name: ordered("tord.invoice"), exact: true }));
  await page.waitForURL((url) => url.hash.startsWith("#/trade-invoices"));
  await expect.poll(() => page.locator("#tinv-orderId").inputValue()).toBe(orderId);
  expect(new URL(page.url()).hash).not.toContain("fromOrder=");
  // TINV-01: focus lands on the first header field the user must fill.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("tinv-externalInvoice");
  await type(page, page.locator("#tinv-externalInvoice"), external);
  // The draft holds only the order's uninvoiced lines, renumbered from L1 (TINV-01).
  if (quantity)
    await type(
      page,
      page.getByRole("textbox", { name: `${t("tinv.quantity")} L1`, exact: true }),
      quantity,
    );
  const preview = await post("tinv.preview", "/api/v1/trade/invoices/preview");
  expect(preview.poMatch).toBe("matched");
  expect(preview.calculation.gross).toBe(gross);
  // The confirm body is the receipt (top-level gross), not the preview's calculation.
  const receipt = await post("tinv.confirm", "/api/v1/trade/invoices");
  expect(receipt).toMatchObject({ poMatch: "matched", gross });
  return receipt;
}

/** A new order invoiced in two steps; once fully invoiced, its Invoice entry is disabled. */
export async function orderToInvoice(scenario: ScenarioContext) {
  const { page, ordered, failures } = scenario;
  const { purchaseOrder, orderQuantities, openOrder, invoiceFromOrder } = orderSteps(scenario);
  const orderId = "PO-FROM";
  await purchaseOrder(orderId);
  expect(await orderQuantities(orderId)).toEqual(["10", "0", "10"]);
  // First invoice covers only part of the order; the second takes the rest.
  await invoiceFromOrder(orderId, "AP-FROM-1", 4520, "4");
  await openOrder(orderId);
  expect(await orderQuantities(orderId)).toEqual(["10", "4", "6"]);
  await invoiceFromOrder(orderId, "AP-FROM-2", 6780);
  await openOrder(orderId);
  const [quantity, invoiced, remaining] = await orderQuantities(orderId);
  expect([quantity, invoiced]).toEqual(["10", "10"]);
  expect(remaining).toContain(ordered("tord.fullyInvoicedBadge"));
  const entry = page.getByRole("button", { name: ordered("tord.invoice"), exact: true });
  expect(await entry.isDisabled()).toBe(true);
  const reason = page.getByText(ordered("tord.fullyInvoiced"), { exact: true });
  expect(await entry.getAttribute("aria-describedby")).toBe(await reason.getAttribute("id"));
  // biome-ignore format: keeps the original line breaks of this assertion (REFAC-01b L2a)
  expect(
    await page.getByRole("link", { name: ordered("tord.invoice"), exact: true }).count(),
  ).toBe(0);
  expect(failures).toEqual([]);
}

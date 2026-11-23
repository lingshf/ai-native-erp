// TORD-06 (B8): the order list's invoicing filter, which follows posting and cancellation.
import { join } from "node:path";
import { expect } from "vitest";
import type { TradeOrderInvoicingStatus } from "@erp/core/domain";
import { activate, choose } from "../keyboard.ts";
import { artifacts } from "../paths.ts";
import type { ScenarioContext } from "./context.ts";
import type { TradeEntry } from "./invoice-entry.ts";
import { orderSteps } from "./orders.ts";

// PO-STATUS is invoiced in part, then in full; cancelling the second invoice brings it back to
// partial. PO-NONE is never invoiced. Runs after orderToInvoice(): PO-DEMO and PO-FROM are then
// fully invoiced. Every filtered row's badge shows the filtered status; TORD-07 writes the company
// and the applied filter into the address.
export async function orderInvoicingFilter(scenario: ScenarioContext, { action }: TradeEntry) {
  const { page, name, failures, navigate } = scenario;
  const { purchaseOrder, orderQuantities, openOrder, invoiceFromOrder } = orderSteps(scenario);
  await purchaseOrder("PO-NONE");
  await purchaseOrder("PO-STATUS");
  expect(await orderQuantities("PO-STATUS")).toEqual(["10", "0", "10"]);
  await invoiceFromOrder("PO-STATUS", "AP-STATUS-1", 4520, "4");
  let stage = 0;
  const listed = async (status: TradeOrderInvoicingStatus, expected: string[]) => {
    stage += 1;
    await navigate("trade-orders");
    await applyInvoicingFilter(scenario, status);
    await expectInvoicingFiltered(scenario, status, expected);
    expect(new URL(page.url()).hash).toBe(`#/trade-orders?company=DEFAULT&invoicing=${status}`);
    await page.screenshot({
      path: join(artifacts, `${name}-order-invoicing-${stage}-${status}.png`),
    });
  };
  await listed("partial", ["PO-STATUS"]);
  await listed("none", ["PO-NONE"]);
  await clearOrderFilters(scenario, "PO-STATUS");
  await openOrder("PO-STATUS");
  expect(await orderQuantities("PO-STATUS")).toEqual(["10", "4", "6"]);
  const second = await invoiceFromOrder("PO-STATUS", "AP-STATUS-2", 6780);
  await listed("full", ["PO-DEMO", "PO-FROM", "PO-STATUS"]);
  await listed("partial", []);
  await navigate("trade-adjustments");
  await action("cancel", {
    "tadj.source": second.documentId,
    "tadj.reason": "Fictional second invoice cancelled",
  });
  await listed("full", ["PO-DEMO", "PO-FROM"]);
  await listed("partial", ["PO-STATUS"]);
  await listed("none", ["PO-NONE"]);
  await clearOrderFilters(scenario, "PO-DEMO");
  expect(failures).toEqual([]);
}

/** The order-list filter form is the one holding the invoicing select. */
const orderFilterForm = ({ page }: ScenarioContext) =>
  page.locator("form").filter({ has: page.locator("#tord-filter-invoicing") });

// The filter is component state, so staying on the route keeps it: clear it and wait for a row
// the filter had hidden.
async function clearOrderFilters(scenario: ScenarioContext, visibleOrderId: string) {
  const { page, ordered } = scenario;
  await activate(
    page,
    orderFilterForm(scenario).getByRole("button", {
      name: ordered("tord.filterClear"),
      exact: true,
    }),
  );
  await page
    .getByRole("table", { name: ordered("tord.list"), exact: true })
    .getByRole("button", { name: visibleOrderId, exact: true })
    .waitFor();
}

async function applyInvoicingFilter(scenario: ScenarioContext, status: TradeOrderInvoicingStatus) {
  const { page, ordered } = scenario;
  await choose(page, page.locator("#tord-filter-invoicing"), status);
  const response = page.waitForResponse((item) => {
    const url = new URL(item.url());
    return (
      url.pathname === "/api/v1/trade/orders" &&
      url.searchParams.get("invoicing") === status &&
      item.request().method() === "GET"
    );
  });
  await activate(
    page,
    orderFilterForm(scenario).getByRole("button", {
      name: ordered("tord.filterApply"),
      exact: true,
    }),
  );
  expect((await response).status()).toBe(200);
}

/** Listed rows as { orderId, badge }, the badge without its aria-hidden tone symbol. */
const listedBadges = ({ page }: ScenarioContext) =>
  page.locator("table.tord-list tbody tr").evaluateAll((items) =>
    items.map((row) => {
      const badge = row.querySelector("td.tord-invoicing .badge")?.cloneNode(true) as
        | Element
        | undefined;
      for (const mark of badge?.querySelectorAll('[aria-hidden="true"]') ?? []) mark.remove();
      return {
        orderId: row.querySelector("td button")?.textContent ?? "",
        badge: badge?.textContent?.trim() ?? "",
      };
    }),
  );

async function expectInvoicingFiltered(
  scenario: ScenarioContext,
  status: TradeOrderInvoicingStatus,
  expected: string[],
) {
  const { page, ordered } = scenario;
  const listedOrderBadges = () => listedBadges(scenario);
  await expect
    .poll(async () => (await listedOrderBadges()).map((row) => row.orderId).sort(), {
      message: `Orders filtered by invoicing=${status}`,
      timeout: 10_000,
    })
    .toEqual(expected);
  if (expected.length === 0) {
    await page
      .locator("p.empty-state")
      .filter({ hasText: ordered("tord.listNoMatch") })
      .waitFor();
    return;
  }
  const label = ordered(`tord.invoicing.${status}`);
  const shown = (await listedOrderBadges()).sort((a, b) => a.orderId.localeCompare(b.orderId));
  expect(shown).toEqual(expected.map((orderId) => ({ orderId, badge: label })));
}

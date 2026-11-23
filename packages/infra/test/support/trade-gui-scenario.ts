import { expect, test } from "vitest";
import { detailBack, invoiceLinks, type InvoiceLinkContext } from "./trade-gui-invoice-links.ts";
import { diagnostics, guiPhase } from "./trade-gui/diagnostics.ts";
import { finishTrace, guiHarness } from "./trade-gui/harness.ts";
import { activate, choose, tabTo, type } from "./trade-gui/keyboard.ts";
import { artifacts } from "./trade-gui/paths.ts";
import { generatedIds, httpSend, linkFingerprints, seedPartOne } from "./trade-gui/seed.ts";
import {
  adjustAdvanceAndCredit,
  checkCancellationRules,
  checkOpenItemReports,
} from "./trade-gui/scenario/adjustments-reports.ts";
import {
  type TradeApi,
  watchStorageReadback,
  watchTradeApi,
} from "./trade-gui/scenario/api-watch.ts";
import {
  type Language,
  type Part,
  type ScenarioContext,
  type Theme,
  scenarioContext,
  startResources,
} from "./trade-gui/scenario/context.ts";
import { invoiceDetail } from "./trade-gui/scenario/invoice-detail.ts";
import { draftPrefix, tradeEntry } from "./trade-gui/scenario/invoice-entry.ts";
import { invoiceFilters } from "./trade-gui/scenario/invoice-filters.ts";
import { sourceOrders } from "./trade-gui/scenario/invoice-source-orders.ts";
import { checkLeaveGuards } from "./trade-gui/scenario/leave-guard.ts";
import { orderInvoicingFilter } from "./trade-gui/scenario/order-invoicing-filter.ts";
import { orderSteps, orderToInvoice } from "./trade-gui/scenario/orders.ts";
import {
  closePeriod,
  configureTradeMasterData,
  settleWithDiscount,
} from "./trade-gui/scenario/part-one.ts";

// Public names of the split modules, re-exported one by one so the slow tests keep importing here.
export type { Diagnostic } from "./trade-gui/diagnostics.ts";
export { diagnostics, guiPhase, timed } from "./trade-gui/diagnostics.ts";
export { tabTo } from "./trade-gui/keyboard.ts";
export { longOrderId, seedSourceOrders } from "./trade-gui/seed.ts";
export { tradeGuiSmoke } from "./trade-gui/smoke.ts";

const parts = {
  1: "period admission, trade configuration, matched AP invoice and payment",
  2: "advance, AR credit and cancellations, open-item reports, invoicing an order in two steps",
} as const;

type Seeded = Awaited<ReturnType<typeof seedPartOne>>;

// One real-browser scenario: resources, observers, then part 1 or part 2 of the keyboard path.
// Each phase lives in trade-gui/scenario/; the order below is the order the user goes through.
export function tradeGuiScenario(language: Language, theme: Theme, part: Part) {
  const phase = (name: string, started: number) =>
    guiPhase(`${language}/${theme}/${part}`, name, started);
  const log = diagnostics(`${language}-${theme}-part${part}`);
  const harness = guiHarness(phase, log);

  test(`real trade GUI: ${language}/${theme}, keyboard main path and safe confirmation branches (part ${part}/2: ${parts[part]})`, async ({
    onTestFinished,
  }) => {
    const name = `${language}-${theme}-part${part}`;
    log?.("test", { test: name, phase: "start" });
    const resources = await startResources({ harness, phase, log, name, part, onTestFinished });
    const { page, traced, address, seeded, replayAddress } = resources;
    const interactionStarted = performance.now();
    const scenario = scenarioContext({ page, log, phase, name, language, theme, part, address });
    const { failures } = scenario;
    await page.clock.setFixedTime(new Date("2026-01-20T12:00:00Z"));
    await watchStorageReadback(page);
    const api = await watchTradeApi(page, failures);
    let failed = true;
    try {
      await page.goto(address);
      await choose(page, page.locator("#workspace-language"), language);
      await choose(page, page.locator("#workspace-theme"), theme);
      if (part === 1) await partOne(scenario, api, replayAddress);
      else await partTwo(scenario, api, seeded);
      expect(await page.locator(".workspace").getAttribute("data-theme")).toBe(theme);
      expect(await page.locator("html").getAttribute("lang")).toBe(language);
      expect(failures).toEqual([]);
      failed = false;
    } finally {
      await finishTrace(traced, page, name, failed, true);
      log?.("test", { test: name, phase: "end", failed });
      phase("interaction", interactionStarted);
    }
  }, 180_000);
}

// Part 1, then the same requests replayed on an untouched server must link the same way.
async function partOne(scenario: ScenarioContext, api: TradeApi, replayAddress: string) {
  const { purchaseOrder } = orderSteps(scenario);
  const { invoice } = tradeEntry(scenario, api);
  const { recorded } = api;
  await closePeriod(scenario);
  await configureTradeMasterData(scenario);
  await purchaseOrder();
  await invoice("AP", "AP-DEMO", true);
  await settleWithDiscount(scenario);
  const replay = await seedPartOne(httpSend(replayAddress), generatedIds(recorded));
  expect(linkFingerprints(recorded)).toEqual(linkFingerprints(replay.recorded));
}

// Part 2 continues from part 1's state, seeded over HTTP.
async function partTwo(scenario: ScenarioContext, api: TradeApi, seeded: Seeded | undefined) {
  if (!seeded) throw new Error("Part 2 requires the replayed part 1 state");
  linkFingerprints(seeded.recorded);
  const { ap } = seeded;
  const entry = tradeEntry(scenario, api);
  const ar = await adjustAdvanceAndCredit(scenario, entry, ap);
  await checkCancellationRules(scenario, entry, ap, ar);
  await checkOpenItemReports(scenario);
  // After the report totals above, so the new AP invoices do not change them.
  await orderToInvoice(scenario);
  await orderInvoicingFilter(scenario, entry);
  await sourceOrders(scenario);
  await invoiceFilters(scenario);
  await invoiceDetail(scenario);
  const invoiceLinkContext = invoiceLinkContextOf(scenario);
  await detailBack(invoiceLinkContext);
  await invoiceLinks(invoiceLinkContext);
  await checkLeaveGuards(scenario);
}

function invoiceLinkContextOf(scenario: ScenarioContext): InvoiceLinkContext {
  const { page, language, name, address, failures, t, detailed, navigate } = scenario;
  return {
    page,
    language,
    name,
    address,
    artifacts,
    failures,
    draftPrefix,
    t,
    detailed,
    navigate,
    keys: { tabTo, type, choose, activate },
  };
}

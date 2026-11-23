// Entering trade documents by keyboard: an AP / AR invoice on the invoice page and an action on
// the adjustment page, each previewed before it is confirmed.
import { expect } from "vitest";
import { activate, choose, type } from "../keyboard.ts";
import type { TradeApi } from "./api-watch.ts";
import type { ScenarioContext } from "./context.ts";

// GATE-01: the invoice page's per-company draft keys in sessionStorage.
export const draftPrefix = "erp.tradeInvoices.v1.";

/** The entry steps with the scenario and its API watch bound. */
export function tradeEntry(scenario: ScenarioContext, api: TradeApi) {
  return {
    invoice: (side: "AP" | "AR", external: string, matched?: boolean) =>
      enterInvoice(scenario, api, side, external, matched),
    action: (kind: string, fields?: Record<string, string>, lostResult?: boolean) =>
      runAdjustment(scenario, api, kind, fields, lostResult),
  };
}

export type TradeEntry = ReturnType<typeof tradeEntry>;

/**
 * One line of 10 × 10 with tax code VAT, `matched` to PO-DEMO's L1. Switching theme and language
 * keeps the draft and posts nothing; for a matched invoice, denied storage blocks the confirmation.
 */
async function enterInvoice(
  scenario: ScenarioContext,
  { envelopes }: TradeApi,
  side: "AP" | "AR",
  external: string,
  matched = false,
) {
  const { page, theme, language, t, button, post, navigate } = scenario;
  await navigate("trade-invoices");
  await choose(page, page.locator("#tinv-side"), side);
  await type(page, page.locator("#tinv-party"), "PARTY");
  await type(page, page.locator("#tinv-externalInvoice"), external);
  if (matched) await type(page, page.locator("#tinv-orderId"), "PO-DEMO");
  await type(
    page,
    page.getByRole("textbox", { name: `${t("tinv.product")} L1`, exact: true }),
    side === "AP" ? "EXPENSE" : "SERVICE",
  );
  await type(
    page,
    page.getByRole("textbox", { name: `${t("tinv.taxCode")} L1`, exact: true }),
    "VAT",
  );
  await type(
    page,
    page.getByRole("textbox", { name: `${t("tinv.quantity")} L1`, exact: true }),
    "10",
  );
  await type(
    page,
    page.getByRole("textbox", { name: `${t("tinv.unitPrice")} L1`, exact: true }),
    "10",
  );
  if (matched)
    await type(
      page,
      page.getByRole("textbox", { name: `${t("tinv.orderLineId")} L1`, exact: true }),
      "L1",
    );
  const preview = await post("tinv.preview", "/api/v1/trade/invoices/preview");
  expect(preview.calculation.gross).toBe(11300);
  expect(preview.poMatch).toBe(matched ? "matched" : "notApplicable");
  // Preference changes must preserve the draft and preview, not post anything.
  const before = envelopes.length;
  await choose(page, page.locator("#workspace-theme"), theme === "red" ? "green" : "red");
  await choose(page, page.locator("#workspace-theme"), theme);
  await choose(page, page.locator("#workspace-language"), language === "zh" ? "en" : "zh");
  await choose(page, page.locator("#workspace-language"), language);
  expect(await page.locator("#tinv-externalInvoice").inputValue()).toBe(external);
  expect(envelopes.length).toBe(before);
  if (matched) {
    await page.evaluate(() => Reflect.set(window, "__denyTradeStorage", true));
    await activate(page, button("tinv.confirm"));
    await page
      .getByRole("alert")
      .filter({ hasText: t("tinv.storageFailed") })
      .waitFor();
    expect(envelopes.length).toBe(before);
    await page.evaluate(() => Reflect.set(window, "__denyTradeStorage", false));
  }
  return await post("tinv.confirm", "/api/v1/trade/invoices");
}

/** With `lostResult`, the first confirmation's result is lost and the retry sends the same body. */
async function runAdjustment(
  { page, t, button, post }: ScenarioContext,
  { envelopes, loseNextResult }: TradeApi,
  kind: string,
  fields: Record<string, string> = {},
  lostResult = false,
) {
  await choose(page, page.getByRole("combobox", { name: t("tadj.kind"), exact: true }), kind);
  for (const [key, value] of Object.entries(fields)) {
    const target = page.getByLabel(t(key as Parameters<typeof t>[0]), { exact: true });
    if (await target.evaluate((element) => element.tagName === "SELECT"))
      await choose(page, target, value);
    else await type(page, target, value);
  }
  await post("tinv.preview", "/api/v1/trade/actions/preview");
  if (lostResult) {
    loseNextResult();
    await activate(page, button("tadj.confirm"));
    await page
      .getByRole("alert")
      .filter({ hasText: t("tinv.uncertain") })
      .waitFor();
    const result = await post("tinv.retryConfirm", "/api/v1/trade/actions");
    expect(envelopes.at(-1)).toBe(envelopes.at(-2));
    return result;
  }
  return await post("tadj.confirm", "/api/v1/trade/actions");
}

// Part 1's own steps: period admission, trade configuration and paying the matched AP invoice.
import { expect } from "vitest";
import { pageState, timed } from "../diagnostics.ts";
import { activate, checked, choose, type } from "../keyboard.ts";
import type { ScenarioContext } from "./context.ts";

/** Admits January 2026 for the trade and tax modules on the period page. */
export async function closePeriod({ page, log, name, t, button, navigate }: ScenarioContext) {
  await navigate("period-close");
  let poll = 0;
  await timed(
    log,
    "choose:#close-month",
    () =>
      choose(
        page,
        page.locator("#close-month"),
        "2026-01",
        expect,
        log &&
          (async (values) => {
            log("poll", {
              test: name,
              poll: poll++,
              values,
              ...(await pageState(page, "#close-month")),
            });
          }),
      ),
    { test: name },
  );
  await checked(page, page.getByLabel(t("trpt.trade"), { exact: true }));
  await checked(page, page.getByLabel(t("trpt.taxModule"), { exact: true }));
  await type(page, page.locator("#trade-period-reason"), "Fictional GUI acceptance");
  const admission = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/v1/periods",
  );
  await activate(page, button("trpt.save"));
  expect((await admission).status()).toBe(200);
  await page
    .getByRole("status")
    .filter({ hasText: t("trpt.saved") })
    .waitFor();
}

/** Terms, tax code, AP / AR profiles, the party and two products on the trade page. */
export async function configureTradeMasterData(scenario: ScenarioContext) {
  const config = configurer(scenario);
  await scenario.navigate("trade");
  await config("tradeTerms", "N30", {});
  await config("taxCode", "VAT", {
    inputAccount: "1400",
    outputAccount: "2200",
    rates: JSON.stringify([
      { id: "STANDARD", from: "2026-01-01", to: "2026-12-31", ratePercent: "13" },
    ]),
  });
  await config("tradeProfile", "PAY", {
    controlAccount: "2100",
    advanceAccount: "1250",
    cashAccount: "1000",
    discountAccount: "4000",
  });
  await config("tradeProfile", "REC", {
    side: "AR",
    controlAccount: "1300",
    advanceAccount: "2300",
    cashAccount: "1000",
    discountAccount: "4000",
  });
  await config("tradeParty", "PARTY", {
    role: "both",
    apProfile: "PAY",
    arProfile: "REC",
    terms: "N30",
    allowedTaxCodes: "VAT",
  });
  await config("tradeProduct", "EXPENSE", { expenseAccount: "5000", allowedTaxCodes: "VAT" });
  await config("tradeProduct", "SERVICE", {
    type: "service",
    revenueAccount: "4000",
    allowedTaxCodes: "VAT",
  });
}

/** Saves one trade master record of `kind`; fields are typed or chosen by their control. */
function configurer({ page, button, post }: ScenarioContext) {
  return async function config(kind: string, code: string, fields: Record<string, string>) {
    await choose(page, page.locator("#trade-kind"), kind);
    await activate(page, button("trade.new"));
    await type(page, page.locator("#trade-code"), code);
    await type(page, page.locator("#trade-name"), `Fictional ${code}`);
    for (const [field, value] of Object.entries(fields)) {
      const target = page.locator(`#trade-${field}`);
      if (await target.evaluate((element) => element.tagName === "SELECT"))
        await choose(page, target, value);
      else await type(page, target, value);
    }
    await post("dim.save", `/api/v1/trade/${kind}`);
    await page.locator("#trade-code").waitFor({ state: "detached" });
  };
}

/** Pays half of AP-DEMO with the early-payment discount. */
export async function settleWithDiscount({ page, t, post, navigate }: ScenarioContext) {
  await navigate("trade-settlements");
  await type(page, page.locator("#tset-party"), "PARTY");
  await checked(
    page,
    page.getByRole("checkbox", { name: `${t("tset.select")} AP-DEMO`, exact: true }),
  );
  await type(
    page,
    page.getByRole("spinbutton", { name: `${t("tset.amount")} AP-DEMO`, exact: true }),
    "5650",
  );
  await checked(
    page,
    page.getByRole("checkbox", { name: `${t("tset.discount")} AP-DEMO`, exact: true }),
  );
  const payment = await post("tinv.preview", "/api/v1/trade/settlements/preview");
  expect(payment.discount).toBe(75);
  expect(payment.cash).toBe(5575);
  expect(payment.allocations[0].remainingGross).toBe(5650);
  await post("tset.confirm", "/api/v1/trade/settlements");
}

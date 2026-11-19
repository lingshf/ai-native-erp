import { chromium } from "playwright";
import { expect, test, vi } from "vitest";
import { tabTo } from "../support/trade-gui-scenario.ts";

test("chooses the short keyboard path after probing an unknown focus position", async ({
  onTestFinished,
}) => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.ERP_E2E_BROWSER_CHANNEL,
  });
  onTestFinished(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(
    Array.from(
      { length: 100 },
      (_, index) => `<button id="stop-${index}">Stop ${index}</button>`,
    ).join(""),
  );
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  const press = vi.spyOn(page.keyboard, "press");
  const target = page.locator("#stop-98");
  await tabTo(page, target);
  expect(
    await target.evaluate((element) => element === document.activeElement && document.hasFocus()),
  ).toBe(true);
  expect(press.mock.calls.length).toBeLessThanOrEqual(8);
});

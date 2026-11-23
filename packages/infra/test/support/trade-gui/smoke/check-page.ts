import type { ExpectStatic } from "vitest";
import type { Page } from "playwright";
import { collectLeakedText } from "./leaked-text.ts";
import { type Label, type TradePage, tradePages } from "./pages.ts";
import type { PageTraffic } from "./watch-page.ts";

// One smoke test's page and settings, shared by every trade page it checks.
export type SmokeVisit = PageTraffic & {
  page: Page;
  expect: ExpectStatic;
  address: string;
  language: "zh" | "en";
  theme: "red" | "green";
  t: Label;
  foreign: string[];
  data: string[];
};

// Checks every trade page in order on the visit's page.
export async function checkTradePages(visit: SmokeVisit) {
  for (const tradePage of tradePages) await checkTradePage(visit, tradePage);
}

// Opens one trade page and checks it loaded its data, translated and themed, without errors.
async function checkTradePage(
  visit: SmokeVisit,
  { path, title, request, loaded, reveal }: TradePage,
) {
  const { page, expect, address, language, theme, t, failures, pending } = visit;
  const listed = page.waitForResponse((response) => request(new URL(response.url())), {
    timeout: 10_000,
  });
  await page.goto(`${address}#/${path}`);
  await page.waitForURL((url) => url.hash === `#/${path}`);
  expect((await listed).status(), `${path} list request`).toBe(200);
  await expect
    .poll(() => page.locator("main h2").first().textContent(), {
      message: `${path} title`,
      timeout: 10_000,
      interval: 20,
    })
    .toBe(t(title));
  await reveal?.(page, expect);
  await expect
    .poll(() => page.locator(loaded(t)).count(), {
      message: `${path} seeded rows loaded`,
      timeout: 10_000,
      interval: 20,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() => pending(), {
      message: `${path} API requests settle`,
      timeout: 10_000,
      interval: 20,
    })
    .toBe(0);
  expect(await page.locator("html").getAttribute("lang"), path).toBe(language);
  expect(await page.locator(".workspace").getAttribute("data-theme"), path).toBe(theme);
  const alerts = await page
    .locator("[role=alert], .message-bar.danger, .message-bar.warning")
    .filter({ visible: true })
    .allTextContents();
  expect(alerts, `${path} error alerts`).toEqual([]);
  expect(failures, `${path} API or page errors`).toEqual([]);
  const leaked = await collectLeakedText(page, visit);
  expect(leaked, `${language} ${path}: hard-coded or other-language text`).toEqual([]);
}

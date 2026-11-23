// TINV-05 / TINV-07: the invoice list's filter bar, with teaching explanations on and off.
import type { Dialog } from "playwright";
import { expect } from "vitest";
import { activate, choose, tabTo } from "../keyboard.ts";
import { artifacts } from "../paths.ts";
import { longOrderId } from "../seed.ts";
import { join } from "node:path";
import type { ScenarioContext } from "./context.ts";
import { sourceCell } from "./invoice-source-orders.ts";

type FilterView = ReturnType<typeof filterView>;
type SourceCell = Awaited<ReturnType<typeof sourceCell>>;

// TINV-05: the filter bar narrows the list by keyboard (Apply button and Enter) with teaching
// explanations on and off; TINV-07: each applied filter is written to the address by replace
// (no history entry) and nothing asks to leave. At 390 px the bar wraps inside the page. Ends
// unfiltered at 1440 with teaching restored.
export async function invoiceFilters(scenario: ScenarioContext) {
  const { page, failures, navigate } = scenario;
  await navigate("trade-invoices");
  const length = await page.evaluate(() => window.history.length);
  const view = filterView(scenario, length);
  const { teaching, count } = view;
  const initial = await teaching.isChecked();
  page.on("dialog", count);
  try {
    for (const on of [initial, !initial]) await filterInMode(scenario, view, on);
    if ((await teaching.isChecked()) !== initial) {
      await tabTo(page, teaching);
      await page.keyboard.press("Space");
    }
    await expect.poll(() => teaching.isChecked()).toBe(initial);
  } finally {
    page.off("dialog", count);
  }
  const dialogs = view.dialogs();
  expect(dialogs).toBe(0);
  expect(failures).toEqual([]);
}

/**
 * The list, the filter bar and its fields, a dialog counter (any dialog is dismissed), the GET a
 * filter sends, and `addressed`: the address holds exactly the filters, with no history entry.
 */
function filterView({ page, t }: ScenarioContext, length: number) {
  const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
  const bar = page.getByRole("search", { name: t("tinv.filter"), exact: true });
  const row = (external: string) => list.locator("tbody tr").filter({ hasText: external }).first();
  const teaching = page.locator("#workspace-teaching");
  const party = page.locator("#tinv-filter-party");
  let dialogs = 0;
  const count = async (dialog: Dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  };
  const filtered = (query: string) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/trade/invoices" && url.search.includes(query);
    });
  const addressed = async (filters: Record<string, string>) => {
    await page.waitForTimeout(300);
    const [path, query = ""] = new URL(page.url()).hash.split("?");
    expect(path).toBe("#/trade-invoices");
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      company: "DEFAULT",
      ...filters,
    });
    expect(await page.evaluate(() => window.history.length)).toBe(length);
    expect(dialogs).toBe(0);
  };
  return { bar, row, teaching, party, count, filtered, addressed, dialogs: () => dialogs };
}

/** One pass with teaching explanations `on`: filter by side, check the layouts, filter to none. */
async function filterInMode(scenario: ScenarioContext, view: FilterView, on: boolean) {
  const { page } = scenario;
  const { bar, row, teaching } = view;
  if ((await teaching.isChecked()) !== on) {
    await tabTo(page, teaching);
    await page.keyboard.press("Space");
  }
  await expect.poll(() => teaching.isChecked()).toBe(on);
  await bar.waitFor();
  await row("AP-DEMO").waitFor();
  const mode = on ? "teaching" : "plain";
  // The unfiltered source cell on this page, compared with the filtered one at 1440.
  const unfiltered = await sourceCell(row("AR-LONG-SO"));
  await filterSideAR(scenario, view);
  await checkFilteredWide(scenario, view, mode, unfiltered);
  await checkFilteredNarrow(scenario, view, mode);
  await filterUnknownParty(scenario, view);
  await clearFilters(scenario, view);
}

// Direction AR through the Apply button: the AP invoice leaves, the AR ones stay.
async function filterSideAR({ page, t }: ScenarioContext, view: FilterView) {
  const { bar, row, filtered, addressed } = view;
  await choose(page, page.locator("#tinv-filter-side"), "AR");
  const ar = filtered("side=AR");
  await activate(page, bar.getByRole("button", { name: t("tinv.filter.apply") }));
  expect((await ar).status()).toBe(200);
  await expect.poll(() => row("AP-DEMO").count()).toBe(0);
  await row("AR-DEMO").waitFor();
  await row("AR-FROM-SO").waitFor();
  await addressed({ side: "AR" });
}

// With the bar applied the source order column keeps the TINV-04 row height; at 1440 its
// width equals the unfiltered one, at 390 it keeps the 240 px bound (D323).
async function checkFilteredWide(
  { page, name }: ScenarioContext,
  { row }: FilterView,
  mode: string,
  unfiltered: SourceCell,
) {
  const filtered1440 = await sourceCell(row("AR-LONG-SO"));
  console.log(
    `[tinv05] ${name} ${mode} 1440 source cell unfiltered ${JSON.stringify(unfiltered)} filtered ${JSON.stringify(filtered1440)}`,
  );
  expect(filtered1440).toMatchObject({ row: 44, title: longOrderId });
  expect(filtered1440.cell).toBe(unfiltered.cell);
  await page.screenshot({ path: join(artifacts, `${name}-invoice-filter-${mode}.png`) });
}

/** At 390 (left set for the next step): the bounded source cell and the wrapped filter bar. */
async function checkFilteredNarrow(
  { page, name }: ScenarioContext,
  { bar, row }: FilterView,
  mode: string,
) {
  await page.setViewportSize({ width: 390, height: 1100 });
  const filtered390 = await sourceCell(row("AR-LONG-SO"));
  console.log(`[tinv05] ${name} ${mode} 390 source cell filtered ${JSON.stringify(filtered390)}`);
  expect(filtered390).toMatchObject({ row: 44, title: longOrderId });
  expect(filtered390.cell).toBeLessThanOrEqual(240);
  await bar.scrollIntoViewIfNeeded();
  const layout = await bar.evaluate((element) => {
    const items = [...element.children].map((child) => child.getBoundingClientRect());
    return {
      rows: new Set(items.map((rect) => Math.round(rect.top))).size,
      right: Math.max(...items.map((rect) => rect.right)),
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(layout.rows).toBeGreaterThan(1);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  expect(layout.overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: join(artifacts, `${name}-invoice-filter-${mode}-390.png`),
  });
}

// A party with no invoices through Enter in the field: the filtered empty state.
async function filterUnknownParty({ page, t }: ScenarioContext, view: FilterView) {
  const { party, filtered, addressed } = view;
  await tabTo(page, party);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("NOPARTY");
  const none = filtered("party=NOPARTY");
  await page.keyboard.press("Enter");
  expect((await none).status()).toBe(200);
  await page
    .locator("p.empty-state")
    .filter({ hasText: t("tinv.filter.none") })
    .waitFor();
  await addressed({ party: "NOPARTY", side: "AR" });
}

/** Back at 1440, the Clear button empties both fields and the address. */
async function clearFilters({ page, t }: ScenarioContext, view: FilterView) {
  const { bar, row, party, addressed } = view;
  await page.setViewportSize({ width: 1440, height: 1100 });
  await activate(page, bar.getByRole("button", { name: t("tinv.filter.clear") }));
  await row("AP-DEMO").waitFor();
  expect(await party.inputValue()).toBe("");
  expect(await page.locator("#tinv-filter-side").inputValue()).toBe("");
  await addressed({});
}

// TINV-06: the invoice list's read-only detail dialog, opened by keyboard at 1440 and 390.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Dialog, Request } from "playwright";
import { expect } from "vitest";
import { formatMinor } from "../../../../../web/src/reports-data.ts";
import { activate, tabTo } from "../keyboard.ts";
import { artifacts } from "../paths.ts";
import type { ScenarioContext } from "./context.ts";
import { draftPrefix } from "./invoice-entry.ts";
import { checkScrolledToEnd, scrollToEnd, tabToRegion } from "./invoice-detail-scroll.ts";

type DetailView = ReturnType<typeof detailView>;
type Snapshot = Awaited<ReturnType<DetailView["snapshot"]>>;

// TINV-06: the external invoice number opens a read-only detail dialog (Enter and Space), at
// 1440 and 390. The list's scroll position, the history length, the draft and the column
// widths are equal before and after; TINV-07: the address carries `invoice=` while open and
// only `company=` after; nothing asks to leave; focus returns to the row's button; each open
// sends exactly one GET /invoices/:id. AP-DEMO amounts come from seedInvoice / seedSettlement
// and the part 2 advance apply (remaining 36.50 = the open-items report above).
export async function invoiceDetail(scenario: ScenarioContext) {
  const { page, name, detailed, failures, navigate } = scenario;
  await navigate("trade-invoices");
  const view = detailView(scenario);
  const { trigger, dialog, count, detailRequest } = view;
  page.on("dialog", count);
  page.on("request", detailRequest);
  try {
    await trigger.waitFor();
    // Enter opens, Esc closes.
    let before = await openDetail(scenario, view, "Enter", 1440);
    await page.screenshot({ path: join(artifacts, `${name}-invoice-detail.png`) });
    await page.keyboard.press("Escape");
    await closedDetail(scenario, view, before);
    // Space opens, the dialog's own Close button closes.
    before = await openDetail(scenario, view, "Space", 1440);
    await activate(
      page,
      dialog.getByRole("button", { name: detailed("tinv.detail.close"), exact: true }),
    );
    await closedDetail(scenario, view, before);
    await page.setViewportSize({ width: 390, height: 1100 });
    try {
      await detailAt390(scenario, view);
    } finally {
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
  } finally {
    page.off("dialog", count);
    page.off("request", detailRequest);
  }
  const details = view.details();
  const dialogs = view.dialogs();
  expect(details).toBe(3);
  expect(dialogs).toBe(0);
  expect(failures).toEqual([]);
}

/** At 390: the detail opens by Enter, and the keyboard scrolls its line table to the last column. */
async function detailAt390(scenario: ScenarioContext, view: DetailView) {
  const { page, name, t } = scenario;
  const before = await openDetail(scenario, view, "Enter", 390);
  await page.screenshot({ path: join(artifacts, `${name}-invoice-detail-390.png`) });
  // Review D356: the lines' scroll region is a Tab stop inside the modal, and the
  // keyboard scrolls it until the last column is in view; focus never leaves the dialog.
  const region = view.dialog.getByRole("region", { name: t("tinv.lines"), exact: true });
  await tabToRegion(page, view.dialog, region);
  const presses = await scrollToEnd(page, region);
  await checkScrolledToEnd(scenario, region, presses);
  await page.keyboard.press("Escape");
  await closedDetail(scenario, view, before);
}

/**
 * AP-DEMO's row button and dialog, counters of browser dialogs (dismissed) and detail GETs, and a
 * snapshot of what opening the dialog must leave unchanged.
 */
function detailView({ page, t, detailed, language }: ScenarioContext) {
  const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
  const scroller = page.locator("section.tinv-list-scroll");
  const trigger = list.getByRole("button", {
    name: `${detailed("tinv.detail.open")} AP-DEMO`,
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: `${detailed("tinv.detail.title")} · AP-DEMO`,
    exact: true,
  });
  const money = (minor: number) => formatMinor(minor, language);
  let dialogs = 0;
  const count = async (event: Dialog) => {
    dialogs += 1;
    await event.dismiss();
  };
  let details = 0;
  const detailRequest = (request: Request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      /^\/api\/v1\/trade\/invoices\/[0-9a-f-]{36}$/.test(url.pathname)
    )
      details += 1;
  };
  const snapshot = () =>
    Promise.all([
      scroller.evaluate((element) => element.scrollTop),
      page.evaluate(() => window.history.length),
      page.evaluate(
        (prefix) =>
          JSON.stringify(
            Object.keys(sessionStorage)
              .filter((key) => key.startsWith(prefix))
              .sort()
              .map((key) => [key, sessionStorage.getItem(key)]),
          ),
        draftPrefix,
      ),
      list.evaluate((table) =>
        [...table.querySelectorAll("thead th")].map((th) => th.getBoundingClientRect().width),
      ),
    ]);
  const focused = () => trigger.evaluate((element) => element === document.activeElement);
  return {
    trigger,
    dialog,
    money,
    count,
    detailRequest,
    snapshot,
    focused,
    details: () => details,
    dialogs: () => dialogs,
  };
}

/** Opens the dialog with `key` at `width`; returns the snapshot taken before. */
async function openDetail(
  scenario: ScenarioContext,
  view: DetailView,
  key: "Enter" | "Space",
  width: number,
) {
  const { page, t } = scenario;
  const { trigger, dialog, snapshot } = view;
  const before = await snapshot();
  const sent = view.details();
  await tabTo(page, trigger);
  await page.keyboard.press(key);
  await dialog.waitFor();
  await dialog.getByRole("table", { name: t("tinv.lines"), exact: true }).waitFor();
  const details = view.details();
  expect(details - sent).toBe(1);
  // TINV-07: the open invoice is in the address (replaced, not pushed).
  expect(new URL(page.url()).hash).toMatch(
    /^#\/trade-invoices\?company=DEFAULT&invoice=[0-9a-f-]{36}$/,
  );
  await checkDetailContent(scenario, view);
  await measureDetail(scenario, view, key, width);
  return before;
}

/** The line table's columns, the totals, the open item's remaining amount and the settlement. */
async function checkDetailContent({ t, detailed }: ScenarioContext, view: DetailView) {
  const { dialog, money } = view;
  const headers = await dialog
    .getByRole("table", { name: t("tinv.lines"), exact: true })
    .locator("thead th")
    .allTextContents();
  expect(headers).toEqual([
    detailed("tinv.detail.lineNo"),
    t("tinv.product"),
    t("tinv.quantity"),
    t("tinv.unitPrice"),
    t("tinv.discountPercent"),
    t("tinv.net"),
    t("tinv.tax"),
    t("tinv.gross"),
    detailed("tinv.detail.matchStatus"),
  ]);
  const totals = dialog.getByRole("region", {
    name: detailed("tinv.detail.totals"),
    exact: true,
  });
  expect(await totals.locator("dd").allTextContents()).toEqual([
    money(10000),
    money(1300),
    money(11300),
  ]);
  const remaining = dialog.getByRole("region", {
    name: detailed("tinv.detail.openItem"),
    exact: true,
  });
  expect(await remaining.locator("dd").last().textContent()).toBe(money(3650));
  const settled = dialog.getByRole("table", {
    name: detailed("tinv.detail.settlements"),
    exact: true,
  });
  expect(await settled.locator("tbody tr").first().locator("td").nth(2).textContent()).toBe(
    money(5650),
  );
}

/** Neither the page nor the dialog scrolls sideways; at 1440 the line table fits its wrap. */
async function measureDetail(
  { name }: ScenarioContext,
  { dialog }: DetailView,
  key: "Enter" | "Space",
  width: number,
) {
  const geometry = await dialog.evaluate((element) => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    dialog: element.getBoundingClientRect().width,
    // The dialog itself never scrolls sideways: wide tables scroll inside their own wrap.
    overflow: element.scrollWidth - element.clientWidth,
    viewport: window.innerWidth,
    lines: (() => {
      const wrap = element.querySelector(".tinv-detail-lines") as HTMLElement;
      return {
        scroll: wrap.scrollWidth,
        client: wrap.clientWidth,
        width: wrap.getBoundingClientRect().width,
      };
    })(),
  }));
  console.log(`[tinv06] ${name} ${width} ${key} ${JSON.stringify(geometry)}`);
  appendFileSync(
    join(artifacts, `${name}-invoice-detail-geometry.json`),
    `${JSON.stringify({ width, key, ...geometry })}\n`,
  );
  expect(geometry.page).toBeLessThanOrEqual(0);
  expect(geometry.dialog).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.lines.width).toBeLessThanOrEqual(geometry.dialog);
  if (width === 1440) expect(geometry.lines.scroll).toBeLessThanOrEqual(geometry.lines.client);
}

/** After closing: focus is back on the row button and nothing in the snapshot changed. */
async function closedDetail(
  { page }: ScenarioContext,
  { dialog, focused, snapshot }: DetailView,
  before: Snapshot,
) {
  await dialog.waitFor({ state: "detached" });
  await expect.poll(focused).toBe(true);
  expect(await snapshot()).toEqual(before);
  expect(new URL(page.url()).hash).toBe("#/trade-invoices?company=DEFAULT");
}

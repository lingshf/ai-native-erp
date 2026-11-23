// TINV-04 / TINV-05: the invoice list's source order column, its links to the order detail, and
// the list's layout at 1440 and 390.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "playwright";
import { expect } from "vitest";
import { activate } from "../keyboard.ts";
import { artifacts } from "../paths.ts";
import { httpSend, longOrderId, seedSourceOrders } from "../seed.ts";
import type { ScenarioContext } from "./context.ts";

type Row = (external: string) => Locator;

// TINV-04: the invoice list's source order column links each invoice to its order detail,
// purchase (PO-DEMO, seeded) and sales (SO-DEMO, seeded here); AR-DEMO has none ("—").
export async function sourceOrders(scenario: ScenarioContext) {
  const { page, t, ordered, address, failures, navigate } = scenario;
  await seedSourceOrders(httpSend(address));
  // The GUI caches lists until it writes itself (staleTime: Infinity); load the HTTP writes.
  await page.reload();
  const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
  const row = (external: string) => list.locator("tbody tr").filter({ hasText: external });
  for (const [external, orderId] of [
    ["AP-DEMO", "PO-DEMO"],
    ["AR-FROM-SO", "SO-DEMO"],
  ] as const) {
    await navigate("trade-invoices");
    const link = row(external).getByRole("link", { name: orderId, exact: true });
    await link.waitFor();
    if (orderId === "PO-DEMO") {
      await checkSourceColumnWide(scenario, row);
      await checkLongOrderIdNarrow(scenario, row);
    }
    // biome-ignore format: keeps the original line breaks of this assertion (REFAC-01b L2a)
    expect(await link.getAttribute("href")).toBe(
      `#/trade-orders?company=DEFAULT&order=${orderId}`,
    );
    await activate(page, link);
    await page.waitForURL((url) => url.hash === `#/trade-orders?company=DEFAULT&order=${orderId}`);
    await page
      .getByRole("table", { name: `${ordered("tord.lines")} ${orderId}`, exact: true })
      .waitFor();
  }
  expect(failures).toEqual([]);
}

/** At 1440: AR-DEMO's empty source cell, the list geometry and the long order ID's cell. */
async function checkSourceColumnWide(scenario: ScenarioContext, row: Row) {
  const { page, t, name } = scenario;
  const none = row("AR-DEMO").locator("td.tinv-source");
  expect(await none.locator("a").count()).toBe(0);
  expect(await none.locator('[aria-hidden="true"]').textContent()).toBe("—");
  // biome-ignore format: keeps the original line breaks of this assertion (REFAC-01b L2a)
  expect(await none.locator(".visually-hidden").textContent()).toBe(
    t("tinv.noSourceOrder"),
  );
  await page.screenshot({ path: join(artifacts, `${name}-invoice-list.png`) });
  await listGeometry(scenario, `${name}-invoice-list-geometry.json`);
  // TINV-05 (D323): row height and title measured at 1440. The 240 px bound applies only
  // at 390 (below, unchanged): at 1440 the auto-layout table hands spare width to columns.
  const wide = await sourceCell(row("AR-LONG-SO"));
  console.log(`[tinv05] ${name} 1440 source cell ${JSON.stringify(wide)}`);
  expect(wide).toMatchObject({ row: 44, title: longOrderId });
}

/** At 390: the 60-character order ID wraps within 3 lines in a bounded cell; then back to 1440. */
async function checkLongOrderIdNarrow(scenario: ScenarioContext, row: Row) {
  const { page, name } = scenario;
  await page.setViewportSize({ width: 390, height: 1100 });
  // The 60-character order ID wraps inside its cell: full text shown (not clipped by
  // the 3-line clamp), the row keeps the virtual list's 44 px, the cell stays bounded.
  const long = row("AR-LONG-SO").getByRole("link", { name: longOrderId, exact: true });
  await long.scrollIntoViewIfNeeded();
  // Lines are counted from the laid-out text (a clamped line is still laid out, just
  // hidden), and the last character must sit inside the link's visible box (1 px slack
  // beyond the half-leading: a 12 px glyph box is taller than the 13 px line box, so its
  // rect overhangs the line by (rect height - 13) / 2 even when nothing is clipped; a 4th
  // line would overhang by a further 13 px). scrollHeight is not used.
  const box = await long.evaluate((element) => {
    const cell = element.closest("td") as HTMLElement;
    const text = element.firstChild as Text;
    const all = document.createRange();
    all.selectNodeContents(text);
    const rects = [...all.getClientRects()].filter((rect) => rect.width > 0);
    const last = document.createRange();
    last.setStart(text, text.length - 1);
    last.setEnd(text, text.length);
    const glyph = last.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    const halfLeading = Math.max(0, (glyph.height - lineHeight) / 2);
    return {
      lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
      overhang: glyph.bottom - element.getBoundingClientRect().bottom - halfLeading,
      row: (cell.parentElement as HTMLElement).getBoundingClientRect().height,
      cell: cell.getBoundingClientRect().width,
      title: element.getAttribute("title"),
    };
  });
  expect(box).toMatchObject({ row: 44, title: longOrderId });
  expect(box.lines).toBeGreaterThanOrEqual(1);
  expect(box.lines).toBeLessThanOrEqual(3);
  expect(box.overhang).toBeLessThanOrEqual(1);
  expect(box.cell).toBeLessThanOrEqual(240);
  // The wide column scrolls inside the table, never the page.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: join(artifacts, `${name}-invoice-list-390.png`) });
  await listGeometry(scenario, `${name}-invoice-list-geometry-390.json`);
  await page.setViewportSize({ width: 1440, height: 1100 });
}

// TINV-05 (D323): the list's column geometry (x relative to the table, width) and row heights,
// logged and written next to the screenshot so the runner compares base and head (±1 px).
export async function listGeometry({ page, t }: ScenarioContext, file: string) {
  const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
  // biome-ignore format: keeps the in-browser callback's original line breaks (REFAC-01b L2c)
  const geometry = await list.evaluate((table) => {
    const left = table.getBoundingClientRect().left;
    return {
      viewport: window.innerWidth,
      table: table.getBoundingClientRect().width,
      columns: [...table.querySelectorAll("thead th")].map((th) => {
        const rect = th.getBoundingClientRect();
        return { text: th.textContent, x: rect.left - left, width: rect.width };
      }),
      rows: [...table.querySelectorAll("tbody tr")].map(
        (tr) => tr.getBoundingClientRect().height,
      ),
    };
  });
  console.log(`[geometry] ${file} ${JSON.stringify(geometry)}`);
  appendFileSync(join(artifacts, file), `${JSON.stringify(geometry)}\n`);
}

// The source order cell of an invoice row: the row's laid-out height, the cell's width and the
// link's title (the full order ID).
export async function sourceCell(target: Locator) {
  const link = target.locator("td.tinv-source a");
  await link.scrollIntoViewIfNeeded();
  return link.evaluate((element) => {
    const cell = element.closest("td") as HTMLElement;
    return {
      row: (cell.parentElement as HTMLElement).getBoundingClientRect().height,
      cell: cell.getBoundingClientRect().width,
      title: element.getAttribute("title"),
    };
  });
}

// TINV-07 A7 browser evidence: the invoice detail deep link (?invoice=) and the invoice filters in
// the address. Every in-page address write is a replace, so history.length never grows; a dirty
// draft still asks exactly once on Back (decision 10, D275). Each exported scenario is split into
// named phases; they share one context handed in by trade-gui-scenario.ts.
import { join } from "node:path";
import { expect } from "vitest";
import type { Dialog, Locator, Page, Request } from "playwright";
import type { label } from "../../../web/src/ui/index.ts";
import type { TradeInvoiceDetailKey } from "../../../web/src/ui/trade-invoice-detail-labels.ts";
import { navigateTitle, targetPageShown, type NavigatePath } from "./navigate-ready.ts";

export type InvoiceLinkContext = {
  page: Page;
  language: "zh" | "en";
  /** Artifact prefix, e.g. `en-green-part2`. */
  name: string;
  /** App origin the deep link is opened against. */
  address: string;
  artifacts: string;
  /** Page errors collected by the scenario; must stay empty. */
  failures: readonly string[];
  /** sessionStorage key prefix of the invoice drafts. */
  draftPrefix: string;
  t: (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) => string;
  detailed: (key: TradeInvoiceDetailKey) => string;
  navigate: (path: NavigatePath) => Promise<void>;
  /** Keyboard-only interaction helpers of the scenario (no click/fill/focus). */
  keys: {
    tabTo: (page: Page, target: Locator) => Promise<void>;
    type: (page: Page, target: Locator, text: string) => Promise<void>;
    choose: (page: Page, target: Locator, value: string) => Promise<void>;
    activate: (page: Page, target: Locator) => Promise<void>;
  };
};

type Side = "AR" | "AP";
const LIST_ADDRESS = "#/trade-invoices?company=DEFAULT";
const DETAIL_PATH = /^\/api\/v1\/trade\/invoices\/[0-9a-f-]{36}$/;

// ---- Shared helpers ------------------------------------------------------------------------

/** The invoice page parts these scenarios touch; AP-DEMO is the invoice opened in detail. */
function invoicePage({ page, t, detailed }: InvoiceLinkContext) {
  const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
  return {
    list,
    bar: page.getByRole("search", { name: t("tinv.filter"), exact: true }),
    title: page.getByRole("heading", { name: t("tinv.title"), exact: true }),
    party: page.locator("#tinv-party"),
    side: page.locator("#tinv-filter-side"),
    row: (external: string) => list.locator("tbody tr").filter({ hasText: external }).first(),
    rows: () => list.locator("tbody tr").allInnerTexts(),
    trigger: list.getByRole("button", {
      name: `${detailed("tinv.detail.open")} AP-DEMO`,
      exact: true,
    }),
    dialog: page.getByRole("dialog", {
      name: `${detailed("tinv.detail.title")} · AP-DEMO`,
      exact: true,
    }),
  };
}
type InvoicePage = ReturnType<typeof invoicePage>;

function historyLength(page: Page) {
  return page.evaluate(() => window.history.length);
}

function hashNow(page: Page) {
  return new URL(page.url()).hash;
}

function draftCount({ page, draftPrefix }: InvoiceLinkContext) {
  return page.evaluate(
    (prefix) => Object.keys(sessionStorage).filter((key) => key.startsWith(prefix)).length,
    draftPrefix,
  );
}

/** Every invoice draft entry, sorted, as one comparable string. */
function draftSnapshot({ page, draftPrefix }: InvoiceLinkContext) {
  return page.evaluate(
    (prefix) =>
      JSON.stringify(
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith(prefix))
          .sort()
          .map((key) => [key, sessionStorage.getItem(key)]),
      ),
    draftPrefix,
  );
}

async function clearInvoiceDrafts({ page, draftPrefix }: InvoiceLinkContext) {
  await page.evaluate((prefix) => {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  }, draftPrefix);
}

/** Like GATE-01 4b/4c: on #/trade-reports (invoice page not mounted), drafts dropped and clean. */
async function startCleanOnReports(ctx: InvoiceLinkContext) {
  if (hashNow(ctx.page) !== "#/trade-reports") await ctx.navigate("trade-reports");
  await clearInvoiceDrafts(ctx);
  expect(await draftCount(ctx)).toBe(0);
}

async function reportsShown({ page, language }: InvoiceLinkContext) {
  await page.waitForURL((url) => url.hash === "#/trade-reports");
  await page.waitForFunction(targetPageShown, navigateTitle(language, "trade-reports"));
}

/** A real Back; a cancelled same-document traversal may never settle as a navigation. */
function browserBack(page: Page) {
  return page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
}

/**
 * Counts every native dialog; `accept` decides the answer, `check` inspects it first. The dialog
 * is always answered, even when `check` throws: a modal left open would block every later history
 * step and the run would only show a navigation timeout. The original assertion error instead
 * rejects `guard(work)`, so the phase being awaited fails with it.
 */
function watchDialogs(page: Page, check?: (dialog: Dialog) => void) {
  const state = { count: 0, accept: false };
  let reject: (error: unknown) => void = () => {};
  const failed = new Promise<never>((_, fail) => {
    reject = fail;
  });
  // Observed through guard(); this only keeps an early failure from being reported as unhandled.
  failed.catch(() => {});
  const answer = async (dialog: Dialog) => {
    state.count += 1;
    try {
      check?.(dialog);
    } catch (error) {
      reject(error);
    } finally {
      await (state.accept ? dialog.accept() : dialog.dismiss());
    }
  };
  page.on("dialog", answer);
  return {
    state,
    guard: <T>(work: Promise<T>) => Promise.race([work, failed]),
    stop: () => page.off("dialog", answer),
  };
}

/** Counts the invoice detail GETs (one per dialog load). */
function watchDetailRequests(page: Page) {
  const state = { count: 0 };
  const seen = (request: Request) => {
    if (request.method() === "GET" && DETAIL_PATH.test(new URL(request.url()).pathname))
      state.count += 1;
  };
  page.on("request", seen);
  return { state, stop: () => page.off("request", seen) };
}

/**
 * Applies the direction filter and waits until the filtered page has rendered: the GET answered,
 * the address replaced, the other side's demo row gone and this side's present. Waiting only for
 * this side's row would accept the old unfiltered rows (or the loading state in between).
 */
async function applySide(ctx: InvoiceLinkContext, ui: InvoicePage, side: Side) {
  const { page, t, keys } = ctx;
  await keys.choose(page, ui.side, side);
  const response = page.waitForResponse((answer) => {
    const url = new URL(answer.url());
    return url.pathname === "/api/v1/trade/invoices" && url.search.includes(`side=${side}`);
  });
  await keys.activate(page, ui.bar.getByRole("button", { name: t("tinv.filter.apply") }));
  expect((await response).status()).toBe(200);
  await page.waitForURL((url) => url.hash === `${LIST_ADDRESS}&side=${side}`);
  await expect.poll(() => ui.row(side === "AR" ? "AP-DEMO" : "AR-DEMO").count()).toBe(0);
  await ui.row(`${side}-DEMO`).waitFor();
}

// ---- detailBack: TINV-06 acceptance 9 + TINV-07 A7 ③④ ----------------------------------------

type DirtyState = { latest: string; rows: string[]; draft: string };

/** Clean draft: Back leaves at once, nothing asks, the dialog unmounts with the page. */
async function cleanBackLeaves(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  confirms: { count: number },
) {
  await startCleanOnReports(ctx);
  await ctx.navigate("trade-invoices");
  await ctx.keys.activate(ctx.page, ui.trigger);
  await ui.dialog.waitFor();
  await browserBack(ctx.page);
  await reportsShown(ctx);
  await ctx.page.waitForTimeout(300);
  expect(confirms.count).toBe(0);
  expect(await ui.dialog.count()).toBe(0);
}

/**
 * Leaves a known forward entry after the invoice page: invoices → reports → Back (the reports
 * page asks nothing) → invoices, forward = reports. Returns the history length to keep.
 */
async function withForwardEntry(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  confirms: { count: number },
) {
  await startCleanOnReports(ctx);
  await ctx.navigate("trade-invoices");
  await ctx.navigate("trade-reports");
  await browserBack(ctx.page);
  await ctx.page.waitForURL((url) => url.hash === "#/trade-invoices");
  await ui.title.waitFor();
  await ui.trigger.waitFor();
  expect(confirms.count).toBe(0);
  expect(await draftCount(ctx)).toBe(0);
  return historyLength(ctx.page);
}

/** ③ Dirty draft, then apply a filter and open the detail: replace only, nothing asks. */
async function dirtyFilterAndOpen(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  confirms: { count: number },
  entries: number,
): Promise<DirtyState> {
  const { page, keys } = ctx;
  await keys.type(page, ui.party, "PARTY-DETAIL");
  await expect.poll(() => draftCount(ctx)).toBe(1);
  await applySide(ctx, ui, "AP");
  await ui.trigger.waitFor();
  await keys.activate(page, ui.trigger);
  await ui.dialog.waitFor();
  await expect
    .poll(() => hashNow(page))
    .toMatch(/^#\/trade-invoices\?company=DEFAULT&side=AP&invoice=[0-9a-f-]{36}$/);
  await page.waitForTimeout(300);
  expect(confirms.count).toBe(0);
  expect(await historyLength(page)).toBe(entries);
  const state = { latest: hashNow(page), rows: await ui.rows(), draft: await draftSnapshot(ctx) };
  expect(await ui.party.inputValue()).toBe("PARTY-DETAIL");
  return state;
}

/**
 * ④ Back asks once; the cancel keeps the address (filter and invoice), the list, the dialog and
 * the draft. D275: the cancel truncated the forward entry, so Forward goes nowhere, asks nothing.
 */
async function cancelledBackKeepsAll(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  confirms: { count: number },
  before: DirtyState,
) {
  const { page } = ctx;
  await browserBack(page);
  await expect.poll(() => confirms.count, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(300);
  expect(confirms.count).toBe(1);
  expect(hashNow(page)).toBe(before.latest);
  await ui.title.waitFor();
  expect(await ui.dialog.isVisible()).toBe(true);
  expect(await ui.rows()).toEqual(before.rows);
  expect(await ui.party.inputValue()).toBe("PARTY-DETAIL");
  expect(await ui.side.inputValue()).toBe("AP");
  expect(await draftSnapshot(ctx)).toBe(before.draft);
  await page.goForward({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
  await page.waitForTimeout(300);
  expect(confirms.count).toBe(1);
  expect(hashNow(page)).toBe(before.latest);
  expect(await ui.dialog.isVisible()).toBe(true);
  expect(await draftSnapshot(ctx)).toBe(before.draft);
}

/** A confirmed Back reaches the previous page; the dirty draft is removed afterwards. */
async function confirmedBackLeaves(
  ctx: InvoiceLinkContext,
  confirms: { count: number; accept: boolean },
) {
  confirms.accept = true;
  await browserBack(ctx.page);
  await expect.poll(() => confirms.count, { timeout: 10_000 }).toBe(2);
  await reportsShown(ctx);
  await ctx.page.waitForTimeout(300);
  expect(confirms.count).toBe(2);
  await clearInvoiceDrafts(ctx);
}

/**
 * TINV-06 acceptance 9: a real Back while the detail dialog is open. TINV-07 A7 dirty segment
 * (③④, decision 10, D275): applying a filter and opening the detail only replace; Back asks
 * exactly once; a cancel restores everything and truncates the known forward entry.
 */
export async function detailBack(ctx: InvoiceLinkContext) {
  const ui = invoicePage(ctx);
  const confirms = watchDialogs(ctx.page, (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(ctx.t("trade.leaveConfirm"));
  });
  try {
    const { state, guard } = confirms;
    await guard(cleanBackLeaves(ctx, ui, state));
    const entries = await guard(withForwardEntry(ctx, ui, state));
    const dirty = await guard(dirtyFilterAndOpen(ctx, ui, state, entries));
    await guard(cancelledBackKeepsAll(ctx, ui, state, dirty));
    await guard(confirmedBackLeaves(ctx, state));
  } finally {
    confirms.stop();
  }
  expect(ctx.failures).toEqual([]);
}

// ---- invoiceLinks: TINV-07 A7 ①②⑤ -----------------------------------------------------------

/** The dialog and its lines are shown, after exactly one more detail GET than `sent`. */
async function detailLoaded(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  details: { count: number },
  sent: number,
) {
  await ui.dialog.waitFor();
  await ui.dialog.getByRole("table", { name: ctx.t("tinv.lines"), exact: true }).waitFor();
  expect(details.count - sent).toBe(1);
}

/** Escape closes the dialog and the address drops ?invoice= (replace). */
async function detailClosed(ctx: InvoiceLinkContext, ui: InvoicePage) {
  await ctx.page.keyboard.press("Escape");
  await ui.dialog.waitFor({ state: "detached" });
  await expect.poll(() => hashNow(ctx.page)).toBe(LIST_ADDRESS);
}

/**
 * ① Open (replace), reload: the same dialog opens from the address alone; close (replace) and
 * focus returns to the trigger. Returns the deep link.
 */
async function openReloadClose(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  details: { count: number },
  entries: number,
) {
  const { page } = ctx;
  await ctx.keys.tabTo(page, ui.trigger);
  await page.keyboard.press("Enter");
  await detailLoaded(ctx, ui, details, 0);
  const linked = hashNow(page);
  expect(linked).toMatch(/^#\/trade-invoices\?company=DEFAULT&invoice=[0-9a-f-]{36}$/);
  expect(await historyLength(page)).toBe(entries);
  await page.reload();
  await detailLoaded(ctx, ui, details, 1);
  expect(hashNow(page)).toBe(linked);
  expect(await historyLength(page)).toBe(entries);
  await page.screenshot({ path: join(ctx.artifacts, `${ctx.name}-invoice-link.png`) });
  await detailClosed(ctx, ui);
  expect(await historyLength(page)).toBe(entries);
  await expect
    .poll(() => ui.trigger.evaluate((element) => element === document.activeElement))
    .toBe(true);
  return linked;
}

/** ② Apply (replace), reload: the filter and the same list come back; clear (replace). */
async function applyReloadClear(ctx: InvoiceLinkContext, ui: InvoicePage, entries: number) {
  const { page } = ctx;
  await applySide(ctx, ui, "AR");
  expect(await historyLength(page)).toBe(entries);
  const filtered = await ui.rows();
  await page.reload();
  await ui.row("AR-DEMO").waitFor();
  expect(await ui.row("AP-DEMO").count()).toBe(0);
  expect(await ui.rows()).toEqual(filtered);
  expect(await ui.side.inputValue()).toBe("AR");
  expect(hashNow(page)).toBe(`${LIST_ADDRESS}&side=AR`);
  expect(await historyLength(page)).toBe(entries);
  await ctx.keys.activate(page, ui.bar.getByRole("button", { name: ctx.t("tinv.filter.clear") }));
  await page.waitForURL((url) => url.hash === LIST_ADDRESS);
  await ui.row("AP-DEMO").waitFor();
  expect(await historyLength(page)).toBe(entries);
}

/**
 * ⑤ The deep link opened once, cold, at 390 px (a new document from about:blank, so the single
 * detail GET belongs to this load): no horizontal overflow; closing keeps history.length.
 */
async function coldDeepLinkAt390(
  ctx: InvoiceLinkContext,
  ui: InvoicePage,
  details: { count: number },
  linked: string,
) {
  const { page, name } = ctx;
  await page.setViewportSize({ width: 390, height: 1100 });
  try {
    await page.goto("about:blank");
    await page.goto(`${ctx.address}${linked}`);
    await detailLoaded(ctx, ui, details, 2);
    expect(hashNow(page)).toBe(linked);
    const opened = await historyLength(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    console.log(`[tinv07] ${name} 390 deep link overflow ${overflow}`);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: join(ctx.artifacts, `${name}-invoice-link-390.png`) });
    await detailClosed(ctx, ui);
    expect(await historyLength(page)).toBe(opened);
  } finally {
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
}

/**
 * TINV-07 A7 clean segment (①②⑤, draft cleared first): the address restores the open invoice and
 * the applied filters after a reload; every in-page replace keeps history.length; a cold deep link
 * at 390 px stays inside the viewport. One GET per detail load; nothing asks; no draft at the end.
 */
export async function invoiceLinks(ctx: InvoiceLinkContext) {
  const ui = invoicePage(ctx);
  const confirms = watchDialogs(ctx.page);
  const details = watchDetailRequests(ctx.page);
  try {
    await startCleanOnReports(ctx);
    await ctx.navigate("trade-invoices");
    await ui.trigger.waitFor();
    const entries = await historyLength(ctx.page);
    const linked = await openReloadClose(ctx, ui, details.state, entries);
    await applyReloadClear(ctx, ui, entries);
    expect(confirms.state.count).toBe(0);
    await coldDeepLinkAt390(ctx, ui, details.state, linked);
  } finally {
    confirms.stop();
    details.stop();
  }
  expect(details.state.count).toBe(3);
  expect(confirms.state.count).toBe(0);
  expect(await draftCount(ctx)).toBe(0);
  expect(ctx.failures).toEqual([]);
}

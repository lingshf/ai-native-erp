// TINV-04 / GATE-01: leaving a dirty invoice or order draft by Back, by Back right after the first
// key, and by Forward always asks once; cancelling keeps the page and its draft.
import type { Dialog, Page } from "playwright";
import { expect } from "vitest";
import { navigateTitle, targetPageShown } from "../../navigate-ready.ts";
import { tabTo, type } from "../keyboard.ts";
import type { ScenarioContext } from "./context.ts";
import { draftPrefix } from "./invoice-entry.ts";

type Leave = {
  path: "trade-invoices" | "trade-orders";
  field: string;
  message: string;
  title: string;
};
type Confirmed = (count: number) => Promise<void>;

/** Every leave branch on the invoice page and the order page. */
export async function checkLeaveGuards(scenario: ScenarioContext) {
  const { page, t, ordered } = scenario;
  await leaveByBack(
    scenario,
    "trade-invoices",
    "#tinv-party",
    t("trade.leaveConfirm"),
    t("tinv.title"),
    2,
    () => page.getByRole("textbox", { name: `${t("tinv.product")} L1`, exact: true }).waitFor(),
  );
  await leaveByBack(
    scenario,
    "trade-orders",
    "#tord-party",
    ordered("tord.leaveConfirm"),
    ordered("tord.title"),
    1,
  );
  const invoiceLeave = {
    path: "trade-invoices",
    field: "#tinv-party",
    message: t("trade.leaveConfirm"),
    title: t("tinv.title"),
  } as const;
  const orderLeave = {
    path: "trade-orders",
    field: "#tord-party",
    message: ordered("tord.leaveConfirm"),
    title: ordered("tord.title"),
  } as const;
  await leaveOnFirstKey(scenario, invoiceLeave);
  await leaveOnFirstKey(scenario, orderLeave);
  await leaveByForward(scenario, invoiceLeave);
  await leaveByForward(scenario, orderLeave);
}

/** The number of invoice drafts in sessionStorage (GATE-01: one key per company). */
function draftCount(page: Page) {
  return page.evaluate(
    (prefix) => Object.keys(sessionStorage).filter((key) => key.startsWith(prefix)).length,
    draftPrefix,
  );
}

// TINV-04 acceptance 5a: a real Back from a dirty draft asks exactly once; a cancel keeps the
// address, the title and the draft; a confirmed Back reaches the previous page. The invoice
// page cancels twice; the order page (same leave-guard-history.ts gate) cancels once.
async function leaveByBack(
  { page, language, failures, navigate }: ScenarioContext,
  path: "trade-invoices" | "trade-orders",
  field: string,
  message: string,
  title: string,
  cancels: number,
  kept?: () => Promise<unknown>,
) {
  await navigate("trade-reports");
  await navigate(path);
  await type(page, page.locator(field), "PARTY-BACK");
  let dialogs = 0;
  let accept = false;
  const answer = async (dialog: Dialog) => {
    dialogs += 1;
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(message);
    await (accept ? dialog.accept() : dialog.dismiss());
  };
  page.on("dialog", answer);
  const back = async (count: number) => {
    // A cancelled same-document traversal may never settle as a navigation.
    await page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
    await expect.poll(() => dialogs, { timeout: 10_000 }).toBe(count);
    await page.waitForTimeout(300);
    expect(dialogs).toBe(count);
  };
  try {
    for (let count = 1; count <= cancels; count += 1) {
      await back(count);
      expect(new URL(page.url()).hash).toBe(`#/${path}`);
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      expect(await page.locator(field).inputValue()).toBe("PARTY-BACK");
      await kept?.();
    }
    accept = true;
    await back(cancels + 1);
    await page.waitForURL((url) => url.hash === "#/trade-reports");
    await page.waitForFunction(targetPageShown, navigateTitle(language, "trade-reports"));
  } finally {
    page.off("dialog", answer);
  }
  expect(failures).toEqual([]);
}

// GATE-01 acceptance 4b/4c. Each branch starts clean (cleanStart): on #/trade-reports with
// neither guarded page mounted, no invoice draft in sessionStorage (the invoice page restores a
// dirty draft per company) and no confirmation counted. Every dialog is counted; until a branch
// registers its cancel/accept answer, a dialog is dismissed and still counted, so an
// unexpected confirmation fails the count.
async function leaveBranches(
  { page, failures, navigate }: ScenarioContext,
  leave: Leave,
  branch: (accept: boolean, confirmed: Confirmed, register: () => void) => Promise<void>,
) {
  const drafts = () => draftCount(page);
  let dialogs = 0;
  let leaving = false;
  let registered: "dismiss" | "accept" | undefined;
  const watch = async (dialog: Dialog) => {
    expect(dialog.type()).toBe("confirm");
    if (leaving) {
      await dialog.accept();
      return;
    }
    dialogs += 1;
    expect(dialog.message()).toBe(leave.message);
    await (registered === "accept" ? dialog.accept() : dialog.dismiss());
  };
  // The cumulative count of this branch, settled: a second confirmation would arrive late.
  const confirmed = async (count: number) => {
    await expect.poll(() => dialogs, { timeout: 10_000 }).toBe(count);
    await page.waitForTimeout(300);
    expect(dialogs).toBe(count);
  };
  page.on("dialog", watch);
  try {
    for (const accept of [false, true]) {
      // cleanStart(path), 1: a branch left on a dirty page leaves it accepting; not counted.
      if (new URL(page.url()).hash !== "#/trade-reports") {
        leaving = true;
        await navigate("trade-reports");
        leaving = false;
      }
      dialogs = 0;
      registered = undefined;
      // 2: drop the invoice drafts while the invoice page is not mounted.
      await page.evaluate((prefix) => {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith(prefix)) sessionStorage.removeItem(key);
      }, draftPrefix);
      expect(await drafts()).toBe(0);
      // 3: enter the page clean, before any answer is registered or any key is pressed.
      await navigate(leave.path);
      await page.locator(leave.field).waitFor();
      expect(await page.locator(leave.field).inputValue()).toBe("");
      expect(await drafts()).toBe(0);
      await confirmed(0);
      await branch(accept, confirmed, () => {
        registered = accept ? "accept" : "dismiss";
      });
      registered = undefined;
    }
  } finally {
    page.off("dialog", watch);
  }
  expect(failures).toEqual([]);
}

// After a leaving traversal: one confirmation, then either the page kept as it was (cancel) or
// the reports page reached (accept).
async function settledLeave(
  { page, language }: ScenarioContext,
  leave: Leave,
  accept: boolean,
  confirmed: Confirmed,
  value: string,
) {
  await confirmed(1);
  if (accept) {
    await page.waitForURL((url) => url.hash === "#/trade-reports");
    await page.waitForFunction(targetPageShown, navigateTitle(language, "trade-reports"));
    return;
  }
  expect(new URL(page.url()).hash).toBe(`#/${leave.path}`);
  await page.getByRole("heading", { name: leave.title, exact: true }).waitFor();
  expect(await page.locator(leave.field).inputValue()).toBe(value);
}

// 4b (D280 + D282): Back right after the first key that makes the draft dirty still asks.
async function leaveOnFirstKey(scenario: ScenarioContext, leave: Leave) {
  const { page } = scenario;
  await leaveBranches(scenario, leave, async (accept, confirmed, register) => {
    register();
    await tabTo(page, page.locator(leave.field));
    await page.keyboard.press("K");
    // A cancelled same-document traversal may never settle as a navigation.
    await page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
    await settledLeave(scenario, leave, accept, confirmed, "K");
  });
}

// 4c: a real Forward from a dirty draft asks once. Each branch rebuilds its own history: a
// cancel drops the entries ahead (D275).
async function leaveByForward(scenario: ScenarioContext, leave: Leave) {
  const { page, language, navigate } = scenario;
  const drafts = () => draftCount(page);
  await leaveBranches(scenario, leave, async (accept, confirmed, register) => {
    await navigate("trade-reports");
    await confirmed(0);
    // Unguarded (the page is clean); the hash is asserted by waitForURL below.
    await page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
    await page.waitForURL((url) => url.hash === `#/${leave.path}`);
    await page.waitForFunction(targetPageShown, navigateTitle(language, leave.path));
    await page.locator(leave.field).waitFor();
    await confirmed(0);
    expect(await page.locator(leave.field).inputValue()).toBe("");
    expect(await drafts()).toBe(0);
    register();
    await type(page, page.locator(leave.field), "PARTY-FORWARD");
    await page.goForward({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
    await settledLeave(scenario, leave, accept, confirmed, "PARTY-FORWARD");
  });
}

// Part 2, first half: advance, AR credit with a lost result, cancellation rules and the
// open-item reports.
import { join } from "node:path";
import { expect } from "vitest";
import { activate, choose, tabTo, type } from "../keyboard.ts";
import { artifacts } from "../paths.ts";
import type { ScenarioContext } from "./context.ts";
import type { TradeEntry } from "./invoice-entry.ts";

type Document = { documentId: string };

/**
 * Applies an advance to part 1's AP invoice, then credits a new AR invoice (losing the first
 * result) and cancels that credit. Returns the AR invoice.
 */
export async function adjustAdvanceAndCredit(
  { navigate }: ScenarioContext,
  { invoice, action }: TradeEntry,
  ap: Document,
) {
  await navigate("trade-adjustments");
  const advance = await action("advance", { "tinv.party": "PARTY", "tadj.gross": "2000" });
  await action("apply", {
    "tadj.source": advance.actionId,
    "tadj.target": ap.documentId,
    "tadj.gross": "2000",
  });
  const ar = await invoice("AR", "AR-DEMO");
  await navigate("trade-adjustments");
  const credit = await action(
    "credit",
    { "tadj.source": ar.documentId, "tadj.sourceLine": "L1", "tinv.quantity": "2" },
    true,
  );
  expect(credit.gross).toBe(2260);
  await action("cancel", {
    "tadj.source": credit.actionId,
    "tadj.relatedRevision": "2",
    "tadj.reason": "Fictional correction",
  });
  return ar;
}

// An applied invoice cannot be cancelled; a fresh complete invoice can.
export async function checkCancellationRules(
  { page, t, button }: ScenarioContext,
  { action }: TradeEntry,
  ap: Document,
  ar: Document,
) {
  await choose(page, page.getByRole("combobox", { name: t("tadj.kind"), exact: true }), "cancel");
  await choose(page, page.getByLabel(t("tadj.source"), { exact: true }), ap.documentId);
  await type(page, page.getByLabel(t("tadj.relatedRevision"), { exact: true }), "");
  await type(
    page,
    page.getByLabel(t("tadj.reason"), { exact: true }),
    "Fictional dependency check",
  );
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/trade/actions/preview") && response.request().method() === "POST",
  );
  await activate(page, button("tinv.preview"));
  // The cleared related revision is valid for an original AP invoice, so the only accepted
  // reason is the applied-invoice rule on the source item, not a shape or revision check.
  const rejection = await rejected;
  expect(rejection.status()).toBe(400);
  expect(await rejection.json()).toMatchObject({
    code: "INVALID_REQUEST",
    fieldErrors: [{ path: "itemId", messageKey: "api.error.tradeDocument.reference" }],
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "itemId: api.error.tradeDocument.reference" })
    .waitFor();
  await action("cancel", {
    "tadj.source": ar.documentId,
    "tadj.reason": "Fictional unused sale",
  });
}

/** January's open items, ageing and reconciliation, read from the server's responses. */
export async function checkOpenItemReports({ page, name, t, button, navigate }: ScenarioContext) {
  await navigate("trade-reports");
  // Use the rendered monthly filter and verify the actual returned values, not just text.
  const report = page.waitForResponse(
    (response) =>
      response.url().includes("/trade/reports/open-items?") &&
      response.url().includes("month=2026-01"),
  );
  await tabTo(page, page.locator("#trpt-month"));
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("01");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("2026");
  await page.keyboard.press("Tab");
  await activate(page, button("trpt.apply"));
  const balances = await (await report).json();
  expect(balances.totals.invoiceGrossMinor).toBe(3650);
  expect(balances.totals.advanceGrossMinor).toBe(0);
  await activate(page, button("trpt.ageing"));
  await page.getByRole("table", { name: t("trpt.ageing"), exact: true }).waitFor();
  expect(balances.totals.notDue).toBe(3650);
  const reconResponse = page.waitForResponse((response) =>
    response.url().includes("/trade/reports/reconciliation?"),
  );
  await activate(page, button("trpt.reconciliation"));
  const reconciliation = await (await reconResponse).json();
  expect(reconciliation.rows.length).toBeGreaterThan(0);
  expect(
    reconciliation.rows.every(
      (row: { tradeDifferenceMinor: number; differenceMinor: number }) =>
        row.tradeDifferenceMinor === 0 && row.differenceMinor === 0,
    ),
  ).toBe(true);
  await page.getByRole("table", { name: t("trpt.reconciliation"), exact: true }).waitFor();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.screenshot({
    path: join(artifacts, `${name}-reconciliation.png`),
    fullPage: true,
  });
}

// MCF-20: real-Chrome assertions for the six REFAC-31 R8b business-event rows. Prerequisites go
// over HTTP; every asserted action is a click on a rendered control (see the support module).
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Locator, Page } from "playwright";
import {
  type CaseOptions,
  type Phase,
  type T,
  button,
  clickAndAwaitPost,
  confirmEvent,
  detailHeading,
  draftJournal,
  editor,
  fillHeader,
  fillCashService,
  httpSend,
  journalButtons,
  newEvent,
  openClearing,
  openEvents,
  openQueue,
  postedJournalCount,
  preview,
  previewAndConfirm,
  row,
  runCase,
  seedCashService,
  seedClearingSources,
  tableRow,
  visible,
} from "../support/business-events-gui.ts";
import {
  type Server,
  closeAll,
  guiHarness,
  provisionServer,
} from "../support/trade-gui/harness.ts";
import { diagnostics, guiPhase, timed } from "../support/trade-gui-scenario.ts";

const phase: Phase = (name, started) => guiPhase("business-events", name, started);
const log = diagnostics("business-events");
const harness = guiHarness(phase, log);
const servers: Server[] = [];
let address = "";
beforeAll(async () => {
  address = await provisionServer(harness, servers, phase, "business-events", "");
}, 60_000);
afterAll(async () => {
  await timed(log, "afterAll:closeAll", () => closeAll(undefined, servers));
});

const options = (name: string, language: "zh" | "en", theme: "red" | "green"): CaseOptions => ({
  launching: harness.launching,
  phase,
  log,
  name: `business-events-${name}`,
  language,
  theme,
});
const CLEARING = "1280";
type StatisticsPreview = {
  plan: { journals: unknown[] };
  statistics: { quantity: number; scale: number };
};
const count = (locator: Locator) => expect.poll(() => locator.count(), { timeout: 10_000 });

test("A cash service receive/pay and cancel (zh/red)", async () => {
  await seedCashService(httpSend(address), "SVC-A");
  await runCase(options("a", "zh", "red"), async (page, t) => {
    await openEvents(page, address, t);
    let receiveId = "";
    await row(page, phase, "cash-receive", async () => {
      receiveId = await postCashService(page, t, "A-RECEIVE", "receive");
    });
    await row(page, phase, "cash-pay", async () => {
      await postCashService(page, t, "A-PAY", "pay");
    });
    await row(page, phase, "cash-cancel", async () => {
      await button(tableRow(page, t("business.title"), "A-RECEIVE"), t("journal.view")).click();
      await visible(detailHeading(page, "A-RECEIVE", t("business.posted")));
      await button(page, t("business.cash_service.cancel")).click();
      const form = editor(page, t, "cash_service.cancel");
      await visible(
        form.getByText(`${t("business.original")}: ${receiveId}`, {
          exact: true,
        }),
      );
      await fillHeader(page, t, {
        sourceRef: "A-CANCEL",
        memo: "Fictional cancel",
      });
      await previewAndConfirm(page, t);
      await visible(detailHeading(page, "A-CANCEL", t("business.posted")));
      await button(page, receiveId).click();
      await visible(detailHeading(page, "A-RECEIVE", t("business.cancelled")));
      await count(button(page, t("business.cash_service.cancel"))).toBe(0);
    });
  });
}, 60_000);

test("B statistics plans evidence without GL (zh/red; stops before D565 candidate)", async () => {
  const before = await postedJournalCount(address);
  await runCase(options("b", "zh", "red"), async (page, t) => {
    await openEvents(page, address, t);
    await row(page, phase, "statistics", async () => {
      await newEvent(page, t, "statistics", {
        sourceRef: "B-STATS",
        memo: "Fictional count",
      });
      const form = editor(page, t, "statistics");
      await form.getByLabel(t("business.code"), { exact: true }).fill("HEADCOUNT");
      await form.getByLabel(t("business.quantity"), { exact: true }).fill("-3.125");
      await form.getByLabel(t("business.unit"), { exact: true }).fill("person");
      // D565 defect candidate: rendering a statistics preview calls formatMinor with scale 6
      // (business-plan.tsx:70), which only accepts 0-4 (reports-data.ts:110) and throws, so
      // the page unmounts. Asserted up to the last step before it: the preview request itself.
      const planned = await clickAndAwaitPost<StatisticsPreview>(
        button(page, t("journal.preview")),
        /^\/api\/v1\/events\/preview$/,
      );
      expect(planned.plan.journals).toEqual([]);
      expect(planned.statistics).toMatchObject({ quantity: -3_125_000, scale: 6 });
    });
  });
  expect(await postedJournalCount(address)).toBe(before);
}, 60_000);

test("C clearing match reserves every selected line (en/green)", async () => {
  await seedClearingSources(httpSend(address), CLEARING, "C-SOURCE");
  await runCase(options("c", "en", "green"), async (page, t) => {
    await openEvents(page, address, t);
    await row(page, phase, "clearing-match", async () => {
      const lines = await openClearing(page, t, "C-MATCH-1", CLEARING);
      await count(lines).toBe(2);
      for (const line of await lines.all()) {
        await line.press("Space");
        await expect.poll(() => line.isChecked()).toBe(true);
      }
      await previewAndConfirm(page, t);
      await visible(detailHeading(page, "C-MATCH-1", t("business.recorded")));
      await count(await openClearing(page, t, "C-MATCH-2", CLEARING)).toBe(0);
      await visible(editor(page, t, "clearing.match").getByText(t("business.empty")));
    });
  });
}, 60_000);

test("D transfer queue intake and confirm (en/green)", async () => {
  const before = await postedJournalCount(address);
  await runCase(options("d", "en", "green"), async (page, t) => {
    await row(page, phase, "queue-intake", async () => {
      const header = { sourceRef: "D-QUEUE", memo: "Fictional queued journal" };
      const dialog = await draftJournal(page, address, t, header);
      await clickAndAwaitPost(button(dialog, t("business.enqueue")), /^\/api\/v1\/transfer-queue$/);
      await visible(page.getByRole("status").filter({ hasText: t("business.enqueued") }));
      await openEvents(page, address, t);
      await openQueue(page, t, "pending");
      await visible(
        tableRow(page, t("business.queue"), "D-QUEUE").getByText(t("business.pending")),
      );
      expect(await postedJournalCount(address)).toBe(before);
    });
    await row(page, phase, "queue-confirm", async () => {
      await button(tableRow(page, t("business.queue"), "D-QUEUE"), t("journal.preview")).click();
      const dialog = page.getByRole("dialog", {
        name: t("journal.previewTitle"),
      });
      const transfer = button(dialog, t("business.transfer"));
      await clickAndAwaitPost(transfer, /^\/api\/v1\/transfer-queue\/[^/]+\/confirm$/);
      await count(journalButtons(page, t)).toBe(1);
      await openQueue(page, t, "transferred");
      const transferred = tableRow(page, t("business.queue"), "D-QUEUE");
      await visible(transferred.getByText(t("business.transferred")));
      await count(button(transferred, t("journal.preview"))).toBe(0);
      await count(button(transferred, t("business.withdraw"))).toBe(0);
    });
  });
}, 60_000);

/** New cash service → preview shows matched rules → confirm → posted with a journal. */
async function postCashService(page: Page, t: T, sourceRef: string, direction: "receive" | "pay") {
  await newEvent(page, t, "cash_service", {
    sourceRef,
    memo: `Fictional ${direction}`,
  });
  await fillCashService(page, t, {
    direction,
    service: "SVC-A",
    amount: "100",
  });
  const dialog = await preview(page, t);
  await visible(
    dialog.getByRole("heading", {
      name: `${t("business.match")}: ${t("business.cash")}`,
    }),
  );
  const result = await confirmEvent(dialog, t);
  await visible(detailHeading(page, sourceRef, t("business.posted")));
  await count(journalButtons(page, t)).toBe(1);
  return result.event.id;
}

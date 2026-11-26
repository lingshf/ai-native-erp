// MCF-20: HTTP prerequisites and rendered-page steps for business-events-gui.slow.test.ts.
// Prerequisites (services, rules, clearing sources) go over HTTP; every asserted business action
// is a click on a control located by role and visible label.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "playwright";
import { label, type LabelKey, type Language } from "../../../web/src/ui/index.ts";
import type { Diagnostic } from "./trade-gui/diagnostics.ts";
import { closeAll, finishTrace, openTracedPage } from "./trade-gui/harness.ts";
import { artifacts } from "./trade-gui/paths.ts";
import { httpSend } from "./trade-gui/seed.ts";

export type Theme = "red" | "green";
export type Phase = (name: string, started: number) => void;
type Key = Exclude<LabelKey, "shell.httpError">;
export type T = (key: Key) => string;
type Send = ReturnType<typeof httpSend>;

const COMPANY = "DEFAULT";
const EVENT_DATE = "2026-01-15";
/** Wall-clock cap for any single wait on a rendered state or a required request. */
const WAIT_MS = 10_000;

const labels =
  (language: Language): T =>
  (key) =>
    label(language, key);

// ---- Page and context lifecycle -------------------------------------------------------------

export type CaseOptions = {
  launching: Promise<Browser>;
  phase: Phase;
  log: Diagnostic | undefined;
  name: string;
  language: Language;
  theme: Theme;
};

/**
 * Runs one case in its own BrowserContext at 1440 × 1000 with teaching off and the case's
 * language and theme preset; keeps the trace on failure and always closes the context.
 */
export async function runCase(options: CaseOptions, body: (page: Page, t: T) => Promise<void>) {
  const { launching, phase, log, name, language, theme } = options;
  const contexts: BrowserContext[] = [];
  let page: Page | undefined;
  let failed = true;
  log?.("test", { test: name, phase: "start" });
  try {
    ({ page } = await openTracedPage(launching, phase, (c) => contexts.push(c), log, name));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(
      (preferences) =>
        localStorage.setItem("erp.workspace.preferences.v1", JSON.stringify(preferences)),
      { language, theme, teaching: false },
    );
    await body(page, labels(language));
    failed = false;
  } finally {
    log?.("test", { test: name, phase: "end", failed });
    const [context] = contexts;
    try {
      if (context && page) await finishTrace(context, page, name, failed);
    } finally {
      await closeAll(context, []);
    }
  }
}

/** One named acceptance row: timed through `phase` and closed with a screenshot. */
export async function row(page: Page, phase: Phase, name: string, action: () => Promise<void>) {
  const started = performance.now();
  await action();
  phase(name, started);
  await page.screenshot({
    path: join(artifacts, `business-events-${name}.png`),
    fullPage: true,
  });
}

// ---- HTTP prerequisites and read-backs -------------------------------------------------------

export { httpSend };

/** One service and the four cash/offset rules for receipts (4000) and payments (5000). */
export async function seedCashService(send: Send, service: string) {
  await send("POST", "/api/v1/services", {
    company: COMPANY,
    value: {
      code: service,
      name: `Fictional ${service}`,
      group: "G",
      active: true,
      revision: 0,
      dimensions: {},
    },
  });
  for (const direction of ["receive", "pay"] as const)
    for (const meaning of ["cash", "offset"] as const)
      await send("POST", "/api/v1/posting-rules", {
        company: COMPANY,
        value: postingRule(direction, meaning),
      });
}

function postingRule(direction: "receive" | "pay", meaning: "cash" | "offset") {
  const offset = direction === "receive" ? "4000" : "5000";
  return {
    code: `${direction}-${meaning}`.toUpperCase(),
    revision: 0,
    active: true,
    direction,
    meaning,
    objectScope: "all",
    objectCode: "*",
    partyScope: "all",
    partyCode: "*",
    account: meaning === "cash" ? "1000" : offset,
    dimensions: {},
    from: "2026-01-01",
    to: "2026-12-31",
  };
}

/** A clearing-purpose account and two posted journals with opposite lines on it. */
export async function seedClearingSources(send: Send, account: string, sourcePrefix: string) {
  await send("POST", "/api/v1/accounts", {
    company: COMPANY,
    revision: 0,
    code: account,
    name: `Fictional clearing ${account}`,
    category: "ASSET",
    reportGroup: "cash",
    controlModule: null,
    purpose: "clearing",
    normalSide: "DEBIT",
    contraOf: null,
    active: true,
    manualAllowed: true,
  });
  await postJournal(send, `${sourcePrefix}-1`, [account, "3000"]);
  await postJournal(send, `${sourcePrefix}-2`, ["1000", account]);
}

async function postJournal(send: Send, sourceRef: string, [debit, credit]: [string, string]) {
  const draft = await send("POST", "/api/v1/journals/drafts", {
    company: COMPANY,
    draft: {
      id: randomUUID(),
      revision: 0,
      operation: "journal",
      originalId: null,
      kind: "normal",
      sourceRef,
      date: EVENT_DATE,
      memo: `Fictional ${sourceRef}`,
      headerDimensions: {},
      lines: [
        {
          account: debit,
          debit: "10",
          credit: "",
          dimensions: {},
          suspense: null,
        },
        {
          account: credit,
          debit: "",
          credit: "10",
          dimensions: {},
          suspense: null,
        },
      ],
    },
  });
  const preview = await send("POST", "/api/v1/journals/preview", {
    company: COMPANY,
    draft,
  });
  await send("POST", "/api/v1/journals/confirm", {
    company: COMPANY,
    draftId: draft.id,
    revision: draft.revision,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
}

export async function postedJournalCount(address: string) {
  const response = await fetch(
    new URL(`/api/v1/journals?company=${COMPANY}&status=posted&limit=500`, address),
  );
  const page = (await response.json()) as {
    items: unknown[];
    nextCursor?: string | null;
  };
  if (!response.ok || page.nextCursor) throw new Error("Unexpected posted journal page");
  return page.items.length;
}

// ---- Rendered-page steps ---------------------------------------------------------------------

export const button = (scope: Page | Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });

export const visible = (locator: Locator) =>
  locator.waitFor({ state: "visible", timeout: WAIT_MS });

/** The "View <journal id>" buttons of an event detail (list rows only say "View"). */
export const journalButtons = (page: Page, t: T) =>
  page.getByRole("button", { name: new RegExp(`^${t("journal.view")} \\S`) });

/** The detail heading "<source ref> · <status>" of the event shown on the right. */
export const detailHeading = (page: Page, sourceRef: string, status: string) =>
  page.getByRole("heading", { name: `${sourceRef} · ${status}`, exact: true });

export async function openEvents(page: Page, address: string, t: T) {
  await page.goto(`${address}/#/events`);
  await visible(button(page, `${t("business.new")} · ${t("business.cash_service")}`));
}

type Operation = "cash_service" | "statistics" | "clearing.match";
type Header = { sourceRef: string; memo: string };

/** Opens the editor for `operation` and fills the three header fields every event has. */
export async function newEvent(page: Page, t: T, operation: Operation, header: Header) {
  await button(page, `${t("business.new")} · ${t(`business.${operation}`)}`).click();
  await fillHeader(page, t, header);
}

export async function fillHeader(page: Page, t: T, { sourceRef, memo }: Header) {
  await page.getByLabel(t("journal.sourceRef"), { exact: true }).fill(sourceRef);
  await page.getByLabel(t("journal.date"), { exact: true }).fill(EVENT_DATE);
  await page.getByLabel(t("journal.memo"), { exact: true }).fill(memo);
}

/** Clicks the editor's preview and returns the opened preview dialog. */
export async function preview(page: Page, t: T) {
  await button(page, t("journal.preview")).click();
  const dialog = page.getByRole("dialog", { name: t("journal.previewTitle") });
  await visible(dialog);
  return dialog;
}

/** Clicks a required-request button, waits for its POST to return 2xx and returns the body. */
export async function clickAndAwaitPost<Body = unknown>(target: Locator, path: RegExp) {
  const page = target.page();
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" && path.test(new URL(candidate.url()).pathname),
      { timeout: WAIT_MS },
    ),
    target.click(),
  ]);
  if (!response.ok()) throw new Error(`${response.url()} returned ${response.status()}`);
  return (await response.json()) as Body;
}

type EventResult = { event: { id: string }; journalIds: string[] };

export const confirmEvent = (dialog: Locator, t: T) =>
  clickAndAwaitPost<EventResult>(
    button(dialog, t("business.confirm")),
    /^\/api\/v1\/events\/confirm$/,
  );

/** The open editor, named by its legend `business.<operation>`. */
export const editor = (page: Page, t: T, operation: Operation | "cash_service.cancel") =>
  page.getByRole("group", { name: t(`business.${operation}`), exact: true });

/** Preview → `business.confirm` for the event being edited; returns the confirm response. */
export async function previewAndConfirm(page: Page, t: T) {
  return confirmEvent(await preview(page, t), t);
}

type CashService = {
  direction: "receive" | "pay";
  service: string;
  amount: string;
};

export async function fillCashService(page: Page, t: T, cash: CashService) {
  const form = editor(page, t, "cash_service");
  await form
    .getByRole("combobox", { name: t("business.direction"), exact: true })
    .selectOption(cash.direction);
  await form.getByLabel(t("business.service"), { exact: true }).fill(cash.service);
  await form.getByLabel(new RegExp(`^${t("business.amount")} · `)).fill(cash.amount);
}

/** Opens a clearing match on `account` and returns the open-item `business.select` checkboxes. */
export async function openClearing(page: Page, t: T, sourceRef: string, account: string) {
  await newEvent(page, t, "clearing.match", {
    sourceRef,
    memo: `Fictional ${sourceRef}`,
  });
  const form = editor(page, t, "clearing.match");
  await form.getByLabel(t("journal.account"), { exact: true }).fill(account);
  await button(form, t("business.openItems")).click();
  return form.getByRole("checkbox", {
    name: t("business.select"),
    exact: true,
  });
}

/** Saves a two-line `journal` draft on the journals page and opens its preview dialog. */
export async function draftJournal(page: Page, address: string, t: T, header: Header) {
  await page.goto(`${address}/#/journals`);
  await button(page, t("journal.new")).click();
  await fillHeader(page, t, header);
  const line = (index: number, column: Key) =>
    page.getByLabel(`${t("journal.line")} ${index} ${t(column)}`, {
      exact: true,
    });
  await line(1, "journal.account").fill("1000");
  await line(1, "journal.debit").fill("10");
  await line(2, "journal.account").fill("3000");
  await line(2, "journal.credit").fill("10");
  await button(page, t("journal.save")).click();
  await visible(page.getByRole("status").filter({ hasText: t("journal.saved") }));
  return preview(page, t);
}

/**
 * The transfer-queue view with its status filter set to `status`. The view switch, the filter and
 * the table all carry the `business.queue` name, so each is located by role, not by label.
 */
export async function openQueue(page: Page, t: T, status: "pending" | "transferred") {
  const filter = page.getByRole("combobox", {
    name: t("business.queue"),
    exact: true,
  });
  if (!(await filter.isVisible())) await button(page, t("business.queue")).click();
  await filter.selectOption(status);
}

/** The row of the table named `table` whose first cell is exactly `sourceRef`. */
export const tableRow = (page: Page, table: string, sourceRef: string) =>
  page
    .getByRole("table", { name: table, exact: true })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: sourceRef, exact: true }) });

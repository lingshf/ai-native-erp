// The scenario's shared context: resources started per test, and the page, labels and generic
// closures every phase uses. Values one phase produces for a later one are returned, not stored here.
import type { BrowserContext, Page } from "playwright";
import { expect, type TestContext } from "vitest";
import { label } from "../../../../../web/src/ui/index.ts";
import { orderLabel, type TradeOrderKey } from "../../../../../web/src/ui/trade-order-labels.ts";
import {
  detailLabel,
  type TradeInvoiceDetailKey,
} from "../../../../../web/src/ui/trade-invoice-detail-labels.ts";
import { navigateTitle, targetPageShown, type NavigatePath } from "../../navigate-ready.ts";
import { type Diagnostic, pageState, timed } from "../diagnostics.ts";
import {
  type Server,
  closeAll,
  type guiHarness,
  openTracedPage,
  provisionServer,
} from "../harness.ts";
import { activate } from "../keyboard.ts";
import { freshIds, httpSend, seedPartOne } from "../seed.ts";

export type Language = "zh" | "en";
export type Theme = "red" | "green";
export type Part = 1 | 2;
export type Phase = (name: string, started: number) => void;
type LabelKey = Exclude<Parameters<typeof label>[1], "shell.httpError">;
type Button = (key: LabelKey) => ReturnType<Page["getByRole"]>;

export type ScenarioContext = {
  page: Page;
  log: Diagnostic | undefined;
  phase: Phase;
  /** Artifact and diagnostics prefix, e.g. `en-green-part2`. */
  name: string;
  language: Language;
  theme: Theme;
  part: Part;
  /** App origin of this test's server. */
  address: string;
  /** Page errors; must stay empty. */
  failures: string[];
  t: (key: LabelKey) => string;
  ordered: (key: TradeOrderKey) => string;
  detailed: (key: TradeInvoiceDetailKey) => string;
  button: Button;
  post: ReturnType<typeof poster>;
  navigate: ReturnType<typeof navigator>;
};

type ResourceOptions = {
  harness: ReturnType<typeof guiHarness>;
  phase: Phase;
  log: Diagnostic | undefined;
  name: string;
  part: Part;
  onTestFinished: TestContext["onTestFinished"];
};

/** The traced page, this test's server (seeded with part 1 for part 2) and part 1's replay target. */
export async function startResources({
  harness,
  phase,
  log,
  name,
  part,
  onTestFinished,
}: ResourceOptions) {
  const servers: Server[] = [];
  let context: BrowserContext | undefined;
  onTestFinished(async () => {
    const started = performance.now();
    await timed(log, "onTestFinished:closeAll", () => closeAll(context, servers), { test: name });
    phase("resources", started);
  });
  const opening = openTracedPage(
    harness.launching,
    phase,
    (created) => {
      context = created;
    },
    log,
    name,
  );
  const provision = (file: string, prefix: string) =>
    provisionServer(harness, servers, phase, file, prefix);
  const serving = (async () => {
    const address = await provision(name, "");
    if (part === 1) return { address, seeded: undefined };
    const started = performance.now();
    const seeded = await seedPartOne(httpSend(address), freshIds());
    phase("seed", started);
    return { address, seeded };
  })();
  // Part 1's replay target: a second, untouched server built the same way, ready by the time
  // the GUI path finishes.
  const replaying = part === 1 ? provision(`${name}-replay`, "replay-") : Promise.resolve("");
  // Wait for all sides so a failure on one never leaves another creating resources.
  const [opened, served, replayed] = await Promise.allSettled([opening, serving, replaying]);
  if (opened.status === "rejected") throw opened.reason;
  if (served.status === "rejected") throw served.reason;
  if (replayed.status === "rejected") throw replayed.reason;
  const { page, context: traced } = opened.value;
  const { address, seeded } = served.value;
  const replayAddress = replayed.value;
  return { page, traced, address, seeded, replayAddress };
}

type ContextOptions = Pick<
  ScenarioContext,
  "page" | "log" | "phase" | "name" | "language" | "theme" | "part" | "address"
>;

/** Labels and generic closures; starts collecting page errors. */
export function scenarioContext(options: ContextOptions): ScenarioContext {
  const { page, language } = options;
  const t = (key: LabelKey) => label(language, key);
  const button = (key: Parameters<typeof t>[0]) =>
    page.getByRole("button", { name: t(key), exact: true });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  return {
    ...options,
    failures,
    t,
    ordered: (key: TradeOrderKey) => orderLabel(language, key),
    detailed: (key: TradeInvoiceDetailKey) => detailLabel(language, key),
    button,
    post: poster(page, button, failures),
    navigate: navigator(options),
  };
}

/** Activates a button and returns the body of the POST to `path`, which must succeed. */
function poster(page: Page, button: Button, failures: string[]) {
  return async function post(key: LabelKey, path: string) {
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === path && response.request().method() === "POST",
    );
    await activate(page, button(key));
    const response = await pending;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBeLessThan(300);
    expect(failures).toEqual([]);
    return body;
  };
}

/** Keyboard navigation through the menu, once no financial operation is still running. */
function navigator({ page, language, log, name }: ContextOptions) {
  return async function navigate(path: NavigatePath) {
    await expect
      .poll(
        () => page.locator('main fieldset:disabled, main select[id$="-company"]:disabled').count(),
        {
          message: "Financial operation must finish before keyboard navigation",
          timeout: 10_000,
        },
      )
      .toBe(0);
    await activate(page, page.locator(`nav a[href="#/${path}"]`));
    await page.waitForURL((url) => url.hash === `#/${path}`);
    await page.waitForFunction(targetPageShown, navigateTitle(language, path));
    await page.locator("main h2").waitFor();
    if (log) log("navigated", { test: name, path, ...(await pageState(page)) });
  };
}

// Page-level smoke over every trade page for each language/theme combination.
import { type TestContext, afterAll, beforeAll, expect, test } from "vitest";
import type { BrowserContext } from "playwright";
import { type LabelKey, label } from "../../../../web/src/ui/index.ts";
import { diagnostics, guiPhase, timed } from "./diagnostics.ts";
import {
  type Server,
  closeAll,
  finishTrace,
  guiHarness,
  openTracedPage,
  provisionServer,
} from "./harness.ts";
import { choose } from "./keyboard.ts";
import { freshIds, httpSend, seedPartOne } from "./seed.ts";
import { checkTradePages } from "./smoke/check-page.ts";
import { foreignLabels } from "./smoke/foreign-labels.ts";
import { watchPageTraffic } from "./smoke/watch-page.ts";

// Page-level smoke for every language/theme combination: each trade page loads from the
// real build and API with the selected `lang` and `data-theme`, shows its translated title and
// renders no text that is hard-coded or leaked from the other language (in zh: no lowercase Latin
// word the dictionary and data do not use). The keyboard main path
// itself runs in full for zh/red and en/green only (trade-gui-<combo>-{1,2}.slow.test.ts).
export function tradeGuiSmoke(combinations: readonly (readonly ["zh" | "en", "red" | "green"])[]) {
  const phase = (name: string, started: number) => guiPhase("smoke", name, started);
  const log = diagnostics("smoke");
  const harness = guiHarness(phase, log);
  const servers: Server[] = [];
  let address = "";
  let data: string[] = [];
  beforeAll(async () => {
    address = await provisionServer(harness, servers, phase, "smoke", "");
    const started = performance.now();
    // Read-only browsing over the same state part 1 creates, so lists and reports have rows.
    await seedPartOne(httpSend(address), freshIds());
    // User data is not UI text: the initialized company name is deliberately bilingual.
    const companies = (await (await fetch(new URL("/api/v1/companies?limit=100", address))).json())
      .items as { name: string }[];
    // Seeded parties, items and memos are named `Fictional <code>`.
    data = [...companies.map((company) => company.name), "Fictional"];
    expect(data.length).toBeGreaterThan(0);
    phase("seed", started);
  }, 60_000);
  afterAll(async () => {
    await timed(log, "afterAll:closeAll", () => closeAll(undefined, servers));
  });

  // One combination's test: its own browser context, read-only browsing over the seeded state.
  async function smokeCombination(
    language: "zh" | "en",
    theme: "red" | "green",
    { onTestFinished, expect }: TestContext,
  ) {
    const name = `smoke-${language}-${theme}`;
    let context: BrowserContext | undefined;
    log?.("test", { test: name, phase: "start" });
    onTestFinished(async () => {
      await timed(log, "onTestFinished:context.close", () => context?.close(), { test: name });
    });
    const { page } = await openTracedPage(
      harness.launching,
      phase,
      (created) => {
        context = created;
      },
      log,
      name,
    );
    const started = performance.now();
    const { failures, pending } = watchPageTraffic(page);
    const t = (key: LabelKey) => label(language, key);
    const foreign = foreignLabels(language);
    const visit = { page, expect, address, language, theme, t, foreign, data, failures, pending };
    let failed = true;
    try {
      await page.goto(address);
      await choose(page, page.locator("#workspace-language"), language, expect);
      await choose(page, page.locator("#workspace-theme"), theme, expect);
      await checkTradePages(visit);
      expect(failures).toEqual([]);
      failed = false;
    } finally {
      if (context) await finishTrace(context, page, name, failed);
      log?.("test", { test: name, phase: "end", failed });
      phase(`${language}/${theme}`, started);
    }
  }

  // Combinations are independent (own context, read-only browsing), so they run concurrently.
  for (const [language, theme] of combinations)
    test.concurrent(
      `real trade GUI smoke: ${language}/${theme}, every trade page loads its data translated with lang and data-theme`,
      (context) => smokeCombination(language, theme, context),
      60_000,
    );
}

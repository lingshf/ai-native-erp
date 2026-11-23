// Page-level smoke over every trade page for each language/theme combination.
import { type ExpectStatic, afterAll, beforeAll, expect, test } from "vitest";
import type { BrowserContext, Page } from "playwright";
import { label, resources } from "../../../../web/src/ui/index.ts";
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

// Each page's own list query (first load must succeed) and the seeded rows it renders from it.
// Titles, lang and theme render even when the data request fails, so they prove nothing alone.
type Label = (key: string) => string;
const tradePages: readonly {
  path: string;
  title: string;
  request: (url: URL) => boolean;
  loaded: (t: Label) => string;
  // Read-only keyboard step that makes the page show its loaded rows.
  reveal?: (page: Page, check: ExpectStatic) => Promise<void>;
}[] = [
  {
    path: "trade",
    title: "trade.title",
    request: (url) => url.pathname === "/api/v1/trade/tradeParty",
    loaded: (t) => `main table[aria-label="${t("trade.tradeParty")}"] tbody tr`,
  },
  {
    path: "trade-invoices",
    title: "tinv.title",
    request: (url) => url.pathname === "/api/v1/trade/invoices",
    loaded: (t) => `main table[aria-label="${t("tinv.list")}"] tbody tr`,
  },
  {
    path: "trade-settlements",
    title: "tset.title",
    request: (url) =>
      url.pathname === "/api/v1/trade/open-items" && url.searchParams.get("status") === "open",
    loaded: (t) => `main table[aria-label="${t("tset.select")}"] tbody tr`,
  },
  {
    path: "trade-adjustments",
    title: "tadj.title",
    request: (url) =>
      url.pathname === "/api/v1/trade/open-items" && !url.searchParams.has("status"),
    loaded: () => `#tadj-sourceId option:not([value=""])`,
    // The default action (advance) lists no items; cancel lists the open items read-only.
    reveal: (page, check) => choose(page, page.locator("#tadj-kind"), "cancel", check),
  },
  {
    path: "trade-reports",
    title: "trpt.title",
    request: (url) => url.pathname === "/api/v1/trade/reports/open-items",
    loaded: () => "main table tbody tr",
  },
  {
    path: "period-close",
    title: "close.title",
    request: (url) => url.pathname === "/api/v1/periods",
    loaded: () => "#close-month option",
  },
];

// Text the other language would show but this one must not: label values (and the literal
// parts of templates) that differ between the two dictionaries.
function foreignLabels(language: "zh" | "en") {
  const own = resources[language] as Record<string, string>;
  const other = resources[language === "zh" ? "en" : "zh"] as Record<string, string>;
  const ownValues = new Set(Object.values(own));
  const foreign = new Set<string>();
  for (const [key, value] of Object.entries(other)) {
    if (value === own[key]) continue;
    for (const part of value.split(/\{[^{}]+\}/u)) {
      const text = part.trim();
      if (/\p{L}{2}/u.test(text) && !ownValues.has(text)) foreign.add(text);
    }
  }
  return [...foreign];
}

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

  // Combinations are independent (own context, read-only browsing), so they run concurrently.
  for (const [language, theme] of combinations)
    test.concurrent(`real trade GUI smoke: ${language}/${theme}, every trade page loads its data translated with lang and data-theme`, async ({
      onTestFinished,
      expect,
    }) => {
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
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      let pending = 0;
      page.on("request", (request) => {
        if (request.url().includes("/api/")) pending++;
      });
      const settled = (request: { url(): string }) => {
        if (request.url().includes("/api/")) pending--;
      };
      page.on("requestfinished", settled);
      page.on("requestfailed", settled);
      // Any failed API call fails the smoke, even one the page would later retry successfully.
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400)
          failures.push(`${response.status()} ${response.url()}`);
      });
      page.on("requestfailed", (request) => {
        if (request.url().includes("/api/") && request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push(`${request.failure()?.errorText} ${request.url()}`);
      });
      const t = (key: string) => label(language, key);
      const foreign = foreignLabels(language);
      let failed = true;
      try {
        await page.goto(address);
        await choose(page, page.locator("#workspace-language"), language, expect);
        await choose(page, page.locator("#workspace-theme"), theme, expect);
        for (const { path, title, request, loaded, reveal } of tradePages) {
          const listed = page.waitForResponse((response) => request(new URL(response.url())), {
            timeout: 10_000,
          });
          await page.goto(`${address}#/${path}`);
          await page.waitForURL((url) => url.hash === `#/${path}`);
          expect((await listed).status(), `${path} list request`).toBe(200);
          await expect
            .poll(() => page.locator("main h2").first().textContent(), {
              message: `${path} title`,
              timeout: 10_000,
              intervals: [20],
            })
            .toBe(t(title));
          await reveal?.(page, expect);
          await expect
            .poll(() => page.locator(loaded(t)).count(), {
              message: `${path} seeded rows loaded`,
              timeout: 10_000,
              intervals: [20],
            })
            .toBeGreaterThan(0);
          await expect
            .poll(() => pending, {
              message: `${path} API requests settle`,
              timeout: 10_000,
              intervals: [20],
            })
            .toBe(0);
          expect(await page.locator("html").getAttribute("lang"), path).toBe(language);
          expect(await page.locator(".workspace").getAttribute("data-theme"), path).toBe(theme);
          const alerts = await page
            .locator("[role=alert], .message-bar.danger, .message-bar.warning")
            .filter({ visible: true })
            .allTextContents();
          expect(alerts, `${path} error alerts`).toEqual([]);
          expect(failures, `${path} API or page errors`).toEqual([]);
          const leaked = await page.evaluate(
            ({ foreign, english, own, latin }) => {
              const texts: string[] = [];
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const parent = node.parentElement;
                if (!parent || parent.closest("script, style, [hidden]")) continue;
                if (!parent.closest("option") && parent.getClientRects().length === 0) continue;
                texts.push(node.textContent ?? "");
              }
              for (const element of document.body.querySelectorAll(
                "[placeholder], [aria-label], [title], [alt]",
              ))
                for (const name of ["placeholder", "aria-label", "title", "alt"])
                  texts.push(element.getAttribute(name) ?? "");
              return [
                ...new Set(
                  texts
                    .map((text) => text.trim())
                    .filter(
                      (text) =>
                        text &&
                        !own.includes(text) &&
                        ((english && /\p{Script=Han}/u.test(text)) ||
                          (!english &&
                            (text.match(/[A-Za-z]{3,}/gu) ?? []).some(
                              (word) => word !== word.toUpperCase() && !latin.includes(word),
                            )) ||
                          foreign.some(
                            (value) =>
                              text === value || (value.length >= 12 && text.includes(value)),
                          )),
                    ),
                ),
              ];
            },
            {
              foreign,
              english: language === "en",
              own: [...Object.values(resources[language]), ...data],
              // Latin words the zh dictionary or user data itself uses; all-caps words are codes.
              latin: [
                ...new Set(
                  [...Object.values(resources[language]), ...data]
                    .join(" ")
                    .match(/[A-Za-z]{3,}/gu) ?? [],
                ),
              ],
            },
          );
          expect(leaked, `${language} ${path}: hard-coded or other-language text`).toEqual([]);
        }
        expect(failures).toEqual([]);
        failed = false;
      } finally {
        if (context) await finishTrace(context, page, name, failed);
        log?.("test", { test: name, phase: "end", failed });
        phase(`${language}/${theme}`, started);
      }
    }, 60_000);
}

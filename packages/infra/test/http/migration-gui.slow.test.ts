import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { chromium, type Browser } from "playwright";
import { build } from "vite";
import { createApi } from "../../src/http/index.ts";
import { MigrationReader } from "../../src/workers/migration-reader.ts";
import { executeLegacyImport } from "../../src/storage/legacy-import.ts";
import { LegacyImportSnapshot, type ImportChoices } from "../../src/legacy/import-plan.ts";
import { legacyFixture, openingItemsFile } from "../support/legacy-fixture.mjs";
import { diagnostics, guiPhase, tabTo, timed } from "../support/trade-gui-scenario.ts";

let directory: string, browser: Browser;
const artifacts = resolve(process.env.ERP_E2E_ARTIFACTS ?? "artifacts\\ci\\migration-e2e");
const log = diagnostics("migration", artifacts);
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "erp-migration-gui-"));
  await mkdir(artifacts, { recursive: true });
  await timed(log, "build", () =>
    build({
      root: resolve("packages", "web"),
      configFile: resolve("packages", "web", "vite.config.ts"),
      logLevel: "error",
      build: { outDir: join(directory, "web") },
    }),
  );
  const started = performance.now();
  browser = await timed(log, "launch", () =>
    chromium.launch({ headless: true, channel: process.env.ERP_E2E_BROWSER_CHANNEL }),
  );
  browser.on("disconnected", () => log("browser-disconnected"));
  guiPhase("migration", "browser", started);
}, 60_000);
afterAll(async () => {
  await timed(log, "afterAll:browser.close", async () => {
    await browser?.close();
  });
  await timed(log, "afterAll:rm", async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });
});
for (const language of ["zh", "en"] as const)
  for (const theme of ["red", "green"] as const) {
    test(`migration report ${language}/${theme}: actual keyboard disclosure and no write requests`, async (t) => {
      const f = legacyFixture(t);
      const snapshot = new LegacyImportSnapshot(f.target, f.manifest);
      f.readers.push(snapshot);
      const target = join(f.directory, "target.sqlite");
      const choices: ImportChoices = {
        drafts: "skip",
        receipts: "archive-only",
        "source-events": "archive-only",
        "transfer-queue": "archive-only",
        seals: "archive-only",
        audit: "archive-only",
      };
      await executeLegacyImport(snapshot, { target, choices, openingItems: openingItemsFile() });
      const migration = new MigrationReader(target);
      const api = await createApi({
        migration,
        webRoot: join(directory, "web"),
        allowPortZero: true,
        environment: { ERP_PORT: "0" },
      });
      const started = performance.now();
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      guiPhase("migration", "page", started);
      try {
        const origin = await api.listen();
        await page.addInitScript(
          ({ language, theme }) =>
            localStorage.setItem(
              "erp.workspace.preferences.v1",
              JSON.stringify({ language, theme, teaching: false }),
            ),
          { language, theme },
        );
        const writes: string[] = [];
        page.on("request", (request) => {
          if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
        });
        await page.goto(`${origin}/#/migration`);
        await expect
          .poll(() => page.getByRole("status").textContent(), { timeout: 10_000 })
          .toBe(language === "zh" ? "待确认" : "Awaiting confirmation");
        expect(await page.locator(".workspace").getAttribute("data-theme")).toBe(theme);
        expect(await page.getByRole("button").count()).toBe(0);
        const summary = page
          .locator("summary")
          .filter({ hasText: "teaching · journals · skipped (1)" });
        for (let count = 0; count < 100; count++) {
          if (await summary.evaluate((element) => element === document.activeElement)) break;
          await page.keyboard.press("Tab");
        }
        expect(await summary.evaluate((element) => element === document.activeElement)).toBe(true);
        await page.keyboard.press("Enter");
        await expect.poll(() => summary.locator("..").getAttribute("open")).toBe("");
        expect(await summary.locator("..").locator("pre").textContent()).toBe("3");
        await page.keyboard.press("Space");
        await expect.poll(() => summary.locator("..").getAttribute("open")).toBe(null);
        expect(writes).toEqual([]);
        await page.screenshot({
          path: join(artifacts, `migration-${language}-${theme}.png`),
          fullPage: true,
        });
      } finally {
        const data = { test: `${language}/${theme}` };
        await timed(log, "finally:page.close", () => page.close(), data);
        await timed(log, "finally:api.close", () => api.close(), data);
        await timed(log, "finally:migration.close", () => migration.close(), data);
      }
    }, 30_000);
  }

test("chooses the short keyboard path after probing an unknown focus position", async ({
  onTestFinished,
}) => {
  const started = performance.now();
  const page = await browser.newPage();
  guiPhase("migration", "page", started);
  onTestFinished(() => timed(log, "onTestFinished:page.close", () => page.close()));
  await page.setContent(
    Array.from(
      { length: 100 },
      (_, index) => `<button id="stop-${index}">Stop ${index}</button>`,
    ).join(""),
  );
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  const press = vi.spyOn(page.keyboard, "press");
  const target = page.locator("#stop-98");
  await tabTo(page, target);
  expect(
    await target.evaluate((element) => element === document.activeElement && document.hasFocus()),
  ).toBe(true);
  expect(press.mock.calls.length).toBeLessThanOrEqual(8);
});

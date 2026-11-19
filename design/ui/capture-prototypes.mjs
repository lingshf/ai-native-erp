// 生成 UI-1 原型截图：node design/ui/capture-prototypes.mjs
// 输出 design/ui/screenshots/after/<page>[-<variant>].png，宽 1440，整页。
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "screenshots", "after");
const shots = [
  ["overview", "", 1440],
  ["trade-invoices", "", 1440],
  ["trade-reports", "", 1440],
  ["trade-invoices", "theme=green&lang=en", 1440, "trade-invoices-en-green"],
  ["trade-reports", "theme=green", 1440, "trade-reports-green"],
  ["trade-reports", "teaching=0", 1440, "trade-reports-teaching-off"],
  ["trade-invoices", "", 390, "trade-invoices-narrow"],
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" }));
try {
  for (const [page, query, width, name = page] of shots) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    const url = pathToFileURL(join(here, "prototypes", `${page}.html`));
    url.search = query;
    await tab.goto(url.href);
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    await context.close();
    console.log(`${name}.png`);
  }
} finally {
  await browser.close();
}

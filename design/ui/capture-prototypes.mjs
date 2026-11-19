// 生成 UI-1 原型截图：node design/ui/capture-prototypes.mjs
// 输出 design/ui/screenshots/after/<page>[-<variant>].png，整页，DPR=1，PNG 宽 = 视口宽。
// 每张都断言：根页面不横向溢出（scrollWidth ≤ 视口宽），超出视口的元素只能位于自身可滚动/裁剪的容器内。
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
  ["overview", "", 390, "overview-narrow"],
  ["trade-invoices", "", 390, "trade-invoices-narrow"],
  ["trade-reports", "theme=green&lang=en", 390, "trade-reports-narrow-en-green"],
];

function overflowReport() {
  const vw = document.documentElement.clientWidth;
  const escaped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.getBoundingClientRect().right <= vw + 0.5) continue;
    let a = el.parentElement;
    let contained = false;
    while (a && a !== document.body) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) {
        contained = a.getBoundingClientRect().right <= vw + 0.5;
        break;
      }
      a = a.parentElement;
    }
    if (!contained) escaped.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, escaped: escaped.slice(0, 5) };
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" }));
let failed = 0;
try {
  for (const [page, query, width, name = page] of shots) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    const url = pathToFileURL(join(here, "prototypes", `${page}.html`));
    url.search = query;
    await tab.goto(url.href);
    await tab.evaluate(() => document.fonts.ready);
    const report = await tab.evaluate(overflowReport);
    const ok = report.vw === width && report.scrollWidth <= width && report.escaped.length === 0;
    if (!ok) failed++;
    await tab.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    await context.close();
    console.log(`${ok ? "PASS" : "FAIL"} ${name}.png  viewport ${width}  scrollWidth ${report.scrollWidth}${report.escaped.length ? `  escaped: ${report.escaped.join(", ")}` : ""}`);
  }
} finally {
  await browser.close();
}
if (failed) {
  console.error(`${failed} screenshot(s) overflow the viewport`);
  process.exit(1);
}

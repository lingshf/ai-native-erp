// Demo v0.13.1 截图脚本（DEMO-14）：证明 S14 拆分后 7 个页面的外观不变，每页 zh-red / en-green 各 1 张（1440 宽），共 14 张。
//   页面：凭证、业务事件、总账报表、期末结账、贸易报表、订单、发票。
// 用法：node docs/demo/v0.13.1/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs 预置（只有 DEFAULT 账套）。
// D440 / D441 / D444：只有“截图是否拍对”（路由、语言、主题、宽度、页头标题）失败即中止；
// 间距、溢出、页面错误等样式类断言只用 check() 记录进 capture-log-main.json，不中止。
// 到达路径：每页直接 goto 该页的地址（页面本身就是入口，没有被演示的深层状态）。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out, day] = process.argv.slice(2);
if (!base || !out || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: capture.mjs <address> <outDir> <yyyy-mm-dd>");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const checks = [];
function check(label, ok, detail) {
  checks.push({ check: label, ok: Boolean(ok), detail });
  if (!ok) console.log(`CHECK-FAILED(recorded): ${label} ${JSON.stringify(detail)}`);
}
const langs = [
  ["zh", "red"],
  ["en", "green"],
];
const width = 1440;
// 页头标题取自 ui/*-labels.ts；中英文不同，所以标题对不上就说明语言或页面拍错了。
const pages = [
  { name: "journals", route: "/journals", title: { zh: "凭证", en: "Journals" } },
  { name: "business-events", route: "/events", title: { zh: "业务事件", en: "Business events" } },
  { name: "ledger-reports", route: "/ledger-reports", title: { zh: "总账报表", en: "Ledger reports" } },
  { name: "period-close", route: "/period-close", title: { zh: "期末结账", en: "Period close" } },
  { name: "trade-reports", route: "/trade-reports", title: { zh: "往来未结项与账龄", en: "Trade open items and ageing" } },
  { name: "trade-orders", route: "/trade-orders", title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" } },
  { name: "trade-invoices", route: "/trade-invoices", title: { zh: "采购与销售发票", en: "Purchase and sales invoices" } },
];
const contextFor = (lang, theme) =>
  browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 }).then(async (context) => {
    await context.addInitScript((value) => window.localStorage.setItem("erp.workspace.preferences.v1", value), JSON.stringify({ language: lang, theme, teaching: true }));
    return context;
  });
function newPage(context, errors) {
  return context.newPage().then((page) => {
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
    page.on("dialog", (d) => d.dismiss());
    return page;
  });
}

// 发票列表“卡片标题 → 第一个字段标签”的间距：从卡片 header 下边缘量到筛选表单里第一个字段 label 的上边缘。
// 只记录，期望 ≥16 px；不量外框到外框（设计上为 0 px）。
async function invoiceSpacing(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".tinv-list > header");
    const label = document.querySelector("form.tinv-filter .field label");
    if (!header || !label) return null;
    return Math.round((label.getBoundingClientRect().top - header.getBoundingClientRect().bottom) * 10) / 10;
  });
}

let failure = null;
try {
  const companies = await (await fetch(new URL("/api/v1/companies?limit=100", base))).json();
  const codes = JSON.stringify(companies);
  if (!codes.includes('"DEFAULT"')) throw new Error(`readiness: 账套 DEFAULT 不存在：${codes.slice(0, 200)}`);

  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme);
    const errors = [];
    const page = await newPage(context, errors);
    for (const item of pages) {
      const tag = `${lang}-${theme}-${width}`;
      const name = `${item.name}-${tag}`;
      await page.goto(`${base}/#${item.route}?company=DEFAULT`);
      await page.locator(".page-header h2").filter({ hasText: item.title[lang] }).first().waitFor({ timeout: 10000 });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollTo(0, 0));
      const got = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        theme: document.querySelector(".workspace")?.dataset.theme,
        width: window.innerWidth,
        hash: location.hash,
        heading: document.querySelector(".page-header h2")?.textContent?.trim(),
        overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      const want = { lang, theme, width };
      const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
      if (bad.length > 0) throw new Error(`${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
      if (!got.hash.startsWith(`#${item.route}`)) throw new Error(`${name} 截图前 location.hash 应以 #${item.route} 开头，实际 ${got.hash}`);
      if (got.heading !== item.title[lang]) throw new Error(`${name} 页头标题应为 ${item.title[lang]}，实际 ${got.heading}`);
      check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
      const extra = { step: "page", via: `goto #${item.route}?company=DEFAULT` };
      if (item.name === "trade-invoices") {
        const gap = await invoiceSpacing(page);
        check(`${name} 卡片标题到第一个字段标签 ≥ 16 px（只记录）`, gap !== null && gap >= 16, gap);
        extra.invoiceCardHeaderToFirstLabelPx = gap;
      }
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      log.push({ name, hash: got.hash, heading: got.heading, ...extra });
    }
    log.push({ page: "s14", lang, theme, errors });
    check(`${lang}-${theme} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
log.push({ checks });
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log("shots", log.filter((l) => l.name).length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

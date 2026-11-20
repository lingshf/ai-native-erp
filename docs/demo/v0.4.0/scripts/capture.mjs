// Demo v0.4.0 截图脚本：对已启动的演示服务（临时账套，虚构数据）用系统 Chrome 走真实页面并截图。
// 用法：node docs/demo/v0.4.0/scripts/capture.mjs <地址> <输出目录> [迁移核对服务地址]
// 每个组合（zh/红/1440、zh/红/390、en/绿/1440、en/绿/390）各用一个新浏览器上下文；订单页每个组合录入一张不同编号的订单。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out, migrationBase] = process.argv.slice(2);
if (!base || !out) throw new Error("usage: capture.mjs <address> <outDir> [migrationAddress]");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440, "PO-DEMO"],
  ["zh", "red", 390, "PO-DEMO-B"],
  ["en", "green", 1440, "PO-DEMO-C"],
  ["en", "green", 390, "PO-DEMO-D"],
];
const text = {
  zh: { order: ["订单号", "伙伴", "商品", "税码", "数量", "单价"], save: "保存订单", filter: "按伙伴代码筛选未结项" },
  en: { order: ["Order number", "Partner", "Product", "Tax code", "Quantity", "Unit price"], save: "Save order", filter: "Filter items by partner code" },
};

async function open(context, path, ready = "main h2") {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
  await page.goto(`${base}/#/${path}`);
  await page.locator(ready).first().waitFor();
  await page.waitForLoadState("networkidle");
  page.errors = errors;
  return page;
}
async function shot(page, name, width) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow });
}

for (const [lang, theme, width, orderId] of combos) {
  const tag = `${lang}-${theme === "red" ? "red" : "green"}-${width}`;
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    (value) => window.localStorage.setItem("erp.workspace.preferences.v1", value),
    JSON.stringify({ language: lang, theme, teaching: true }),
  );
  const t = text[lang];

  let page = await open(context, "", "main h2");
  await shot(page, `overview-${tag}`, width);

  // 订单页：保存前 / 保存后
  page = await open(context, "trade-orders");
  await page.locator("#tord-orderId").fill(orderId);
  await page.locator("#tord-party").fill("PARTY");
  const line = (label, role = "textbox") => page.getByRole(role, { name: `${label} L1`, exact: true });
  await line(t.order[2], "combobox").fill("EXPENSE");
  await line(t.order[3], "combobox").fill("VAT");
  await line(t.order[4]).fill("10");
  await line(t.order[5]).fill("10");
  await shot(page, `trade-orders-draft-${tag}`, width);
  const saved = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/trade/orders" && r.request().method() === "POST");
  await page.getByRole("button", { name: t.save, exact: true }).click();
  const response = await saved;
  log.push({ order: orderId, status: response.status(), body: await response.json() });
  await page.getByRole("status").first().waitFor();
  await shot(page, `trade-orders-saved-${tag}`, width);
  log.push({ page: "orders", errors: page.errors });

  // 预付 / 贷项 / 纠错：伙伴筛选
  page = await open(context, "trade-adjustments", "main select");
  await page.locator("#tadj-kind").selectOption("credit");
  await page.waitForTimeout(500);
  await shot(page, `trade-adjustments-all-${tag}`, width);
  const filter = page.getByLabel(t.filter, { exact: true });
  await filter.fill("PARTY2");
  await filter.press("Enter");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await shot(page, `trade-adjustments-filtered-${tag}`, width);
  log.push({ page: "adjustments", errors: page.errors });

  for (const [name, path, ready] of [
    ["accounts", "accounts", "main table"],
    ["trade-master", "trade", "main table"],
    ["journals", "journals", "main table"],
    ["trade-invoices", "trade-invoices", "main h2"],
    ["period-close", "period-close", "main h2"],
  ]) {
    page = await open(context, path, ready);
    if (name === "journals") {
      await page.locator(".jv-status select").selectOption("posted");
      await page.getByRole("row").nth(1).waitFor();
    }
    await shot(page, `${name}-${tag}`, width);
    log.push({ page: name, errors: page.errors });
  }
  await context.close();
}

// 偏好存储失败：只对本页让 localStorage.getItem 抛错（模拟存储不可用）
for (const [lang, theme, width] of [["zh", "red", 1440], ["en", "green", 390]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("storage unavailable");
    };
  });
  const page = await open(context, "", "main h2");
  await shot(page, `preference-warning-${lang}-${theme}-${width}`, width);
  await context.close();
}

if (migrationBase) {
  for (const [lang, theme, width] of [["zh", "red", 1440], ["en", "green", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(
      (value) => window.localStorage.setItem("erp.workspace.preferences.v1", value),
      JSON.stringify({ language: lang, theme, teaching: true }),
    );
    const page = await context.newPage();
    await page.goto(`${migrationBase}/#/migration`);
    await page.locator("main h2").first().waitFor();
    await page.waitForLoadState("networkidle");
    for (const summary of await page.locator("main details > summary:visible").all()) await summary.click().catch(() => {});
    await shot(page, `migration-${lang}-${theme}-${width}`, width);
    await context.close();
  }
}
await browser.close();
await writeFile(join(out, "capture-log.json"), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => l.overflowPx !== undefined && l.overflowPx > 0 || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);

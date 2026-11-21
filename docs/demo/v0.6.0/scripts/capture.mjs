// Demo v0.6.0 截图脚本：用系统 Chrome 走真实页面，演示 S6 的用户可见变化（订单列表 #132、保存前预览 #138、标签页图标 #136、迁移核对页 390 宽 #148）。
// 用法：node docs/demo/v0.6.0/scripts/capture.mjs <模式> <地址> <输出目录>
//   模式 main：订单页（预览 → 保存 → 列表 → 从列表打开），连接 seed 后的演示账套
//   模式 migration：迁移核对页，连接导入后的目标库
// 每张截图前断言语言、主题、宽度、教学开关、scrollY（见 docs/demo/TEMPLATE.md）。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [mode, base, out] = process.argv.slice(2);
if (!["main", "migration"].includes(mode) || !base || !out) throw new Error("usage: capture.mjs <main|migration> <address> <outDir>");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440, "PO-S6-A"],
  ["zh", "red", 390, "PO-S6-B"],
  ["en", "green", 1440, "PO-S6-C"],
  ["en", "green", 390, "PO-S6-D"],
];
const text = {
  zh: { order: ["订单号", "伙伴", "商品", "税码", "数量", "单价"], save: "保存订单", preview: "预览", empty: "本公司还没有订单。" },
  en: { order: ["Order number", "Partner", "Product", "Tax code", "Quantity", "Unit price"], save: "Save order", preview: "Preview", empty: "This company has no orders yet." },
};

async function assertState(page, want) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const got = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    teaching: document.querySelector("#workspace-teaching")?.checked,
    scrollY: window.scrollY,
  }));
  const wanted = { scrollY: 0, ...want };
  const bad = Object.entries(wanted).filter(([key, value]) => got[key] !== value);
  if (bad.length > 0) throw new Error("截图状态与文件名不符：" + JSON.stringify({ wanted, got }));
}
async function open(context, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  await page.goto(`${base}/#/${path}`);
  await page.locator("main h2").first().waitFor();
  await page.waitForLoadState("networkidle");
  page.errors = errors;
  return page;
}
const describeActive = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName,
      id: el?.id || null,
      cls: el?.className || null,
      labelledby: el?.getAttribute("aria-labelledby"),
      insidePreview: Boolean(el?.closest('[aria-labelledby="tord-preview-title"]')),
      insideLookupResult: Boolean(el?.closest(".tord-lookup-result")),
      text: (el?.textContent ?? "").trim().slice(0, 40),
    };
  });
async function shot(page, name, want) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await assertState(page, want);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow });
}

for (const [lang, theme, width, orderId] of combos) {
  const tag = `${lang}-${theme}-${width}`;
  const want = { lang, theme, width, teaching: true };
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    (value) => window.localStorage.setItem("erp.workspace.preferences.v1", value),
    JSON.stringify({ language: lang, theme, teaching: true }),
  );
  const t = text[lang];
  if (mode === "main") {
    // #136：首页加载的图标声明与 ≥400 响应（页面级，不进截图；标签页图标在浏览器外框，无法截入页面截图）
    const home = await context.newPage();
    const bad = [];
    home.on("response", (r) => r.status() >= 400 && bad.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`));
    await home.goto(`${base}/`);
    await home.waitForLoadState("networkidle");
    await home.waitForTimeout(1500);
    const icon = await home.evaluate(() => document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? null);
    const iconResponse = icon ? await home.request.get(new URL(icon, base).toString()) : null;
    log.push({ page: "home-icon", tag, iconHref: icon, iconStatus: iconResponse?.status() ?? null, iconType: iconResponse?.headers()["content-type"] ?? null, badResponses: bad });
    await home.close();

    let page = await open(context, "trade-orders");
    const listEmptyBefore = await page.getByText(t.empty, { exact: true }).count();
    log.push({ page: "orders-list-before", tag, emptyMessageVisible: listEmptyBefore > 0 });
    await page.locator("#tord-orderId").fill(orderId);
    await page.locator("#tord-party").fill("PARTY");
    const line = (label, role = "textbox") => page.getByRole(role, { name: `${label} L1`, exact: true });
    await line(t.order[2], "combobox").fill("EXPENSE");
    await line(t.order[3], "combobox").fill("VAT");
    await line(t.order[4]).fill("10");
    await line(t.order[5]).fill("10");

    // #138：预览（服务端计算，不保存）
    const previewed = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/trade/orders/preview" && r.request().method() === "POST");
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    const previewResponse = await previewed;
    if (previewResponse.status() !== 200) throw new Error(`预览请求返回 ${previewResponse.status()}：${(await previewResponse.text()).slice(0, 300)}`);
    await page.locator('[aria-labelledby="tord-preview-title"]').waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    const listAfterPreview = await page.locator("table.tord-list tbody tr").count();
    log.push({ page: "orders-preview", tag, order: orderId, status: previewResponse.status(), active: await describeActive(page), listRowsAfterPreview: listAfterPreview });
    await shot(page, `trade-orders-preview-${tag}`, want);

    // #132：保存后列表重新读取，新订单出现在列表里
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/trade/orders" && r.request().method() === "POST");
    await page.getByRole("button", { name: t.save, exact: true }).click();
    const response = await saved;
    await page.getByRole("status").first().waitFor();
    await page.getByRole("button", { name: orderId, exact: true }).first().waitFor();
    await page.waitForTimeout(300);
    const rows = await page.locator("table.tord-list tbody tr").count();
    const previewLeft = await page.locator('[aria-labelledby="tord-preview-title"]').count();
    log.push({ page: "orders-saved", tag, order: orderId, status: response.status(), listRows: rows, previewStillShown: previewLeft > 0 });
    await shot(page, `trade-orders-saved-list-${tag}`, want);

    // #132：点列表里的订单号，查询框填入该号并显示只读详情
    await page.getByRole("button", { name: orderId, exact: true }).first().click();
    await page.locator(".tord-lookup-result").first().waitFor();
    await page.waitForTimeout(500);
    const lookupValue = await page.locator("#tord-lookup-id").inputValue();
    log.push({ page: "orders-open-from-list", tag, order: orderId, lookupValue, active: await describeActive(page) });
    await shot(page, `trade-orders-open-from-list-${tag}`, want);
    log.push({ page: "orders", errors: page.errors });
  } else {
    // #148：展开所有核对详情，量表格容器与页面溢出
    const page = await open(context, "migration");
    for (const summary of await page.locator("main details > summary:visible").all()) await summary.click().catch(() => {});
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(() => {
      const wraps = [...document.querySelectorAll(".migration-page .grid-wrap:has(.kv)")].filter((el) => el.getClientRects().length > 0);
      return {
        visibleKvTables: wraps.length,
        wraps: wraps.slice(0, 6).map((wrap) => ({ clientWidth: wrap.clientWidth, scrollWidth: wrap.scrollWidth, scrolls: wrap.scrollWidth > wrap.clientWidth })),
        pageOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    log.push({ page: "migration-kv", tag, ...metrics });
    // 截图只留第一张键值表所在的详情展开，其余折叠，避免整页过长
    await page.evaluate(() => {
      const open = [...document.querySelectorAll("main details")];
      const first = open.find((d) => d.querySelector(".grid-wrap .kv"));
      for (const d of open) d.open = d === first || d.contains(first);
    });
    await page.waitForTimeout(300);
    await shot(page, `migration-${tag}`, want);
    log.push({ page: "migration", errors: page.errors });
  }
  await context.close();
}
await browser.close();
await writeFile(join(out, `capture-log-${mode}.json`), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => (l.overflowPx !== undefined && l.overflowPx > 0) || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);

// Demo v0.13.0 截图脚本（D448）：只演示 TORD-07 的订单筛选记忆，zh-red / en-green × 1440 / 390，每个组合 3 张：
//   orders-filter-applied：订单列表应用“开票状态 = 部分开票”后，地址带上 invoicing；
//   orders-filter-reload：同一页面刷新后筛选栏与列表仍是同一批订单；
//   orders-filter-invalid-link：深链接带非法筛选，整组忽略并显示提示与全部订单。
// 用法：node docs/demo/v0.13.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs 预置（订单有未开票 / 部分开票 / 已开完）。
// D448 / D441：只有“截图是否拍对”（路由、语言、主题、宽度、筛选值、列表等于 API 集合、提示可见）失败即中止；其余断言只记录进 capture-log-main.json 的 checks。
// 到达路径：入口 = 订单列表；筛选由页面上的选择与“应用”到达；刷新用 page.reload()；非法链接是被演示功能本身，允许直接 goto。
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
const combos = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
const warning = {
  zh: "链接中的筛选条件无效，已忽略；当前显示全部订单。",
  en: "The filters in the link are not valid and were ignored; all orders are shown.",
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function api(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}
const orderIds = async (invoicing) => (await api(`/api/v1/trade/orders?company=DEFAULT&limit=100${invoicing ? `&invoicing=${invoicing}` : ""}`)).items.map((o) => o.orderId).sort();
async function poll(read, wanted, label) {
  const deadline = Date.now() + 8000;
  let got;
  while (Date.now() < deadline) {
    got = await read();
    if (same(got, wanted)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${label}：应为 ${JSON.stringify(wanted)}，实际 ${JSON.stringify(got)}`);
}
function newPage(context, errors) {
  return context.newPage().then((page) => {
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
    page.on("dialog", (d) => d.dismiss());
    return page;
  });
}
const contextFor = (lang, theme, width) =>
  browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 }).then(async (context) => {
    await context.addInitScript((value) => window.localStorage.setItem("erp.workspace.preferences.v1", value), JSON.stringify({ language: lang, theme, teaching: true }));
    return context;
  });
const rowsOf = (page) => page.locator("table.tord-list tbody tr button.cell-link").evaluateAll((b) => b.map((x) => x.textContent.trim()).sort());
async function shot(page, name, want, extra = {}) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  const got = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    hash: location.hash,
    overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
  if (bad.length > 0) throw new Error(`${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
  if (!got.hash.startsWith("#/trade-orders")) throw new Error(`${name} 截图前 location.hash 应以 #/trade-orders 开头，实际 ${got.hash}`);
  check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, hash: got.hash, ...extra });
}

let failure = null;
try {
  const all = await orderIds("");
  const partial = await orderIds("partial");
  if (partial.length === 0 || partial.length >= all.length) throw new Error(`readiness: 部分开票订单应非空且少于全部 ${all.length}，实际 ${partial.length}`);
  log.push({ readiness: { all, partial } });

  for (const [lang, theme, width] of combos) {
    const tag = `${lang}-${theme}-${width}`;
    const want = { lang, theme, width };
    const errors = [];

    // 1 应用筛选：地址带上 invoicing
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-orders?company=DEFAULT`);
      await poll(() => rowsOf(page), all, "订单列表（未筛选）");
      const historyBefore = await page.evaluate(() => history.length);
      await page.locator("#tord-filter-invoicing").selectOption("partial");
      await page.locator("form.tord-filter button[type=submit]").click();
      await poll(() => rowsOf(page), partial, "开票状态 partial 的订单");
      const hash = await page.evaluate(() => location.hash);
      if (!hash.includes("invoicing=partial")) throw new Error(`应用筛选后地址应含 invoicing=partial，实际 ${hash}`);
      check(`${tag} 应用筛选不新增浏览器历史`, (await page.evaluate(() => history.length)) === historyBefore, { historyBefore });
      await shot(page, `orders-filter-applied-${tag}`, want, { step: "applied", entryHash: "#/trade-orders?company=DEFAULT", via: "select #tord-filter-invoicing=partial, click apply", before: all.length, after: partial.length });

      // 2 刷新：同一页面 reload，筛选与列表还原
      await page.reload();
      await poll(() => rowsOf(page), partial, "刷新后的订单列表");
      const selected = await page.locator("#tord-filter-invoicing").inputValue();
      if (selected !== "partial") throw new Error(`刷新后开票状态下拉框应为 partial，实际 ${selected}`);
      await shot(page, `orders-filter-reload-${tag}`, want, { step: "reload", via: "page.reload()", rows: partial.length });
      await context.close();
    }

    // 3 非法链接：整组忽略，提示可见，列表是全部订单
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      const entry = "#/trade-orders?company=DEFAULT&invoicing=bogus";
      await page.goto(`${base}/${entry}`);
      await poll(() => rowsOf(page), all, "非法筛选链接下的订单列表");
      await page.getByText(warning[lang], { exact: true }).waitFor({ timeout: 8000 });
      await shot(page, `orders-filter-invalid-link-${tag}`, want, { step: "invalid-link", entryHash: entry, via: "goto deep link", rows: all.length });
      await context.close();
    }

    log.push({ page: "s13", tag, errors });
    check(`${tag} 无页面错误`, errors.length === 0, errors);
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

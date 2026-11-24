// Demo v0.19.0 截图脚本（DEMO-20）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明：(1) TLIST-04：财务维度页（#/dimensions）中英文各一张 1440 截图，展示“新建配置”“刷新列表”两个按钮；
//       (2) TLIST-04 的 390 px：页面 scrollWidth ≤ 390，两个按钮 left ≥ 0 且 right ≤ 390（中英文各一张截图与记录）；
//       (3) TLIST-04 的原生键盘取证（page.keyboard.press）：Tab 从“新建配置”到“刷新列表”，Enter 与空格各触发一次 /api/v1/dimensions 请求；
//           编辑器打开时，Tab 同样到达“刷新列表”，Enter 触发请求且编辑器保持打开；
//       (4) REFAC-11：订单详情页（PO-C1，已开票 6 / 未开票 4）中英文各一张 1440 截图，“未开票数量”列与“开票”入口可见
//           （只证明拆分后能正常渲染，没有拆分前对比图）。
// 用法：node docs/demo/v0.19.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 run-main.ps1 的 prepare.mjs 与 seed 脚本预置（只有 DEFAULT 账套）。
// D457：每个页面（每个语言 / 宽度）使用一个全新的浏览器 context。
// D440 / D441 / D444：只有“截图是否拍对”（路由、语言、主题、宽度、页头标题、按钮文字与顺序）和键盘行为失败即中止；
// 溢出、按钮矩形、页面错误等样式类断言只用 check() 记录，不中止。
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
function must(ok, message) {
  if (!ok) throw new Error(message);
}
const langs = [
  ["zh", "red"],
  ["en", "green"],
];
// 文案取自 ui/dimension-labels.ts、ui/master-labels.ts、ui/trade-order-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const dims = {
  route: "#/dimensions",
  title: { zh: "财务维度", en: "Financial dimensions" },
  buttons: { zh: ["新建配置", "刷新列表"], en: ["New configuration", "Refresh list"] },
};
const orders = {
  route: "#/trade-orders?company=DEFAULT",
  title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" },
  lines: { zh: "订单行", en: "Order lines" },
  invoicedCol: { zh: "已开票数量", en: "Invoiced qty" },
  uninvoicedCol: { zh: "未开票数量", en: "Not invoiced qty" },
  invoice: { zh: "开票", en: "Invoice" },
};
async function contextFor(lang, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((value) => window.localStorage.setItem("erp.workspace.preferences.v1", value), JSON.stringify({ language: lang, theme, teaching: true }));
  return context;
}
async function newPage(context, errors) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  page.on("dialog", (d) => d.dismiss());
  return page;
}
async function openRoute(page, route, title) {
  await page.goto(`${base}/${route}`);
  await page.locator(".page-header h2").filter({ hasText: title }).first().waitFor({ timeout: 10000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}
async function state(page) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    hash: location.hash,
    heading: document.querySelector(".page-header h2")?.textContent?.trim(),
    overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}
function mustMatchState(name, got, want, title, route) {
  const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
  must(bad.length === 0, `${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
  must(got.hash.startsWith(route), `${name} 截图前 location.hash 应以 ${route} 开头，实际 ${got.hash}`);
  must(got.heading === title, `${name} 页头标题应为 ${title}，实际 ${got.heading}`);
}
function rectsOf(locator) {
  return locator.evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { text: n.textContent.trim(), left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top * 10) / 10 };
    }),
  );
}
// 财务维度页的按钮区（.ui-master-actions）：文字与顺序必须是 新建配置 / 刷新列表。
async function dimButtons(page, lang) {
  const area = page.locator(".ui-master-actions").first();
  await area.waitFor({ timeout: 10000 });
  const buttons = area.locator("button");
  const texts = (await buttons.allInnerTexts()).map((x) => x.trim());
  must(JSON.stringify(texts) === JSON.stringify(dims.buttons[lang]), `财务维度按钮区应为 ${JSON.stringify(dims.buttons[lang])}，实际 ${JSON.stringify(texts)}`);
  return { texts, buttons };
}
const isDimList = (r) => r.method() === "GET" && new URL(r.url()).pathname === "/api/v1/dimensions";
async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}
// 真实键盘输入：按键后等待列表请求，再静候 600 ms，确认只发出了一次。
async function keyAndCountRequests(page, key) {
  const seen = [];
  const listener = (r) => isDimList(r) && seen.push(new URL(r.url()).pathname + new URL(r.url()).search);
  page.on("request", listener);
  const first = page.waitForRequest(isDimList, { timeout: 10000 });
  await page.keyboard.press(key);
  await first;
  await page.waitForTimeout(600);
  page.off("request", listener);
  return seen;
}

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);
  const orderList = await (await fetch(new URL("/api/v1/trade/orders?company=DEFAULT&limit=100", base))).json();
  must((orderList.items ?? []).some((o) => o.orderId === "PO-C1"), `readiness: 没有订单 PO-C1：${JSON.stringify(orderList).slice(0, 200)}`);

  const width = 1440;
  // (1) TLIST-04：财务维度页 1440，两个按钮。
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `dimensions-${lang}-${theme}-${width}`;
    await openRoute(page, dims.route, dims.title[lang]);
    const { texts } = await dimButtons(page, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width }, dims.title[lang], "#/dimensions");
    check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${dims.route}`, hash: got.hash, heading: got.heading, buttons: texts });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (2) TLIST-04 的 390 记录：中英文。
  const narrow = 390;
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, narrow);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `dimensions-${lang}-${theme}-${narrow}`;
    await openRoute(page, dims.route, dims.title[lang]);
    const { texts, buttons } = await dimButtons(page, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width: narrow }, dims.title[lang], "#/dimensions");
    const rects = await rectsOf(buttons);
    check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= narrow, got.scrollWidth);
    check(`${name} 两个按钮都在视口内（left ≥ 0 且 right ≤ 390）`, rects.length === 2 && rects.every((r) => r.left >= 0 && r.right <= narrow), rects);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "k7-390", via: `goto ${dims.route}`, hash: got.hash, documentScrollWidth: got.scrollWidth, buttons: texts, rects });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (3) 原生键盘取证：只用 page.keyboard.press，不用 click 触发刷新。
  {
    const [lang, theme] = langs[1];
    const [newLabel, refreshLabel] = dims.buttons[lang];
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    await openRoute(page, dims.route, dims.title[lang]);
    await dimButtons(page, lang);
    const newButton = page.getByRole("button", { name: newLabel, exact: true });
    const refreshButton = page.getByRole("button", { name: refreshLabel, exact: true });
    const record = { lang, theme, width };

    await newButton.focus();
    record.focusStart = await focusedText(page);
    await page.keyboard.press("Tab");
    record.focusAfterTab = await focusedText(page);
    must(record.focusStart === newLabel, `键盘取证：起点焦点应在“${newLabel}”，实际“${record.focusStart}”`);
    must(record.focusAfterTab === refreshLabel, `键盘取证：Tab 后焦点应到“${refreshLabel}”，实际“${record.focusAfterTab}”`);
    record.enterRequests = await keyAndCountRequests(page, "Enter");
    must(record.enterRequests.length === 1, `键盘取证：Enter 应触发 1 次 /api/v1/dimensions 请求，实际 ${JSON.stringify(record.enterRequests)}`);
    record.spaceRequests = await keyAndCountRequests(page, "Space");
    must(record.spaceRequests.length === 1, `键盘取证：空格应触发 1 次 /api/v1/dimensions 请求，实际 ${JSON.stringify(record.spaceRequests)}`);

    // 编辑器打开：“新建配置”仍可用，焦点回到它后 Tab 到“刷新列表”；Enter 触发请求，编辑器保持打开。
    await newButton.click();
    // FastTab 只把 id 放在正文 `<id>-body` 上；等编辑器正文可见（代码输入框在其中）。
    await page.locator("#dim-editor-body #dim-code").waitFor({ state: "visible", timeout: 10000 });
    record.refreshDisabledWithEditor = await refreshButton.isDisabled();
    await newButton.focus();
    await page.keyboard.press("Tab");
    record.editorOpenFocusAfterTab = await focusedText(page);
    must(!record.refreshDisabledWithEditor, "键盘取证：编辑器打开时“刷新列表”应可用");
    must(record.editorOpenFocusAfterTab === refreshLabel, `键盘取证：编辑器打开时 Tab 后焦点应到“${refreshLabel}”，实际“${record.editorOpenFocusAfterTab}”`);
    record.editorOpenEnterRequests = await keyAndCountRequests(page, "Enter");
    must(record.editorOpenEnterRequests.length === 1, `键盘取证：编辑器打开时 Enter 应触发 1 次 /api/v1/dimensions 请求，实际 ${JSON.stringify(record.editorOpenEnterRequests)}`);
    record.editorStillOpen = await page.locator("#dim-editor-body #dim-code").isVisible();
    must(record.editorStillOpen, "键盘取证：刷新后编辑器应仍然打开");
    check("键盘取证 无页面错误", errors.length === 0, errors);
    log.push({ name: "dimensions-keyboard-record", step: "keyboard", via: `${dims.route}：page.keyboard.press 的 Tab / Enter / Space`, record });
    await context.close();
  }

  // (4) REFAC-11：订单详情（PO-C1）1440，中英文；订单行表里 L1 数量 10 / 已开票 6 / 未开票 4，“开票”入口可见。
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-order-detail-${lang}-${theme}-${width}`;
    await openRoute(page, orders.route, orders.title[lang]);
    await page.getByRole("button", { name: "PO-C1", exact: true }).click();
    const table = page.getByRole("table", { name: `${orders.lines[lang]} PO-C1`, exact: true });
    await table.waitFor({ timeout: 10000 });
    const headers = (await table.locator("thead th").allInnerTexts()).map((h) => h.trim());
    const invoicedAt = headers.indexOf(orders.invoicedCol[lang]);
    const uninvoicedAt = headers.indexOf(orders.uninvoicedCol[lang]);
    must(invoicedAt >= 0 && uninvoicedAt >= 0, `${name} 订单行表缺少已开票 / 未开票列：${JSON.stringify(headers)}`);
    const cells = (await table.locator("tbody tr").first().locator("td").allInnerTexts()).map((c) => c.trim());
    const num = (value) => Number(value.replaceAll(",", ""));
    const got = { quantity: num(cells[invoicedAt - 1]), invoiced: num(cells[invoicedAt]), uninvoiced: num(cells[uninvoicedAt]) };
    must(got.quantity === 10 && got.invoiced === 6 && got.uninvoiced === 4, `${name} PO-C1 L1 应为 数量 10 / 已开票 6 / 未开票 4，实际 ${JSON.stringify({ got, cells })}`);
    const invoiceEntry = page.locator(".tord-invoice-actions").getByRole("link", { name: orders.invoice[lang], exact: true });
    must((await invoiceEntry.count()) === 1, `${name} 应有 1 个“${orders.invoice[lang]}”入口`);
    await invoiceEntry.scrollIntoViewIfNeeded();
    const st = await state(page);
    must(st.lang === lang && st.theme === theme && st.width === width, `${name} 截图状态与文件名不符：${JSON.stringify(st)}`);
    check(`${name} 页面无横向溢出`, st.overflowPx <= 0, st.overflowPx);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${orders.route}，点击订单号 PO-C1`, hash: st.hash, headers, got });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
log.push({ checks });
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log("shots", log.filter((l) => l.name && l.step !== "keyboard").length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

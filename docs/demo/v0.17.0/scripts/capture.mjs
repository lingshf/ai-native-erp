// Demo v0.17.0 截图脚本（DEMO-18）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明：(1) TLIST-01 英文 390 px（S17 评审遗留）：订单页、发票页各一张英文 390 宽截图，记录页面 scrollWidth 与三个按钮矩形；
//       (2) REFAC-09：发票页（#/trade-invoices）中英文各一张 1440 截图，列表有行、筛选栏三个按钮可见（只证明拆分后能正常渲染，没有拆分前对比图）；
//       (3) TLIST-02：贸易主数据页（#/trade）中英文各一张 1440 截图，展示“新增配置”“刷新列表”两个按钮；
//       (4) TLIST-02 的 390 px 记录：页面 scrollWidth ≤ 390，两个按钮 left ≥ 0 且 right ≤ 390；
//       (5) TLIST-02 的原生键盘取证（真实键盘输入 page.keyboard.press）：Tab 从“新增配置”到“刷新列表”，Enter 与空格各触发一次列表请求；
//           编辑器打开时，Tab 同样到达“刷新列表”，Enter 触发列表请求且编辑器保持打开。
// 用法：node docs/demo/v0.17.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs、docs/demo/v0.14.0/scripts/seed-credit.mjs 预置（只有 DEFAULT 账套）。
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
// 文案取自 ui/trade-order-labels.ts、ui/trade-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const lists = {
  orders: {
    route: "#/trade-orders?company=DEFAULT",
    title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" },
    buttons: { zh: ["应用", "清除", "刷新列表"], en: ["Apply", "Clear", "Refresh list"] },
  },
  invoices: {
    route: "#/trade-invoices?company=DEFAULT",
    title: { zh: "采购与销售发票", en: "Purchase and sales invoices" },
    buttons: { zh: ["应用", "清除", "刷新列表"], en: ["Apply", "Clear", "Refresh list"] },
  },
};
const master = {
  route: "#/trade",
  title: { zh: "贸易主数据", en: "Trade master data" },
  buttons: { zh: ["新增配置", "刷新列表"], en: ["New configuration", "Refresh list"] },
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
// 订单 / 发票筛选栏的三个按钮：文字与顺序必须是 应用 / 清除 / 刷新列表；type 依次为 submit / button / button。
async function filterButtons(page, spec, lang) {
  const buttons = page.locator("form.filter-bar").first().locator("div.actions button");
  const texts = (await buttons.allInnerTexts()).map((x) => x.trim());
  const types = await buttons.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("type")));
  must(JSON.stringify(texts) === JSON.stringify(spec.buttons[lang]), `筛选栏按钮应为 ${JSON.stringify(spec.buttons[lang])}，实际 ${JSON.stringify(texts)}`);
  must(JSON.stringify(types) === JSON.stringify(["submit", "button", "button"]), `按钮 type 应为 submit / button / button，实际 ${JSON.stringify(types)}`);
  return { texts, types };
}
function rectsOf(locator) {
  return locator.evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { text: n.textContent.trim(), left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top * 10) / 10 };
    }),
  );
}
// 贸易主数据页的按钮区：文字与顺序必须是 新增配置 / 刷新列表。
async function masterButtons(page, lang) {
  const buttons = page.locator(".ui-master-actions").first().locator("button");
  const texts = (await buttons.allInnerTexts()).map((x) => x.trim());
  must(JSON.stringify(texts) === JSON.stringify(master.buttons[lang]), `主数据按钮区应为 ${JSON.stringify(master.buttons[lang])}，实际 ${JSON.stringify(texts)}`);
  return { texts, buttons };
}
const isMasterList = (r) => {
  const url = new URL(r.url());
  return r.method() === "GET" && url.pathname.startsWith("/api/v1/trade/") && url.searchParams.get("company") === "DEFAULT";
};
async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}
// 真实键盘输入：按键后等待列表请求，再静候 600 ms，确认只发出了一次。
async function keyAndCountRequests(page, key) {
  const seen = [];
  const listener = (r) => isMasterList(r) && seen.push(new URL(r.url()).pathname + new URL(r.url()).search);
  page.on("request", listener);
  const first = page.waitForRequest(isMasterList, { timeout: 10000 });
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
  const invoices = await (await fetch(new URL("/api/v1/trade/invoices?company=DEFAULT&limit=100", base))).json();
  must((invoices.items ?? []).length >= 1, `readiness: 没有已过账发票：${JSON.stringify(invoices).slice(0, 200)}`);

  // (2) REFAC-09：发票页 1440，列表有行、三个按钮可见。
  const width = 1440;
  for (const [lang, theme] of langs) {
    const spec = lists.invoices;
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-invoices-list-${lang}-${theme}-${width}`;
    await openRoute(page, spec.route, spec.title[lang]);
    await page.locator("table.grid tbody tr").first().waitFor({ timeout: 10000 });
    const rowCount = await page.locator("table.grid tbody tr").count();
    must(rowCount >= 1, `${name} 发票列表应有行，实际 ${rowCount}`);
    const buttons = await filterButtons(page, spec, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width }, spec.title[lang], "#/trade-invoices");
    check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${spec.route}`, hash: got.hash, heading: got.heading, rowCount, buttons });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (3) TLIST-02：贸易主数据页 1440，两个按钮。
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-master-${lang}-${theme}-${width}`;
    await openRoute(page, master.route, master.title[lang]);
    await page.locator("table.grid").first().waitFor({ timeout: 10000 });
    const { texts } = await masterButtons(page, lang);
    const rowCount = await page.locator("table.grid tbody tr").count();
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width }, master.title[lang], "#/trade");
    check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
    check(`${name} 列表有行`, rowCount >= 1, rowCount);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${master.route}`, hash: got.hash, heading: got.heading, rowCount, buttons: texts });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (1) TLIST-01 英文 390：订单页、发票页。 (4) TLIST-02 的 390 记录：贸易主数据页，中英文。
  const narrow = 390;
  for (const [key, spec] of Object.entries(lists)) {
    const [lang, theme] = langs[1];
    const context = await contextFor(lang, theme, narrow);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-${key}-list-${lang}-${theme}-${narrow}`;
    await openRoute(page, spec.route, spec.title[lang]);
    const buttons = await filterButtons(page, spec, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width: narrow }, spec.title[lang], `#/trade-${key}`);
    const rects = await rectsOf(page.locator("form.filter-bar").first().locator("div.actions button"));
    check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= narrow, got.scrollWidth);
    check(`${name} 三个按钮都在视口内（left ≥ 0 且 right ≤ 390）`, rects.length === 3 && rects.every((r) => r.left >= 0 && r.right <= narrow), rects);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "k7-390", via: `goto ${spec.route}`, hash: got.hash, documentScrollWidth: got.scrollWidth, buttons, rects });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, narrow);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-master-${lang}-${theme}-${narrow}`;
    await openRoute(page, master.route, master.title[lang]);
    await page.locator("table.grid").first().waitFor({ timeout: 10000 });
    const { texts, buttons } = await masterButtons(page, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width: narrow }, master.title[lang], "#/trade");
    const rects = await rectsOf(buttons);
    check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= narrow, got.scrollWidth);
    check(`${name} 两个按钮都在视口内（left ≥ 0 且 right ≤ 390）`, rects.length === 2 && rects.every((r) => r.left >= 0 && r.right <= narrow), rects);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "k7-390", via: `goto ${master.route}`, hash: got.hash, documentScrollWidth: got.scrollWidth, buttons: texts, rects });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (5) 原生键盘取证（TLIST-02，L7 的行为部分）：只用 page.keyboard.press，不用 click 触发刷新。
  {
    const [lang, theme] = langs[1];
    const [newLabel, refreshLabel] = master.buttons[lang];
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    await openRoute(page, master.route, master.title[lang]);
    await page.locator("table.grid").first().waitFor({ timeout: 10000 });
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
    must(record.enterRequests.length === 1, `键盘取证：Enter 应触发 1 次列表请求，实际 ${JSON.stringify(record.enterRequests)}`);
    record.spaceRequests = await keyAndCountRequests(page, "Space");
    must(record.spaceRequests.length === 1, `键盘取证：空格应触发 1 次列表请求，实际 ${JSON.stringify(record.spaceRequests)}`);

    // 编辑器打开：“新增配置”禁用，从搜索框 Tab 到“刷新列表”；Enter 触发请求，编辑器保持打开。
    await newButton.click();
    await page.locator("#trade-editor").waitFor({ timeout: 10000 });
    record.newDisabledWithEditor = await newButton.isDisabled();
    await page.locator("#trade-search").focus();
    await page.keyboard.press("Tab");
    record.editorOpenFocusAfterTab = await focusedText(page);
    must(record.newDisabledWithEditor, "键盘取证：编辑器打开时“新增配置”应禁用");
    must(record.editorOpenFocusAfterTab === refreshLabel, `键盘取证：编辑器打开时 Tab 后焦点应到“${refreshLabel}”，实际“${record.editorOpenFocusAfterTab}”`);
    record.editorOpenEnterRequests = await keyAndCountRequests(page, "Enter");
    must(record.editorOpenEnterRequests.length === 1, `键盘取证：编辑器打开时 Enter 应触发 1 次列表请求，实际 ${JSON.stringify(record.editorOpenEnterRequests)}`);
    record.editorStillOpen = (await page.locator("#trade-editor").count()) === 1;
    must(record.editorStillOpen, "键盘取证：刷新后编辑器应仍然打开");
    check("键盘取证 无页面错误", errors.length === 0, errors);
    log.push({ name: "trade-master-keyboard-record", step: "keyboard", via: `${master.route}：page.keyboard.press 的 Tab / Enter / Space`, record });
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

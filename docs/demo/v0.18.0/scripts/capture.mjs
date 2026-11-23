// Demo v0.18.0 截图脚本（DEMO-19）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明：(1) REFAC-10：订单页（#/trade-orders）中英文各一张 1440 截图，列表有行、筛选栏三个按钮可见（只证明拆分后能正常渲染，没有拆分前对比图）；
//       (2) TLIST-03：科目表页（#/accounts）中英文各一张 1440 截图，展示“新建科目”“刷新列表”两个按钮；
//       (3) TLIST-03 的 390 px：页面 scrollWidth ≤ 390，两个按钮 left ≥ 0 且 right ≤ 390（中英文各一张截图与记录）；
//       (4) TLIST-03 的原生键盘取证（真实键盘输入 page.keyboard.press）：Tab 从“新建科目”到“刷新列表”，Enter 与空格各触发一次 /api/v1/accounts 请求；
//           编辑器打开时，Tab 同样到达“刷新列表”，Enter 触发请求且编辑器保持打开。
// 用法：node docs/demo/v0.18.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
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
// 文案取自 ui/trade-order-labels.ts、ui/master-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const orders = {
  route: "#/trade-orders?company=DEFAULT",
  title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" },
  buttons: { zh: ["应用", "清除", "刷新列表"], en: ["Apply", "Clear", "Refresh list"] },
};
const accounts = {
  route: "#/accounts",
  title: { zh: "科目表", en: "Chart of accounts" },
  buttons: { zh: ["新建科目", "刷新列表"], en: ["New account", "Refresh list"] },
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
// 订单筛选栏的三个按钮：文字与顺序必须是 应用 / 清除 / 刷新列表；type 依次为 submit / button / button。
async function orderButtons(page, lang) {
  const buttons = page.locator("form.filter-bar.tord-filter").first().locator("div.actions button");
  const texts = (await buttons.allInnerTexts()).map((x) => x.trim());
  const types = await buttons.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("type")));
  must(JSON.stringify(texts) === JSON.stringify(orders.buttons[lang]), `筛选栏按钮应为 ${JSON.stringify(orders.buttons[lang])}，实际 ${JSON.stringify(texts)}`);
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
// 科目表页的按钮区（.acct-actions）：文字与顺序必须是 新建科目 / 刷新列表。
async function accountButtons(page, lang) {
  const buttons = page.locator(".acct-actions").first().locator("button");
  const texts = (await buttons.allInnerTexts()).map((x) => x.trim());
  must(JSON.stringify(texts) === JSON.stringify(accounts.buttons[lang]), `科目表按钮区应为 ${JSON.stringify(accounts.buttons[lang])}，实际 ${JSON.stringify(texts)}`);
  return { texts, buttons };
}
const isAccountList = (r) => {
  const url = new URL(r.url());
  return r.method() === "GET" && url.pathname === "/api/v1/accounts" && url.searchParams.get("company") === "DEFAULT";
};
async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}
// 真实键盘输入：按键后等待列表请求，再静候 600 ms，确认只发出了一次。
async function keyAndCountRequests(page, key) {
  const seen = [];
  const listener = (r) => isAccountList(r) && seen.push(new URL(r.url()).pathname + new URL(r.url()).search);
  page.on("request", listener);
  const first = page.waitForRequest(isAccountList, { timeout: 10000 });
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
  must((orderList.items ?? []).length >= 1, `readiness: 没有订单：${JSON.stringify(orderList).slice(0, 200)}`);
  const accountList = await (await fetch(new URL("/api/v1/accounts?company=DEFAULT&limit=100", base))).json();
  must((accountList.items ?? []).length >= 1, `readiness: 没有科目：${JSON.stringify(accountList).slice(0, 200)}`);

  const width = 1440;
  // (1) REFAC-10：订单页 1440，列表有行、三个按钮可见。
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-orders-list-${lang}-${theme}-${width}`;
    await openRoute(page, orders.route, orders.title[lang]);
    await page.locator("table.grid.tord-list tbody tr").first().waitFor({ timeout: 10000 });
    const rowCount = await page.locator("table.grid.tord-list tbody tr").count();
    must(rowCount >= 1, `${name} 订单列表应有行，实际 ${rowCount}`);
    const buttons = await orderButtons(page, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width }, orders.title[lang], "#/trade-orders");
    check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${orders.route}`, hash: got.hash, heading: got.heading, rowCount, buttons });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (2) TLIST-03：科目表页 1440，两个按钮。
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `accounts-${lang}-${theme}-${width}`;
    await openRoute(page, accounts.route, accounts.title[lang]);
    await page.locator("table.grid").first().waitFor({ timeout: 10000 });
    const { texts } = await accountButtons(page, lang);
    const rowCount = await page.locator("table.grid tbody tr").count();
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width }, accounts.title[lang], "#/accounts");
    check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
    check(`${name} 列表有行`, rowCount >= 1, rowCount);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${accounts.route}`, hash: got.hash, heading: got.heading, rowCount, buttons: texts });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (3) TLIST-03 的 390 记录：科目表页，中英文。
  const narrow = 390;
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, narrow);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `accounts-${lang}-${theme}-${narrow}`;
    await openRoute(page, accounts.route, accounts.title[lang]);
    await page.locator("table.grid").first().waitFor({ timeout: 10000 });
    const { texts, buttons } = await accountButtons(page, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width: narrow }, accounts.title[lang], "#/accounts");
    const rects = await rectsOf(buttons);
    check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= narrow, got.scrollWidth);
    check(`${name} 两个按钮都在视口内（left ≥ 0 且 right ≤ 390）`, rects.length === 2 && rects.every((r) => r.left >= 0 && r.right <= narrow), rects);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "k7-390", via: `goto ${accounts.route}`, hash: got.hash, documentScrollWidth: got.scrollWidth, buttons: texts, rects });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // (4) 原生键盘取证（TLIST-03，L7 的行为部分）：只用 page.keyboard.press，不用 click 触发刷新。
  {
    const [lang, theme] = langs[1];
    const [newLabel, refreshLabel] = accounts.buttons[lang];
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    await openRoute(page, accounts.route, accounts.title[lang]);
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
    must(record.enterRequests.length === 1, `键盘取证：Enter 应触发 1 次 /api/v1/accounts 请求，实际 ${JSON.stringify(record.enterRequests)}`);
    record.spaceRequests = await keyAndCountRequests(page, "Space");
    must(record.spaceRequests.length === 1, `键盘取证：空格应触发 1 次 /api/v1/accounts 请求，实际 ${JSON.stringify(record.spaceRequests)}`);

    // 编辑器打开：“新建科目”不禁用（TLIST-03 L4），焦点回到它后 Tab 到“刷新列表”；Enter 触发请求，编辑器保持打开。
    await newButton.click();
    // FastTab 只把 id 放在正文 `<id>-body` 上；等编辑器正文可见（科目代码输入框在其中）。
    await page.locator("#account-editor-body #account-code").waitFor({ state: "visible", timeout: 10000 });
    record.newDisabledWithEditor = await newButton.isDisabled();
    record.refreshDisabledWithEditor = await refreshButton.isDisabled();
    await newButton.focus();
    await page.keyboard.press("Tab");
    record.editorOpenFocusAfterTab = await focusedText(page);
    must(!record.refreshDisabledWithEditor, "键盘取证：编辑器打开时“刷新列表”应可用");
    must(record.editorOpenFocusAfterTab === refreshLabel, `键盘取证：编辑器打开时 Tab 后焦点应到“${refreshLabel}”，实际“${record.editorOpenFocusAfterTab}”`);
    record.editorOpenEnterRequests = await keyAndCountRequests(page, "Enter");
    must(record.editorOpenEnterRequests.length === 1, `键盘取证：编辑器打开时 Enter 应触发 1 次 /api/v1/accounts 请求，实际 ${JSON.stringify(record.editorOpenEnterRequests)}`);
    record.editorStillOpen = await page.locator("#account-editor-body #account-code").isVisible();
    must(record.editorStillOpen, "键盘取证：刷新后编辑器应仍然打开");
    check("键盘取证 无页面错误", errors.length === 0, errors);
    log.push({ name: "accounts-keyboard-record", step: "keyboard", via: `${accounts.route}：page.keyboard.press 的 Tab / Enter / Space`, record });
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

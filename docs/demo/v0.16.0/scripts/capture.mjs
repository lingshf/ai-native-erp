// Demo v0.16.0 截图脚本（DEMO-17）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明：(1) TLIST-01：订单列表与发票列表的筛选栏有三个按钮，顺序为 应用 / 清除 / 刷新列表（1440，中 / 英）；
//       (2) TLIST-01 行为记录：应用筛选 → 改输入但不应用 → 点“刷新列表”后，输入框仍是改过的值、地址不变，
//           刷新请求带的是已应用的筛选（不含没应用的输入）；
//       (3) TLIST-01 的 390 px 记录（S17 证据要求表）：页面 scrollWidth ≤ 窗口宽，三个按钮的 left ≥ 0 且 right ≤ 390；
//       (4) REFAC-07：预付 / 贷项 / 纠错页（#/trade-adjustments）选“专用取消单据”后，未结项列表有可选项，页面正常渲染
//           （只证明能正常渲染、关键控件在，不证明逐像素不变，没有拆分前的对比图）。
// 用法：node docs/demo/v0.16.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs、docs/demo/v0.14.0/scripts/seed-credit.mjs 预置（只有 DEFAULT 账套）。
// D457：每个页面（每个语言 / 宽度）使用一个全新的浏览器 context。
// D440 / D441 / D444：只有“截图是否拍对”（路由、语言、主题、宽度、页头标题、按钮文字与顺序）失败即中止；
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
const pages = {
  orders: {
    route: "#/trade-orders?company=DEFAULT",
    title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" },
    buttons: { zh: ["应用", "清除", "刷新列表"], en: ["Apply", "Clear", "Refresh list"] },
    side: "#tord-filter-side",
    party: "#tord-filter-party",
    api: "/api/v1/trade/orders",
  },
  invoices: {
    route: "#/trade-invoices?company=DEFAULT",
    title: { zh: "采购与销售发票", en: "Purchase and sales invoices" },
    buttons: { zh: ["应用", "清除", "刷新列表"], en: ["Apply", "Clear", "Refresh list"] },
    side: "#tinv-filter-side",
    party: "#tinv-filter-party",
    api: "/api/v1/trade/invoices",
  },
};
const adjustments = {
  route: "#/trade-adjustments?company=DEFAULT",
  title: { zh: "预付、贷项与专用纠错", en: "Advances, credits and corrections" },
  cancel: { zh: "专用取消单据", en: "Cancel document" },
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
// 筛选栏的三个按钮：文字与顺序必须是 应用 / 清除 / 刷新列表；type 依次为 submit / button / button。
async function filterButtons(page, spec, lang) {
  const buttons = page.locator("form.filter-bar").first().locator("div.actions button");
  const texts = (await buttons.allInnerTexts()).map((x) => x.trim());
  const types = await buttons.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("type")));
  must(JSON.stringify(texts) === JSON.stringify(spec.buttons[lang]), `筛选栏按钮应为 ${JSON.stringify(spec.buttons[lang])}，实际 ${JSON.stringify(texts)}`);
  must(JSON.stringify(types) === JSON.stringify(["submit", "button", "button"]), `按钮 type 应为 submit / button / button，实际 ${JSON.stringify(types)}`);
  return { texts, types };
}
async function buttonRects(page) {
  return page.locator("form.filter-bar").first().locator("div.actions button").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { text: n.textContent.trim(), left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top * 10) / 10 };
    }),
  );
}

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);
  const orders = await (await fetch(new URL("/api/v1/trade/orders?company=DEFAULT&limit=100", base))).json();
  must((orders.items ?? []).length >= 1, "readiness: 没有订单");
  const invoices = await (await fetch(new URL("/api/v1/trade/invoices?company=DEFAULT&limit=100", base))).json();
  must((invoices.items ?? []).length >= 1, `readiness: 没有已过账发票：${JSON.stringify(invoices).slice(0, 200)}`);
  const open = await (await fetch(new URL("/api/v1/trade/open-items?company=DEFAULT&limit=100", base))).json();
  must((open.items ?? []).some((item) => item.status !== "cancelled"), `readiness: 没有未取消的未结项：${JSON.stringify(open).slice(0, 200)}`);

  // 1440：两个列表各 zh-red / en-green 一张，展示筛选栏三个按钮。
  const width = 1440;
  for (const [key, spec] of Object.entries(pages)) {
    for (const [lang, theme] of langs) {
      const context = await contextFor(lang, theme, width);
      const errors = [];
      const page = await newPage(context, errors);
      const name = `trade-${key}-list-${lang}-${theme}-${width}`;
      await openRoute(page, spec.route, spec.title[lang]);
      const buttons = await filterButtons(page, spec, lang);
      const got = await state(page);
      mustMatchState(name, got, { lang, theme, width }, spec.title[lang], `#/trade-${key}`);
      check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      log.push({ name, step: "page", via: `goto ${spec.route}`, hash: got.hash, heading: got.heading, buttons });
      check(`${name} 无页面错误`, errors.length === 0, errors);
      await context.close();
    }
  }

  // 刷新列表的行为记录：应用 方向=AR → 在伙伴框里输入但不应用 → 点“刷新列表”。
  for (const [key, spec] of Object.entries(pages)) {
    const [lang, theme] = langs[0];
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    await openRoute(page, spec.route, spec.title[lang]);
    await page.locator(spec.side).selectOption("AR");
    await page.getByRole("button", { name: spec.buttons[lang][0], exact: true }).click();
    await page.waitForFunction(() => location.hash.includes("side=AR"), undefined, { timeout: 10000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const typed = "ZZZ";
    await page.locator(spec.party).fill(typed);
    const hashBefore = await page.evaluate(() => location.hash);
    const historyBefore = await page.evaluate(() => history.length);
    const requestPromise = page.waitForRequest((r) => new URL(r.url()).pathname === spec.api && r.method() === "GET", { timeout: 10000 });
    await page.getByRole("button", { name: spec.buttons[lang][2], exact: true }).click();
    const request = await requestPromise;
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const query = new URL(request.url()).searchParams;
    const record = {
      appliedHash: hashBefore,
      requestQuery: Object.fromEntries(query),
      partyInputAfter: await page.locator(spec.party).inputValue(),
      sideAfter: await page.locator(spec.side).inputValue(),
      hashAfter: await page.evaluate(() => location.hash),
      historyLengthBefore: historyBefore,
      historyLengthAfter: await page.evaluate(() => history.length),
    };
    const name = `trade-${key}-refresh-record`;
    must(record.partyInputAfter === typed, `${name} 点刷新后伙伴输入框应仍是 ${typed}，实际 ${record.partyInputAfter}`);
    must(record.hashAfter === hashBefore, `${name} 点刷新后地址应不变：${hashBefore} → ${record.hashAfter}`);
    must(record.sideAfter === "AR", `${name} 点刷新后方向应仍是 AR，实际 ${record.sideAfter}`);
    must(query.get("side") === "AR" && !query.has("party"), `${name} 刷新请求应带已应用的 side=AR、不带没应用的 party：${request.url()}`);
    check(`${name} 浏览器历史长度不变`, record.historyLengthAfter === record.historyLengthBefore, record);
    check(`${name} 无页面错误`, errors.length === 0, errors);
    log.push({ name, step: "refresh", via: `${spec.route}：方向选 AR 并点应用，伙伴框输入 ${typed} 不应用，点刷新列表`, record });
    await context.close();
  }

  // 390：两个列表各一张，记录页面级 scrollWidth 与三个按钮的矩形（证据要求表）。
  for (const [key, spec] of Object.entries(pages)) {
    const [lang, theme] = langs[0];
    const narrow = 390;
    const context = await contextFor(lang, theme, narrow);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-${key}-list-${lang}-${theme}-${narrow}`;
    await openRoute(page, spec.route, spec.title[lang]);
    const buttons = await filterButtons(page, spec, lang);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width: narrow }, spec.title[lang], `#/trade-${key}`);
    const rects = await buttonRects(page);
    check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= narrow, got.scrollWidth);
    check(`${name} 三个按钮都在视口内（left ≥ 0 且 right ≤ 390）`, rects.length === 3 && rects.every((r) => r.left >= 0 && r.right <= narrow), rects);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "k7-390", via: `goto ${spec.route}`, hash: got.hash, documentScrollWidth: got.scrollWidth, buttons, rects });
    check(`${name} 无页面错误`, errors.length === 0, errors);
    await context.close();
  }

  // REFAC-07：预付 / 贷项 / 纠错页，选“专用取消单据”，未结项列表有可选项。
  for (const [lang, theme] of langs) {
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    const name = `trade-adjustments-cancel-${lang}-${theme}-${width}`;
    await openRoute(page, adjustments.route, adjustments.title[lang]);
    await page.locator("#tadj-kind").selectOption({ label: adjustments.cancel[lang] });
    await page.waitForFunction(() => document.querySelectorAll("#tadj-sourceId option").length > 1, undefined, { timeout: 10000 });
    const options = await page.locator("#tadj-sourceId option").allInnerTexts();
    const kind = await page.locator("#tadj-kind").inputValue();
    must(kind === "cancel", `${name} 动作应为 cancel，实际 ${kind}`);
    must(options.length > 1, `${name} 未结项下拉框应有可选项，实际 ${JSON.stringify(options)}`);
    const got = await state(page);
    mustMatchState(name, got, { lang, theme, width }, adjustments.title[lang], "#/trade-adjustments");
    check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    log.push({ name, step: "page", via: `goto ${adjustments.route}，动作选 ${adjustments.cancel[lang]}`, hash: got.hash, heading: got.heading, selectableItems: options.length - 1 });
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
console.log("shots", log.filter((l) => l.name && l.step !== "refresh").length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

// Demo v0.21.0 截图脚本（DEMO-22）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明 TLIST-06：付款与收款页（#/trade-settlements）“核销分配”页签在表格之前有一个“刷新列表”按钮。
//   (1) 中文红色 / 英文绿色各一张 1440 截图，按钮在表格之前、不在 fieldset 内。
//   (2) 390 px：中英文，页面 scrollWidth ≤ 390，按钮 left ≥ 0 且 right ≤ 390（各一张截图与记录）。
//   (3) 原生键盘取证（page.keyboard.press，不用 click 触发刷新）：
//       K1：焦点起点是“核销分配”页签头按钮（button.fasttab-toggle[aria-controls=tset-allocation-body]），Tab → “刷新列表”，
//           Enter 与空格各触发 1 次未结项第一页请求（GET /api/v1/trade/open-items，不带 cursor）；
//       K2：先选中一条未结项（伙伴 PARTY），核销总额保持，再按 K1 的键序刷新：选中状态与金额不变；
//       K3：点“预览”与“确认账面核销”（确认的 POST 被 page.route 中止，进入“结果未知”锁定态）：
//           表格被锁定，焦点从页签头按钮 Tab 仍到“刷新列表”，Enter 触发 1 次请求，且“安全重试过账”按钮与锁定状态保持。
// 用法：node docs/demo/v0.21.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 run-main.ps1 的 prepare.mjs 与 seed 脚本预置（DEFAULT 账套；应付侧伙伴 PARTY 有已过账发票的未结项）。
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
// 文案取自 ui/trade-labels（tset.* / tinv.*）与 ui/master-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const st = {
  route: "#/trade-settlements?company=DEFAULT",
  title: { zh: "付款与收款", en: "Payments and receipts" },
  refresh: { zh: "刷新列表", en: "Refresh list" },
  party: { zh: "伙伴代码", en: "Partner code" },
  date: { zh: "记账日期（总账期间）", en: "Accounting date (GL period)" },
  select: { zh: "选择未结项", en: "Select open item" },
  amount: { zh: "核销总额", en: "Settlement gross" },
  preview: { zh: "预览", en: "Preview" },
  confirm: { zh: "确认账面核销", en: "Confirm book settlement" },
  retry: { zh: "安全重试过账", en: "Retry posting safely" },
};
const toggle = "button.fasttab-toggle[aria-controls=tset-allocation-body]";
const isOpenItems = (r) => {
  const u = new URL(r.url());
  return r.method() === "GET" && u.pathname === "/api/v1/trade/open-items" && !u.searchParams.has("cursor");
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
async function openSettlements(page, lang) {
  await page.goto(`${base}/${st.route}`);
  await page.locator(".page-header h2").filter({ hasText: st.title[lang] }).first().waitFor({ timeout: 10000 });
  await page.locator(`table.grid tbody tr`).first().waitFor({ timeout: 10000 });
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
function mustMatchState(name, got, want, lang) {
  const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
  must(bad.length === 0, `${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
  must(got.hash.startsWith("#/trade-settlements"), `${name} 截图前 location.hash 应以 #/trade-settlements 开头，实际 ${got.hash}`);
  must(got.heading === st.title[lang], `${name} 页头标题应为 ${st.title[lang]}，实际 ${got.heading}`);
}
// 刷新按钮：整页只有 1 个，文字正确；所在 .toolbar-row 的下一个兄弟是 fieldset（按钮在表格之前、在 fieldset 之外）。
async function refreshButton(page, lang) {
  const buttons = page.getByRole("button", { name: st.refresh[lang], exact: true });
  must((await buttons.count()) === 1, `应恰有 1 个“${st.refresh[lang]}”按钮，实际 ${await buttons.count()}`);
  const button = buttons.first();
  const placement = await button.evaluate((n) => {
    const row = n.closest(".toolbar-row");
    return {
      beforeFieldset: row?.nextElementSibling?.tagName === "FIELDSET",
      insideFieldset: n.closest("fieldset") !== null,
      beforeTable: Boolean(row && document.querySelector("table.grid") && row.compareDocumentPosition(document.querySelector("table.grid")) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  must(placement.beforeFieldset && placement.beforeTable && !placement.insideFieldset, `“${st.refresh[lang]}”应在表格之前且在 fieldset 之外：${JSON.stringify(placement)}`);
  return { button, placement };
}
async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
}
// 真实键盘输入：按键后等待匹配的列表请求，再静候 600 ms，确认只发出了一次。
async function keyAndCountRequests(page, key, matcher) {
  const seen = [];
  const listener = (r) => matcher(r) && seen.push(new URL(r.url()).pathname + new URL(r.url()).search);
  page.on("request", listener);
  const first = page.waitForRequest(matcher, { timeout: 10000 });
  await page.keyboard.press(key);
  await first;
  await page.waitForTimeout(600);
  page.off("request", listener);
  return seen;
}
// 焦点起点是确定的元素：“核销分配”页签头按钮。
async function focusToggle(page) {
  await page.locator(toggle).focus();
  return page.evaluate(() => {
    const a = document.activeElement;
    return `${a?.tagName.toLowerCase()}[aria-controls=${a?.getAttribute("aria-controls")}]:${a?.textContent?.trim()}`;
  });
}
async function tabAndRefresh(page, lang, record, prefix) {
  record[`${prefix}FocusStart`] = await focusToggle(page);
  must(record[`${prefix}FocusStart`].includes("tset-allocation-body"), `${prefix}：焦点起点应是核销分配页签头按钮，实际 ${record[`${prefix}FocusStart`]}`);
  await page.keyboard.press("Tab");
  record[`${prefix}FocusAfterTab`] = await focusedText(page);
  must(record[`${prefix}FocusAfterTab`] === st.refresh[lang], `${prefix}：Tab 后焦点应到“${st.refresh[lang]}”，实际“${record[`${prefix}FocusAfterTab`]}”`);
}
async function selectFirstItem(page, lang) {
  await page.getByLabel(st.party[lang], { exact: true }).fill("PARTY");
  await page.getByLabel(st.date[lang], { exact: true }).fill(day);
  const box = page.locator("tbody input[type=checkbox]").first();
  await box.check();
  const amount = page.locator("tbody input").filter({ hasNot: page.locator("[type=checkbox]") }).first();
  return { box, amount };
}

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);
  const items = await (await fetch(new URL("/api/v1/trade/open-items?company=DEFAULT&status=open&limit=100", base))).json();
  const count = (items.items ?? items.data ?? []).length;
  must(count > 0, `readiness: DEFAULT 没有未结项：${JSON.stringify(items).slice(0, 200)}`);
  log.push({ name: "readiness", openItems: count });

  // (1) 1440 与 (2) 390。
  for (const [width, step] of [[1440, "page"], [390, "k7-390"]]) {
    for (const [lang, theme] of langs) {
      const context = await contextFor(lang, theme, width);
      const errors = [];
      const page = await newPage(context, errors);
      const name = `settlements-${lang}-${theme}-${width}`;
      await openSettlements(page, lang);
      const { button, placement } = await refreshButton(page, lang);
      const got = await state(page);
      mustMatchState(name, got, { lang, theme, width }, lang);
      const rect = await button.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top * 10) / 10 };
      });
      if (width === 1440) check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
      else {
        check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= width, got.scrollWidth);
        check(`${name} 刷新按钮在视口内（left ≥ 0 且 right ≤ 390）`, rect.left >= 0 && rect.right <= width, rect);
      }
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      log.push({ name, step, via: `goto ${st.route}`, hash: got.hash, heading: got.heading, documentScrollWidth: got.scrollWidth, rect, placement });
      check(`${name} 无页面错误`, errors.length === 0, errors);
      await context.close();
    }
  }

  // (3) 原生键盘取证：只用 page.keyboard.press 触发刷新；click / fill / check 只用于准备状态。
  {
    const [lang, theme] = langs[1];
    const width = 1440;
    const errors = [];
    const record = { lang, theme, width };

    // K1：无选择。
    const c1 = await contextFor(lang, theme, width);
    const p1 = await newPage(c1, errors);
    await openSettlements(p1, lang);
    await tabAndRefresh(p1, lang, record, "k1");
    record.k1EnterRequests = await keyAndCountRequests(p1, "Enter", isOpenItems);
    must(record.k1EnterRequests.length === 1, `K1：Enter 应触发 1 次 open-items 第一页请求，实际 ${JSON.stringify(record.k1EnterRequests)}`);
    record.k1SpaceRequests = await keyAndCountRequests(p1, "Space", isOpenItems);
    must(record.k1SpaceRequests.length === 1, `K1：空格应触发 1 次请求，实际 ${JSON.stringify(record.k1SpaceRequests)}`);
    await c1.close();

    // K2：有选择，刷新后选中与金额不变。
    const c2 = await contextFor(lang, theme, width);
    const p2 = await newPage(c2, errors);
    await openSettlements(p2, lang);
    const { box, amount } = await selectFirstItem(p2, lang);
    record.k2AmountBefore = await amount.inputValue();
    must(await box.isChecked(), "K2：选中未结项失败");
    await tabAndRefresh(p2, lang, record, "k2");
    record.k2EnterRequests = await keyAndCountRequests(p2, "Enter", isOpenItems);
    must(record.k2EnterRequests.length === 1, `K2：Enter 应触发 1 次请求，实际 ${JSON.stringify(record.k2EnterRequests)}`);
    record.k2StillChecked = await box.isChecked();
    record.k2AmountAfter = await amount.inputValue();
    must(record.k2StillChecked && record.k2AmountAfter === record.k2AmountBefore, `K2：刷新后选中与金额应不变：${JSON.stringify(record)}`);
    await c2.close();

    // K3：确认的 POST 被中止，进入“结果未知”锁定态，刷新仍可用。
    const c3 = await contextFor(lang, theme, width);
    const p3 = await newPage(c3, errors);
    await openSettlements(p3, lang);
    await selectFirstItem(p3, lang);
    await p3.route("**/api/v1/trade/settlements", (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()));
    await p3.getByRole("button", { name: st.preview[lang], exact: true }).click();
    await p3.waitForLoadState("networkidle").catch(() => undefined);
    await p3.getByRole("button", { name: st.confirm[lang], exact: true }).click();
    await p3.getByRole("button", { name: st.retry[lang], exact: true }).waitFor({ timeout: 10000 });
    record.k3FieldsetDisabled = await p3.locator("fieldset.tset-allocation").evaluate((n) => n.disabled);
    must(record.k3FieldsetDisabled, "K3：结果未知时表格所在 fieldset 应被锁定");
    record.k3RefreshDisabled = await p3.getByRole("button", { name: st.refresh[lang], exact: true }).isDisabled();
    must(!record.k3RefreshDisabled, "K3：锁定时“刷新列表”应可用");
    await tabAndRefresh(p3, lang, record, "k3");
    record.k3EnterRequests = await keyAndCountRequests(p3, "Enter", isOpenItems);
    must(record.k3EnterRequests.length === 1, `K3：Enter 应触发 1 次请求，实际 ${JSON.stringify(record.k3EnterRequests)}`);
    record.k3RetryStillShown = await p3.getByRole("button", { name: st.retry[lang], exact: true }).isVisible();
    record.k3FieldsetStillDisabled = await p3.locator("fieldset.tset-allocation").evaluate((n) => n.disabled);
    must(record.k3RetryStillShown && record.k3FieldsetStillDisabled, `K3：刷新后应仍显示重试按钮且表格锁定：${JSON.stringify(record)}`);
    check("键盘取证 无页面错误（K3 中止的 POST 产生的 net 错误除外）", errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/u.test(e)).length === 0, errors);
    log.push({ name: "settlements-keyboard-record", step: "keyboard", via: `${st.route}：page.keyboard.press 的 Tab / Enter / Space`, record });
    await c3.close();
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
log.push({ checks });
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log("shots", log.filter((l) => l.name && l.step !== "keyboard" && l.name !== "readiness").length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

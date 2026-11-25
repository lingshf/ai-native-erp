// Demo v0.22.0 截图脚本（DEMO-23）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明 RC2 的三项用户可见改动（BUG-03 只改接口层，界面不变，不拍）：
//   TSET-01：付款与收款页，已选项不再未结时出现警告与“移除这些项”；键盘 Tab 到按钮、Enter 只移除缺失项，焦点回到“刷新列表”。
//   TMAS-01：付款条件的到期天数只接受 0–3650 的整数；30.0 / 1e2 / 0x10 / 3651 不发请求并显示提示（键盘输入并按 Enter 提交）。
//   BUG-01：总账明细“维度值”在维度代码为空时不可填；填维度后可填；清空维度时值一并清空；键盘 Tab 在值被禁用时跳过它。
// 用法：node docs/demo/v0.22.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 run-main.ps1 的 prepare.mjs 与 seed 脚本预置（DEFAULT 账套；应付侧伙伴 PARTY 有已过账发票的未结项）。
// D457：每个页面（每个语言 / 宽度）使用一个全新的浏览器 context。
// D440 / D441 / D444：只有“截图是否拍对”（路由、语言、主题、宽度、页头标题、文字）和键盘行为失败即中止；样式类断言只用 check() 记录。
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
const month = day.slice(0, 7);
const st = {
  route: "#/trade-settlements?company=DEFAULT",
  title: { zh: "付款与收款", en: "Payments and receipts" },
  refresh: { zh: "刷新列表", en: "Refresh list" },
  party: { zh: "伙伴代码", en: "Partner code" },
  date: { zh: "记账日期（总账期间）", en: "Accounting date (GL period)" },
  remove: { zh: "移除这些项", en: "Remove these items" },
  select: { zh: "选择未结项", en: "Select open item" },
};
const tm = {
  route: "#/trade?company=DEFAULT",
  kind: { zh: "配置类型", en: "Configuration type" },
  terms: { zh: "付款条件", en: "Payment terms" },
  add: { zh: "新增配置", en: "New configuration" },

  due: { zh: "到期天数", en: "Due days" },
  issue: { zh: "请输入 0–3650 的整数。", en: "Enter a whole number from 0 to 3650." },
};
const lg = {
  trial: `#/reports/trial?company=DEFAULT&month=${month}&view=trial&stage=adjusted`,
  dimension: { zh: "维度代码", en: "Dimension code" },
  value: { zh: "维度值（~ 表示未分配）", en: "Dimension value (~ means unassigned)" },
  apply: { zh: "查询", en: "Query" },
  detail: { zh: "总账明细", en: "General ledger" },
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
function mustMatchState(name, got, want) {
  const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
  must(bad.length === 0, `${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
}
async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.id || "");
}
const isOpenItems = (r) => {
  const u = new URL(r.url());
  return r.method() === "GET" && u.pathname === "/api/v1/trade/open-items" && !u.searchParams.has("cursor");
};

// ---------- TSET-01 ----------
const toggle = "button.fasttab-toggle[aria-controls=tset-allocation-body]";
async function openSettlements(page, lang) {
  await page.goto(`${base}/${st.route}`);
  await page.locator(".page-header h2").filter({ hasText: st.title[lang] }).first().waitFor({ timeout: 10000 });
  await page.locator("table.grid tbody tr").first().waitFor({ timeout: 10000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}
// 选一条未结项，再让列表请求的第一页少掉第一条：模拟“已在别处核销”，不改账套。
async function selectAndHide(page, lang, record) {
  await page.getByLabel(st.party[lang], { exact: true }).fill("PARTY");
  await page.getByLabel(st.date[lang], { exact: true }).fill(day);
  const boxes = page.locator(`tbody input[type=checkbox][aria-label^="${st.select[lang]}"]:enabled`);
  await page.waitForTimeout(800);
  const total = await boxes.count();
  must(total >= 1, "没有可选的未结项");
  const picked = 1; // 选中一条后其余项被同伙伴 / 同方向规则锁定，所以只能选一条
  for (let i = 0; i < picked; i += 1) await boxes.nth(i).check();
  record.rowsBefore = total;
  record.pickedBefore = picked;
  let hidden = null;
  await page.route("**/api/v1/trade/open-items**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const key = Array.isArray(body.items) ? "items" : "data";
    if (new URL(route.request().url()).searchParams.has("cursor") || !Array.isArray(body[key])) return route.fulfill({ response, json: body });
    hidden ??= body[key][0]?.itemId ?? null;
    body[key] = body[key].filter((item) => item.itemId !== hidden);
    return route.fulfill({ response, json: body });
  });
  await page.locator(toggle).focus();
  await page.keyboard.press("Tab");
  must((await focusedText(page)) === st.refresh[lang], `Tab 后焦点应到“${st.refresh[lang]}”，实际“${await focusedText(page)}”`);
  const first = page.waitForRequest(isOpenItems, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await first;
  await page.locator(".message-bar, [role=status]").filter({ hasText: st.remove[lang] }).first().waitFor({ timeout: 10000 });
  record.hiddenItemId = hidden;
  return { picked };
}
async function tset(lang, theme, width, record) {
  const context = await contextFor(lang, theme, width);
  const errors = [];
  const page = await newPage(context, errors);
  await openSettlements(page, lang);
  const probe = {};
  const { picked } = await selectAndHide(page, lang, probe);
  const name = `tset01-${lang}-${theme}-${width}`;
  const got = await state(page);
  mustMatchState(name, got, { lang, theme, width });
  must(got.hash.startsWith("#/trade-settlements"), `${name} location.hash 应以 #/trade-settlements 开头，实际 ${got.hash}`);
  must(got.heading === st.title[lang], `${name} 页头标题应为 ${st.title[lang]}，实际 ${got.heading}`);
  const removeButton = page.getByRole("button", { name: st.remove[lang], exact: true });
  must((await removeButton.count()) === 1, `应恰有 1 个“${st.remove[lang]}”按钮`);
  if (width === 390) check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= width, got.scrollWidth);
  else check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  Object.assign(record, probe, { hash: got.hash, heading: got.heading, documentScrollWidth: got.scrollWidth });
  if (width === 1440 && lang === "en") {
    // 键盘取证：焦点在“刷新列表”，Tab 逐站前进直到“移除这些项”，Enter 只移除缺失项，焦点回到“刷新列表”。
    await page.locator(`${toggle}`).focus();
    await page.keyboard.press("Tab");
    must((await focusedText(page)) === st.refresh[lang], "键盘起点应是“刷新列表”");
    const stops = [];
    for (let i = 0; i < 40 && (await focusedText(page)) !== st.remove[lang]; i += 1) {
      await page.keyboard.press("Tab");
      stops.push(await focusedText(page));
    }
    record.tabStopsToRemove = stops.length;
    must((await focusedText(page)) === st.remove[lang], `Tab 应能到达“${st.remove[lang]}”：${JSON.stringify(stops)}`);
    const checkedBefore = await page.locator(`tbody input[type=checkbox][aria-label^="${st.select[lang]}"]:checked`).count();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    record.checkedBeforeRemove = checkedBefore;
    record.checkedAfterRemove = await page.locator(`tbody input[type=checkbox][aria-label^="${st.select[lang]}"]:checked`).count();
    record.noticeGone = (await page.getByRole("button", { name: st.remove[lang], exact: true }).count()) === 0;
    record.focusAfterRemove = await focusedText(page);
    must(record.noticeGone, "Enter 后警告应消失");
    must(record.focusAfterRemove === st.refresh[lang], `Enter 后焦点应回到“${st.refresh[lang]}”，实际“${record.focusAfterRemove}”`);
    must(record.checkedAfterRemove === Math.max(0, picked - 1), `只应移除缺失项：移除前 ${checkedBefore}，移除后 ${record.checkedAfterRemove}，已选 ${picked}`);
    await page.screenshot({ path: join(out, `tset01-${lang}-${theme}-${width}-after-remove.png`), fullPage: true });
  }
  check(`${name} 无页面错误`, errors.length === 0, errors);
  await context.close();
}

// ---------- TMAS-01 ----------
async function tmas(lang, theme, width, record) {
  const context = await contextFor(lang, theme, width);
  const errors = [];
  const page = await newPage(context, errors);
  await page.goto(`${base}/${tm.route}`);
  await page.getByLabel(tm.kind[lang], { exact: true }).waitFor({ timeout: 10000 });
  await page.getByLabel(tm.kind[lang], { exact: true }).selectOption({ label: tm.terms[lang] });
  await page.getByRole("button", { name: tm.add[lang], exact: true }).click();
  const due = page.getByLabel(tm.due[lang], { exact: true });
  await due.waitFor({ timeout: 10000 });
  await page.locator("#trade-code").fill("T-DEMO23");
  await page.locator("#trade-name").fill("Demo terms");
  const posts = [];
  page.on("request", (r) => ["POST", "PUT", "PATCH"].includes(r.method()) && new URL(r.url()).pathname.startsWith("/api/") && posts.push(`${r.method()} ${new URL(r.url()).pathname}`));
  const name = `tmas01-${lang}-${theme}-${width}`;
  const cases = [];
  for (const text of ["30.0", "1e2", "0x10", "3651"]) {
    await due.fill("");
    await due.focus();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const alert = (await page.locator("#trade-error").first().textContent({ timeout: 5000 }).catch(() => null)) ?? "";
    cases.push({ text, alert: alert.trim(), postsSoFar: posts.length });
    if (!alert.includes(tm.issue[lang])) {
      cases.push({ diag: await page.evaluate(() => [...document.querySelectorAll("form.ui-master-editor :invalid")].map((n) => `${n.id}:${n.validationMessage}`)) });
      await page.screenshot({ path: join(out, `${name}-diag.png`), fullPage: true });
    }
    must(alert.includes(tm.issue[lang]), `TMAS-01：输入 ${text} 应提示“${tm.issue[lang]}”，实际“${alert}”`);
    if (text === "30.0") {
      const got = await state(page);
      mustMatchState(name, got, { lang, theme, width });
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      Object.assign(record, { hash: got.hash, heading: got.heading, documentScrollWidth: got.scrollWidth });
      if (width === 390) check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= width, got.scrollWidth);
    }
  }
  record.cases = cases;
  record.posts = posts;
  must(posts.length === 0, `TMAS-01：非法输入不应发出写请求，实际 ${JSON.stringify(posts)}`);
  check(`${name} 无页面错误`, errors.length === 0, errors);
  await context.close();
}

// ---------- BUG-01 ----------
async function bug01(lang, theme, width, record) {
  const context = await contextFor(lang, theme, width);
  const errors = [];
  const page = await newPage(context, errors);
  await page.goto(`${base}/#/ledger?company=DEFAULT`);
  const dimension = page.getByLabel(lg.dimension[lang], { exact: true });
  const value = page.getByLabel(lg.value[lang], { exact: true });
  try {
    await dimension.waitFor({ timeout: 15000 });
  } catch (e) {
    await page.screenshot({ path: join(out, `bug01-${lang}-${theme}-${width}-diag.png`), fullPage: true });
    record.diagHash = await page.evaluate(() => location.hash);
    throw e;
  }
  const name = `bug01-${lang}-${theme}-${width}`;
  const got = await state(page);
  mustMatchState(name, got, { lang, theme, width });
  must(got.hash.startsWith("#/ledger"), `${name} hash 应以 #/ledger 开头，实际 ${got.hash}`);
  record.hash = got.hash;
  record.valueDisabledEmpty = await value.isDisabled();
  must(record.valueDisabledEmpty, "维度代码为空时“维度值”应不可填");
  if (width === 390) check(`${name} 页面 scrollWidth ≤ 390`, got.scrollWidth <= width, got.scrollWidth);
  await page.screenshot({ path: join(out, `${name}-empty.png`), fullPage: true });
  // 键盘：从“维度代码”按 Tab，值被禁用时焦点越过它直接到“查询”。
  await dimension.focus();
  await page.keyboard.press("Tab");
  record.tabFromEmptyDimension = await focusedText(page);
  must(record.tabFromEmptyDimension === lg.apply[lang], `值被禁用时 Tab 应越过它到“${lg.apply[lang]}”，实际“${record.tabFromEmptyDimension}”`);
  // 点“查询”（Enter）只带有效参数：不出现孤立的 value。
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  record.hashAfterQueryEmpty = await page.evaluate(() => location.hash);
  must(!/[?&]value=/u.test(record.hashAfterQueryEmpty), `不应出现孤立 value：${record.hashAfterQueryEmpty}`);
  record.invalidShown = await page.getByText(/选择无效|Invalid selection/u).count();
  // 填维度后可填值；清空维度时值一并清空。
  await dimension.focus();
  await page.keyboard.type("BU");
  record.valueEnabledWithDimension = await value.isEnabled();
  must(record.valueEnabledWithDimension, "填了维度代码后“维度值”应可填");
  await page.keyboard.press("Tab");
  await page.keyboard.type("X1");
  record.valueTyped = await value.inputValue();
  await page.screenshot({ path: join(out, `${name}-filled.png`), fullPage: true });
  await dimension.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  record.valueAfterClearDimension = await value.inputValue();
  record.valueDisabledAfterClear = await value.isDisabled();
  must(record.valueAfterClearDimension === "" && record.valueDisabledAfterClear, `清空维度后值应清空且不可填：${JSON.stringify(record)}`);
  check(`${name} 无页面错误`, errors.length === 0, errors);
  await context.close();
}

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);
  for (const [feature, fn] of [["tset01", tset], ["tmas01", tmas], ["bug01", bug01]]) {
    for (const width of [1440, 390]) {
      for (const [lang, theme] of langs) {
        const record = { feature, lang, theme, width };
        await fn(lang, theme, width, record);
        log.push({ name: `${feature}-${lang}-${theme}-${width}`, step: width === 1440 && lang === "en" ? "keyboard" : "page", record });
      }
    }
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
log.push({ checks });
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log("entries", log.filter((l) => l.name).length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

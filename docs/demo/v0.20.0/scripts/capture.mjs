// Demo v0.20.0 截图脚本（DEMO-21）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明 TLIST-05：业务事件页（#/events）的“业务事件”与“待转队列”两个视图，在表格之前各有一个“刷新列表”按钮。
//   (1) 两个视图 × 中文红色 / 英文绿色，各一张 1440 截图，按钮在表格之前；业务事件视图中位于“新增 · …”一行之下。
//   (2) 390 px：两个视图 × 中英文，页面 scrollWidth ≤ 390，按钮 left ≥ 0 且 right ≤ 390（各一张截图与记录）。
//   (3) 原生键盘取证（page.keyboard.press，不用 click 触发刷新）：
//       业务事件视图：Tab 从最后一个“新增 · …”按钮到“刷新列表”，Enter 与空格各触发 1 次第一页请求（/api/v1/events，不带 cursor）；
//       草稿编辑器打开时，先在“摘要”输入一段文字，再 Tab（从“刷新列表”之前最近的可聚焦元素）到达“刷新列表”，Enter 触发 1 次请求，编辑器保持打开且摘要文字不变；
//       待转队列视图：状态下拉选“失败”，Tab 到“刷新列表”，Enter 与空格各触发 1 次 /api/v1/transfer-queue（status=failed）请求，下拉仍为“失败”。
// 用法：node docs/demo/v0.20.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 run-main.ps1 的 prepare.mjs 与 seed 脚本预置（只有 DEFAULT 账套；没有业务事件，表格显示空状态）。
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
// 文案取自 ui/business-labels.ts 与 ui/master-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const ev = {
  route: "#/events?company=DEFAULT",
  title: { zh: "业务事件", en: "Business events" },
  refresh: { zh: "刷新列表", en: "Refresh list" },
  view: { events: { zh: "业务事件", en: "Business events" }, queue: { zh: "待转队列", en: "Transfer queue" } },
  newPrefix: { zh: "新增 ·", en: "New ·" },
  cash: { zh: "新增 · 现金服务", en: "New · Cash service" },
  failed: { zh: "失败", en: "Failed" },
  memo: { zh: "摘要", en: "Memo" },
};
const draftText = "DEMO-21 draft memo";
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
async function openEvents(page, lang) {
  await page.goto(`${base}/${ev.route}`);
  await page.locator(".page-header h2").filter({ hasText: ev.title[lang] }).first().waitFor({ timeout: 10000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}
async function showView(page, lang, view) {
  if (view === "queue") await page.locator(".segmented button", { hasText: ev.view.queue[lang] }).click();
  await page.locator(".segmented button[aria-pressed=true]").filter({ hasText: ev.view[view][lang] }).waitFor({ timeout: 10000 });
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
  must(got.hash.startsWith("#/events"), `${name} 截图前 location.hash 应以 #/events 开头，实际 ${got.hash}`);
  must(got.heading === ev.title[lang], `${name} 页头标题应为 ${ev.title[lang]}，实际 ${got.heading}`);
}
// 刷新按钮：整页只有 1 个，文字正确；它所在的 .toolbar-row 的下一个兄弟元素是 .card（按钮在表格之前）。
async function refreshButton(page, lang, view) {
  const buttons = page.getByRole("button", { name: ev.refresh[lang], exact: true });
  must((await buttons.count()) === 1, `${view} 视图应恰有 1 个“${ev.refresh[lang]}”按钮，实际 ${await buttons.count()}`);
  const button = buttons.first();
  const beforeCard = await button.evaluate((n) => n.closest(".toolbar-row")?.nextElementSibling?.classList.contains("card") ?? false);
  must(beforeCard, `${view} 视图的“${ev.refresh[lang]}”按钮所在行之后应紧跟 div.card`);
  // 业务事件视图：上一行是“新增 · …”按钮；待转队列视图：上一个兄弟是状态下拉 label.jv-status。
  const previous = await button.evaluate((n) => {
    const prev = n.closest(".toolbar-row")?.previousElementSibling;
    return { tag: prev?.tagName, cls: prev?.className, texts: [...(prev?.querySelectorAll("button") ?? [])].map((b) => b.textContent.trim()) };
  });
  if (view === "events") must(previous.texts.length === 3 && previous.texts.every((x) => x.startsWith(ev.newPrefix[lang])), `业务事件视图：刷新按钮之前应是 3 个“${ev.newPrefix[lang]} …”按钮，实际 ${JSON.stringify(previous)}`);
  else must(String(previous.cls).includes("jv-status"), `待转队列视图：刷新按钮之前应是状态下拉，实际 ${JSON.stringify(previous)}`);
  return { button, previous };
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
const isEventsPage1 = (r) => {
  const u = new URL(r.url());
  return r.method() === "GET" && u.pathname === "/api/v1/events" && !u.searchParams.has("cursor");
};
const isQueueFailed = (r) => {
  const u = new URL(r.url());
  return r.method() === "GET" && u.pathname === "/api/v1/transfer-queue" && u.searchParams.get("status") === "failed";
};

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);

  // (1) 1440 与 (2) 390：两个视图 × 语言。
  for (const [width, step] of [[1440, "page"], [390, "k7-390"]]) {
    for (const [lang, theme] of langs) {
      for (const view of ["events", "queue"]) {
        const context = await contextFor(lang, theme, width);
        const errors = [];
        const page = await newPage(context, errors);
        const name = `${view}-${lang}-${theme}-${width}`;
        await openEvents(page, lang);
        await showView(page, lang, view);
        const { button, previous } = await refreshButton(page, lang, view);
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
        log.push({ name, step, via: `goto ${ev.route}，视图 ${view}`, hash: got.hash, heading: got.heading, documentScrollWidth: got.scrollWidth, rect, previous });
        check(`${name} 无页面错误`, errors.length === 0, errors);
        await context.close();
      }
    }
  }

  // (3) 原生键盘取证：只用 page.keyboard.press，不用 click 触发刷新（click 只用于打开视图与编辑器）。
  {
    const [lang, theme] = langs[1];
    const width = 1440;
    const context = await contextFor(lang, theme, width);
    const errors = [];
    const page = await newPage(context, errors);
    await openEvents(page, lang);
    await showView(page, lang, "events");
    const refreshLabel = ev.refresh[lang];
    const record = { lang, theme, width };

    // 业务事件视图：最后一个“新增 · …”按钮 → Tab → 刷新列表。
    const lastNew = page.locator(".toolbar-row button", { hasText: ev.newPrefix[lang] }).last();
    await lastNew.focus();
    record.eventsFocusStart = await focusedText(page);
    await page.keyboard.press("Tab");
    record.eventsFocusAfterTab = await focusedText(page);
    must(record.eventsFocusStart.startsWith(ev.newPrefix[lang]), `键盘取证：起点焦点应在“${ev.newPrefix[lang]} …”，实际“${record.eventsFocusStart}”`);
    must(record.eventsFocusAfterTab === refreshLabel, `键盘取证：Tab 后焦点应到“${refreshLabel}”，实际“${record.eventsFocusAfterTab}”`);
    record.eventsEnterRequests = await keyAndCountRequests(page, "Enter", isEventsPage1);
    must(record.eventsEnterRequests.length === 1, `键盘取证：Enter 应触发 1 次 /api/v1/events 第一页请求，实际 ${JSON.stringify(record.eventsEnterRequests)}`);
    record.eventsSpaceRequests = await keyAndCountRequests(page, "Space", isEventsPage1);
    must(record.eventsSpaceRequests.length === 1, `键盘取证：空格应触发 1 次 /api/v1/events 第一页请求，实际 ${JSON.stringify(record.eventsSpaceRequests)}`);

    // 草稿编辑器打开：“新增 · …”和视图切换按钮被禁用。焦点放在“刷新列表”之前最近的、仍可聚焦的元素上，再按一次 Tab，必须到达“刷新列表”。
    await page.getByRole("button", { name: ev.cash[lang], exact: true }).click();
    await page.locator("fieldset.jv-event").waitFor({ state: "visible", timeout: 10000 });
    record.refreshDisabledWithEditor = await page.getByRole("button", { name: refreshLabel, exact: true }).isDisabled();
    must(!record.refreshDisabledWithEditor, "键盘取证：编辑器打开时“刷新列表”应可用");
    // 草稿内容：先在“摘要”里输入一段文字，刷新后必须原样保留（不清空草稿）。
    const memo = page.locator("fieldset.jv-event").getByLabel(ev.memo[lang], { exact: true });
    await memo.fill(draftText);
    record.draftBefore = await memo.inputValue();
    must(record.draftBefore === draftText, `键盘取证：草稿摘要输入失败，实际“${record.draftBefore}”`);
    record.editorOpenFocusStart = await page.evaluate((label) => {
      const refresh = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
      const focusable = [...document.querySelectorAll("button, select, input, textarea, a[href], [tabindex]")].filter((n) => !n.disabled && n.tabIndex >= 0);
      const before = focusable.filter((n) => n.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING);
      const last = before.at(-1);
      last?.focus();
      return last ? `${last.tagName.toLowerCase()}:${(last.textContent || last.value || "").trim().slice(0, 40)}` : "";
    }, refreshLabel);
    must(record.editorOpenFocusStart !== "", "键盘取证：编辑器打开时，“刷新列表”之前没有可聚焦元素");
    await page.keyboard.press("Tab");
    record.editorOpenFocusAfterTab = await focusedText(page);
    must(record.editorOpenFocusAfterTab === refreshLabel, `键盘取证：编辑器打开时 Tab 后焦点应到“${refreshLabel}”，起点 ${record.editorOpenFocusStart}，实际“${record.editorOpenFocusAfterTab}”`);
    record.editorOpenEnterRequests = await keyAndCountRequests(page, "Enter", isEventsPage1);
    must(record.editorOpenEnterRequests.length === 1, `键盘取证：编辑器打开时 Enter 应触发 1 次请求，实际 ${JSON.stringify(record.editorOpenEnterRequests)}`);
    record.editorStillOpen = await page.locator("fieldset.jv-event").isVisible();
    must(record.editorStillOpen, "键盘取证：刷新后编辑器应仍然打开");
    record.draftAfter = await memo.inputValue();
    must(record.draftAfter === draftText, `键盘取证：刷新后草稿摘要应保持“${draftText}”，实际“${record.draftAfter}”`);
    await context.close();

    // 待转队列视图（新 context，编辑器未打开）：状态下拉选“失败”，Tab 到“刷新列表”。
    const qctx = await contextFor(lang, theme, width);
    const qpage = await newPage(qctx, errors);
    await openEvents(qpage, lang);
    await showView(qpage, lang, "queue");
    const select = qpage.locator(".jv-status select");
    await select.selectOption("failed");
    await qpage.waitForLoadState("networkidle").catch(() => undefined);
    await select.focus();
    await qpage.keyboard.press("Tab");
    record.queueFocusAfterTab = await focusedText(qpage);
    must(record.queueFocusAfterTab === refreshLabel, `键盘取证：待转队列中 Tab 后焦点应到“${refreshLabel}”，实际“${record.queueFocusAfterTab}”`);
    record.queueEnterRequests = await keyAndCountRequests(qpage, "Enter", isQueueFailed);
    must(record.queueEnterRequests.length === 1, `键盘取证：待转队列 Enter 应触发 1 次 status=failed 请求，实际 ${JSON.stringify(record.queueEnterRequests)}`);
    record.queueSpaceRequests = await keyAndCountRequests(qpage, "Space", isQueueFailed);
    must(record.queueSpaceRequests.length === 1, `键盘取证：待转队列空格应触发 1 次 status=failed 请求，实际 ${JSON.stringify(record.queueSpaceRequests)}`);
    record.queueStatusAfter = await select.inputValue();
    must(record.queueStatusAfter === "failed", `键盘取证：刷新后状态下拉应仍为 failed，实际 ${record.queueStatusAfter}`);
    check("键盘取证 无页面错误", errors.length === 0, errors);
    log.push({ name: "events-keyboard-record", step: "keyboard", via: `${ev.route}：page.keyboard.press 的 Tab / Enter / Space`, record });
    await qctx.close();
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

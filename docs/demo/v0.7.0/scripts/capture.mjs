// Demo v0.7.0 截图脚本：用系统 Chrome 走真实页面，演示 S7 的用户可见变化（订单列表筛选 #161）。
// 用法：node docs/demo/v0.7.0/scripts/capture.mjs <地址> <输出目录> <财年>
// 前提：账套已由 seed-trade.mjs 与 seed-orders.mjs 预置（4 张订单）。
// 每张截图前断言语言、主题、宽度、教学开关、scrollY（见 docs/demo/TEMPLATE.md），并断言筛选请求的参数与列表行数。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out, year] = process.argv.slice(2);
if (!base || !out || !/^\d{4}$/u.test(year ?? "")) throw new Error("usage: capture.mjs <address> <outDir> <yyyy>");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
const text = {
  zh: { noMatch: "没有符合条件的订单。", range: "起始日期不能晚于截止日期。" },
  en: { noMatch: "No orders match the filters.", range: "The start date must not be later than the end date." },
};
const all = ["PO-F1", "PO-F2", "SO-F3", "SO-F4"];

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (o) => Object.entries(o).sort();
const rowIds = (page) => page.locator("table.tord-list tbody tr td:first-child").allInnerTexts().then((v) => v.map((s) => s.trim()));
async function expectRows(page, ids, label) {
  const deadline = Date.now() + 8000;
  let got = [];
  while (Date.now() < deadline) {
    got = await rowIds(page);
    if (same(got, ids)) return got;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label}：列表应为 ${JSON.stringify(ids)}，实际 ${JSON.stringify(got)}`);
}
async function shot(page, name, want) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await assertState(page, want);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow });
}

for (const [lang, theme, width] of combos) {
  const tag = `${lang}-${theme}-${width}`;
  const want = { lang, theme, width, teaching: true };
  const t = text[lang];
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    (value) => window.localStorage.setItem("erp.workspace.preferences.v1", value),
    JSON.stringify({ language: lang, theme, teaching: true }),
  );
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === "/api/v1/trade/orders") requests.push(Object.fromEntries(url.searchParams));
  });
  await page.goto(`${base}/#/trade-orders`);
  await page.locator("main h2").first().waitFor();
  await page.waitForLoadState("networkidle");

  const filter = page.locator("form.tord-filter");
  const apply = filter.locator('button[type="submit"]');
  const clear = filter.locator('button[type="button"]');
  async function setFilter(f) {
    await page.locator("#tord-filter-party").fill(f.party ?? "");
    await page.locator("#tord-filter-side").selectOption(f.side ?? "");
    await page.locator("#tord-filter-from").fill(f.from ?? "");
    await page.locator("#tord-filter-to").fill(f.to ?? "");
  }
  // 点“应用”或“清除”，等到下一次订单列表请求并断言其参数；预期不发请求时 expected 为 null
  async function act(button, expected, label) {
    const before = requests.length;
    await button.click();
    if (expected === null) {
      await page.waitForTimeout(600);
      if (requests.length !== before) throw new Error(`${label}：不应发请求，实际多了 ${requests.length - before} 个`);
      return;
    }
    const deadline = Date.now() + 8000;
    while (requests.length === before && Date.now() < deadline) await page.waitForTimeout(100);
    if (requests.length === before) throw new Error(`${label}：没有发出列表请求`);
    const sent = requests[requests.length - 1];
    const wantSent = { company: "DEFAULT", limit: "100", ...expected };
    if (!same(sorted(sent), sorted(wantSent))) throw new Error(`${label}：请求参数应为 ${JSON.stringify(wantSent)}，实际 ${JSON.stringify(sent)}`);
  }

  // 1 无筛选：4 张订单，首次请求只带 company 与 limit
  await expectRows(page, all, "无筛选");
  if (!same(sorted(requests[requests.length - 1]), sorted({ company: "DEFAULT", limit: "100" }))) throw new Error("无筛选首次请求带了多余参数：" + JSON.stringify(requests[requests.length - 1]));
  log.push({ step: "all", tag, rows: all.length });
  await shot(page, `trade-orders-filter-all-${tag}`, want);

  // 2 仅伙伴：PARTY 有 PO-F1 与 SO-F3（只记录，不截图）
  await setFilter({ party: "PARTY" });
  await act(apply, { party: "PARTY" }, "仅伙伴");
  await expectRows(page, ["PO-F1", "SO-F3"], "仅伙伴");
  log.push({ step: "party-only", tag, rows: 2 });

  // 3 伙伴 + 方向 + 日期区间（含两端）：只剩 SO-F3
  await setFilter({ party: "PARTY", side: "AR", from: `${year}-11-01`, to: `${year}-11-30` });
  await act(apply, { party: "PARTY", side: "AR", from: `${year}-11-01`, to: `${year}-11-30` }, "组合筛选");
  await expectRows(page, ["SO-F3"], "组合筛选");
  log.push({ step: "combined", tag, rows: 1 });
  await shot(page, `trade-orders-filter-combined-${tag}`, want);

  // 4 清除：控件清空，回到无筛选请求与 4 张订单
  await act(clear, {}, "清除");
  await expectRows(page, all, "清除后");
  const cleared = await page.evaluate(() => ["party", "side", "from", "to"].map((k) => document.querySelector(`#tord-filter-${k}`).value));
  if (!same(cleared, ["", "", "", ""])) throw new Error("清除后控件未清空：" + JSON.stringify(cleared));
  log.push({ step: "cleared", tag, rows: 4 });

  // 5 有筛选而无结果：PARTY2 + 销售 + 截止 <年>-10-31
  await setFilter({ party: "PARTY2", side: "AR", to: `${year}-10-31` });
  await act(apply, { party: "PARTY2", side: "AR", to: `${year}-10-31` }, "无结果筛选");
  await page.getByText(t.noMatch, { exact: true }).waitFor({ timeout: 8000 });
  log.push({ step: "no-match", tag, message: t.noMatch, rows: (await rowIds(page)).length });
  await shot(page, `trade-orders-filter-no-match-${tag}`, want);

  // 6 起始晚于截止：就地提示，不发请求
  await act(clear, {}, "清除（无结果后）");
  await expectRows(page, all, "清除（无结果后）");
  await setFilter({ from: `${year}-12-01`, to: `${year}-11-01` });
  await act(apply, null, "日期区间错误");
  await page.getByText(t.range, { exact: true }).waitFor({ timeout: 4000 });
  log.push({ step: "range-error", tag, message: t.range, rows: (await rowIds(page)).length });
  await shot(page, `trade-orders-filter-range-error-${tag}`, want);

  log.push({ page: "orders", tag, listRequests: requests.length, errors });
  await context.close();
}
await browser.close();
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => (l.overflowPx !== undefined && l.overflowPx > 0) || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);

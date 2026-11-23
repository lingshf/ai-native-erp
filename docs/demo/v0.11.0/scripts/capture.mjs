// Demo v0.11.0 截图脚本：用系统 Chrome 走真实页面，演示 S11 的用户可见变化：
// 发票详情对话框（TINV-06，#199/#200）、发票列表筛选的 v0.10.0 未演示分支（记账日期、输入错误、加载更多保持筛选、刷新/切换公司重置，TINV-05）、侧栏导航分组（UI-14，#197）。
// 用法：node docs/demo/v0.11.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs、seed-detail.mjs 预置（数据与数字见 seed-detail.mjs 头部注释与 README §3）。
// 到达路径规则（docs/demo/TEMPLATE.md，PROC-08）：只有入口页（发票列表、首页）允许直接 goto；其余目标状态都由同一页面实例上的用户操作到达，
// 并在 capture-log-main.json 里记录入口 hash、操作与最终 hash。每个步骤用全新的浏览器上下文。
// 每张截图前断言语言、主题、宽度、教学开关、scrollY，宽度为 390 时再断言页面不横向溢出。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out, day] = process.argv.slice(2);
if (!base || !out || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: capture.mjs <address> <outDir> <yyyy-mm-dd>");
const first = `${day.slice(0, 7)}-01`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
// 文案来源：packages/web/src/ui/trade-invoice-detail-labels.ts、ui/trade-labels.ts（tinv.filter.*）、ui/labels.ts（shell.nav.*）、ui/*-labels.ts 的 master.group / reports.group
const text = {
  zh: {
    open: "查看发票",
    title: "发票详情",
    totals: "合计",
    openItem: "未结项",
    settlements: "核销记录",
    noSettlements: "该发票没有核销记录。",
    apply: "应用",
    clear: "清除",
    loadMore: "加载更多",
    range: "起始日期不能晚于截止日期。",
    partyError: "请使用大写字母、数字及 _ . : -（以字母或数字开头，最多 60 个字符）。",
    groups: { master: "基础配置", posting: "凭证与业务事件", trade: "贸易往来", ledger: "总账与结账", reports: "只读报表" },
  },
  en: {
    open: "View invoice",
    title: "Invoice details",
    totals: "Totals",
    openItem: "Open item",
    settlements: "Settlements",
    noSettlements: "No settlements for this invoice.",
    apply: "Apply",
    clear: "Clear",
    loadMore: "Load more",
    range: "The start date must not be later than the end date.",
    partyError: "Use uppercase letters, digits and _ . : - (up to 60 characters, starting with a letter or digit).",
    groups: { master: "Master data", posting: "Journals and events", trade: "Trade", ledger: "Ledger and close", reports: "Read-only reports" },
  },
};
// 侧栏链接顺序：与 UI-14 #197 核验的 base 506201e / head 5f67f2e 的 16 个链接顺序相同（packages/web/src/App.tsx:199–236）
const navOrder = [
  "#/", "#/migration", "#/accounts", "#/dimensions", "#/trade", "#/journals", "#/events", "#/trade-orders", "#/trade-invoices",
  "#/trade-settlements", "#/trade-adjustments", "#/trade-reports", "#/ledger-reports", "#/ledger", "#/period-close", "#/reports/trial",
];

async function assertState(page, want) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const got = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    teaching: document.querySelector("#workspace-teaching")?.checked,
    scrollY: window.scrollY,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const { scrollWidth, ...state } = got;
  const wanted = { scrollY: 0, ...want };
  const bad = Object.entries(wanted).filter(([key, value]) => state[key] !== value);
  if (bad.length > 0) throw new Error("截图状态与文件名不符：" + JSON.stringify({ wanted, got: state }));
  if (state.width === 390 && scrollWidth > state.width) throw new Error(`390 px 页面横向溢出：scrollWidth=${scrollWidth} > innerWidth=${state.width}`);
  return scrollWidth;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LIST_HASH = "#/trade-invoices?company=DEFAULT";
const HOME_HASH = "#/";
const expectedHash = (step) => (step === "sidebar-groups" ? HOME_HASH : LIST_HASH);
async function shot(page, name, want, extra = {}) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const scrollWidth = await assertState(page, want);
  const hash = await page.evaluate(() => location.hash);
  const expectHash = expectedHash(extra.step);
  if (hash !== expectHash) throw new Error(`${name} 截图前 location.hash 应为 ${expectHash}，实际 ${hash}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow, scrollWidth, hash, expectHash, ...extra });
}
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
const hashOf = (page) => page.evaluate(() => location.hash);
// 发票列表当前渲染的外部发票号（超过 100 行时列表是虚拟滚动，只含可见行），排序后比较
const externals = (page) =>
  page.locator("section.tinv-list-scroll table tbody tr button.tinv-detail-trigger").evaluateAll((buttons) => buttons.map((b) => b.textContent.trim()).sort());
const rowCount = (page) => page.locator("section.tinv-list-scroll table").getAttribute("aria-rowcount");

function newPage(context, errors) {
  return context.newPage().then((page) => {
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
    return page;
  });
}
const contextFor = (lang, theme, width) =>
  browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 }).then(async (context) => {
    await context.addInitScript((value) => window.localStorage.setItem("erp.workspace.preferences.v1", value), JSON.stringify({ language: lang, theme, teaching: true }));
    return context;
  });
// 入口页：发票列表（唯一允许直接打开的页面，之后所有状态都由页面内操作到达）
async function openList(context, errors) {
  const page = await newPage(context, errors);
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    return d.dismiss();
  });
  await page.goto(`${base}/#/trade-invoices?company=DEFAULT`);
  const entryHash = await page.evaluate(() => location.hash);
  if (entryHash !== LIST_HASH) throw new Error(`入口 hash 应为 ${LIST_HASH}，实际 ${entryHash}`);
  await page.locator("section.tinv-list-scroll table tbody tr button.tinv-detail-trigger").first().waitFor({ timeout: 8000 });
  page.dialogs = dialogs;
  return page;
}
const filterBar = (page) => page.locator("form[role=search]");
async function applyFilter(page, t, { party, side, from, to }) {
  const form = filterBar(page);
  if (party !== undefined) await form.locator("#tinv-filter-party").fill(party);
  if (side !== undefined) await form.locator("#tinv-filter-side").selectOption(side);
  if (from !== undefined) await form.locator("#tinv-filter-from").fill(from);
  if (to !== undefined) await form.locator("#tinv-filter-to").fill(to);
  await form.getByRole("button", { name: t.apply, exact: true }).click();
}
const barValues = (page) =>
  page.evaluate(() => ["party", "side", "from", "to"].map((k) => document.querySelector(`#tinv-filter-${k}`).value));
// 只对 /api/v1/trade/invoices 列表请求计数（详情请求是 /invoices/<id>）
function countListRequests(page) {
  const counter = { n: 0, urls: [] };
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === "/api/v1/trade/invoices") {
      counter.n += 1;
      counter.urls.push(url.search);
    }
  });
  return counter;
}
const money = (dialog, region) => dialog.getByRole("region", { name: region, exact: true }).innerText();

let failure = null;
try {
  for (const [lang, theme, width] of combos) {
    const tag = `${lang}-${theme}-${width}`;
    const want = { lang, theme, width, teaching: true };
    const t = text[lang];
    const errors = [];

    // 1 发票详情（AP，有来源订单）：列表按伙伴 PARTY2 + 方向 AP 筛选后，鼠标点击外部发票号 AP-D1-1 进入
    {
      const context = await contextFor(lang, theme, width);
      const page = await openList(context, errors);
      const entry = await hashOf(page);
      await applyFilter(page, t, { party: "PARTY2", side: "AP" });
      await poll(() => externals(page), ["AP-D1-1", "AP-DEMO2", "AP-EARLY-1", "AP-EARLY-2", "AP-EARLY-3"], "伙伴 PARTY2 + 方向 AP 的发票（seed-detail.mjs 头部 2、3 与 seed-trade.mjs 的 AP-DEMO2）");
      const before = await hashOf(page);
      const detailRequests = [];
      page.on("request", (r) => /\/api\/v1\/trade\/invoices\/[^/?]+/u.test(new URL(r.url()).pathname) && detailRequests.push(new URL(r.url()).pathname));
      await page.getByRole("button", { name: `${t.open} AP-D1-1`, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${t.title} · AP-D1-1`, exact: true });
      await dialog.waitFor({ timeout: 8000 });
      await dialog.getByRole("region", { name: t.totals, exact: true }).waitFor({ timeout: 8000 });
      const totals = await money(dialog, t.totals);
      const openItem = await money(dialog, t.openItem);
      for (const value of ["100.00", "13.00", "113.00"]) if (!totals.includes(value)) throw new Error(`AP-D1-1 合计区应含 ${value}：${totals}`);
      if (!openItem.includes("113.00")) throw new Error(`AP-D1-1 未结项应含 113.00：${openItem}`);
      if (!(await dialog.innerText()).includes("PO-D1")) throw new Error("AP-D1-1 详情应显示来源订单 PO-D1");
      if (!(await dialog.innerText()).includes(t.noSettlements)) throw new Error("AP-D1-1 没有核销，应显示空态：" + t.noSettlements);
      const after = await hashOf(page);
      if (after !== before) throw new Error(`打开详情不应改变地址栏：${before} → ${after}`);
      if (detailRequests.length !== 1) throw new Error(`打开一次详情应恰好一个详情请求，实际 ${detailRequests.length}：${detailRequests}`);
      if (page.dialogs.length !== 0) throw new Error("打开详情不应弹出离开确认框：" + JSON.stringify(page.dialogs));
      await shot(page, `invoice-detail-ap-${tag}`, want, { step: "invoice-detail-ap", entryHash: entry, via: "filter party=PARTY2 side=AP, click button AP-D1-1", hashBefore: before, hashAfter: after });
      await context.close();
    }

    // 2 发票详情（AR，部分核销）：按方向 AR 筛选后，从“应用”按钮 Tab 到 AR-I1-1 的外部发票号按钮，按 Enter 进入
    {
      const context = await contextFor(lang, theme, width);
      const page = await openList(context, errors);
      const entry = await hashOf(page);
      await applyFilter(page, t, { side: "AR" });
      await poll(() => externals(page), ["AR-I1-1", "AR-I2-1"], "方向 AR 的发票（seed-sales.mjs）");
      const before = await hashOf(page);
      await filterBar(page).getByRole("button", { name: t.apply, exact: true }).focus();
      let tabs = 0;
      const wantedLabel = `${t.open} AR-I1-1`;
      while ((await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")) !== wantedLabel) {
        if (tabs >= 12) throw new Error(`Tab 12 次仍没有到达 ${wantedLabel}`);
        await page.keyboard.press("Tab");
        tabs += 1;
      }
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: `${t.title} · AR-I1-1`, exact: true });
      await dialog.waitFor({ timeout: 8000 });
      await dialog.getByRole("region", { name: t.totals, exact: true }).waitFor({ timeout: 8000 });
      const totals = await money(dialog, t.totals);
      const openItem = await money(dialog, t.openItem);
      const settlements = await dialog.getByRole("table", { name: t.settlements, exact: true }).innerText();
      for (const value of ["120.00", "15.60", "135.60"]) if (!totals.includes(value)) throw new Error(`AR-I1-1 合计区应含 ${value}：${totals}`);
      if (!openItem.includes("85.60")) throw new Error(`AR-I1-1 未结余额应为 85.60（seed-detail.mjs 第 5 条）：${openItem}`);
      if (!settlements.includes("50.00")) throw new Error(`AR-I1-1 核销记录应含 50.00：${settlements}`);
      const after = await hashOf(page);
      if (after !== before) throw new Error(`打开详情不应改变地址栏：${before} → ${after}`);
      await shot(page, `invoice-detail-ar-${tag}`, want, { step: "invoice-detail-ar", entryHash: entry, via: `filter side=AR, focus Apply then Tab x${tabs} to the AR-I1-1 button, Enter`, tabs, hashBefore: before, hashAfter: after });
      await context.close();
    }

    // 3 记账日期筛选：同一页面内填起止日期（都是当月 1 日），点“应用”，只剩 AP-EARLY-1..3
    {
      const context = await contextFor(lang, theme, width);
      const page = await openList(context, errors);
      const entry = await hashOf(page);
      const counter = countListRequests(page);
      await applyFilter(page, t, { from: first, to: first });
      await poll(() => externals(page), ["AP-EARLY-1", "AP-EARLY-2", "AP-EARLY-3"], `记账日期 ${first}～${first}（seed-detail.mjs 头部 3）`);
      if (!counter.urls.some((s) => s.includes(`from=${first}`) && s.includes(`to=${first}`))) throw new Error("应用后没有带 from/to 的列表请求：" + JSON.stringify(counter.urls));
      if ((await hashOf(page)) !== entry) throw new Error("筛选不应改变地址栏");
      if (page.dialogs.length !== 0) throw new Error("筛选不应弹出离开确认框");
      await shot(page, `invoice-filter-date-${tag}`, want, { step: "invoice-filter-date", entryHash: entry, via: `fill from/to ${first}, click ${t.apply}`, rows: 3 });
      await context.close();
    }

    // 4 输入错误：伙伴格式不合法 → 报错、不刷新；起止日期倒置 → 报错、不刷新。两次都在同一页面实例内
    {
      const context = await contextFor(lang, theme, width);
      const page = await openList(context, errors);
      const entry = await hashOf(page);
      const counter = countListRequests(page);
      const rows = await rowCount(page);
      await filterBar(page).locator("#tinv-filter-party").fill("bad party");
      await filterBar(page).getByRole("button", { name: t.apply, exact: true }).click();
      await page.locator("#tinv-filter-party-error").waitFor({ timeout: 8000 });
      const partyText = (await page.locator("#tinv-filter-party-error").innerText()).trim();
      if (partyText !== t.partyError) throw new Error(`伙伴格式错误的提示应为“${t.partyError}”，实际“${partyText}”`);
      if ((await filterBar(page).locator("#tinv-filter-party").getAttribute("aria-invalid")) !== "true") throw new Error("伙伴输入框应 aria-invalid=true");
      await page.waitForTimeout(500);
      if (counter.n !== 0) throw new Error(`伙伴格式错误时不应发列表请求，实际 ${counter.n}：${JSON.stringify(counter.urls)}`);
      if ((await rowCount(page)) !== rows) throw new Error("伙伴格式错误时列表不应刷新");
      await shot(page, `invoice-filter-error-party-${tag}`, want, { step: "invoice-filter-error-party", entryHash: entry, via: "fill party 'bad party', click apply", listRequestsAfter: counter.n });

      await filterBar(page).locator("#tinv-filter-party").fill("");
      await filterBar(page).locator("#tinv-filter-from").fill(day);
      await filterBar(page).locator("#tinv-filter-to").fill(first);
      await filterBar(page).getByRole("button", { name: t.apply, exact: true }).click();
      const range = page.locator("#tinv-filter-range-error");
      await range.waitFor({ timeout: 8000 });
      const rangeText = (await range.innerText()).trim();
      if (rangeText !== t.range) throw new Error(`起止倒置的提示应为“${t.range}”，实际“${rangeText}”`);
      await page.waitForTimeout(500);
      if (counter.n !== 0) throw new Error(`起止倒置时不应发列表请求，实际 ${counter.n}`);
      if ((await rowCount(page)) !== rows) throw new Error("起止倒置时列表不应刷新");
      await shot(page, `invoice-filter-error-range-${tag}`, want, { step: "invoice-filter-error-range", entryHash: entry, via: `fill from ${day} to ${first}, click apply`, listRequestsAfter: counter.n });
      await context.close();
    }

    // 5 加载更多保持筛选：伙伴 PARTY 共 105 张，第一页 100 行（aria-rowcount 101），加载更多后 105 行（106），新页每一行都是 PARTY
    {
      const context = await contextFor(lang, theme, width);
      const page = await openList(context, errors);
      const entry = await hashOf(page);
      await applyFilter(page, t, { party: "PARTY" });
      await poll(() => rowCount(page), "101", "伙伴 PARTY 第一页的 aria-rowcount（100 行 + 表头；seed-detail.mjs 头部 4）");
      const more = page.waitForResponse((r) => {
        const url = new URL(r.url());
        return url.pathname === "/api/v1/trade/invoices" && url.search.includes("cursor=");
      });
      await page.getByRole("button", { name: t.loadMore, exact: true }).click();
      const response = await more;
      const url = new URL(response.url());
      if (url.searchParams.get("party") !== "PARTY") throw new Error("加载更多的请求应保持 party=PARTY：" + url.search);
      const items = (await response.json()).items;
      if (items.length !== 5 || items.some((item) => item.party !== "PARTY")) throw new Error(`加载更多应返回 5 行且都是 PARTY：${JSON.stringify(items.map((item) => [item.externalNo, item.party]))}`);
      await poll(() => rowCount(page), "106", "加载更多后的 aria-rowcount（105 行 + 表头）");
      await poll(() => barValues(page), ["PARTY", "", "", ""], "加载更多后筛选条应不变");
      await shot(page, `invoice-filter-loadmore-${tag}`, want, { step: "invoice-filter-loadmore", entryHash: entry, via: "fill party PARTY, apply, click load more", secondPageRows: items.length, secondPageUrl: url.search });
      await context.close();
    }

    // 6 重置：筛选结果与未筛选结果靠真实请求参数和返回行数区分。
    //   应用 AR（2 行）→ 刷新 → 请求不带筛选参数、101 行；应用 PARTY2 + AP（5 行，请求带 party/side）→ 切到 DEMO2（请求 company=DEMO2、不带筛选、0 行）→ 切回 DEFAULT（请求 company=DEFAULT、不带筛选、101 行）
    {
      const context = await contextFor(lang, theme, width);
      const page = await openList(context, errors);
      const entry = await hashOf(page);
      const filterKeys = ["party", "side", "from", "to"];
      const unfiltered = (response, company, label) => {
        const params = Object.fromEntries(new URL(response.url()).searchParams);
        if (params.company !== company || filterKeys.some((k) => params[k])) throw new Error(`${label}：请求应是 company=${company} 且不带筛选参数，实际 ${response.url()}`);
      };
      const listResponse = (trigger) => {
        const waited = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/trade/invoices" && r.request().method() === "GET");
        return trigger().then(() => waited);
      };
      const listLocator = page.locator("section.tinv-list-scroll table tbody tr button.tinv-detail-trigger");
      await applyFilter(page, t, { side: "AR" });
      await poll(() => externals(page), ["AR-I1-1", "AR-I2-1"], "刷新前先筛出 AR（2 行）");
      unfiltered(await listResponse(() => page.reload()), "DEFAULT", "刷新后");
      await listLocator.first().waitFor({ timeout: 8000 });
      await poll(() => barValues(page), ["", "", "", ""], "刷新后筛选条应为空");
      await poll(() => rowCount(page), "101", "刷新后应回到未筛选第一页（100 行 + 表头）");
      const applied = await listResponse(() => applyFilter(page, t, { party: "PARTY2", side: "AP" }));
      const appliedParams = Object.fromEntries(new URL(applied.url()).searchParams);
      if (appliedParams.party !== "PARTY2" || appliedParams.side !== "AP") throw new Error("应用后的请求应带 party=PARTY2&side=AP：" + applied.url());
      await poll(() => externals(page), ["AP-D1-1", "AP-DEMO2", "AP-EARLY-1", "AP-EARLY-2", "AP-EARLY-3"], "切换公司前先筛出 PARTY2 + AP（5 行，区别于未筛选的 101）");
      unfiltered(await listResponse(() => page.locator("#tinv-company").selectOption("DEMO2")), "DEMO2", "切到 DEMO2");
      await poll(() => barValues(page), ["", "", "", ""], "切换到 DEMO2 后筛选条应为空");
      await poll(() => listLocator.count(), 0, "DEMO2 没有发票");
      unfiltered(await listResponse(() => page.locator("#tinv-company").selectOption("DEFAULT")), "DEFAULT", "切回 DEFAULT");
      await listLocator.first().waitFor({ timeout: 8000 });
      await poll(() => barValues(page), ["", "", "", ""], "切回 DEFAULT 后筛选条应为空");
      await poll(() => rowCount(page), "101", "切回 DEFAULT 后应是未筛选第一页（100 行 + 表头，不是筛选后的 5 行）");
      await shot(page, `invoice-filter-reset-${tag}`, want, { step: "invoice-filter-reset", entryHash: entry, via: "apply side=AR, reload; apply party=PARTY2 side=AP, switch company DEMO2 then DEFAULT" });
      await context.close();
    }

    // 7 侧栏导航分组（UI-14）：首页入口，不做操作。1440：五个带标题的分组标题可见（其中三个是 UI-14 新拆出的）；390：标题隐藏。
    //   链接顺序 navOrder 与 #197（base 506201e、head 5f67f2e）核验的 16 个链接顺序相同（#197 正文与 slot-2 比对 16 对、failures=[]）。
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/`);
      await page.locator("nav.nav").waitFor({ timeout: 8000 });
      const order = await page.locator("nav.nav a").evaluateAll((links) => links.map((a) => (a.getAttribute("href") ?? "").split("?")[0]));
      if (!same(order, navOrder)) throw new Error(`侧栏链接顺序与 App.tsx 不符：${JSON.stringify(order)}`);
      for (const [id, title] of Object.entries(t.groups)) {
        const heading = page.locator(`#nav-group-${id}`);
        const visible = await heading.isVisible();
        if (width === 1440 && (!visible || (await heading.innerText()).trim() !== title)) throw new Error(`1440 下分组标题 ${id} 应可见且为“${title}”，实际 visible=${visible}`);
        if (width === 390 && visible) throw new Error(`390 下分组标题 ${id} 应隐藏（shell.css:289–291）`);
        if ((await page.locator(`nav.nav [role=group][aria-labelledby=nav-group-${id}]`).count()) !== 1) throw new Error(`分组 ${id} 应有 role=group 与 aria-labelledby`);
      }
      await shot(page, `sidebar-groups-${tag}`, want, { step: "sidebar-groups", entryHash: "#/", via: "none (entry page)", links: order.length });
      await context.close();
    }

    log.push({ page: "s11", tag, errors });
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => (l.overflowPx !== undefined && l.overflowPx > 0) || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

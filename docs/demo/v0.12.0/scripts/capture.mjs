// Demo v0.12.0 截图脚本：用系统 Chrome 走真实页面，演示 S12 的用户可见变化，并补 D409 延后的 TINV-08 截图与大额发票 390 实测：
// 发票深链接（TINV-07）：打开详情、非法 invoice、非法筛选组；订单按开票状态筛选（TORD-06）三种状态；期末结账页新页头、徽标与复选框（UI-15）；
// 总账四页新页头（UI-16）；TINV-08：筛选栏留白、详情合计、详情行千分位、大额发票。UI-17 不进截图（D384）。
// 用法：node docs/demo/v0.12.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs、seed-detail.mjs、seed-large.mjs 预置（数字见各脚本头部注释与 README §3）。
// 到达路径规则（docs/demo/TEMPLATE.md，PROC-08）：入口页（发票列表、订单列表、首页）以及“深链接”这个被演示的功能本身允许直接 goto；
// 其余目标状态由同一页面实例上的用户操作到达，并在 capture-log-main.json 里记录入口 hash、操作与最终 hash。每个步骤用全新的浏览器上下文。
// 每张截图前断言语言、主题、宽度、教学开关、scrollY，宽度为 390 时再断言页面不横向溢出。每条断言的对照态见 README §3。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out, day] = process.argv.slice(2);
if (!base || !out || !/^\d{4}-\d{2}-\d{2}$/u.test(day ?? "")) throw new Error("usage: capture.mjs <address> <outDir> <yyyy-mm-dd>");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
// 文案来源：ui/trade-invoice-detail-labels.ts、ui/trade-order-labels.ts、ui/close-labels.ts、ui/trade-report-labels.ts、
// ui/master-labels.ts、ui/dimension-labels.ts、ui/journal-labels.ts、ui/business-labels.ts
const text = {
  zh: {
    notFound: "发票不存在或已不在本公司。",
    linkInvalid: "链接中的筛选条件无效，已忽略；当前显示全部发票。",
    detailTitle: "发票详情",
    totals: "合计",
    invoicingLabel: "开票状态",
    invoicing: { none: "未开票", partial: "部分开票", full: "已开完" },
    admit: ["准入贸易", "准入税务"],
    modules: ["贸易", "税务"],
    pages: {
      "#/accounts": ["科目表", "按公司维护会计科目的类别、报表分组、余额方向与手工录入权限。"],
      "#/dimensions": ["财务维度", "配置维度、维度值、科目维度结构、默认值、派生规则与平衡维度。"],
      "#/journals": ["凭证", "录入手工凭证草稿，预览并确认过账，再查看或反向已过账凭证。"],
      "#/events": ["业务事件", "维护服务、往来方与过账规则，录入业务事件并处理待转队列。"],
      "#/period-close": ["期末结账", "先预览再确认结账；贸易与税务写入前，先在本页保存期间准入。"],
    },
    open: "查看发票",
  },
  en: {
    notFound: "The invoice does not exist or is no longer in this company.",
    linkInvalid: null,
    detailTitle: "Invoice details",
    totals: "Totals",
    invoicingLabel: "Invoicing",
    invoicing: { none: "Not invoiced", partial: "Partly invoiced", full: "Fully invoiced" },
    admit: ["Admit trade", "Admit tax"],
    modules: ["Trade", "Tax"],
    pages: {
      "#/accounts": ["Chart of accounts", "Maintain each company's accounts: category, report group, normal side and manual-entry permission."],
      "#/dimensions": ["Financial dimensions", "Configure dimensions, values, account structures, defaults, derivation rules and balancing dimensions."],
      "#/journals": ["Journals", "Enter manual journal drafts, preview and confirm posting, then review or reverse posted journals."],
      "#/events": ["Business events", "Maintain services, parties and posting rules, record business events and process the transfer queue."],
      "#/period-close": ["Period close", "Preview, then confirm the close; save the period admission here before trade and tax writes."],
    },
    open: "View invoice",
  },
};
async function api(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}
async function allInvoices(query = "") {
  const items = [];
  let cursor = "";
  do {
    const page = await api(`/api/v1/trade/invoices?company=DEFAULT&limit=500${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    items.push(...page.items);
    cursor = page.nextCursor ?? "";
  } while (cursor);
  return items;
}
const invoiceId = async (externalNo) => {
  const item = (await allInvoices()).find((row) => row.externalNo === externalNo);
  if (!item) throw new Error(`readiness: 发票 ${externalNo} 不存在`);
  return item.documentId;
};
const orderIds = async (invoicing) => (await api(`/api/v1/trade/orders?company=DEFAULT&limit=100${invoicing ? `&invoicing=${invoicing}` : ""}`)).items.map((o) => o.orderId).sort();

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
  return scrollWidth;
}
// D441：只有“截图是否拍对”（状态、路由、关键文本可见、readiness）失败即中止；其余断言只记录进日志，由 README 逐条核对。
const checks = [];
function check(label, ok, detail) {
  checks.push({ check: label, ok: Boolean(ok), detail });
  if (!ok) console.log(`CHECK-FAILED(recorded): ${label} ${JSON.stringify(detail)}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function shot(page, name, want, expectPrefix, extra = {}) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const scrollWidth = await assertState(page, want);
  const hash = await page.evaluate(() => location.hash);
  if (!hash.startsWith(expectPrefix)) throw new Error(`${name} 截图前 location.hash 应以 ${expectPrefix} 开头，实际 ${hash}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow, scrollWidth, hash, ...extra });
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
function newPage(context, errors, expectedErrors = []) {
  return context.newPage().then((page) => {
    page.requests = [];
    page.dialogs = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !expectedErrors.some((p) => m.text().includes(p)) && errors.push(`${m.text()} @ ${page.url()}`));
    page.on("response", (r) => r.status() >= 400 && !expectedErrors.some((p) => `HTTP ${r.status()}`.includes(p)) && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
    page.on("request", (r) => page.requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
    page.on("dialog", (d) => {
      page.dialogs.push(d.message());
      return d.dismiss();
    });
    return page;
  });
}
const contextFor = (lang, theme, width) =>
  browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 }).then(async (context) => {
    await context.addInitScript((value) => window.localStorage.setItem("erp.workspace.preferences.v1", value), JSON.stringify({ language: lang, theme, teaching: true }));
    return context;
  });
const listRows = (page) =>
  page.locator("section.tinv-list-scroll table tbody tr button.tinv-detail-trigger").evaluateAll((buttons) => buttons.map((b) => b.textContent.trim()).sort());
const rowCount = (page) => page.locator("section.tinv-list-scroll table").getAttribute("aria-rowcount");
const firstRow = (page) => page.locator("section.tinv-list-scroll table tbody tr button.tinv-detail-trigger").first().waitFor({ timeout: 8000 });
const numbers = (s) => s.replace(/\D/gu, "");
const detailRequests = (page) => page.requests.filter((r) => /^GET \/api\/v1\/trade\/invoices\/[^/]+$/u.test(r));

let failure = null;
try {
  const ids = { d1: await invoiceId("AP-D1-1"), big: await invoiceId("AP-BIG-1") };
  const bigDetail = await api(`/api/v1/trade/invoices/${ids.big}?company=DEFAULT`);
  const bigLine = bigDetail.document.lines[0];
  const bigGross = bigDetail.document.gross;
  if (bigGross < 100_000_000_000) throw new Error(`readiness: AP-BIG-1 合计 ${bigGross} 分，应不少于 100000000000`);
  const apAll = (await allInvoices("&side=AP")).length;
  const orderAll = await orderIds("");
  const orderSets = { none: await orderIds("none"), partial: await orderIds("partial"), full: await orderIds("full") };
  for (const [state, set] of Object.entries(orderSets)) {
    if (set.length === 0 || set.length >= orderAll.length) throw new Error(`readiness: 开票状态 ${state} 的订单应非空且少于全部 ${orderAll.length}，实际 ${set.length}`);
  }
  log.push({ readiness: { apAll, bigGross, orderAll, orderSets } });

  for (const [lang, theme, width] of combos) {
    const tag = `${lang}-${theme}-${width}`;
    const want = { lang, theme, width, teaching: true };
    const t = text[lang];
    const errors = [];

    // 1 深链接打开详情：对照 = 同一列表筛选、没有 invoice 参数的链接（没有对话框、没有详情请求）
    {
      const params = `company=DEFAULT&party=PARTY2&side=AP`;
      const context = await contextFor(lang, theme, width);
      const control = await newPage(context, errors);
      await control.goto(`${base}/#/trade-invoices?${params}`);
      await firstRow(control);
      check(`${tag} 深链接对照无对话框/详情请求`, (await control.getByRole("dialog").count()) === 0 && detailRequests(control).length === 0, detailRequests(control));
      await control.close();
      const page = await newPage(context, errors);
      const entry = `#/trade-invoices?${params}&invoice=${ids.d1}`;
      await page.goto(`${base}/${entry}`);
      const dialog = page.getByRole("dialog", { name: `${t.detailTitle} · AP-D1-1`, exact: true });
      await dialog.waitFor({ timeout: 8000 });
      const totals = await dialog.getByRole("region", { name: t.totals, exact: true }).innerText();
      for (const value of ["100.00", "13.00", "113.00"]) check(`${tag} 深链接详情合计含 ${value}`, totals.includes(value), totals);
      await poll(() => listRows(page), ["AP-D1-1", "AP-DEMO2", "AP-EARLY-1", "AP-EARLY-2", "AP-EARLY-3", "AP-BIG-1"].sort(), "深链接的列表按 PARTY2 + AP 筛选");
      check(`${tag} 深链接恰好一个详情请求`, detailRequests(page).length === 1, detailRequests(page));
      const hash = await page.evaluate(() => location.hash);
      check(`${tag} 深链接不改写地址栏`, hash === entry, { entry, hash });
      await shot(page, `deeplink-detail-${tag}`, want, "#/trade-invoices", { step: "deeplink-detail", entryHash: entry, via: "goto deep link" });
      await context.close();
    }

    // 2 非法 invoice（P6）：对照 = 格式正确但不存在的 id（会发一次请求并得到 404，同一句提示）
    {
      const context = await contextFor(lang, theme, width);
      const control = await newPage(context, errors, ["HTTP 404", "404"]);
      await control.goto(`${base}/#/trade-invoices?company=DEFAULT&invoice=${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`);
      await control.getByText(t.notFound, { exact: false }).waitFor({ timeout: 8000 });
      check(`${tag} 对照（格式正确、不存在）发一个详情请求`, detailRequests(control).length === 1, detailRequests(control));
      await control.close();
      const page = await newPage(context, errors);
      const entry = "#/trade-invoices?company=DEFAULT&invoice=not-a-document-id";
      await page.goto(`${base}/${entry}`);
      await page.getByText(t.notFound, { exact: false }).waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      check(`${tag} 非法 invoice 不发详情请求`, detailRequests(page).length === 0, detailRequests(page));
      check(`${tag} 非法 invoice 无重试按钮`, (await page.getByRole("button", { name: /^(重试|Retry)$/u }).count()) === 0, null);
      await shot(page, `deeplink-invalid-invoice-${tag}`, want, "#/trade-invoices", { step: "deeplink-invalid-invoice", entryHash: entry, via: "goto deep link", detailRequests: 0, controlDetailRequests: 1 });
      await context.close();
    }

    // 3 非法筛选组（side=XX）：整组忽略并提示；对照 = 合法的 side=AR（无提示，只剩 AR 行）
    {
      const context = await contextFor(lang, theme, width);
      const control = await newPage(context, errors);
      await control.goto(`${base}/#/trade-invoices?company=DEFAULT&side=AR`);
      await firstRow(control);
      const controlRows = Number(await rowCount(control));
      check(`${tag} 对照（合法 side=AR）无警告`, (await control.getByRole("status").filter({ hasText: /链接中的筛选条件无效|filter in the link/u }).count()) === 0, null);
      await control.close();
      const page = await newPage(context, errors);
      const entry = "#/trade-invoices?company=DEFAULT&side=XX";
      await page.goto(`${base}/${entry}`);
      await firstRow(page);
      const warning = page.getByRole("status").filter({ has: page.getByRole("button", { name: /^(清除|Clear)$/u }) });
      await warning.waitFor({ timeout: 8000 });
      if (t.linkInvalid) check(`${tag} 警告含文案`, (await warning.innerText()).includes(t.linkInvalid), await warning.innerText());
      const rows = Number(await rowCount(page));
      check(`${tag} 忽略非法筛选后显示全部发票`, rows > controlRows, { rows, controlRows });
      await shot(page, `deeplink-invalid-filter-${tag}`, want, "#/trade-invoices", { step: "deeplink-invalid-filter", entryHash: entry, via: "goto deep link", rowcount: rows, controlRowcount: controlRows });
      await context.close();
    }

    // 4 订单按开票状态筛选：入口 = 订单列表；对照 = 筛选前的全部订单集合（与 API 的 invoicing 参数结果逐一比对）
    for (const state of ["none", "partial", "full"]) {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-orders?company=DEFAULT`);
      const rows = () => page.locator("table.tord-list tbody tr button.cell-link").evaluateAll((b) => b.map((x) => x.textContent.trim()).sort());
      await poll(rows, orderAll, "订单列表（未筛选）");
      await page.locator("#tord-filter-invoicing").selectOption(state);
      await page.locator("form.tord-filter button[type=submit]").click();
      await poll(rows, orderSets[state], `开票状态 ${state} 的订单`);
      const badges = await page.locator("table.tord-list td.tord-invoicing").allInnerTexts();
      check(`${tag} ${state} 徽标全为 ${t.invoicing[state]}`, badges.length > 0 && badges.every((b) => b.includes(t.invoicing[state])), badges);
      await shot(page, `orders-invoicing-${state}-${tag}`, want, "#/trade-orders", { step: `orders-invoicing-${state}`, entryHash: "#/trade-orders?company=DEFAULT", via: `select #tord-filter-invoicing=${state}, click apply`, before: orderAll.length, after: orderSets[state].length });
      await context.close();
    }

    // 5 期末结账页（UI-15）与总账四页（UI-16）：入口 = 首页，侧栏链接点击到达；页头说明为纯新增（无对照），徽标与复选框对照原始模块键 trade / tax
    for (const hash of ["#/period-close", "#/accounts", "#/dimensions", "#/journals", "#/events"]) {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/`);
      await page.locator("nav.nav").waitFor({ timeout: 8000 });
      await page.locator(`nav.nav a[href^="${hash}"]`).click();
      const [title, description] = t.pages[hash];
      await page.locator(".page-header h2", { hasText: title }).waitFor({ timeout: 8000 });
      const header = await page.locator(".page-header .titles").first().innerText();
      check(`${tag} ${hash} 页头含说明`, header.includes(title) && header.includes(description), { title, description, header });
      const extra = { step: `page-header${hash.slice(1).replace("/", "-")}`, entryHash: "#/", via: `click nav link ${hash}` };
      if (hash === "#/period-close") {
        const summary = await page.locator("#trade-period-admission-body").evaluate((body) => body.closest(".fasttab").querySelector("header").innerText);
        for (const m of t.modules) check(`${tag} 准入徽标可见文本含 ${m}`, summary.includes(m), summary);
        for (const l of t.admit) check(`${tag} 复选框 ${l}`, (await page.locator(".ui-check", { hasText: l }).count()) === 1, null);
        extra.badges = summary;
      }
      await shot(page, `${hash === "#/period-close" ? "period-close" : `header-${hash.slice(2)}`}-${tag}`, want, hash, extra);
      await context.close();
    }

    // 6 TINV-08：筛选栏留白（记录实测）、大额发票详情的千分位与合计（对照 = 同一发票的 API 原值）
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-invoices?company=DEFAULT`);
      await firstRow(page);
      const gaps = await page.evaluate(() => {
        const card = document.querySelector(".tinv-list");
        const head = card.querySelector(":scope > header").getBoundingClientRect();
        const form = card.querySelector("form.filter-bar");
        const box = form.getBoundingClientRect();
        const style = getComputedStyle(form);
        return { headToForm: box.top - head.bottom, padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft] };
      });
      // D440：只记录实测间距（0 px 可能是真实界面问题），不作断言
      await shot(page, `invoice-list-filter-${tag}`, want, "#/trade-invoices", { step: "invoice-list-filter", entryHash: "#/trade-invoices?company=DEFAULT", via: "none (entry page)", gaps });
      await context.close();
    }
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-invoices?company=DEFAULT`);
      await firstRow(page);
      await page.locator("#tinv-filter-party").fill("PARTY2");
      await page.locator("#tinv-filter-side").selectOption("AP");
      await page.locator("form[role=search] button[type=submit]").click();
      await poll(() => listRows(page), ["AP-BIG-1", "AP-D1-1", "AP-DEMO2", "AP-EARLY-1", "AP-EARLY-2", "AP-EARLY-3"], "PARTY2 + AP 的发票");
      await page.getByRole("button", { name: `${t.open} AP-BIG-1`, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${t.detailTitle} · AP-BIG-1`, exact: true });
      await dialog.waitFor({ timeout: 8000 });
      const region = dialog.getByRole("region", { name: t.totals, exact: true });
      await region.waitFor({ timeout: 8000 });
      const cells = await dialog.locator(".tinv-detail-lines tbody tr").first().locator("td").allInnerTexts();
      const grouped = [cells[2], cells[3], cells[4]];
      check(`${tag} 详情行数量/单价/折扣千分位`, same(grouped, ["1,234", "1,000,000.12", "12.5"]), { grouped, api: [bigLine.quantity, bigLine.unitPrice, bigLine.discountPercent] });
      const dd = await region.locator("dd").allInnerTexts();
      check(`${tag} 合计与 API net/tax/gross 一致`, dd.length === 3 && numbers(dd[0]) === String(bigDetail.document.net) && numbers(dd[1]) === String(bigDetail.document.tax) && numbers(dd[2]) === String(bigGross), { dd, net: bigDetail.document.net, tax: bigDetail.document.tax, gross: bigGross });
      const measure = await page.evaluate(() => {
        const dlg = document.querySelector("dialog.tinv-detail");
        const tops = [...dlg.querySelectorAll(".tinv-totals dd")].map((n) => Math.round(n.getBoundingClientRect().top));
        const overflowing = [...dlg.querySelectorAll(".tinv-totals dd")].filter((n) => n.scrollWidth > n.clientWidth).length;
        return { totalsRows: new Set(tops).size, totalsOverflowing: overflowing, dialogScrollWidth: dlg.scrollWidth, dialogClientWidth: dlg.clientWidth, docScrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      });
      check(`${tag} 合计金额不溢出单元格`, measure.totalsOverflowing === 0, measure);
      check(`${tag} 页面无横向溢出`, measure.docScrollWidth <= measure.innerWidth, measure);
      await shot(page, `invoice-detail-large-${tag}`, want, "#/trade-invoices", { step: "invoice-detail-large", entryHash: "#/trade-invoices?company=DEFAULT", via: "filter party=PARTY2 side=AP, click AP-BIG-1", grossMinor: bigGross, grouped, measure });
      await context.close();
    }

    log.push({ page: "s12", tag, errors });
    check(`${tag} 无页面错误`, errors.length === 0, errors);
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
log.push({ checks });
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => (l.overflowPx !== undefined && l.overflowPx > 0) || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

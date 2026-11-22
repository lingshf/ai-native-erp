// Demo v0.9.0 截图脚本：用系统 Chrome 走真实页面，演示 S9 的用户可见变化：
// 订单列表“开票状态”列与订单深链接（TINV-03，#179）、发票列表“来源订单”列与五页统一离开确认（TINV-04，#181）。
// 用法：node docs/demo/v0.9.0/scripts/capture.mjs <地址> <输出目录>
// 前提：账套已由 seed-trade.mjs 与 seed-invoicing.mjs 预置（PO-I1 部分开票，PO-I2 已开完，PO-I3 未开票；发票 AP-I1-1 来自 PO-I1，AP-I2-1 来自 PO-I2）。
// 每张截图前断言语言、主题、宽度、教学开关、scrollY（见 docs/demo/TEMPLATE.md）。
// 每个步骤用全新的浏览器上下文隔离草稿 / 本地存储；步骤 4 内部刻意复用同一页面（演示草稿在取消离开后仍在、确认离开后才丢失），原因见该步骤注释。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error("usage: capture.mjs <address> <outDir>");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
// 文案来源：packages/web/src/ui/trade-order-labels.ts:84-93、:187-196；trade-labels.ts:62、:201、:289、:420-421
// 徽章 textContent = aria-hidden 符号 + 文本（ui/components/index.tsx Badge；符号 warning "!"、info "i"、success "✓"，message-bar 的 symbols）
const text = {
  zh: {
    badge: { none: "!未开票", partial: "i部分开票", full: "✓已开完" },
    invoicingHead: "开票状态",
    sourceHead: "来源订单",
    noSource: "—无来源订单",
    notFound: "本公司没有该订单号的订单。",
    companyMissing: "公司不在已加载的列表中 · NOPE",
    back: "返回列表",
    leave: "本页有未提交的修改，仍要离开吗？",
  },
  en: {
    badge: { none: "!Not invoiced", partial: "iPartly invoiced", full: "✓Fully invoiced" },
    invoicingHead: "Invoicing",
    sourceHead: "Source order",
    noSource: "—No source order",
    notFound: "No order with this number exists in this company.",
    companyMissing: "The company is not in the loaded list · NOPE",
    back: "Back to list",
    leave: "This page has changes that are not submitted. Leave anyway?",
  },
};
const tone = { none: "badge warning", partial: "badge info", full: "badge success" };

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
async function shot(page, name, want) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await assertState(page, want);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow });
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
// 订单列表：每行取 订单号、开票状态单元格 textContent、Badge 的 class、aria-hidden 符号，按订单号排序
const listRows = (page) =>
  page.locator("table.tord-list tbody tr").evaluateAll((rows) =>
    rows
      .map((row) => {
        const badge = row.querySelector("td.tord-invoicing .badge");
        return [row.children[0].textContent.trim(), row.querySelector("td.tord-invoicing").textContent, badge?.className, badge?.querySelector("[aria-hidden=true]")?.textContent];
      })
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
// 订单行表：每行取 订单行号、数量、已开票、未开票 四列（与 v0.8.0 相同）
const orderRows = (page) =>
  page.locator("table.tord-amounts tbody tr:not(.tord-total)").evaluateAll((rows) => rows.map((row) => [1, 4, 5, 6].map((i) => row.children[i].textContent.replace(/^\u2713\s*/, "").trim())));
// 发票列表：每行取 外部发票号、来源订单文字、来源订单链接地址，按发票号排序
const invoiceRows = (page) =>
  page.locator("section.tinv-list-scroll table tbody tr").evaluateAll((rows) =>
    rows
      .map((row) => {
        const cell = row.querySelector("td.tinv-source");
        return [row.children[2].textContent.trim(), cell.textContent.trim(), cell.querySelector("a")?.getAttribute("href") ?? null];
      })
      .sort((a, b) => a[0].localeCompare(b[0])),
  );

function newPage(context, errors) {
  return context.newPage().then((page) => {
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
    return page;
  });
}
const contextFor = (lang, theme, width) =>
  browser
    .newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    .then(async (context) => {
      await context.addInitScript((value) => window.localStorage.setItem("erp.workspace.preferences.v1", value), JSON.stringify({ language: lang, theme, teaching: true }));
      return context;
    });

// 失败时先把已有日志与错误写入输出目录再抛出，截图已逐张落盘
let failure = null;
try {
for (const [lang, theme, width] of combos) {
  const tag = `${lang}-${theme}-${width}`;
  const want = { lang, theme, width, teaching: true };
  const t = text[lang];
  const errors = [];

  // 1 订单列表：三种开票状态各一行；徽章文字 = 符号 + 文本，class 对应 warning / info / success，符号在 aria-hidden 内
  {
    const context = await contextFor(lang, theme, width);
    const page = await newPage(context, errors);
    await page.goto(`${base}/#/trade-orders`);
    await page.locator("main h2").first().waitFor();
    await page.locator("table.tord-list").waitFor({ timeout: 8000 });
    const head = await page.locator("table.tord-list thead th").last().innerText();
    if (head.trim() !== t.invoicingHead) throw new Error("最后一列表头不符：" + head);
    await poll(
      () => listRows(page),
      [
        ["PO-I1", t.badge.partial, tone.partial, t.badge.partial[0]],
        ["PO-I2", t.badge.full, tone.full, t.badge.full[0]],
        ["PO-I3", t.badge.none, tone.none, t.badge.none[0]],
      ],
      "订单列表开票状态",
    );
    log.push({ step: "orders-list", tag });
    await shot(page, `orders-list-invoicing-${tag}`, want);
    await context.close();
  }

  // 2 订单深链接：直接打开 PO-I1 的只读详情，焦点在结果区，刷新后仍是同一画面；订单不存在与公司不在列表中有明确提示和“返回列表”
  {
    const context = await contextFor(lang, theme, width);
    const page = await newPage(context, errors);
    await page.goto(`${base}/#/trade-orders?company=DEFAULT&order=PO-I1`);
    await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
    await poll(() => orderRows(page), [["L1", "10", "4", "6"], ["L2", "4", "0", "4"]], "深链接 PO-I1 订单行");
    const inResult = () => page.evaluate(() => !!document.activeElement?.closest(".tord-lookup-result"));
    await poll(inResult, true, "深链接打开后焦点应在结果区");
    await page.reload();
    await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
    await poll(() => orderRows(page), [["L1", "10", "4", "6"], ["L2", "4", "0", "4"]], "刷新后订单行");
    log.push({ step: "order-deeplink", tag, hash: new URL(page.url()).hash });
    await shot(page, `order-deeplink-${tag}`, want);

    // 订单不存在：提示文案；该步浏览器会记录一次 GET /api/v1/trade/orders/PO-MISSING 404（预期）
    await page.goto(`${base}/#/trade-orders?company=DEFAULT&order=PO-MISSING`);
    await page.getByText(t.notFound, { exact: true }).waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: t.back }).click();
    await poll(() => page.evaluate(() => location.hash), "#/trade-orders?company=DEFAULT", "订单不存在后点返回列表：保留 company，去掉 order");
    // 公司不在已加载的列表中：提示；返回列表清掉 company 与 order
    await page.goto(`${base}/#/trade-orders?company=NOPE&order=PO-I1`);
    await page.getByText(t.companyMissing, { exact: true }).waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: t.back }).click();
    await poll(() => page.evaluate(() => location.hash), "#/trade-orders", "公司不在列表后点返回列表：清掉 company 与 order");
    log.push({ step: "order-deeplink-errors", tag });
    await context.close();
  }

  // 3 发票列表：来源订单列显示订单号链接，指向订单详情；点链接进入该订单的深链接
  {
    const context = await contextFor(lang, theme, width);
    const page = await newPage(context, errors);
    await page.goto(`${base}/#/trade-invoices?company=DEFAULT`);
    await page.locator("section.tinv-list-scroll table tbody tr").first().waitFor({ timeout: 8000 });
    const head = await page.locator("section.tinv-list-scroll table thead th.tinv-source").innerText();
    if (head.trim() !== t.sourceHead) throw new Error("来源订单列表头不符：" + head);
    await poll(
      () => invoiceRows(page),
      [
        ["AP-DEMO", t.noSource, null],
        ["AP-DEMO2", t.noSource, null],
        ["AP-I1-1", "PO-I1", "#/trade-orders?company=DEFAULT&order=PO-I1"],
        ["AP-I2-1", "PO-I2", "#/trade-orders?company=DEFAULT&order=PO-I2"],
      ],
      "发票列表来源订单",
    );
    log.push({ step: "invoice-list-source", tag });
    await shot(page, `invoice-list-source-${tag}`, want);
    await page.locator("td.tinv-source a[title=PO-I1]").click();
    await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
    await poll(() => orderRows(page), [["L1", "10", "4", "6"], ["L2", "4", "0", "4"]], "点来源订单后的订单行");
    await context.close();
  }

  // 4 离开确认：在发票页写一点草稿，点来源订单链接 → 确认框；取消则留在原页且草稿不变；浏览器后退也只问一次，取消则留在原地址；
  // 确认后才离开。刻意在同一页面内连续完成：要演示的正是“取消后草稿仍在”，所以这一步不能换新上下文；
  // 与其他步骤的隔离靠本步骤自己的全新浏览器上下文。第一次进入发票页前先打开订单页，保证后退目标是应用内同文档的历史项。
  {
    const context = await contextFor(lang, theme, width);
    const page = await newPage(context, errors);
    const dialogs = [];
    let answer = "dismiss";
    page.on("dialog", (d) => {
      dialogs.push({ type: d.type(), message: d.message() });
      return answer === "accept" ? d.accept() : d.dismiss();
    });
    await page.goto(`${base}/#/trade-orders`);
    await page.locator("main h2").first().waitFor();
    await page.evaluate(() => {
      location.hash = "#/trade-invoices?company=DEFAULT";
    });
    await page.locator("section.tinv-list-scroll table tbody tr").first().waitFor({ timeout: 8000 });
    await page.locator("#tinv-externalInvoice").fill("DRAFT-1");
    const draft = () => page.locator("#tinv-externalInvoice").inputValue();
    const invoicesHash = await page.evaluate(() => location.hash);
    if (!invoicesHash.startsWith("#/trade-invoices")) throw new Error("应在发票页：" + invoicesHash);

    // 4a 点链接，取消
    await page.locator("td.tinv-source a[title=PO-I1]").click();
    await page.waitForTimeout(500);
    if (!same(dialogs, [{ type: "confirm", message: t.leave }])) throw new Error("点链接应恰好弹出一次确认框：" + JSON.stringify(dialogs));
    if ((await page.evaluate(() => location.hash)) !== invoicesHash) throw new Error("取消后应留在发票页");
    if ((await draft()) !== "DRAFT-1") throw new Error("取消后草稿应保留");

    // 4b 真实的浏览器后退（page.goBack，不用合成 pushState），取消：只问一次，留在原地址，草稿还在
    await page.goBack({ waitUntil: "commit", timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(800);
    if (dialogs.length !== 2 || dialogs[1].message !== t.leave) throw new Error("后退应再弹一次确认框：" + JSON.stringify(dialogs));
    if ((await page.evaluate(() => location.hash)) !== invoicesHash) throw new Error("后退取消后应留在原地址");
    if ((await draft()) !== "DRAFT-1") throw new Error("后退取消后草稿应保留");
    log.push({ step: "invoice-leave-cancelled", tag, dialogs: dialogs.length });
    await shot(page, `invoice-leave-cancelled-${tag}`, want);

    // 4c 点链接，确认：离开到该订单的深链接
    answer = "accept";
    await page.locator("td.tinv-source a[title=PO-I1]").click();
    await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
    if (dialogs.length !== 3) throw new Error("确认离开应只多一次确认框：" + JSON.stringify(dialogs));
    if ((await page.evaluate(() => location.hash)) !== "#/trade-orders?company=DEFAULT&order=PO-I1") throw new Error("确认后应进入订单深链接");
    await context.close();
  }

  log.push({ page: "s9", tag, errors });
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

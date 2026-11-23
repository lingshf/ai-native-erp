// Demo v0.14.0 截图脚本（DEMO-15）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明：(1) TINV-09：订单列表与订单详情把贷项算进已开票数量（PO-C1 订购 10、开票 10、贷项 4 → 已开票 6、未开票 4、“部分开票”）；
//       (2) JV-FIX-01：凭证列表工具栏按钮为“刷新列表 / Refresh list”，页面上没有“重试 / Retry”按钮；
//       (3) 发票、期末结账、往来未结项与账龄页在 REFAC-06b / 06c 之后仍能正常渲染（不证明外观逐像素不变，没有与 v0.13.1 的对比图）。
// 页面（6 组）：订单列表、订单详情、凭证、发票、期末结账、往来未结项与账龄；每组 zh-red / en-green 各 1 张（1440 宽），共 12 张。
// 用法：node docs/demo/v0.14.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs、seed-credit.mjs 预置（只有 DEFAULT 账套）。
// D457：每个页面（每个语言）使用一个全新的浏览器 context，页面之间不共用前端状态。
// D440 / D441 / D444：只有“截图是否拍对”（路由、语言、主题、宽度、页头标题、关键可见文字与数字）失败即中止；
// 溢出、页面错误等样式类断言只用 check() 记录进 capture-log-main.json，不中止。
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
const width = 1440;
// 文案取自 ui/*-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const text = {
  invoicing: { zh: "部分开票", en: "Partly invoiced" },
  invoicedCol: { zh: "已开票数量", en: "Invoiced qty" },
  uninvoicedCol: { zh: "未开票数量", en: "Not invoiced qty" },
  lines: { zh: "订单行", en: "Order lines" },
  refresh: { zh: "刷新列表", en: "Refresh list" },
  retry: { zh: "重试", en: "Retry" },
};
const pages = [
  { name: "trade-orders", route: "/trade-orders", title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" }, kind: "orders-list" },
  { name: "trade-orders-detail", route: "/trade-orders", title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" }, kind: "orders-detail" },
  { name: "journals", route: "/journals", title: { zh: "凭证", en: "Journals" }, kind: "journals" },
  { name: "trade-invoices", route: "/trade-invoices", title: { zh: "采购与销售发票", en: "Purchase and sales invoices" }, kind: "plain" },
  { name: "period-close", route: "/period-close", title: { zh: "期末结账", en: "Period close" }, kind: "plain" },
  { name: "trade-reports", route: "/trade-reports", title: { zh: "往来未结项与账龄", en: "Trade open items and ageing" }, kind: "plain" },
];
async function contextFor(lang, theme) {
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

// 订单列表：PO-C1 一行的“开票状态”徽标文字。对照态：贷项之前它是“已开完”（seed-credit.mjs 在贷项前后各读一次并断言）。
async function ordersList(page, lang) {
  const row = page.locator("table.tord-list tbody tr").filter({ has: page.getByRole("button", { name: "PO-C1", exact: true }) });
  await row.first().waitFor({ timeout: 10000 });
  const badge = (await row.locator(".tord-invoicing").first().innerText()).trim();
  must(badge.includes(text.invoicing[lang]), `订单列表 PO-C1 开票状态应含“${text.invoicing[lang]}”，实际“${badge}”`);
  return { badge };
}

// 订单详情：从列表点订单号进入；订单行表里 L1 的数量 10、已开票 6、未开票 4。
async function ordersDetail(page, lang) {
  await page.getByRole("button", { name: "PO-C1", exact: true }).click();
  const table = page.getByRole("table", { name: `${text.lines[lang]} PO-C1`, exact: true });
  await table.waitFor({ timeout: 10000 });
  const headers = (await table.locator("thead th").allInnerTexts()).map((h) => h.trim());
  const invoicedAt = headers.indexOf(text.invoicedCol[lang]);
  const uninvoicedAt = headers.indexOf(text.uninvoicedCol[lang]);
  must(invoicedAt >= 0 && uninvoicedAt >= 0, `订单行表缺少已开票 / 未开票列：${JSON.stringify(headers)}`);
  const qtyAt = invoicedAt - 1;
  const cells = (await table.locator("tbody tr").first().locator("td").allInnerTexts()).map((c) => c.trim());
  const num = (value) => Number(value.replaceAll(",", ""));
  const got = { quantity: num(cells[qtyAt]), invoiced: num(cells[invoicedAt]), uninvoiced: num(cells[uninvoicedAt]) };
  // 若读取已开票数量仍在加载，单元格是“…”，Number 得到 NaN，这里会中止并报出实际值。
  must(got.quantity === 10 && got.invoiced === 6 && got.uninvoiced === 4, `PO-C1 L1 应为 数量 10 / 已开票 6 / 未开票 4，实际 ${JSON.stringify({ got, cells })}`);
  return { got };
}

// 凭证列表：无错误时工具栏按钮为“刷新列表”，没有“重试”按钮（JV-FIX-01 J1）。对照态：v0.13.1 同一位置是“重试 / Retry”（见 docs/demo/v0.13.1/README.md §3）。
async function journals(page, lang) {
  const refresh = await page.getByRole("button", { name: text.refresh[lang], exact: true }).count();
  const retry = await page.getByRole("button", { name: text.retry[lang], exact: true }).count();
  must(refresh === 1, `凭证页应有 1 个“${text.refresh[lang]}”按钮，实际 ${refresh}`);
  must(retry === 0, `凭证页不应有“${text.retry[lang]}”按钮，实际 ${retry}`);
  return { refreshButtons: refresh, retryButtons: retry };
}

// 发票列表“卡片标题 → 第一个字段标签”的间距：只记录，期望 ≥16 px（DEMO-14 口径）。
async function invoiceSpacing(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".tinv-list > header");
    const label = document.querySelector("form.tinv-filter .field label");
    if (!header || !label) return null;
    return Math.round((label.getBoundingClientRect().top - header.getBoundingClientRect().bottom) * 10) / 10;
  });
}

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);
  const orders = await (await fetch(new URL("/api/v1/trade/orders?company=DEFAULT&limit=100", base))).json();
  const seeded = orders.items.find((order) => order.orderId === "PO-C1");
  must(seeded?.invoicing === "partial", `readiness: PO-C1 开票状态应为 partial，实际 ${seeded?.invoicing}`);

  for (const [lang, theme] of langs) {
    for (const item of pages) {
      const context = await contextFor(lang, theme);
      const errors = [];
      const page = await newPage(context, errors);
      const tag = `${lang}-${theme}-${width}`;
      const name = `${item.name}-${tag}`;
      await page.goto(`${base}/#${item.route}?company=DEFAULT`);
      await page.locator(".page-header h2").filter({ hasText: item.title[lang] }).first().waitFor({ timeout: 10000 });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const extra = { step: "page", via: `goto #${item.route}?company=DEFAULT` };
      if (item.kind === "orders-list") Object.assign(extra, await ordersList(page, lang));
      if (item.kind === "orders-detail") {
        Object.assign(extra, await ordersDetail(page, lang), { via: `goto #${item.route}?company=DEFAULT，点订单号 PO-C1` });
        await page.waitForLoadState("networkidle").catch(() => undefined);
      }
      if (item.kind === "journals") Object.assign(extra, await journals(page, lang));
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollTo(0, 0));
      const got = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        theme: document.querySelector(".workspace")?.dataset.theme,
        width: window.innerWidth,
        hash: location.hash,
        heading: document.querySelector(".page-header h2")?.textContent?.trim(),
        overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      const want = { lang, theme, width };
      const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
      must(bad.length === 0, `${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
      must(got.hash.startsWith(`#${item.route}`), `${name} 截图前 location.hash 应以 #${item.route} 开头，实际 ${got.hash}`);
      must(got.heading === item.title[lang], `${name} 页头标题应为 ${item.title[lang]}，实际 ${got.heading}`);
      if (item.kind === "orders-detail") must(got.hash.includes("order=PO-C1"), `${name} 详情的地址应含 order=PO-C1，实际 ${got.hash}`);
      check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
      if (item.name === "trade-invoices") {
        const gap = await invoiceSpacing(page);
        check(`${name} 卡片标题到第一个字段标签 ≥ 16 px（只记录）`, gap !== null && gap >= 16, gap);
        extra.invoiceCardHeaderToFirstLabelPx = gap;
      }
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      log.push({ name, hash: got.hash, heading: got.heading, ...extra });
      check(`${name} 无页面错误`, errors.length === 0, errors);
      await context.close();
    }
  }
} catch (e) {
  failure = e;
  log.push({ failure: String(e && e.stack ? e.stack : e) });
}
await browser.close();
log.push({ checks });
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log("shots", log.filter((l) => l.name).length);
if (failure) {
  console.error("CAPTURE FAILED:", failure.message);
  process.exit(1);
}

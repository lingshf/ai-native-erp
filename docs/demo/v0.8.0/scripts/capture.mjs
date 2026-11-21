// Demo v0.8.0 截图脚本：用系统 Chrome 走真实页面，演示 S8 的用户可见变化（从订单开票，#171、#172）。
// 用法：node docs/demo/v0.8.0/scripts/capture.mjs <地址> <输出目录>
// 前提：账套已由 seed-trade.mjs 与 seed-invoicing.mjs 预置（PO-I1 部分开票，PO-I2 全部开完）。
// 每张截图前断言语言、主题、宽度、教学开关、scrollY（见 docs/demo/TEMPLATE.md），并断言订单详情的数量、开票入口、发票页带入的行。
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
const text = {
  zh: { badge: "已开完", invoice: "开票", loaded: "已按订单带入", fully: "该订单已全部开票，未生成行", reason: "该订单所有行都已开完发票，没有可开票的数量。" },
  en: { badge: "Fully invoiced", invoice: "Invoice", loaded: "Filled from order", fully: "Order fully invoiced; no lines added", reason: "Every line of this order is fully invoiced; there is nothing left to invoice." },
};

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
// 订单行表：每行取 订单行号、数量、已开票、未开票 四列
const orderRows = (page) =>
  page.locator("table.tord-amounts tbody tr:not(.tord-total)").evaluateAll((rows) => rows.map((row) => [1, 4, 5, 6].map((i) => row.children[i].textContent.replace(/^\u2713\s*/, "").trim())));

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
  const invoicing = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.request().method()} ${path}`);
    if (path.endsWith("/invoicing")) invoicing.push(`${r.status()} ${path}`);
  });

  async function lookup(orderId) {
    await page.locator("#tord-lookup-id").fill(orderId);
    await page.locator("form.tord-lookup button[type=submit]").click();
    await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
  }

  // 1 订单页：查询 PO-I1（部分开票）。L1 订购 10 已开 4 未开 6；L2 订购 4 已开 0 未开 4；开票入口是可点的链接
  await page.goto(`${base}/#/trade-orders`);
  await page.locator("main h2").first().waitFor();
  await page.waitForLoadState("networkidle");
  await lookup("PO-I1");
  await poll(() => orderRows(page), [["L1", "10", "4", "6"], ["L2", "4", "0", "4"]], "PO-I1 订单行");
  const link = page.locator("section.tord-lookup-result .tord-invoice-actions a");
  await link.waitFor({ timeout: 8000 });
  if ((await link.innerText()).trim() !== t.invoice) throw new Error("开票入口文案不符");
  const href = await link.getAttribute("href");
  if (!href.includes("fromOrder=PO-I1") || !href.includes("company=DEFAULT")) throw new Error("开票入口地址不符：" + href);
  log.push({ step: "order-partial", tag, href });
  await shot(page, `order-partial-${tag}`, want);

  // 2 点“开票”：发票页带入 PO-I1 未开票的两行（数量 6 与 4），外部发票号为空且获得焦点，地址里的 fromOrder 已去掉
  await link.click();
  await page.getByText(t.loaded, { exact: false }).first().waitFor({ timeout: 8000 });
  await poll(
    () => page.locator('fieldset.tinv-lines tbody tr').evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("input")].map((i) => i.value))),
    [["EXPENSE", "VAT", "6", "10", "0", "0", "L1"], ["EXPENSE", "VAT", "4", "25", "0", "0", "L2"]],
    "发票页带入的行",
  );
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (focused !== "tinv-externalInvoice") throw new Error("焦点应在外部发票号，实际 " + focused);
  const header = await page.evaluate(() => ["side", "party", "orderId", "externalInvoice"].map((k) => document.querySelector(`#tinv-${k}`).value));
  if (!same(header, ["AP", "PARTY", "PO-I1", ""])) throw new Error("发票页表头不符：" + JSON.stringify(header));
  if (page.url().includes("fromOrder")) throw new Error("fromOrder 没有从地址里去掉：" + page.url());
  log.push({ step: "invoice-prefilled", tag, header });
  await shot(page, `invoice-prefilled-${tag}`, want);

  // 3 订单页：查询 PO-I2（全部开完）：两列为 10 / 已开完，开票是禁用按钮并写明原因
  await page.goto(`${base}/#/trade-orders`);
  await page.locator("main h2").first().waitFor();
  await lookup("PO-I2");
  await poll(() => orderRows(page), [["L1", "10", "10", t.badge]], "PO-I2 订单行");
  const button = page.locator("section.tord-lookup-result .tord-invoice-actions button");
  await button.waitFor({ timeout: 8000 });
  if (!(await button.isDisabled())) throw new Error("全部开完时开票应禁用");
  await page.getByText(t.reason, { exact: true }).waitFor({ timeout: 4000 });
  if ((await page.locator("section.tord-lookup-result .tord-invoice-actions a").count()) !== 0) throw new Error("全部开完时不应有开票链接");
  log.push({ step: "order-full", tag });
  await shot(page, `order-full-${tag}`, want);

  // 4 直接用链接打开发票页（全新浏览器上下文，没有前面步骤留下的草稿）：订单已全部开票，提示且不生成行（仍是一行空白草稿）
  const fresh = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await fresh.addInitScript(
    (value) => window.localStorage.setItem("erp.workspace.preferences.v1", value),
    JSON.stringify({ language: lang, theme, teaching: true }),
  );
  const page4 = await fresh.newPage();
  page4.on("pageerror", (e) => errors.push(String(e)));
  page4.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page4.url()}`));
  page4.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  await page4.goto(`${base}/#/trade-invoices?company=DEFAULT&fromOrder=PO-I2`);
  await page4.getByText(t.fully, { exact: false }).first().waitFor({ timeout: 8000 });
  const blank = await page4.locator("fieldset.tinv-lines tbody tr").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("input")].map((i) => i.value)));
  if (blank.length !== 1 || blank[0].some((v) => v === "PO-I2" || v === "L1")) throw new Error("全部开完时不应带入行：" + JSON.stringify(blank));
  log.push({ step: "invoice-fully-invoiced", tag, rows: blank.length });
  await shot(page4, `invoice-fully-invoiced-${tag}`, want);
  await fresh.close();

  log.push({ page: "s8", tag, invoicingRequests: invoicing, errors });
  await context.close();
}
await browser.close();
await writeFile(join(out, "capture-log-main.json"), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => (l.overflowPx !== undefined && l.overflowPx > 0) || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);

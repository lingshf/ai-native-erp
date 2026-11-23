// Demo v0.15.0 截图脚本（DEMO-16）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
// 证明：(1) REFAC-05b：订单录入页在 OrderWorkspace 拆分之后能正常渲染（命令条的“预览 / 保存订单”按钮、订单行表都在；
//           不证明外观逐像素不变，没有与 v0.14.0 的对比图）；
//       (2) TORD-08：订单详情的订单行表有第 8 列“贷项冲回数量 / Credited qty”，位置在“未开票数量”之后、“单价”之前，
//           PO-C1 的 L1 为 数量 10 / 已开票 6 / 未开票 4 / 冲回 4；
//       (3) TORD-08 K7：390 px 宽下文档不横向溢出，表格容器 div.grid-wrap 内可横向滚动，滚到新列后该列完整落在容器内（记录 scrollLeft 与三个矩形）。
// 页面：订单录入、订单详情，各 zh-red / en-green 一张（1440 宽，共 4 张）；订单详情 390 宽（zh-red）滚动前后各一张（共 2 张）。
// 用法：node docs/demo/v0.15.0/scripts/capture.mjs <地址> <输出目录> <day yyyy-mm-dd>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs、docs/demo/v0.14.0/scripts/seed-credit.mjs 预置（只有 DEFAULT 账套）。
// D457：每个页面（每个语言 / 宽度）使用一个全新的浏览器 context，页面之间不共用前端状态。
// D440 / D441 / D444：只有“截图是否拍对”（路由、语言、主题、宽度、页头标题、关键可见文字与数字）失败即中止；
// 溢出、滚动位置、页面错误等样式类断言只用 check() 记录进 capture-log-main.json，不中止。
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
// 文案取自 ui/trade-order-labels.ts；中英文不同，所以文字对不上就说明语言或页面拍错了。
const text = {
  title: { zh: "采购 / 销售订单", en: "Purchase and sales orders" },
  lines: { zh: "订单行", en: "Order lines" },
  preview: { zh: "预览", en: "Preview" },
  save: { zh: "保存订单", en: "Save order" },
  qtyCol: { zh: "数量", en: "Quantity" },
  invoicedCol: { zh: "已开票数量", en: "Invoiced qty" },
  uninvoicedCol: { zh: "未开票数量", en: "Not invoiced qty" },
  creditedCol: { zh: "贷项冲回数量", en: "Credited qty" },
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
async function openOrders(page, lang) {
  await page.goto(`${base}/#/trade-orders?company=DEFAULT`);
  await page.locator(".page-header h2").filter({ hasText: text.title[lang] }).first().waitFor({ timeout: 10000 });
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
  }));
}
function mustMatchState(name, got, want, lang) {
  const bad = ["lang", "theme", "width"].filter((k) => got[k] !== want[k]);
  must(bad.length === 0, `${name} 截图状态与文件名不符：${JSON.stringify({ want, got })}`);
  must(got.hash.startsWith("#/trade-orders"), `${name} 截图前 location.hash 应以 #/trade-orders 开头，实际 ${got.hash}`);
  must(got.heading === text.title[lang], `${name} 页头标题应为 ${text.title[lang]}，实际 ${got.heading}`);
}

// 订单录入页：命令条的“预览”“保存订单”按钮各 1 个，录入用的订单行表（aria-label 为“订单行”，没有订单号后缀）存在。
async function entryPage(page, lang) {
  const preview = await page.getByRole("button", { name: text.preview[lang], exact: true }).count();
  const save = await page.getByRole("button", { name: text.save[lang], exact: true }).count();
  const table = await page.getByRole("table", { name: text.lines[lang], exact: true }).count();
  must(preview === 1 && save === 1 && table === 1, `订单录入页应各有 1 个“${text.preview[lang]}”“${text.save[lang]}”按钮与 1 张订单行表，实际 ${JSON.stringify({ preview, save, table })}`);
  return { previewButtons: preview, saveButtons: save, entryLineTables: table };
}

// 订单详情：从列表点订单号进入。订单行表第一行（L1）：数量 10、已开票 6、未开票 4、贷项冲回 4；列顺序为 …未开票、贷项冲回、单价…
async function detailPage(page, lang) {
  await page.getByRole("button", { name: "PO-C1", exact: true }).click();
  const table = page.getByRole("table", { name: `${text.lines[lang]} PO-C1`, exact: true });
  await table.waitFor({ timeout: 10000 });
  const headers = (await table.locator("thead th").allInnerTexts()).map((h) => h.trim());
  const at = Object.fromEntries(["qtyCol", "invoicedCol", "uninvoicedCol", "creditedCol"].map((k) => [k, headers.indexOf(text[k][lang])]));
  must(Object.values(at).every((i) => i >= 0), `订单行表缺少数量 / 已开票 / 未开票 / 贷项冲回列：${JSON.stringify({ headers, at })}`);
  must(at.creditedCol === at.uninvoicedCol + 1 && headers.length > at.creditedCol + 1, `“${text.creditedCol[lang]}”应紧跟在“${text.uninvoicedCol[lang]}”之后且后面还有“单价”等列：${JSON.stringify(headers)}`);
  const cells = (await table.locator("tbody tr").first().locator("td").allInnerTexts()).map((c) => c.trim());
  const num = (value) => Number(value.replaceAll(",", ""));
  const got = { quantity: num(cells[at.qtyCol]), invoiced: num(cells[at.invoicedCol]), uninvoiced: num(cells[at.uninvoicedCol]), credited: num(cells[at.creditedCol]) };
  // 读取仍在加载时单元格是“…”，Number 得到 NaN，这里会中止并报出实际值。
  must(got.quantity === 10 && got.invoiced === 6 && got.uninvoiced === 4 && got.credited === 4, `PO-C1 L1 应为 数量 10 / 已开票 6 / 未开票 4 / 冲回 4，实际 ${JSON.stringify({ got, cells })}`);
  return { headers: headers.length, creditedColumnIndex: at.creditedCol, got };
}

let failure = null;
try {
  const companies = JSON.stringify(await (await fetch(new URL("/api/v1/companies?limit=100", base))).json());
  must(companies.includes('"DEFAULT"'), `readiness: 账套 DEFAULT 不存在：${companies.slice(0, 200)}`);
  const orders = await (await fetch(new URL("/api/v1/trade/orders?company=DEFAULT&limit=100", base))).json();
  const seeded = orders.items.find((order) => order.orderId === "PO-C1");
  must(seeded?.invoicing === "partial", `readiness: PO-C1 开票状态应为 partial，实际 ${seeded?.invoicing}`);

  const width = 1440;
  for (const [lang, theme] of langs) {
    for (const kind of ["entry", "detail"]) {
      const context = await contextFor(lang, theme, width);
      const errors = [];
      const page = await newPage(context, errors);
      const name = `trade-orders-${kind}-${lang}-${theme}-${width}`;
      await openOrders(page, lang);
      const extra = { step: "page", via: kind === "entry" ? "goto #/trade-orders?company=DEFAULT" : "goto #/trade-orders?company=DEFAULT，点订单号 PO-C1" };
      if (kind === "entry") Object.assign(extra, await entryPage(page, lang));
      else {
        Object.assign(extra, await detailPage(page, lang));
        await page.waitForLoadState("networkidle").catch(() => undefined);
      }
      const got = await state(page);
      mustMatchState(name, got, { lang, theme, width }, lang);
      if (kind === "detail") must(got.hash.includes("order=PO-C1"), `${name} 详情的地址应含 order=PO-C1，实际 ${got.hash}`);
      check(`${name} 页面无横向溢出`, got.overflowPx <= 0, got.overflowPx);
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      log.push({ name, hash: got.hash, heading: got.heading, ...extra });
      check(`${name} 无页面错误`, errors.length === 0, errors);
      await context.close();
    }
  }

  // K7：390 px 宽下的订单详情。
  {
    const lang = "zh";
    const theme = "red";
    const narrow = 390;
    const context = await contextFor(lang, theme, narrow);
    const errors = [];
    const page = await newPage(context, errors);
    await openOrders(page, lang);
    const detail = await detailPage(page, lang);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const before = await state(page);
    const tag = `${lang}-${theme}-${narrow}`;
    mustMatchState(`trade-orders-detail-${tag}`, before, { lang, theme, width: narrow }, lang);
    must(before.hash.includes("order=PO-C1"), `390 宽详情的地址应含 order=PO-C1，实际 ${before.hash}`);
    const table = page.getByRole("table", { name: `${text.lines[lang]} PO-C1`, exact: true });
    const wrap = page.locator("div.grid-wrap").filter({ has: table }).first();
    const rects = () =>
      wrap.evaluate((container, creditedLabel) => {
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 };
        };
        const th = [...container.querySelectorAll("thead th")].find((cell) => cell.textContent.trim() === creditedLabel);
        const index = [...th.parentElement.children].indexOf(th);
        const cell = container.querySelector("tbody tr").children[index];
        return {
          documentScrollWidth: document.documentElement.scrollWidth,
          containerScrollWidth: container.scrollWidth,
          containerClientWidth: container.clientWidth,
          scrollLeft: Math.round(container.scrollLeft * 10) / 10,
          container: rect(container),
          header: rect(th),
          cell: rect(cell),
        };
      }, text.creditedCol[lang]);
    const first = await rects();
    check("390 宽：文档 scrollWidth ≤ 390", first.documentScrollWidth <= narrow, first.documentScrollWidth);
    check("390 宽：容器 scrollWidth > clientWidth（表格在容器内横向滚动）", first.containerScrollWidth > first.containerClientWidth, { scrollWidth: first.containerScrollWidth, clientWidth: first.containerClientWidth });
    await page.screenshot({ path: join(out, `trade-orders-detail-${tag}-before-scroll.png`), fullPage: true });
    await wrap.evaluate((container, creditedLabel) => {
      const th = [...container.querySelectorAll("thead th")].find((cell) => cell.textContent.trim() === creditedLabel);
      th.scrollIntoView({ inline: "nearest", block: "nearest" });
    }, text.creditedCol[lang]);
    await page.waitForTimeout(300);
    const after = await rects();
    const inside = (r, c) => r.left >= c.left && r.right <= c.right;
    check("390 宽：滚到新列后 scrollLeft > 0", after.scrollLeft > 0, after.scrollLeft);
    check("390 宽：滚到新列后表头完整落在容器内", inside(after.header, after.container), { header: after.header, container: after.container });
    check("390 宽：滚到新列后 L1 行的单元格完整落在容器内", inside(after.cell, after.container), { cell: after.cell, container: after.container });
    check("390 宽：滚动后文档仍不溢出", after.documentScrollWidth <= narrow, after.documentScrollWidth);
    await page.screenshot({ path: join(out, `trade-orders-detail-${tag}-after-scroll.png`), fullPage: true });
    log.push({ name: `trade-orders-detail-${tag}`, step: "k7", via: "goto #/trade-orders?company=DEFAULT，点订单号 PO-C1，再把“贷项冲回数量”表头 scrollIntoView({inline:\"nearest\"})", hash: before.hash, detail, beforeScroll: first, afterScroll: after });
    check("390 宽 无页面错误", errors.length === 0, errors);
    await context.close();
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

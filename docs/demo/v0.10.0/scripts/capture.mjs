// Demo v0.10.0 截图脚本：用系统 Chrome 走真实页面，演示 S10 的用户可见变化：
// 销售（AR）方向的订单开票状态与来源订单链接（TINV-03/04 在销售单上的表现），以及发票列表的筛选条（TINV-05，#189）：按伙伴、按方向、无结果。
// 用法：node docs/demo/v0.10.0/scripts/capture.mjs <地址> <输出目录>
// 前提：账套已由 seed-trade.mjs、seed-invoicing.mjs、seed-sales.mjs 预置：
//   采购：PO-I1 部分开票、PO-I2 已开完、PO-I3 未开票；发票 AP-I1-1（PO-I1）、AP-I2-1（PO-I2）、AP-DEMO（PARTY）、AP-DEMO2（PARTY2，无来源订单）；
//   销售：SO-I1（PARTY2）部分开票、SO-I2（PARTY2）已开完；发票 AR-I1-1（SO-I1）、AR-I2-1（SO-I2）。
// 种子数据在 GUI 之外、本脚本启动之前写入；每个步骤用全新的浏览器上下文，页面首次加载就读到种子数据（QueryClient staleTime 为 Infinity，写入后需 reload 才可见，见 D277），所以本脚本不依赖 reload。
// 每张截图前断言语言、主题、宽度、教学开关、scrollY，宽度为 390 时再断言页面不横向溢出（见 docs/demo/TEMPLATE.md）。
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
// 文案来源：packages/web/src/ui/trade-labels.ts:111-112、:201-214、:351-352、:434-447；trade-order-labels.ts:84-93、:187-196
// 徽章 textContent = aria-hidden 符号 + 文本（ui/components/index.tsx Badge；符号 warning "!"、info "i"、success "✓"）
const text = {
  zh: {
    badge: { none: "!未开票", partial: "i部分开票", full: "✓已开完" },
    ap: "应付",
    ar: "应收",
    noSource: "—无来源订单",
    none: "没有符合条件的发票。",
    apply: "应用",
    clear: "清除",
  },
  en: {
    badge: { none: "!Not invoiced", partial: "iPartly invoiced", full: "✓Fully invoiced" },
    ap: "Accounts payable",
    ar: "Accounts receivable",
    noSource: "—No source order",
    none: "No invoices match the filters.",
    apply: "Apply",
    clear: "Clear",
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
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const { scrollWidth, ...state } = got;
  const wanted = { scrollY: 0, ...want };
  const bad = Object.entries(wanted).filter(([key, value]) => state[key] !== value);
  if (bad.length > 0) throw new Error("截图状态与文件名不符：" + JSON.stringify({ wanted, got: state }));
  if (state.width === 390 && scrollWidth > state.width) {
    throw new Error(`390 px 页面横向溢出：scrollWidth=${scrollWidth} > innerWidth=${state.width}`);
  }
  return scrollWidth;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function shot(page, name, want) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const scrollWidth = await assertState(page, want);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow, scrollWidth });
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
// 订单行表：每行取 订单行号、数量、已开票、未开票 四列
const orderRows = (page) =>
  page.locator("table.tord-amounts tbody tr:not(.tord-total)").evaluateAll((rows) => rows.map((row) => [1, 4, 5, 6].map((i) => row.children[i].textContent.replace(/^\u2713\s*/, "").trim())));
// 发票列表：每行取 方向、伙伴、外部发票号、来源订单文字、来源订单链接地址，按发票号排序
const invoiceRows = (page) =>
  page.locator("section.tinv-list-scroll table tbody tr").evaluateAll((rows) =>
    rows
      .map((row) => {
        const cell = row.querySelector("td.tinv-source");
        return [row.children[0].textContent.trim(), row.children[1].textContent.trim(), row.children[2].textContent.trim(), cell.textContent.trim(), cell.querySelector("a")?.getAttribute("href") ?? null];
      })
      .sort((a, b) => a[2].localeCompare(b[2])),
  );
const link = (order) => `#/trade-orders?company=DEFAULT&order=${order}`;

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

// 失败时先把已有日志与错误写入输出目录再抛出，截图已逐张落盘，原断言原文写进日志与标准错误
let failure = null;
try {
  for (const [lang, theme, width] of combos) {
    const tag = `${lang}-${theme}-${width}`;
    const want = { lang, theme, width, teaching: true };
    const t = text[lang];
    const errors = [];
    const all = [
      [t.ap, "PARTY", "AP-DEMO", t.noSource, null],
      [t.ap, "PARTY2", "AP-DEMO2", t.noSource, null],
      [t.ap, "PARTY", "AP-I1-1", "PO-I1", link("PO-I1")],
      [t.ap, "PARTY", "AP-I2-1", "PO-I2", link("PO-I2")],
      [t.ar, "PARTY2", "AR-I1-1", "SO-I1", link("SO-I1")],
      [t.ar, "PARTY2", "AR-I2-1", "SO-I2", link("SO-I2")],
    ];
    const party2 = [all[1], all[4], all[5]];
    const arOnly = [all[4], all[5]];

    // 1 订单列表：采购与销售订单并列，销售单 SO-I1 部分开票、SO-I2 已开完；徽章 class 对应 info / success，符号在 aria-hidden 内
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-orders`);
      await page.locator("main h2").first().waitFor();
      await page.locator("table.tord-list").waitFor({ timeout: 8000 });
      await poll(
        () => listRows(page),
        [
          ["PO-I1", t.badge.partial, tone.partial, t.badge.partial[0]],
          ["PO-I2", t.badge.full, tone.full, t.badge.full[0]],
          ["PO-I3", t.badge.none, tone.none, t.badge.none[0]],
          ["SO-I1", t.badge.partial, tone.partial, t.badge.partial[0]],
          ["SO-I2", t.badge.full, tone.full, t.badge.full[0]],
        ],
        "订单列表开票状态（含销售单）",
      );
      log.push({ step: "orders-list-sales", tag });
      await shot(page, `orders-list-sales-${tag}`, want);
      await context.close();
    }

    // 2 销售单深链接：直接打开 SO-I1 的只读详情（部分开票：L1 已开 4 未开 6，L2 未开 4）
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-orders?company=DEFAULT&order=SO-I1`);
      await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
      await poll(() => orderRows(page), [["L1", "10", "4", "6"], ["L2", "4", "0", "4"]], "深链接 SO-I1 订单行");
      log.push({ step: "order-deeplink-ar", tag, hash: new URL(page.url()).hash });
      await shot(page, `order-deeplink-ar-${tag}`, want);
      await context.close();
    }

    // 3 发票列表（未筛选）：采购与销售发票并列，销售发票的来源订单是 SO- 开头的链接；点链接进入销售单深链接
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      await page.goto(`${base}/#/trade-invoices?company=DEFAULT`);
      await page.locator("section.tinv-list-scroll table tbody tr").first().waitFor({ timeout: 8000 });
      await poll(() => invoiceRows(page), all, "发票列表（未筛选，含销售发票与来源订单）");
      log.push({ step: "invoice-list-ar", tag });
      await shot(page, `invoice-list-ar-source-${tag}`, want);
      await page.locator("td.tinv-source a[title=SO-I1]").click();
      await page.locator("section.tord-lookup-result table.tord-amounts").waitFor({ timeout: 8000 });
      await poll(() => orderRows(page), [["L1", "10", "4", "6"], ["L2", "4", "0", "4"]], "点销售来源订单后的订单行");
      await context.close();
    }

    // 4 发票列表筛选：同一页面内连续做（筛选状态只在组件里，不进地址栏，不触发离开确认）。
    // 按伙伴 PARTY2 → 3 行（混合方向）；清除 → 全部 6 行；按方向 AR → 2 行；伙伴 PARTY + 方向 AR → 无结果空态（已应用筛选时的提示）
    {
      const context = await contextFor(lang, theme, width);
      const page = await newPage(context, errors);
      const dialogs = [];
      page.on("dialog", (d) => {
        dialogs.push(d.message());
        return d.dismiss();
      });
      await page.goto(`${base}/#/trade-invoices?company=DEFAULT`);
      await page.locator("section.tinv-list-scroll table tbody tr").first().waitFor({ timeout: 8000 });
      await poll(() => invoiceRows(page), all, "筛选前发票列表");
      const form = page.locator("form[role=search]");
      const apply = () => form.locator("button[type=submit]").click();
      const hashBefore = await page.evaluate(() => location.hash);

      await form.locator("#tinv-filter-party").fill("PARTY2");
      await apply();
      await poll(() => invoiceRows(page), party2, "按伙伴 PARTY2 筛选");
      log.push({ step: "invoice-filter-party", tag });
      await shot(page, `invoice-filter-party-${tag}`, want);

      await form.getByRole("button", { name: t.clear, exact: true }).click();
      await poll(() => invoiceRows(page), all, "清除筛选后应回到全部发票");
      if ((await form.locator("#tinv-filter-party").inputValue()) !== "" || (await form.locator("#tinv-filter-side").inputValue()) !== "") throw new Error("清除后筛选条应为空");

      await form.locator("#tinv-filter-side").selectOption("AR");
      await apply();
      await poll(() => invoiceRows(page), arOnly, "按方向 AR 筛选");
      log.push({ step: "invoice-filter-side-ar", tag });
      await shot(page, `invoice-filter-side-ar-${tag}`, want);

      await form.locator("#tinv-filter-party").fill("PARTY");
      await apply();
      await page.locator("p.empty-state").waitFor({ timeout: 8000 });
      await poll(() => page.locator("p.empty-state").innerText().then((s) => s.trim()), t.none, "伙伴 PARTY + 方向 AR 的空态文案");
      await poll(() => page.locator("section.tinv-list-scroll table tbody tr").count(), 0, "无结果时表格不应有数据行");
      log.push({ step: "invoice-filter-empty", tag });
      await shot(page, `invoice-filter-empty-${tag}`, want);

      if ((await page.evaluate(() => location.hash)) !== hashBefore) throw new Error("筛选不应改变地址栏：" + (await page.evaluate(() => location.hash)));
      if (dialogs.length !== 0) throw new Error("筛选不应弹出离开确认框：" + JSON.stringify(dialogs));
      await context.close();
    }

    log.push({ page: "s10", tag, errors });
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

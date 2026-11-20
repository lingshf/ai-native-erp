// UI-07b 改前 / 改后截图：node design/ui/screenshots/UI-07b/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-03 / UI-06 的做法：全新临时虚构账套（迁移 + 默认公司初始化，月度教学模式，不连 4173、不用 .bak），
// 进程内 API 托管 <webDist>，系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。所有接口都走真实 API。
// 夹具：2026-01 准入 trade 与 tax，已过账采购发票 AP-DEMO（费用 100.00）与销售发票 AR-SEED（收入 50.00）。
// 三个状态：
//   open     开放期间 2026-01，点“预览结账”后（损益结转分录 + 净额）；
//   blocked  2026-02 预览结账，前一期间仍开放 → 阻断项 priorPeriods，“确认结账”禁用；
//   closed   经 API 预览并确认结账 2026-01 后，回到 2026-01（已结账，准入不可改，“打开下一期间”）。
// 每张断言：根节点 scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main.scrollWidth ≤ main.clientWidth；
// main 内每张表格都在自身 overflow-x: auto 容器内，且溢出时能在容器内横向滚动。
// 第三个参数为 after 时另断言 main 内可见交互控件（button/select/input/表格外的 a[href]）高度 ≥ 44px（复选框和链接宽高都须 ≥ 44px；复选框按实际点击区——包裹的 label 或自身——宽高都 ≥ 44px），
// 并另截教学关闭图；改前图只记录、不判失败。
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { MasterDataService } from "../../../../packages/core/src/application/index.ts";
import { createSqliteStorage } from "../../../../packages/infra/src/storage/index.ts";
import { createMasterDataStore } from "../../../../packages/infra/src/storage/master-data.ts";
import { SqliteExecutor } from "../../../../packages/infra/src/workers/executor.ts";
import { createApi } from "../../../../packages/infra/src/http/index.ts";
import { label } from "../../../../packages/web/src/ui/index.ts";

const [webRoot, outDir] = process.argv.slice(2, 4).map((p) => resolve(p));
const after = process.argv[4] === "after";
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir> [after]");

function mainScroll() {
  const main = document.querySelector("main");
  return [main.scrollWidth, main.clientWidth];
}
function overflowReport() {
  const vw = document.documentElement.clientWidth;
  const escaped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.getBoundingClientRect().right <= vw + 0.5) continue;
    let a = el.parentElement;
    let contained = false;
    while (a && a !== document.body) {
      if (
        /(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX) &&
        a.getBoundingClientRect().right <= vw + 0.5
      ) {
        contained = true;
        break;
      }
      a = a.parentElement;
    }
    if (!contained) escaped.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`);
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, escaped: escaped.slice(0, 5) };
}
// Every table in main must sit in its own horizontal scroll container.
function tableScroll() {
  const main = document.querySelector("main");
  const result = [];
  for (const table of main.querySelectorAll("table")) {
    let box = table.parentElement;
    while (box && box !== main && !/(auto|scroll)/.test(getComputedStyle(box).overflowX))
      box = box.parentElement;
    const name = table.getAttribute("aria-label") ?? "table";
    if (!box || box === main) {
      result.push({ name, own: false });
      continue;
    }
    const overflow = box.scrollWidth > box.clientWidth;
    let scrolled = true;
    if (overflow) {
      box.scrollLeft = 64;
      scrolled = box.scrollLeft > 0;
      box.scrollLeft = 0;
    }
    result.push({ name, own: true, overflow, scrolled });
  }
  return result;
}
function inlineLinks() {
  return document.querySelectorAll("main table a[href]").length;
}
function smallTargets() {
  const small = [];
  for (const el of document.querySelectorAll("main button, main select, main input, main a[href]")) {
    // 表格内联金额链接属于行内文字，不计入（也不声称通过），见 inlineLinks()。
    if (el.tagName === "A" && el.closest("table")) continue;
    // 复选框按实际点击区判定：包裹它的 label（若有），否则复选框本身；宽高都须 ≥ 44。
    const target = el.type === "checkbox" ? (el.closest("label") ?? el) : el;
    const box = target.getBoundingClientRect();
    if (box.width === 0 || el.closest("[hidden]")) continue;
    if (box.height < 43.5 || ((el.type === "checkbox" || el.tagName === "A") && box.width < 43.5))
      small.push(
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.type === "checkbox" ? `[checkbox ${target.textContent?.trim() ?? ""}]` : ""}${el.tagName === "A" ? `[link ${el.textContent?.trim() ?? ""}]` : ""} ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
  }
  return small.slice(0, 8);
}

const variants = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
const states = ["open", "blocked", "closed"];
// [state, language, theme, width, teaching]
const shots = Object.fromEntries(
  states.map((state) => [state, variants.map(([language, theme, width]) => [language, theme, width, true])]),
);
if (after) {
  shots.open.push(["zh", "red", 1440, false], ["en", "green", 390, false]);
  shots.blocked.push(["zh", "red", 1440, false], ["en", "green", 390, false]);
}

const day = "2026-01-20";
const year = { from: "2026-01-01", to: "2026-12-31" };
const trade = (kind, code, data) => [
  "POST",
  `/api/v1/trade/${kind}`,
  {
    company: "DEFAULT",
    code,
    active: true,
    expectedRevision: 0,
    kind,
    data: { name: `Fictional ${code}`, ...year, ...data },
  },
];
const seed = [
  [
    "PUT",
    "/api/v1/periods",
    {
      company: "DEFAULT",
      month: "2026-01",
      revision: 1,
      status: "open",
      reason: "Fictional UI-07b screenshots",
      confirmed: true,
      modules: ["trade", "tax"],
    },
  ],
  trade("tradeTerms", "N30", { dueDays: 30, discountDays: 7, discountPercent: "1.5", allowPartialDiscount: true }),
  trade("taxCode", "VAT", {
    mode: "ordinary",
    rates: [{ id: "STANDARD", ...year, ratePercent: "13" }],
    deductiblePercent: "100",
    inputAccount: "1400",
    outputAccount: "2200",
  }),
  trade("tradeProfile", "PAY", { side: "AP", controlAccount: "2100", advanceAccount: "1250", cashAccount: "1000", discountAccount: "4000" }),
  trade("tradeProfile", "REC", { side: "AR", controlAccount: "1300", advanceAccount: "2300", cashAccount: "1000", discountAccount: "4000" }),
  trade("tradeParty", "PARTY", {
    role: "both",
    apProfile: "PAY",
    arProfile: "REC",
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
  trade("tradeProduct", "EXPENSE", { type: "expense", expenseAccount: "5000", revenueAccount: null, allowedTaxCodes: ["VAT"], defaultDimensions: {} }),
  trade("tradeProduct", "SERVICE", { type: "service", expenseAccount: null, revenueAccount: "4000", allowedTaxCodes: ["VAT"], defaultDimensions: {} }),
];
const invoice = (side, externalInvoice, quantity) => ({
  company: "DEFAULT",
  documentId: crypto.randomUUID(),
  side,
  party: "PARTY",
  externalInvoice,
  currency: "CNY",
  accountingDate: day,
  documentDate: day,
  taxDate: day,
  orderId: null,
  priceIncludesTax: false,
  rounding: "line",
  headerDimensions: {},
  matchingException: null,
  lines: [
    {
      lineId: "L1",
      product: side === "AP" ? "EXPENSE" : "SERVICE",
      taxCode: "VAT",
      quantity,
      unitPrice: "10",
      discountPercent: "0",
      taxableCharge: "0",
      orderLineId: null,
      dimensions: {},
    },
  ],
});

const directory = await mkdtemp(join(tmpdir(), "erp-ui07b-capture-"));
const filename = join(directory, "fictional.sqlite");
const storage = createSqliteStorage({ filename });
await storage.migrate();
await storage.close();
const store = createMasterDataStore({ filename });
try {
  const master = new MasterDataService(store);
  await master.initialize(2026);
  // Same prerequisite GL control accounts as the trade-gui scenario.
  for (const [code, category, reportGroup, controlModule] of [
    ["2100", "LIABILITY", "payables", "AP"],
    ["1250", "ASSET", "prepayments", "AP"],
    ["1300", "ASSET", "receivables", "AR"],
    ["2300", "LIABILITY", "otherLiabilities", "AR"],
    ["1400", "ASSET", "otherAssets", "TAX"],
    ["2200", "LIABILITY", "taxLiabilities", "TAX"],
  ])
    await master.saveAccount(
      "DEFAULT",
      {
        code,
        name: `Fictional ${code}`,
        category,
        reportGroup,
        controlModule,
        purpose: "control",
        normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
        contraOf: null,
        active: true,
        manualAllowed: false,
      },
      0,
    );
} finally {
  await store.close();
}
const executor = await SqliteExecutor.create({ filename });
const api = await createApi({
  ...executor.services(),
  webRoot,
  allowPortZero: true,
  environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
});
const origin = await api.listen();
async function send(method, path, body) {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Seed ${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function confirmed(path, command) {
  const preview = await send("POST", `${path}/preview`, command);
  return await send("POST", path, {
    command,
    fingerprint: preview.fingerprint,
    idempotencyKey: crypto.randomUUID(),
    confirmation: "POST",
  });
}
async function closeJanuary() {
  const periods = await send("GET", "/api/v1/periods?company=DEFAULT&limit=100");
  const { revision } = periods.items.find((item) => item.month === "2026-01");
  const body = { company: "DEFAULT", revision, commandId: crypto.randomUUID() };
  const preview = await send("POST", "/api/v1/periods/2026-01/close-preview", body);
  await send("POST", "/api/v1/periods/2026-01/close", {
    ...body,
    fingerprint: preview.fingerprint,
    confirmation: "CLOSE",
  });
}
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const [method, path, body] of seed) await send(method, path, body);
  for (const doc of [invoice("AP", "AP-DEMO", "10"), invoice("AR", "AR-SEED", "5")])
    await confirmed("/api/v1/trade/invoices", doc);
  for (const state of states) {
    if (state === "closed") await closeJanuary();
    for (const [language, theme, width, teaching] of shots[state]) {
      const t = (key) => label(language, key);
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await context.addInitScript((value) => {
        window.localStorage.setItem("erp.workspace.preferences.v1", value);
      }, JSON.stringify({ language, theme, teaching }));
      const file = `period-close-${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
      const tab = await context.newPage();
      await tab.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
      const month = state === "blocked" ? "2026-02" : "2026-01";
      await tab.goto(`${origin}/#/period-close?company=DEFAULT&month=${month}`);
      await tab.locator("main h2").first().waitFor();
      await tab.locator("#close-month").waitFor({ timeout: 10_000 });
      await tab.waitForLoadState("networkidle");
      if (state === "closed") await tab.getByText(t("close.closed"), { exact: true }).waitFor();
      else {
        await tab.getByRole("button", { name: t("close.preview"), exact: true }).click();
        await tab.getByRole("table", { name: t("close.lines"), exact: true }).waitFor();
        if (state === "blocked")
          await tab.getByRole("alert").filter({ hasText: t("close.block.priorPeriods") }).waitFor();
      }
      await tab.waitForLoadState("networkidle");
      await tab.evaluate(() => {
        document.activeElement?.blur?.();
        window.scrollTo(0, 0);
      });
      await tab.evaluate(() => document.fonts.ready);
      const overflow = await tab.evaluate(overflowReport);
      const main = await tab.evaluate(mainScroll);
      const tables = await tab.evaluate(tableScroll);
      const small = after ? await tab.evaluate(smallTargets) : [];
      const inline = await tab.evaluate(inlineLinks);
      await tab.screenshot({ path: join(outDir, file), fullPage: true });
      const size = await tab.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ]);
      const loose = tables.filter((table) => !table.own || (table.overflow && !table.scrolled));
      const ok =
        overflow.vw === width &&
        overflow.scrollWidth <= width &&
        overflow.escaped.length === 0 &&
        main[0] <= main[1] &&
        loose.length === 0 &&
        small.length === 0;
      if (!ok && after) failed++;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")} tables ${tables.length} table-inline links (not checked) ${inline}${loose.length ? ` not in own scroller: ${loose.map((table) => table.name).join(", ")}` : ""}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}${small.length ? ` <44px: ${small.join(", ")}` : ""}`,
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await api.close();
  await executor.close();
  await rm(directory, { recursive: true, force: true });
}
if (failed) {
  console.error(`${failed} screenshot(s) failed the checks`);
  process.exitCode = 1;
}

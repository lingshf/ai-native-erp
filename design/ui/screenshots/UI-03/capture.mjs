// UI-03 改前 / 改后截图：node design/ui/screenshots/UI-03/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-01 / UI-02b 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。所有接口都走真实 API。
// 夹具（与 trade-gui 场景同一组虚构数据）：开放 2026-01 贸易与税务期间，N30 / VAT / PAY / REC / PARTY / EXPENSE / SERVICE，
// 采购订单 PO-DEMO，以及一张已过账的销售发票 AR-SEED（让“已过账发票”列表非空）。
// 四个状态：草稿（填好 AP-DEMO 匹配 PO-DEMO）、预览后、预览过期（预览后改数量）、过账成功（AR 发票过账）。
// 每张断言：根节点 scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main.scrollWidth ≤ main.clientWidth；
// 发票行表格在自身 overflow-x: auto 容器内，且该容器 scrollWidth > clientWidth 时能在容器内横向滚动。
// 第三个参数为 after 时另断言 main 内可见交互控件高度 ≥ 44px、“新增行”按钮在真实 Chrome 中的可访问名称与 label 完全一致，
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
// The invoice lines table must sit in its own horizontal scroll container inside main.
function linesScroll(name) {
  const table = document.querySelector(`main table[aria-label="${name}"]`);
  const main = document.querySelector("main");
  let box = table?.parentElement;
  while (box && box !== main && !/(auto|scroll)/.test(getComputedStyle(box).overflowX))
    box = box.parentElement;
  if (!table || !box || box === main) return { own: false };
  const overflow = box.scrollWidth > box.clientWidth;
  let scrolled = true;
  if (overflow) {
    box.scrollLeft = 64;
    scrolled = box.scrollLeft > 0;
    box.scrollLeft = 0;
  }
  return { own: true, size: `${box.scrollWidth}/${box.clientWidth}`, overflow, scrolled };
}
function smallTargets() {
  const small = [];
  for (const el of document.querySelectorAll(
    "main button, main select, main input:not([type=checkbox]), main label:has(> input[type=checkbox])",
  )) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || el.closest("[hidden]")) continue;
    if (box.height < 43.5)
      small.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${Math.round(box.height)}`);
  }
  return small.slice(0, 8);
}

const variants = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
// [state, language, theme, width, teaching]
const shots = ["draft", "preview", "stale", "posted"].flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after)
  shots.push(["preview", "zh", "red", 1440, false], ["posted", "en", "green", 390, false]);

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
      reason: "Fictional UI-03 screenshots",
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
  [
    "POST",
    "/api/v1/trade/orders",
    {
      company: "DEFAULT",
      orderId: "PO-DEMO",
      side: "AP",
      party: "PARTY",
      currency: "CNY",
      orderDate: day,
      priceIncludesTax: false,
      rounding: "line",
      lines: [
        { lineId: "OL1", product: "EXPENSE", taxCode: "VAT", quantity: "10", unitPrice: "10", discountPercent: "0", taxableCharge: "0" },
      ],
    },
  ],
];
const seedInvoice = {
  company: "DEFAULT",
  documentId: crypto.randomUUID(),
  side: "AR",
  party: "PARTY",
  externalInvoice: "AR-SEED",
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
    { lineId: "L1", product: "SERVICE", taxCode: "VAT", quantity: "5", unitPrice: "10", discountPercent: "0", taxableCharge: "0", orderLineId: null, dimensions: {} },
  ],
};

const directory = await mkdtemp(join(tmpdir(), "erp-ui03-capture-"));
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
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Seed ${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
let posted = 0;
try {
  for (const [method, path, body] of seed) await send(method, path, body);
  const preview = await send("POST", "/api/v1/trade/invoices/preview", seedInvoice);
  await send("POST", "/api/v1/trade/invoices", {
    command: seedInvoice,
    fingerprint: preview.fingerprint,
    idempotencyKey: crypto.randomUUID(),
    confirmation: "POST",
  });
  for (const [state, language, theme, width, teaching] of shots) {
    const t = (key) => label(language, key);
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const file = `trade-invoices-${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
    await tab.goto(`${origin}/#/trade-invoices`);
    await tab.locator("main h2").first().waitFor();
    await tab.locator("#tinv-party").waitFor({ timeout: 10_000 });
    await tab.waitForLoadState("networkidle");
    const line = (key) => tab.getByRole("textbox", { name: `${t(key)} L1`, exact: true });
    const sale = state === "posted";
    await tab.locator("#tinv-side").selectOption(sale ? "AR" : "AP");
    await tab.locator("#tinv-party").fill("PARTY");
    await tab.locator("#tinv-externalInvoice").fill(sale ? `AR-${String(++posted).padStart(3, "0")}` : "AP-DEMO");
    if (!sale) await tab.locator("#tinv-orderId").fill("PO-DEMO");
    await line("tinv.product").fill(sale ? "SERVICE" : "EXPENSE");
    await line("tinv.taxCode").fill("VAT");
    await line("tinv.quantity").fill("10");
    await line("tinv.unitPrice").fill("10");
    if (!sale) await line("tinv.orderLineId").fill("OL1");
    if (state !== "draft") {
      await tab.getByRole("button", { name: t("tinv.preview"), exact: true }).click();
      await tab.getByRole("region", { name: t("tinv.previewTitle"), exact: true }).waitFor();
    }
    if (state === "stale") {
      await line("tinv.quantity").fill("9");
      await tab.getByRole("alert").filter({ hasText: t("tinv.stale") }).waitFor();
    }
    if (state === "posted") {
      await tab.getByRole("button", { name: t("tinv.confirm"), exact: true }).click();
      await tab.getByRole("status").filter({ hasText: t("tinv.posted") }).waitFor();
      await tab.waitForLoadState("networkidle");
      await tab.getByRole("cell", { name: `AR-${String(posted).padStart(3, "0")}`, exact: true }).waitFor();
    }
    await tab.evaluate(() => {
      document.activeElement?.blur?.();
      window.scrollTo(0, 0);
    });
    await tab.evaluate(() => document.fonts.ready);
    const overflow = await tab.evaluate(overflowReport);
    const main = await tab.evaluate(mainScroll);
    const lines = await tab.evaluate(linesScroll, t("tinv.lines"));
    const small = after ? await tab.evaluate(smallTargets) : [];
    // Real Chrome accessible name of the add-line button must equal the label exactly (kbd adds no spaces).
    const addLine = after
      ? await tab.getByRole("button", { name: t("tinv.addLine"), exact: true }).count()
      : 1;
    await tab.screenshot({ path: join(outDir, file), fullPage: true });
    const size = await tab.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]);
    const ok =
      overflow.vw === width &&
      overflow.scrollWidth <= width &&
      overflow.escaped.length === 0 &&
      main[0] <= main[1] &&
      lines.own &&
      (!lines.overflow || lines.scrolled) &&
      small.length === 0 &&
      addLine === 1;
    if (!ok && after) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")} lines ${lines.own ? `${lines.size}${lines.overflow ? (lines.scrolled ? " scrolls" : " NOT scrollable") : ""}` : "no own scroller"}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}${small.length ? ` <44px: ${small.join(", ")}` : ""}${addLine === 1 ? "" : " add-line name mismatch"}`,
    );
    await context.close();
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

// UI-06 改前 / 改后截图：node design/ui/screenshots/UI-06/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-03 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。所有接口都走真实 API。
// 夹具（与 trade-gui 场景同一组虚构数据）：开放 2026-01 贸易与税务期间，N30 / VAT / PAY / REC / PARTY / EXPENSE / SERVICE，
// 已过账采购发票 AP-DEMO、AP-PAID（已全额核销，核销 ID 用于反向）与销售发票 AR-SEED。
// 五个状态，均停在“预览后”：付款（AP-DEMO 部分核销 + 折扣）、收款（AR-SEED 全额）、预付、贷项（AR-SEED 第 L1 行 2 件）、
// 反向（撤销 AP-PAID 的核销）。
// 每张断言：根节点 scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main.scrollWidth ≤ main.clientWidth；
// main 内每张表格都在自身 overflow-x: auto 容器内，且溢出时能在容器内横向滚动。
// 第三个参数为 after 时另断言 main 内可见交互控件高度 ≥ 44px，并另截教学关闭图；改前图只记录、不判失败。
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
const shots = ["payment", "receipt", "advance", "credit", "reverse"].flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after)
  shots.push(
    ["payment", "zh", "red", 1440, false],
    ["payment", "en", "green", 390, false],
    ["reverse", "zh", "red", 1440, false],
    ["reverse", "en", "green", 390, false],
  );

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
      reason: "Fictional UI-06 screenshots",
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
const apDemo = invoice("AP", "AP-DEMO", "10");
const apPaid = invoice("AP", "AP-PAID", "4");
const arSeed = invoice("AR", "AR-SEED", "5");
const paymentId = crypto.randomUUID();

const directory = await mkdtemp(join(tmpdir(), "erp-ui06-capture-"));
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
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const [method, path, body] of seed) await send(method, path, body);
  for (const doc of [apDemo, apPaid, arSeed]) await confirmed("/api/v1/trade/invoices", doc);
  const open = await send("GET", "/api/v1/trade/open-items?company=DEFAULT&status=open&limit=100");
  const paid = open.items.find((item) => item.itemId === apPaid.documentId);
  await confirmed("/api/v1/trade/settlements", {
    company: "DEFAULT",
    paymentId,
    side: "AP",
    party: "PARTY",
    currency: "CNY",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    items: [{ itemId: paid.itemId, revision: paid.revision, gross: paid.remainingGross, takeDiscount: false }],
  });
  for (const [state, language, theme, width, teaching] of shots) {
    const t = (key) => label(language, key);
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const file = `trade-${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
    const byLabel = (key) => tab.getByLabel(t(key), { exact: true });
    const kind = tab.getByRole("combobox", { name: t("tadj.kind"), exact: true });
    const preview = async (region) => {
      await tab.getByRole("button", { name: t("tinv.preview"), exact: true }).click();
      await tab.getByRole("region", { name: t(region), exact: true }).waitFor();
    };
    if (state === "payment" || state === "receipt") {
      await tab.goto(`${origin}/#/trade-settlements`);
      await tab.locator("main h2").first().waitFor();
      await tab.locator("#tset-party").waitFor({ timeout: 10_000 });
      await tab.waitForLoadState("networkidle");
      const external = state === "payment" ? "AP-DEMO" : "AR-SEED";
      await tab.locator("#tset-side").selectOption(state === "payment" ? "AP" : "AR");
      await tab.locator("#tset-party").fill("PARTY");
      await tab.getByRole("checkbox", { name: `${t("tset.select")} ${external}`, exact: true }).check();
      if (state === "payment") {
        await tab.getByRole("spinbutton", { name: `${t("tset.amount")} ${external}`, exact: true }).fill("5650");
        await tab.getByRole("checkbox", { name: `${t("tset.discount")} ${external}`, exact: true }).check();
      }
      await preview("tset.result");
    } else {
      await tab.goto(`${origin}/#/trade-adjustments`);
      await tab.locator("main h2").first().waitFor();
      await kind.waitFor({ timeout: 10_000 });
      await tab.waitForLoadState("networkidle");
      await kind.selectOption(state);
      if (state === "advance") {
        await byLabel("tinv.party").fill("PARTY");
        await byLabel("tadj.gross").fill("2000");
      } else if (state === "credit") {
        await byLabel("tadj.source").selectOption(arSeed.documentId);
        await byLabel("tadj.sourceLine").fill("L1");
        await byLabel("tinv.quantity").fill("2");
      } else {
        await byLabel("tadj.settlementId").fill(paymentId);
        await tab.getByLabel(new RegExp(`AP-PAID.*${apPaid.documentId}`)).check();
        await byLabel("tadj.reason").fill("Fictional reversal");
      }
      await preview("tadj.result");
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
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")} tables ${tables.length}${loose.length ? ` not in own scroller: ${loose.map((table) => table.name).join(", ")}` : ""}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}${small.length ? ` <44px: ${small.join(", ")}` : ""}`,
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

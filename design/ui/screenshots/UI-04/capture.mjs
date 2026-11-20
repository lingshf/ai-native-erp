// UI-04 改前 / 改后截图：node design/ui/screenshots/UI-04/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-06 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。所有接口都走真实 API。
// 夹具：财务维度 DEPT / PROJECT / REGION（DEPT 下两个值）、科目 5000 的维度结构；贸易主数据与 trade-gui 场景同一组虚构数据
// （N30 / VAT / PAY / REC / PARTY / ACME / EXPENSE / SERVICE）。
// 四个状态：维度列表、维度编辑（科目维度结构 5000）、贸易主数据列表（贸易伙伴）、贸易主数据编辑（PARTY）。
// 每张断言：根节点 scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main.scrollWidth ≤ main.clientWidth；
// main 内每张表格都在自身 overflow-x: auto 容器内，且溢出时能在容器内横向滚动。
// 第三个参数为 after 时另断言 main 内可见交互控件高度 ≥ 44px（复选框按实际点击区——包裹的 label 或自身——宽高都 ≥ 44px），
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
function smallTargets() {
  const small = [];
  for (const el of document.querySelectorAll("main button, main select, main input, main textarea")) {
    // 复选框按实际点击区判定：包裹它的 label（若有），否则复选框本身；宽高都须 ≥ 44。
    const target = el.type === "checkbox" ? (el.closest("label") ?? el) : el;
    const box = target.getBoundingClientRect();
    if (box.width === 0 || el.closest("[hidden]")) continue;
    if (box.height < 43.5 || (el.type === "checkbox" && box.width < 43.5))
      small.push(
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.type === "checkbox" ? `[checkbox ${el.getAttribute("aria-label") ?? ""}]` : ""} ${Math.round(box.width)}x${Math.round(box.height)}`,
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
const states = ["dimensions-list", "dimensions-edit", "trade-list", "trade-edit"];
// [state, language, theme, width, teaching]
const shots = states.flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after)
  for (const state of states)
    shots.push([state, "zh", "red", 1440, false], [state, "en", "green", 390, false]);

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
const dimension = (config) => [
  "POST",
  "/api/v1/dimensions",
  { company: "DEFAULT", config: { revision: 0, active: true, ...year, ...config } },
];
const seed = [
  dimension({ kind: "dimension", code: "DEPT", name: "Fictional department" }),
  dimension({ kind: "dimension", code: "PROJECT", name: "Fictional project" }),
  dimension({ kind: "dimension", code: "REGION", name: "Fictional region", active: false }),
  dimension({ kind: "value", dimension: "DEPT", code: "SALES", name: "Fictional sales" }),
  dimension({ kind: "value", dimension: "DEPT", code: "ADMIN", name: "Fictional admin" }),
  dimension({
    kind: "structure",
    code: "5000",
    required: ["DEPT"],
    optional: ["PROJECT"],
    forbidden: [],
    allowed: [],
    fixed: {},
    conditionals: [],
  }),
  trade("tradeTerms", "N30", {
    dueDays: 30,
    discountDays: 7,
    discountPercent: "1.5",
    allowPartialDiscount: true,
  }),
  trade("taxCode", "VAT", {
    mode: "ordinary",
    rates: [{ id: "STANDARD", ...year, ratePercent: "13" }],
    deductiblePercent: "100",
    inputAccount: "1400",
    outputAccount: "2200",
  }),
  trade("tradeProfile", "PAY", {
    side: "AP",
    controlAccount: "2100",
    advanceAccount: "1250",
    cashAccount: "1000",
    discountAccount: "4000",
  }),
  trade("tradeProfile", "REC", {
    side: "AR",
    controlAccount: "1300",
    advanceAccount: "2300",
    cashAccount: "1000",
    discountAccount: "4000",
  }),
  trade("tradeParty", "PARTY", {
    role: "both",
    apProfile: "PAY",
    arProfile: "REC",
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
  trade("tradeParty", "ACME", {
    role: "vendor",
    apProfile: "PAY",
    arProfile: null,
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
  trade("tradeProduct", "EXPENSE", {
    type: "expense",
    expenseAccount: "5000",
    revenueAccount: null,
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
  trade("tradeProduct", "SERVICE", {
    type: "service",
    expenseAccount: null,
    revenueAccount: "4000",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
];

const directory = await mkdtemp(join(tmpdir(), "erp-ui04-capture-"));
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
  if (!response.ok)
    throw new Error(`Seed ${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const [method, path, body] of seed) await send(method, path, body);
  for (const [state, language, theme, width, teaching] of shots) {
    const t = (key) => label(language, key);
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const file = `${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    const button = (name) => tab.getByRole("button", { name, exact: true });
    if (state.startsWith("dimensions")) {
      await tab.goto(`${origin}/#/dimensions`);
      await tab.locator("#dimension-kind").waitFor({ timeout: 10_000 });
      await tab.waitForLoadState("networkidle");
      if (state === "dimensions-edit") {
        await tab.locator("#dimension-kind").selectOption("structure");
        await button(`${t("dim.edit")} 5000`).click();
        await tab.locator("#dim-required").waitFor();
      } else await button(`${t("dim.edit")} PROJECT`).waitFor();
    } else {
      await tab.goto(`${origin}/#/trade`);
      await tab.locator("#trade-kind").waitFor({ timeout: 10_000 });
      await tab.waitForLoadState("networkidle");
      await button(`${t("trade.edit")} PARTY`).waitFor();
      if (state === "trade-edit") {
        await button(`${t("trade.edit")} PARTY`).click();
        await tab.locator("#trade-code").waitFor();
      }
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

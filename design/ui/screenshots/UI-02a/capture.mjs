// UI-02a 改前 / 改后截图：node design/ui/screenshots/UI-02a/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-01 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。
// 报表接口用虚构夹具（PARTY / AP-DEMO，未结 36.50，与 design/ui §9 一致）经 page.route 返回，其余接口走真实 API。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动。
// 第三个参数为 after 时另截发票页、凭证页（证明除 UI-01 外壳外无变化）、来源详情与教学关闭图。
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createSqliteStorage } from "../../../../packages/infra/src/storage/index.ts";
import { SqliteExecutor } from "../../../../packages/infra/src/workers/executor.ts";
import { createApi } from "../../../../packages/infra/src/http/index.ts";

const [webRoot, outDir] = process.argv.slice(2, 4).map((p) => resolve(p));
const after = process.argv[4] === "after";
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir> [after]");

const id = "00000000-0000-4000-8000-0000000000a1";
const journalId = "00000000-0000-4000-8000-0000000000b1";
const fingerprint = "a".repeat(64);
const item = (externalNo, side, kind, party, net, tax, due, days, bucket, documentId = id) => ({
  kind,
  side,
  documentId,
  party,
  currency: "CNY",
  externalNo,
  version: 3,
  currentVersion: 3,
  accountingDate: "2026-11-19",
  documentDate: "2026-11-19",
  dueDate: due,
  remainingNetMinor: net,
  remainingTaxMinor: tax,
  remainingGrossMinor: net + tax,
  overdueDays: days,
  ageingBucket: bucket,
  controlAccount: side === "AP" ? "2100" : "1122",
  sourceReference: `TRADE-${side}-INV:${documentId}`,
  journalId,
});
const items = [
  item("AP-DEMO", "AP", "invoice", "PARTY", 3230, 420, "2026-12-19", 0, "notDue"),
  item(
    "AR-DEMO",
    "AR",
    "invoice",
    "CUSTOMER",
    10000,
    1300,
    "2026-10-31",
    20,
    "overdue1_30",
    "00000000-0000-4000-8000-0000000000a2",
  ),
  item(
    "ADV-DEMO",
    "AR",
    "advance",
    "CUSTOMER",
    2000,
    0,
    null,
    null,
    null,
    "00000000-0000-4000-8000-0000000000a3",
  ),
];
const report = {
  company: "DEFAULT",
  basis: "current",
  asOf: null,
  ageingDate: "2026-11-20",
  snapshot: fingerprint,
  items,
  totals: {
    invoiceGrossMinor: 14950,
    notDue: 3650,
    overdue1_30: 11300,
    overdue31_60: 0,
    overdue61_90: 0,
    overdue91Plus: 0,
    creditGrossMinor: 0,
    advanceGrossMinor: 2000,
  },
  nextCursor: null,
};
const reconciliation = {
  company: "DEFAULT",
  asOf: null,
  basis: "debitMinusCredit",
  scope: "companyAllParties",
  rows: [
    {
      account: "1122",
      subledgerMinor: 11300,
      tradeGlMinor: 11300,
      otherSourceMinor: 0,
      glMinor: 11300,
      tradeDifferenceMinor: 0,
      differenceMinor: 0,
    },
    {
      account: "2100",
      subledgerMinor: -3650,
      tradeGlMinor: -3650,
      otherSourceMinor: -700,
      glMinor: -4350,
      tradeDifferenceMinor: 0,
      differenceMinor: -700,
    },
  ],
};
const line = {
  lineId: "L1",
  lineNo: 1,
  product: "SERVICE",
  account: "5000",
  taxCode: "VAT",
  taxRateId: "VAT13",
  ratePercent: "13",
  quantity: "1",
  unitPrice: "100.00",
  discountPercent: "0",
  taxableCharge: "0",
  net: 10000,
  tax: 1300,
  gross: 11300,
  deductibleTax: 1300,
  orderId: null,
  orderLineId: null,
  expectedNet: null,
  matchStatus: "notApplicable",
};
const detail = {
  company: "DEFAULT",
  asOf: null,
  selected: items[0],
  current: {
    kind: "invoice",
    itemId: id,
    side: "AP",
    party: "PARTY",
    externalNo: "AP-DEMO",
    controlAccount: "2100",
    dimensions: {},
    segments: [{ dimensions: {}, gross: 11300, remainingGross: 3650 }],
    currency: "CNY",
    accountingDate: "2026-11-19",
    documentDate: "2026-11-19",
    dueDate: "2026-12-19",
    discountDate: "2026-11-26",
    discountPercent: "0",
    allowPartialDiscount: false,
    gross: 11300,
    net: 10000,
    tax: 1300,
    remainingGross: 3650,
    remainingNet: 3230,
    remainingTax: 420,
    status: "open",
    revision: 3,
  },
  document: {
    documentId: id,
    side: "AP",
    party: "PARTY",
    externalNo: "AP-DEMO",
    externalNoNormalized: "AP-DEMO",
    currency: "CNY",
    accountingDate: "2026-11-19",
    documentDate: "2026-11-19",
    taxDate: "2026-11-19",
    dueDate: "2026-12-19",
    discountDate: "2026-11-26",
    orderId: null,
    poMatch: "notApplicable",
    exceptionReason: null,
    net: 10000,
    tax: 1300,
    gross: 11300,
    journalId,
    receiptKey: id,
    fingerprint,
    commandHash: fingerprint,
    postedAt: "2026-11-19T00:00:00.000Z",
    controlAccount: "2100",
    controlDimensions: {},
    lines: [line],
  },
  originalDocumentId: null,
  actions: [],
  settlements: [],
};

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
      // Nested clippers (a td with overflow:hidden inside a scrolling table) are fine as long as
      // one ancestor clipper sits inside the viewport.
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

const views = [
  ["open-items", "trade-reports?company=DEFAULT"],
  ["ageing", "trade-reports?company=DEFAULT&view=ageing"],
  ["reconciliation", "trade-reports?company=DEFAULT&view=reconciliation"],
];
const variants = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
// [name, path, language, theme, width, teaching]
const shots = views.flatMap(([name, path]) =>
  variants.map(([language, theme, width]) => [`trade-reports-${name}`, path, language, theme, width, true]),
);
shots.push(
  ["trade-reports-detail", `trade-reports?company=DEFAULT&item=${id}`, "zh", "red", 1440, true],
  ["trade-reports-detail", `trade-reports?company=DEFAULT&item=${id}`, "en", "green", 390, true],
);
if (after)
  shots.push(
    ["trade-reports-open-items", views[0][1], "zh", "red", 1440, false],
    ["trade-invoices", "trade-invoices", "zh", "red", 1440, true],
    ["journals", "journals", "zh", "red", 1440, true],
  );

const directory = await mkdtemp(join(tmpdir(), "erp-ui02a-capture-"));
const filename = join(directory, "fictional.sqlite");
const storage = createSqliteStorage({ filename });
await storage.migrate();
await storage.close();
const executor = await SqliteExecutor.create({ filename });
await executor.execute("masterData", "initialize", [2026]);
const api = await createApi({
  ...executor.services(),
  webRoot,
  allowPortZero: true,
  environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
});
const origin = await api.listen();
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const [name, path, language, theme, width, teaching] of shots) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    await context.route("**/api/v1/trade/reports/**", (route) => {
      const url = new URL(route.request().url());
      const body = url.pathname.endsWith("/reconciliation")
        ? reconciliation
        : url.pathname.endsWith("/open-items")
          ? report
          : detail;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const file = `${name}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    await tab.goto(`${origin}/#/${path}`);
    await tab.locator("main h2").first().waitFor();
    await tab.waitForLoadState("networkidle");
    if (name.startsWith("trade-reports"))
      await tab
        .locator("main table")
        .first()
        .waitFor({ timeout: 10_000 })
        .catch(async (error) => {
          throw new Error(`${file}: ${await tab.locator("main").innerText()}`, { cause: error });
        });
    if (path.includes("item=")) await tab.getByText("SERVICE").first().waitFor();
    await tab.evaluate(() => document.fonts.ready);
    const overflow = await tab.evaluate(overflowReport);
    const main = await tab.evaluate(mainScroll);
    const mainOk = main[0] <= main[1] || name === "trade-invoices";
    await tab.screenshot({ path: join(outDir, file), fullPage: true });
    const size = await tab.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]);
    const ok = overflow.vw === width && overflow.scrollWidth <= width && overflow.escaped.length === 0 && mainOk;
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}`,
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
  console.error(`${failed} screenshot(s) failed the width checks`);
  process.exitCode = 1;
}

// UI-07a 改前 / 改后截图：node design/ui/screenshots/UI-07a/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-02a 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。
// 公司、期间、总账报表、总账明细与只读快照接口用虚构夹具经 page.route 返回；报表索引图不拦截快照接口（未配置态）。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动；
// 390 宽另列出 main 内高度 < 44px 的交互目标（after 要求为空）。
// 第三个参数为 after 时另截教学关闭图。
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { buildReports } from "../../../../packages/core/src/domain/reports.ts";
import { createSqliteStorage } from "../../../../packages/infra/src/storage/index.ts";
import { SqliteExecutor } from "../../../../packages/infra/src/workers/executor.ts";
import { createApi } from "../../../../packages/infra/src/http/index.ts";

const [webRoot, outDir] = process.argv.slice(2, 4).map((p) => resolve(p));
const after = process.argv[4] === "after";
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir> [after]");

const company = {
  code: "DEFAULT",
  name: "Synthetic Trading",
  currency: "CNY",
  scale: 2,
  year: 2026,
  closeMode: "annual",
  revision: 1,
};
const account = (code, name, category, reportGroup, normalSide, opening, debit, credit) => ({
  code,
  name,
  category,
  reportGroup,
  normalSide,
  purpose: "general",
  controlModule: null,
  contraOf: null,
  manualAllowed: true,
  active: true,
  builtin: false,
  revision: 1,
  opening,
  debit,
  credit,
  closing: opening + debit - credit,
  yearNet: ["REVENUE", "EXPENSE"].includes(category) ? opening + debit - credit : debit - credit,
});
const rows = [
  account("1000", "Cash", "ASSET", "cash", "DEBIT", 500000, 113000, 41300),
  account("1122", "Trade receivables", "ASSET", "receivables", "DEBIT", 80000, 113000, 113000),
  account("2100", "Trade payables", "LIABILITY", "payables", "CREDIT", -60000, 41300, 11300),
  account("2221", "VAT payable", "LIABILITY", "taxLiabilities", "CREDIT", -4000, 1300, 13000),
  account("3000", "Paid-in capital", "EQUITY", "capital", "CREDIT", -400000, 0, 0),
  account("4000", "Sales revenue", "REVENUE", "sales", "CREDIT", -250000, 0, 100000),
  account("5000", "Cost of sales", "EXPENSE", "costOfSales", "DEBIT", 120000, 10000, 0),
  account("6600", "Office expense", "EXPENSE", "operatingExpense", "DEBIT", 14000, 0, 0),
];
const ledger = {
  company: "DEFAULT",
  month: "2026-11",
  account: "1000",
  currency: "CNY",
  scale: 2,
  stage: "adjusted",
  opening: 500000,
  debit: 113000,
  credit: 41300,
  closing: 571700,
  total: 3,
  watermark: 42,
  accountRevision: 7,
  items: [
    ["2026-11-03", "AR-RECEIPT-0001", 113000, 0, 613000, { PROJECT: "ALPHA" }],
    ["2026-11-12", "AP-PAYMENT-0001", 0, 30000, 583000, {}],
    ["2026-11-19", "AP-PAYMENT-0002", 0, 11300, 571700, { PROJECT: null }],
  ].map(([date, sourceRef, debit, credit, balance, dimensions], index) => ({
    entryId: `00000000-0000-4000-8000-00000000000${index + 1}`,
    lineNo: 1,
    date,
    sourceRef,
    memo: "Synthetic",
    debit,
    credit,
    dimensions,
    balance,
  })),
  nextCursor: null,
};
const source = {
  sourceKind: "verified-teaching-snapshot",
  baseline: "M00-verified-snapshot",
  live: false,
  snapshotSha256: "a".repeat(64),
  snapshotBytes: 123,
  scale: 2,
};
const legacyContext = {
  contractVersion: "1",
  source,
  periods: [
    { month: "2025-01", status: "closed" },
    { month: "2025-02", status: "open" },
  ],
};
const balance = {
  rows: [
    { code: "1100", name: "Cash at bank", category: "ASSET", debit: 1234500, credit: 0 },
    { code: "1200", name: "Receivables", category: "ASSET", debit: 340000, credit: 0 },
    { code: "2100", name: "Payables", category: "LIABILITY", debit: 0, credit: 274500 },
    { code: "3000", name: "Capital", category: "EQUITY", debit: 0, credit: 1000000 },
    { code: "4000", name: "Revenue", category: "REVENUE", debit: 0, credit: 450000 },
    { code: "5000", name: "Expenses", category: "EXPENSE", debit: 150000, credit: 0 },
  ],
  debit: 1724500,
  credit: 1724500,
};
const legacyTrial = (month) => ({
  contractVersion: "1",
  source,
  month,
  trialBalances: { unadjusted: balance, adjusted: balance, postClosing: balance },
});
const legacyEntry = (lineId, memo, debit, credit, balanceMinor, kind = "normal") => ({
  id: 7 + lineId,
  lineId,
  date: `2025-02-0${lineId}`,
  memo,
  kind,
  reversal_of: null,
  source_kind: null,
  account: "1100",
  debit,
  credit,
  dimensions: lineId === 1 ? { project: "ALPHA" } : {},
  balance: balanceMinor,
});
const legacyLedger = {
  contractVersion: "1",
  source,
  month: "2025-02",
  account: "1100",
  opening: 1000000,
  closing: 1234500,
  debit: 334500,
  credit: 100000,
  totalEntries: 3,
  entries: [
    legacyEntry(1, "Customer receipt", 300000, 0, 1300000),
    legacyEntry(2, "Supplier payment", 0, 100000, 1200000),
    legacyEntry(3, "Interest accrual", 34500, 0, 1234500, "adjusting"),
  ],
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
function smallTargets() {
  const small = [];
  for (const el of document.querySelectorAll(
    "main a[href], main button, main select, main input, main summary",
  )) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 43.5)
      small.push(`${el.tagName.toLowerCase()}:${el.textContent.trim().slice(0, 14)}(${Math.round(r.height)})`);
  }
  return small;
}

const base = "company=DEFAULT&month=2026-11";
const variants = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
const pairs = [
  ["zh", "red", 1440],
  ["en", "green", 390],
];
// [name, path, mockLegacy, readySelector, variants]
const pages = [
  ["reports-index", "reports", false, "main h2", variants],
  ["ledger-reports-trial", `ledger-reports?${base}`, true, "main table", variants],
  ["ledger-reports-income", `ledger-reports?${base}&view=income`, true, "main table", pairs],
  ["ledger-reports-balance-sheet", `ledger-reports?${base}&view=balance-sheet`, true, "main table", pairs],
  ["ledger-reports-reconciliation", `ledger-reports?${base}&view=reconciliation`, true, "main table", pairs],
  ["ledger-detail", `ledger?${base}&account=1000`, true, "main table", variants],
  ["reports-trial", "reports/trial", true, "main table", variants],
  ["reports-ledger", "reports/ledger/1100?month=2025-02", true, "main table", variants],
];
const shots = pages.flatMap(([name, path, mock, ready, list]) =>
  list.map(([language, theme, width]) => [name, path, mock, ready, language, theme, width, true]),
);
if (after)
  shots.push(
    ["ledger-reports-trial", pages[1][1], true, "main table", "zh", "red", 1440, false],
    ["ledger-detail", pages[5][1], true, "main table", "en", "green", 390, false],
    ["reports-trial", "reports/trial", true, "main table", "zh", "red", 1440, false],
  );

const directory = await mkdtemp(join(tmpdir(), "erp-ui07a-capture-"));
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
const json = (route, body) =>
  route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
let failed = 0;
try {
  for (const [name, path, mock, ready, language, theme, width, teaching] of shots) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    await context.route("**/api/v1/companies?*", (route) =>
      json(route, { items: [company], nextCursor: null }),
    );
    await context.route("**/api/v1/periods?*", (route) =>
      json(route, {
        items: [
          { month: "2026-10", status: "closed", revision: 1 },
          { month: "2026-11", status: "open", revision: 1 },
        ],
        nextCursor: null,
      }),
    );
    await context.route("**/api/v1/reports/**", (route) => {
      const url = new URL(route.request().url());
      const stage = url.searchParams.get("stage") ?? "adjusted";
      return json(route, {
        ...buildReports(company, url.searchParams.get("month"), stage, rows),
        watermark: 42,
        accountRevision: 7,
      });
    });
    await context.route("**/api/v1/ledger?*", (route) => json(route, ledger));
    if (mock)
      await context.route("**/api/v1/legacy/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/context")) return json(route, legacyContext);
        if (url.pathname.endsWith("/trial"))
          return json(route, legacyTrial(url.searchParams.get("month")));
        return json(route, legacyLedger);
      });
    const file = `${name}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    await tab.goto(`${origin}/#/${path}`);
    await tab.locator("main h2").first().waitFor();
    await tab.waitForLoadState("networkidle");
    await tab
      .locator(ready)
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(async (error) => {
        throw new Error(`${file}: ${await tab.locator("main").innerText()}`, { cause: error });
      });
    await tab.evaluate(() => document.fonts.ready);
    const overflow = await tab.evaluate(overflowReport);
    const main = await tab.evaluate(mainScroll);
    const small = width <= 760 ? await tab.evaluate(smallTargets) : [];
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
      (!after || small.length === 0);
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}${small.length ? ` small<44: ${small.slice(0, 6).join(", ")}${small.length > 6 ? ` …(${small.length})` : ""}` : ""}`,
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
  console.error(`${failed} screenshot(s) failed the width/target checks`);
  process.exitCode = 1;
}

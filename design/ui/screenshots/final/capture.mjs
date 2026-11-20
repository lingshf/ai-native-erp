// UI-08 全部页面终版截图：node design/ui/screenshots/final/capture.mjs <webDist> <outDir> [baselineDist]
// 只用虚构夹具：全新临时账套（迁移 + 默认公司初始化，月度教学模式，不连 4173、不用 .bak）；
// 迁移核对接口用内存假读取器，只读快照（/api/v1/legacy/**）经 page.route 返回虚构数据。
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽；中文 + 专业红、English + 专业绿，宽 1440 与 390。
// 每张自动断言：
//   - 根节点 scrollWidth ≤ 视口宽，溢出元素只在自身滚动容器内，main 自身不横向溢出；
//   - main 内每张表格都在自身 overflow-x 容器内，溢出时能在容器内横向滚动；
//   - 390 宽：main 内可见的 button / select / input / textarea / summary 与表格外的 a[href] 高度 ≥ 44px，
//     复选框按实际点击区（包裹的 label 或自身）宽高都 ≥ 44px，链接宽高都 ≥ 44px；
//     表格内联金额链接属于行内文字，单独记录高度，不计入也不声称通过；
//   - 390 宽：导航条 overflow-x 可滚动，且能实际横向滚动。
// 给出 baselineDist 时，同一夹具、同一浏览器状态下再用 baselineDist 截一次，逐像素比较（不同像素数须为 0）。
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { MasterDataService } from "../../../../packages/core/src/application/index.ts";
import { createApi } from "../../../../packages/infra/src/http/index.ts";
import { createSqliteStorage } from "../../../../packages/infra/src/storage/index.ts";
import { createMasterDataStore } from "../../../../packages/infra/src/storage/master-data.ts";
import { SqliteExecutor } from "../../../../packages/infra/src/workers/executor.ts";
import { label } from "../../../../packages/web/src/ui/index.ts";

const [webRoot, outDir, baselineRoot] = process.argv.slice(2, 5).map((p) => p && resolve(p));
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir> [baselineDist]");
// 可选：SELECTORS 环境变量放 JSON 选择器列表，统计每个选择器在各页面上的最大命中数（有基线时按基线构建统计）。
const selectors = process.env.SELECTORS ? JSON.parse(process.env.SELECTORS) : [];
// 可选：INTENDED 环境变量放逗号分隔的截图文件名，这些截图允许与基线有差异（有意的视觉改动，逐张说明），其余必须为 0。
const intended = new Set(process.env.INTENDED?.split(",") ?? []);

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
function tableScroll() {
  const main = document.querySelector("main");
  const result = [];
  for (const table of main.querySelectorAll("table")) {
    let box = table.parentElement;
    while (box && box !== main && !/(auto|scroll)/.test(getComputedStyle(box).overflowX))
      box = box.parentElement;
    const name = table.getAttribute("aria-label") ?? table.caption?.textContent ?? "table";
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
    "main button, main select, main input, main textarea, main summary, main a[href]",
  )) {
    if (el.tagName === "A" && el.closest("table")) continue;
    if (el.type === "hidden" || el.closest("[hidden], [inert]")) continue;
    const check = el.type === "checkbox" || el.type === "radio";
    // 表格内禁用的复选框是只读状态指示（如科目“启用”列），不可点击，不计入点击区。
    if (check && el.disabled && el.closest("table")) continue;
    const target = check ? (el.closest("label") ?? el) : el;
    const box = target.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (box.height < 43.5 || ((check || el.tagName === "A") && box.width < 43.5))
      small.push(
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${check ? `[${el.type} ${target.textContent?.trim().slice(0, 16) ?? ""}]` : ""}${el.tagName === "A" ? `[link ${el.textContent?.trim().slice(0, 16)}]` : ""} ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
  }
  return small.slice(0, 8);
}
// 表格内联链接：[链接高, 所在行高]
function tableLinks() {
  return [...document.querySelectorAll("main table a[href]")].map((a) => [
    Math.round(a.getBoundingClientRect().height),
    Math.round(a.closest("tr").getBoundingClientRect().height),
  ]);
}
function navScroll() {
  const nav = document.querySelector("nav.nav");
  const style = getComputedStyle(nav);
  const before = nav.scrollLeft;
  nav.scrollLeft = before === 0 ? 64 : 0;
  const moved = nav.scrollLeft !== before;
  nav.scrollLeft = before;
  return {
    overflowX: style.overflowX,
    scrollable: /(auto|scroll)/.test(style.overflowX) && nav.scrollWidth > nav.clientWidth,
    moved,
  };
}
function selectorHits(list) {
  return Object.fromEntries(
    list.map((selector) => {
      try {
        return [selector, document.querySelectorAll(selector).length];
      } catch {
        return [selector, -1];
      }
    }),
  );
}

const variants = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
const day = "2026-01-20";
const scope = "company=DEFAULT&month=2026-01";
// [name, hash path, ready selector, prepare(tab, t)]
const pages = [
  ["overview", "", ".overview-ready"],
  [
    "migration",
    "migration",
    "main details summary",
    async (tab) => {
      await tab.locator("main details summary").last().click();
    },
  ],
  ["accounts", "accounts", "main table"],
  ["dimensions", "dimensions", "main table"],
  ["trade-master", "trade", "main table"],
  ["journals", "journals", "main table"],
  [
    "journals-new",
    "journals",
    "main table",
    async (tab, t) => {
      await tab.getByRole("button", { name: t("journal.new"), exact: true }).click();
      await tab.locator("main form").first().waitFor();
    },
  ],
  [
    "journals-detail",
    "journals",
    "main table",
    async (tab, t) => {
      await tab.locator(".jv-status select").selectOption("posted");
      await tab.getByRole("button", { name: new RegExp(`^${t("journal.view")} `) }).first().click();
      await tab.locator("main .jv-detail").first().waitFor();
    },
  ],
  ["events", "events", "main table"],
  ["trade-invoices", "trade-invoices", "main table"],
  [
    "trade-settlements",
    "trade-settlements",
    "#tset-party",
    async (tab, t) => {
      await tab.waitForLoadState("networkidle");
      await tab.locator("#tset-side").selectOption("AP");
      await tab.locator("#tset-party").fill("PARTY");
      await tab.getByRole("checkbox", { name: `${t("tset.select")} AP-DEMO`, exact: true }).waitFor();
    },
  ],
  ["trade-adjustments", "trade-adjustments", "main select"],
  ["trade-reports", "trade-reports", "main table"],
  [
    "trade-reports-detail",
    `trade-reports?${scope}`,
    "main .cell-link",
    async (tab) => {
      await tab.locator("main .cell-link").first().click();
      await tab.locator("main .trpt-detail").waitFor();
    },
  ],
  ["ledger-reports", `ledger-reports?${scope}`, "main table"],
  ["ledger-detail", `ledger?${scope}&account=2100`, "main table"],
  [
    "period-close",
    `period-close?${scope}`,
    "#close-month",
    async (tab, t) => {
      await tab.waitForLoadState("networkidle");
      await tab.getByRole("button", { name: t("close.preview"), exact: true }).click();
      await tab.getByRole("table", { name: t("close.lines"), exact: true }).waitFor();
    },
  ],
  ["reports-index", "reports", "main h2"],
  ["reports-trial", "reports/trial", "main table"],
];

// ---------- 虚构夹具 ----------
const year = { from: "2026-01-01", to: "2026-12-31" };
const trade = (kind, code, data) => [
  "POST",
  `/api/v1/trade/${kind}`,
  { company: "DEFAULT", code, active: true, expectedRevision: 0, kind, data: { name: `Fictional ${code}`, ...year, ...data } },
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
      reason: "Fictional UI-08 screenshots",
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
const sha = (c) => c.repeat(64);
const reconciled = {
  company: "DEMO",
  account: "1122",
  glMinor: 11300,
  tradeMinor: 7650,
  openingGlMinor: 3650,
  subledgerMinor: 11300,
  tradeDifferenceMinor: 0,
  otherSourceMinor: 0,
};
const migration = {
  run: {
    id: "demo-run-0001",
    status: "reconciled",
    createdAt: "2026-01-01T08:00:00.000Z",
    baseline: "2026-01-02T09:30:00.000Z",
    reportSha256: sha("a"),
    confirmationSha256: sha("d"),
    report: {
      version: 1,
      runId: "demo-run-0001",
      snapshotSha256: { "legacy.sqlite": sha("c") },
      verdict: "pass",
      blockers: [],
      knownDifferencesSha256: sha("b"),
      knownDifferences: [
        { source: "teaching", object: "journals", disposition: "skipped", reasons: ["draft"], count: 2, legacyRefs: ["DEMO-J-0003", "DEMO-J-0007"] },
      ],
      checks: [
        {
          section: "trial-balance",
          expected: [{ company: "DEMO", account: "1122", debitMinor: 11300, creditMinor: 0 }],
          actual: [{ company: "DEMO", account: "1122", debitMinor: 11300, creditMinor: 0 }],
        },
        { section: "trade-reconciliation", expected: [reconciled], actual: [reconciled] },
      ],
      differences: [],
    },
  },
};
const source = {
  sourceKind: "verified-teaching-snapshot",
  baseline: "M00-verified-snapshot",
  live: false,
  snapshotSha256: sha("a"),
  snapshotBytes: 123,
  scale: 2,
};
const balance = {
  rows: [
    { code: "1100", name: "Cash at bank", category: "ASSET", debit: 1234500, credit: 0 },
    { code: "2100", name: "Payables", category: "LIABILITY", debit: 0, credit: 234500 },
    { code: "3000", name: "Capital", category: "EQUITY", debit: 0, credit: 1000000 },
  ],
  debit: 1234500,
  credit: 1234500,
};
const legacy = {
  context: { contractVersion: "1", source, periods: [{ month: "2025-01", status: "closed" }, { month: "2025-02", status: "open" }] },
  trial: (month) => ({
    contractVersion: "1",
    source,
    month,
    trialBalances: { unadjusted: balance, adjusted: balance, postClosing: balance },
  }),
};

const directory = await mkdtemp(join(tmpdir(), "erp-ui08-capture-"));
const filename = join(directory, "fictional.sqlite");
const storage = createSqliteStorage({ filename });
await storage.migrate();
await storage.close();
const store = createMasterDataStore({ filename });
try {
  const master = new MasterDataService(store);
  await master.initialize(2026);
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
const environment = { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" };
const serve = async (root) => {
  const api = await createApi({
    ...executor.services(),
    migration: { latest: async () => migration },
    webRoot: root,
    allowPortZero: true,
    environment,
  });
  return { api, origin: await api.listen() };
};
// 同一账套、两套前端构建：截图差异只可能来自 CSS / JS 构建本身。
const builds = [["after", await serve(webRoot)]];
if (baselineRoot) builds.push(["baseline", await serve(baselineRoot)]);
const origin = builds[0][1].origin;
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

const json = (route, body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
const report = { shots: [], selectors: {} };
let failed = 0;

async function shoot(base, name, path, ready, prepare, language, theme, width) {
  const t = (key) => label(language, key);
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((value) => {
    window.localStorage.setItem("erp.workspace.preferences.v1", value);
  }, JSON.stringify({ language, theme, teaching: true }));
  await context.route("**/api/v1/legacy/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/context")) return json(route, legacy.context);
    return json(route, legacy.trial(url.searchParams.get("month")));
  });
  const tab = await context.newPage();
  await tab.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
  await tab.goto(`${base}/#/${path}`);
  await tab.locator("main h2").first().waitFor();
  await tab
    .locator(ready)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(async (error) => {
      throw new Error(`${name}: ${await tab.locator("main").innerText()}`, { cause: error });
    });
  if (prepare) await prepare(tab, t);
  await tab.waitForLoadState("networkidle");
  await tab.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await tab.evaluate(() => document.fonts.ready);
  // 等两帧，让失焦 / 滚动复位后的重绘落定（否则偶见顶栏下拉框底边 1–2px 栅格化差异）
  await tab.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const facts = {
    overflow: await tab.evaluate(overflowReport),
    main: await tab.evaluate(mainScroll),
    tables: await tab.evaluate(tableScroll),
    small: width <= 760 ? await tab.evaluate(smallTargets) : [],
    links: await tab.evaluate(tableLinks),
    nav: width <= 760 ? await tab.evaluate(navScroll) : null,
    hits: selectors.length ? await tab.evaluate(selectorHits, selectors) : {},
    size: await tab.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]),
  };
  // 稳定帧：连续两次截图逐字节相同才采用（同 Playwright toHaveScreenshot 的做法），最多 5 次。
  let png = await tab.screenshot({ fullPage: true, animations: "disabled" });
  let stable = false;
  for (let i = 0; i < 4 && !stable; i++) {
    const next = await tab.screenshot({ fullPage: true, animations: "disabled" });
    stable = next.equals(png);
    png = next;
  }
  if (!stable) console.warn(`${name} ${language}/${theme}/${width}: no two identical consecutive frames`);
  await context.close();
  return { png, facts };
}

async function pixelDiff(a, b) {
  if (a.equals(b)) return 0;
  const page = await browser.newPage();
  const diff = await page.evaluate(
    async ([x, y]) => {
      const load = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return { w: image.width, h: image.height, d: context.getImageData(0, 0, image.width, image.height).data };
      };
      const [p, q] = [await load(x), await load(y)];
      if (p.w !== q.w || p.h !== q.h) return `size ${p.w}x${p.h} vs ${q.w}x${q.h}`;
      let count = 0;
      const box = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < p.d.length; i += 4)
        if (p.d[i] !== q.d[i] || p.d[i + 1] !== q.d[i + 1] || p.d[i + 2] !== q.d[i + 2] || p.d[i + 3] !== q.d[i + 3]) {
          count++;
          const x = (i / 4) % p.w;
          const y = Math.floor(i / 4 / p.w);
          box[0] = Math.min(box[0], x);
          box[1] = Math.min(box[1], y);
          box[2] = Math.max(box[2], x);
          box[3] = Math.max(box[3], y);
        }
      return count ? `${count} in [${box.join(",")}]` : 0;
    },
    [a.toString("base64"), b.toString("base64")],
  );
  await page.close();
  return diff;
}

try {
  for (const [method, path, body] of seed) await send(method, path, body);
  for (const doc of [invoice("AP", "AP-DEMO", "10"), invoice("AR", "AR-SEED", "5")])
    await confirmed("/api/v1/trade/invoices", doc);
  const only = process.env.ONLY?.split(",");
  for (const [name, path, ready, prepare] of pages) {
    if (only && !only.includes(name)) continue;
    for (const [language, theme, width] of variants) {
      const file = `${name}-${language}-${theme}-${width}.png`;
      const result = {};
      for (const [kind, build] of builds)
        result[kind] = await shoot(build.origin, name, path, ready, prepare, language, theme, width);
      const { png, facts } = result.after;
      await writeFile(join(outDir, file), png);
      const loose = facts.tables.filter((table) => !table.own || (table.overflow && !table.scrolled));
      const navOk = !facts.nav || (facts.nav.scrollable && facts.nav.moved);
      const diff = result.baseline ? await pixelDiff(result.baseline.png, png) : null;
      if (diff && process.env.DIFF_DIR) {
        await mkdir(process.env.DIFF_DIR, { recursive: true });
        await writeFile(join(process.env.DIFF_DIR, `baseline-${file}`), result.baseline.png);
      }
      const ok =
        facts.overflow.vw === width &&
        facts.overflow.scrollWidth <= width &&
        facts.overflow.escaped.length === 0 &&
        facts.main[0] <= facts.main[1] &&
        loose.length === 0 &&
        facts.small.length === 0 &&
        navOk &&
        (diff === null || diff === 0 || intended.has(file));
      if (!ok) failed++;
      const linkHeights = [...new Set(facts.links.map(([h, row]) => `${h}/${row}`))];
      console.log(
        `${ok ? "PASS" : "FAIL"} ${file} page ${facts.size.join("x")} main ${facts.main.join("/")} tables ${facts.tables.length}` +
          `${facts.nav ? ` nav ${facts.nav.scrollable && facts.nav.moved ? "scrolls" : `NOT scrollable ${JSON.stringify(facts.nav)}`}` : ""}` +
          `${diff === null ? "" : ` diff ${diff}px${diff && intended.has(file) ? " (intended)" : ""}`}` +
          `${linkHeights.length ? ` table-inline links (not checked) ${facts.links.length} link/row h ${linkHeights.join(",")}` : ""}` +
          `${loose.length ? ` not in own scroller: ${loose.map((table) => table.name).join(", ")}` : ""}` +
          `${facts.overflow.escaped.length ? ` escaped: ${facts.overflow.escaped.join(", ")}` : ""}` +
          `${facts.small.length ? ` <44px: ${facts.small.join(", ")}` : ""}`,
      );
      report.shots.push({ file, ok, diff, size: facts.size, links: facts.links, small: facts.small });
      for (const [selector, count] of Object.entries((result.baseline ?? result.after).facts.hits))
        report.selectors[selector] = Math.max(report.selectors[selector] ?? 0, count);
    }
  }
} finally {
  await browser.close();
  for (const [, build] of builds) await build.api.close();
  await executor.close();
  await rm(directory, { recursive: true, force: true });
}
if (process.env.CAPTURE_REPORT) await writeFile(process.env.CAPTURE_REPORT, JSON.stringify(report, null, 1));
if (failed) {
  console.error(`${failed} screenshot(s) failed the checks`);
  process.exitCode = 1;
}

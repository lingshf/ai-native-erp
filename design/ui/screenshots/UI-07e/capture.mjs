// UI-07e 迁移核对页改前 / 改后截图：node design/ui/screenshots/UI-07e/capture.mjs <webDist> <outDir> [after]
// 只用虚构夹具：进程内 API 托管 <webDist>，/api/v1/migration 由内存假读取器返回虚构报告（经 migrationStatusSchema
// 校验）；不读取旧账、4173 账套或 .bak。系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。
// 状态：核对通过（pass）、期初门禁阻断（blocked）。第三个参数为 after 时另截教学关闭图，
// 并断言 main 内可见的交互控件（summary 等）高度 ≥ 44px。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动。
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createApi } from "../../../../packages/infra/src/http/index.ts";

const [webRoot, outDir] = process.argv.slice(2, 4).map((p) => resolve(p));
const after = process.argv[4] === "after";
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir> [after]");

const sha = (c) => c.repeat(64);
const known = [
  {
    source: "teaching",
    object: "journals",
    disposition: "skipped",
    reasons: ["draft"],
    count: 2,
    legacyRefs: ["DEMO-J-0003", "DEMO-J-0007"],
  },
  {
    source: "trade",
    object: "receipts",
    disposition: "archive-only",
    reasons: ["archive-only"],
    count: 1,
    legacyRefs: ["DEMO-R-0001"],
  },
];
const tradeRow = {
  company: "DEMO",
  account: "1122",
  glMinor: 11300,
  tradeMinor: 7650,
  openingGlMinor: 3650,
  subledgerMinor: 11300,
  tradeDifferenceMinor: 0,
  otherSourceMinor: 0,
};
const checks = [
  {
    section: "trial-balance",
    expected: [{ company: "DEMO", account: "1122", debitMinor: 11300, creditMinor: 0 }],
    actual: [{ company: "DEMO", account: "1122", debitMinor: 11300, creditMinor: 0 }],
  },
  { section: "trade-reconciliation", expected: [tradeRow], actual: [tradeRow] },
];
const report = (verdict, blockers) => ({
  version: 1,
  runId: "demo-run-0001",
  snapshotSha256: { "legacy.sqlite": sha("c") },
  verdict,
  blockers,
  knownDifferencesSha256: sha("b"),
  knownDifferences: known,
  checks,
  differences: [],
});
const fixtures = {
  pass: {
    run: {
      id: "demo-run-0001",
      status: "reconciled",
      createdAt: "2026-01-01T08:00:00.000Z",
      baseline: "2026-01-02T09:30:00.000Z",
      reportSha256: sha("a"),
      confirmationSha256: sha("d"),
      report: report("pass", []),
    },
  },
  blocked: {
    run: {
      id: "demo-run-0001",
      status: "imported",
      createdAt: "2026-01-01T08:00:00.000Z",
      baseline: null,
      reportSha256: sha("a"),
      confirmationSha256: null,
      report: report("blocked", [
        { code: "M2_03B_OPENING_REQUIRED", company: "DEMO", account: "1122" },
        { code: "M2_03B_OPENING_REQUIRED", company: "DEMO", account: "2202" },
      ]),
    },
  },
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
  for (const el of document.querySelectorAll("main summary, main a, main button")) {
    const box = el.getBoundingClientRect();
    if (box.width === 0) continue;
    if (box.height < 43.5) small.push(`${el.tagName.toLowerCase()} ${Math.round(box.height)}`);
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
const shots = ["pass", "blocked"].flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after) shots.push(["blocked", "zh", "red", 1440, false], ["pass", "en", "green", 390, false]);

let current = fixtures.pass;
const api = await createApi({
  migration: { latest: async () => current },
  webRoot,
  allowPortZero: true,
  environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
});
const origin = await api.listen();
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const [state, language, theme, width, teaching] of shots) {
    current = fixtures[state];
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const file = `migration-${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.goto(`${origin}/#/migration`);
    // 展开最后一组核对明细（贸易子账，含期初 P 列），展示明细样式
    const last = tab.locator("main details summary").last();
    await last.waitFor();
    await last.click();
    await tab.waitForLoadState("networkidle");
    await tab.evaluate(() => window.scrollTo(0, 0));
    await tab.evaluate(() => document.fonts.ready);
    const overflow = await tab.evaluate(overflowReport);
    const main = await tab.evaluate(mainScroll);
    const small = after ? await tab.evaluate(smallTargets) : [];
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
      small.length === 0;
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}${small.length ? ` <44px: ${small.join(", ")}` : ""}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await api.close();
}
if (failed) {
  console.error(`${failed} screenshot(s) failed the checks`);
  process.exitCode = 1;
}

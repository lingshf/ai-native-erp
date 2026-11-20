// UI-07c AI 面板改前 / 改后截图：node design/ui/screenshots/UI-07c/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-05 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。
// AI 接口不连真实 Copilot：用 Playwright 路由拦截 /api/v1/ai/draft，返回虚构候选或 AI_UNAVAILABLE 错误。
// 状态：空态（新建凭证，未发送）、有候选、出错。第三个参数为 after 时另截教学关闭图，
// 并断言窄屏（390）下 AI 面板内可见交互控件高度 ≥ 44px。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动。
import { randomUUID } from "node:crypto";
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

const text = {
  zh: {
    new: "新建凭证",
    date: "记账日期",
    prompt: "业务描述",
    send: "发送给 Copilot",
    description: "收到客户咨询服务费 1,280.50 元，已存入银行。",
  },
  en: {
    new: "New journal",
    date: "Accounting date",
    prompt: "Business description",
    send: "Send to Copilot",
    description: "Received consulting fee of 1,280.50 from a customer, deposited to bank.",
  },
};
const line = (account, debit, credit) => ({ account, debit, credit, dimensions: {}, suspense: null });
const candidate = {
  status: "candidate",
  draft: {
    id: randomUUID(),
    revision: 0,
    sourceRef: "AI-DEMO-0001",
    date: "2026-01-15",
    memo: "演示：咨询服务收入 / Demo consulting revenue",
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: {},
    lines: [line("1000", "1280.50", "0"), line("4000", "0", "1280.50")],
  },
  rationale:
    "演示理由：收到服务费，银行存款增加记借方，服务收入记贷方。/ Demo rationale: cash increases (debit), service revenue is earned (credit).",
};
const unavailable = {
  code: "AI_UNAVAILABLE",
  messageKey: "api.error.ai.unavailable",
  params: {},
  fieldErrors: [],
  requestId: randomUUID(),
  retryable: true,
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
  const root = document.querySelector(".ai-panel");
  for (const el of root.querySelectorAll("button, select, input, textarea")) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || el.closest("[hidden]")) continue;
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
const states = ["empty", "candidate", "error"];
// [state, language, theme, width, teaching]
const shots = states.flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after)
  shots.push(["candidate", "zh", "red", 1440, false], ["error", "en", "green", 390, false]);

const directory = await mkdtemp(join(tmpdir(), "erp-ui07c-capture-"));
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
  for (const [state, language, theme, width, teaching] of shots) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const file = `ai-${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.route("**/api/v1/ai/**", (route) =>
      route.fulfill({
        status: state === "error" ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(state === "error" ? unavailable : candidate),
      }),
    );
    await tab.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    const t = text[language];
    await tab.goto(`${origin}/#/journals`);
    await tab.locator("main h2").first().waitFor();
    await tab.waitForLoadState("networkidle");
    await tab.getByRole("button", { name: t.new, exact: true }).click();
    await tab.getByLabel(t.date, { exact: true }).fill("2026-01-15");
    await tab.locator(".ai-panel").waitFor();
    if (state !== "empty") {
      await tab.getByLabel(t.prompt, { exact: true }).fill(t.description);
      await tab.getByRole("button", { name: t.send, exact: true }).click();
      await tab
        .locator(state === "error" ? ".ai-panel [role=alert]" : ".ai-panel table")
        .first()
        .waitFor();
    }
    await tab.waitForLoadState("networkidle");
    await tab.evaluate(() => window.scrollTo(0, 0));
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
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} main ${main.join("/")}${overflow.escaped.length ? ` escaped: ${overflow.escaped.join(", ")}` : ""}${small.length ? ` <44px: ${small.join(", ")}` : ""}`,
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

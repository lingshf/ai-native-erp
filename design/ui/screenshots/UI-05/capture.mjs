// UI-05 改前 / 改后截图：node design/ui/screenshots/UI-05/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-02b 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。夹具经真实 API 写入：
// 3 张凭证草稿、2 张已过账凭证、1 个服务 + 收款过账规则 + 2 个已过账业务事件。
// 状态：凭证列表（草稿）、草稿编辑、过账预览（对话框）、不平衡错误（服务端 balance 规则），业务事件列表与详情。
// 第三个参数为 after 时另截教学关闭图，并断言窄屏（390）下 main（或打开的对话框）内可见交互控件高度 ≥ 44px。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动、对话框不超出视口。
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
    edit: "编辑 JV-0003",
    preview: "预览（Ctrl+Enter）",
    new: "新建凭证",
    sourceRef: "来源编号",
    date: "记账日期",
    memo: "摘要",
    line: "行",
    account: "科目",
    debit: "借方",
    credit: "贷方",
    view: "查看",
  },
  en: {
    edit: "Edit JV-0003",
    preview: "Preview (Ctrl+Enter)",
    new: "New journal",
    sourceRef: "Source reference",
    date: "Accounting date",
    memo: "Memo",
    line: "Line",
    account: "Account",
    debit: "Debit",
    credit: "Credit",
    view: "View",
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
  const root = document.querySelector("dialog[open]") ?? document.querySelector("main");
  for (const el of root.querySelectorAll(
    "button, select, input:not([type=checkbox]), label:has(> input[type=checkbox])",
  )) {
    const box = el.getBoundingClientRect();
    // AI 面板归 UI-07c，不在本任务范围内。
    if (box.width === 0 || el.closest("[hidden]") || el.closest(".ai-panel")) continue;
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
const states = ["list", "draft", "preview", "unbalanced", "events", "event-detail"];
// [state, language, theme, width, teaching]
const shots = states.flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after)
  shots.push(["draft", "zh", "red", 1440, false], ["event-detail", "en", "green", 1440, false]);

const directory = await mkdtemp(join(tmpdir(), "erp-ui05-capture-"));
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
async function post(path, body) {
  const result = await fetch(`${origin}/api/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await result.json();
  if (!result.ok) throw new Error(`${path} ${result.status} ${JSON.stringify(json)}`);
  return json;
}
const line = (account, debit, credit) => ({ account, debit, credit, dimensions: {}, suspense: null });
const journals = [
  ["JV-0001", "2026-01-08", "演示：股东投入 / Demo owner contribution", "5000.00", "1000", "3000"],
  ["JV-0002", "2026-01-12", "演示：服务收入 / Demo service revenue", "1280.50", "1000", "4000"],
  ["JV-0003", "2026-01-20", "演示：顾问收入 / Demo consulting revenue", "860.00", "1000", "4000"],
  ["JV-0004", "2026-01-22", "演示：零星收入 / Demo sundry revenue", "45.10", "1000", "4000"],
  ["JV-0005", "2026-01-25", "演示：补充投入 / Demo top-up contribution", "300.00", "1000", "3000"],
];
for (const [index, [sourceRef, date, memo, amount, debit, credit]] of journals.entries()) {
  const draft = await post("journals/drafts", {
    company: "DEFAULT",
    draft: {
      id: randomUUID(),
      revision: 0,
      sourceRef,
      date,
      memo,
      kind: "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines: [line(debit, amount, ""), line(credit, "", amount)],
    },
  });
  if (index < 2) {
    const plan = await post("journals/preview", { company: "DEFAULT", draft });
    await post("journals/confirm", {
      company: "DEFAULT",
      draftId: draft.id,
      revision: draft.revision,
      fingerprint: plan.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    });
  }
}
await post("services", {
  company: "DEFAULT",
  value: {
    code: "SVC-DEMO",
    name: "演示咨询 / Demo consulting",
    group: "DEMO",
    active: true,
    revision: 0,
    dimensions: {},
  },
});
for (const meaning of ["cash", "offset"]) {
  await post("posting-rules", {
    company: "DEFAULT",
    value: {
      code: `DEMO-${meaning.toUpperCase()}`,
      revision: 0,
      active: true,
      direction: "receive",
      meaning,
      objectScope: "all",
      objectCode: "*",
      partyScope: "all",
      partyCode: "*",
      account: meaning === "cash" ? "1000" : "4000",
      dimensions: {},
      from: "2026-01-01",
      to: "2026-12-31",
    },
  });
}
for (const [sourceRef, date, amount] of [
  ["EV-0001", "2026-01-16", "100.00"],
  ["EV-0002", "2026-01-18", "113.00"],
]) {
  const event = {
    id: randomUUID(),
    operation: "cash_service",
    sourceRef,
    date,
    memo: "演示：咨询费 / Demo consulting fee",
    direction: "receive",
    service: "SVC-DEMO",
    party: null,
    currency: "CNY",
    amount,
    dimensions: {},
  };
  const preview = await post("events/preview", { company: "DEFAULT", event });
  await post("events/confirm", {
    company: "DEFAULT",
    event,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
}

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
    const page = state.startsWith("event") ? "events" : "journals";
    const name = state === "events" ? "list" : state === "event-detail" ? "detail" : state;
    const file = `${page}-${name}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    const t = text[language];
    await tab.goto(`${origin}/#/${page}`);
    await tab.locator("main h2").first().waitFor();
    await tab.locator("main table").first().waitFor({ timeout: 10_000 });
    await tab.waitForLoadState("networkidle");
    if (state === "draft" || state === "preview") {
      await tab.getByRole("button", { name: t.edit, exact: true }).click();
      await tab.locator("form").first().waitFor();
      if (state === "preview") {
        await tab.getByRole("button", { name: t.preview, exact: true }).click();
        await tab.locator("dialog[open]").waitFor();
      }
    }
    if (state === "unbalanced") {
      await tab.getByRole("button", { name: t.new, exact: true }).click();
      await tab.getByLabel(t.sourceRef, { exact: true }).fill("JV-0099");
      await tab.getByLabel(t.date, { exact: true }).fill("2026-01-28");
      await tab
        .getByLabel(t.memo, { exact: true })
        .fill(language === "zh" ? "演示：借贷不平" : "Demo: unbalanced");
      const cell = (n, field) => tab.getByLabel(`${t.line} ${n} ${t[field]}`, { exact: true });
      await cell(1, "account").fill("1000");
      await cell(1, "debit").fill("100.00");
      await cell(2, "account").fill("4000");
      await cell(2, "credit").fill("90.00");
      await tab.getByRole("button", { name: t.preview, exact: true }).click();
      await tab.locator("main [role=alert]").first().waitFor();
    }
    if (state === "event-detail") {
      await tab.getByRole("button", { name: t.view, exact: true }).first().click();
      await tab.locator("main h3").first().waitFor();
      await tab.waitForLoadState("networkidle");
    }
    if (state !== "preview") await tab.evaluate(() => window.scrollTo(0, 0));
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

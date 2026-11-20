// UI-02b 改前 / 改后截图：node design/ui/screenshots/UI-02b/capture.mjs <webDist> <outDir> [after]
// 沿用 UI-01 / UI-02a 的做法：全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内 API 托管 <webDist>，
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。科目表接口全部走真实 API。
// 列表态：打开科目表；编辑态：点“新建科目”，填代码 / 名称并把用途改为控制科目（显示模块说明）。
// 第三个参数为 after 时另截：编辑态校验失败（FastTab 内 role="alert"）与教学关闭图。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动；
// 窄屏（390）下另断言 main 内可见的交互控件高度 ≥ 44px。
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
  zh: { new: "新建科目", code: "科目代码", name: "科目名称", purpose: "用途", contra: "备抵关联原值科目", save: "保存科目" },
  en: { new: "New account", code: "Account code", name: "Account name", purpose: "Purpose", contra: "Contra parent account", save: "Save account" },
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
    "main button, main select, main input:not([type=checkbox]), main label:has(> input[type=checkbox])",
  )) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || el.closest("[hidden]")) continue;
    if (box.height < 43.5) small.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${Math.round(box.height)}`);
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
const shots = ["list", "edit"].flatMap((state) =>
  variants.map(([language, theme, width]) => [state, language, theme, width, true]),
);
if (after)
  shots.push(
    ["edit-error", "zh", "red", 1440, true],
    ["edit-error", "en", "green", 390, true],
    ["list", "zh", "red", 1440, false],
  );

const directory = await mkdtemp(join(tmpdir(), "erp-ui02b-capture-"));
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
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const file = `accounts-${state}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    await tab.goto(`${origin}/#/accounts`);
    await tab.locator("main h2").first().waitFor();
    await tab.locator("main table").first().waitFor({ timeout: 10_000 });
    await tab.waitForLoadState("networkidle");
    if (state !== "list") {
      const t = text[language];
      await tab.getByRole("button", { name: t.new, exact: true }).click();
      await tab.getByLabel(t.code, { exact: true }).fill("1600");
      await tab.getByLabel(t.name, { exact: true }).fill(language === "zh" ? "演示设备" : "Demo equipment");
      if (state === "edit-error") {
        // 对冲科目不存在 → 服务端字段错误（role=alert），用于展示 FastTab 内的错误态。
        await tab.getByLabel(t.contra, { exact: true }).fill("9999");
        await tab.getByRole("button", { name: t.save, exact: true }).click();
        await tab.locator("main [role=alert]").first().waitFor();
      } else {
        await tab.getByLabel(t.purpose, { exact: true }).selectOption("control");
      }
      await tab.locator("form").first().scrollIntoViewIfNeeded();
      await tab.evaluate(() => window.scrollTo(0, 0));
    }
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

// UI-01 改前 / 改后截图：node design/ui/screenshots/UI-01/capture.mjs <webDist> <outDir>
// 用全新临时虚构账套（迁移 + 默认公司初始化，不连 4173、不用 .bak），进程内启动 API 托管 <webDist>，
// 用系统 Chrome（channel=chrome）截图。DPR = 1，整页，PNG 宽 = 视口宽。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内；并检查偏好三个控件可见、可用 Tab 到达。
// 另断言偏好控件点击区域（桌面 36px，窄屏或粗指针 44px，粗指针用 hasTouch 模拟），
// 以及 main 自身不横向滚动（UI-03 发票页例外，仅记录）。
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createSqliteStorage } from "../../../../packages/infra/src/storage/index.ts";
import { SqliteExecutor } from "../../../../packages/infra/src/workers/executor.ts";
import { createApi } from "../../../../packages/infra/src/http/index.ts";

const [webRoot, outDir] = process.argv.slice(2).map((p) => resolve(p));
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir>");

const pages = [
  ["overview", ""],
  ["trade-invoices", "trade-invoices"],
  ["trade-reports", "trade-reports"],
];
const variants = [
  ["zh", "red", 1440, false],
  ["zh", "red", 390, false],
  ["en", "green", 1440, false],
  ["en", "green", 390, false],
];
// [page, path, language, theme, width, teaching, coarse pointer]
const extra = [
  ["overview", "", "zh", "red", 1440, true, false],
  ["overview", "", "zh", "red", 1440, false, true],
];
// UI-03 例外：发票行表格尚无自身滚动容器，暂由 main 横向滚动（见 design/tasks/UI-03-trade-invoices.md）。
const mainScrollException = new Set(["trade-invoices"]);

function hitAreas() {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  };
  const checkbox = document.getElementById("workspace-teaching");
  return {
    coarse: matchMedia("(pointer: coarse)").matches,
    "workspace-language": box(document.getElementById("workspace-language")),
    "workspace-theme": box(document.getElementById("workspace-theme")),
    // The wrapping label is the click target of the checkbox.
    "workspace-teaching": box(checkbox.closest("label") ?? checkbox),
  };
}

function mainScroll() {
  const main = document.querySelector("main");
  const scrollers = [...main.querySelectorAll("*")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))
    .map((el) => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}/${el.clientWidth}`);
  return { main: [main.scrollWidth, main.clientWidth], scrollers };
}

function overflowReport() {
  const vw = document.documentElement.clientWidth;
  const escaped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.getBoundingClientRect().right <= vw + 0.5) continue;
    let a = el.parentElement;
    let contained = false;
    while (a && a !== document.body) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) {
        contained = a.getBoundingClientRect().right <= vw + 0.5;
        break;
      }
      a = a.parentElement;
    }
    if (!contained) escaped.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`);
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, escaped: escaped.slice(0, 5) };
}

const directory = await mkdtemp(join(tmpdir(), "erp-ui01-capture-"));
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
  const shots = [
    ...pages.flatMap(([name, path]) =>
      variants.map(([language, theme, width, teaching]) => [name, path, language, theme, width, teaching, false]),
    ),
    ...extra,
  ];
  for (const [name, path, language, theme, width, teaching, coarse] of shots) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: coarse,
    });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    const tab = await context.newPage();
    await tab.clock.setFixedTime(new Date("2026-01-20T12:00:00Z"));
    await tab.goto(`${origin}/#/${path}`);
    await tab.locator("main h2").first().waitFor();
    await tab.waitForLoadState("networkidle");
    await tab.evaluate(() => document.fonts.ready);
    const report = await tab.evaluate(overflowReport);
    const hits = await tab.evaluate(hitAreas);
    const scroll = await tab.evaluate(mainScroll);
    // design/ui §7: 36px on desktop, 44px on narrow screens or coarse pointers.
    const minTarget = width <= 760 || hits.coarse ? 44 : 36;
    const smallTargets = ["workspace-language", "workspace-theme", "workspace-teaching"].filter(
      (id) => hits[id][1] < minTarget || (id === "workspace-teaching" && hits[id][0] < minTarget),
    );
    const mainOk = scroll.main[0] <= scroll.main[1] || mainScrollException.has(name);
    // Preferences must be visible and reachable by real Tab presses from the document start.
    const reach = {};
    for (const id of ["workspace-language", "workspace-theme", "workspace-teaching"]) {
      const visible = await tab.locator(`#${id}`).isVisible();
      await tab.evaluate(() => {
        document.activeElement?.blur?.();
        window.scrollTo(0, 0);
      });
      let presses = 0;
      while (presses < 40 && !(await tab.evaluate((i) => document.activeElement?.id === i, id))) {
        await tab.keyboard.press("Tab");
        presses++;
      }
      reach[id] = visible && presses < 40 ? presses : -1;
    }
    await tab.evaluate(() => {
      document.activeElement?.blur?.();
      window.scrollTo(0, 0);
    });
    const file = `${name}-${language}-${theme}-${width}${teaching ? "-teaching" : ""}${coarse ? "-coarse" : ""}.png`;
    await tab.screenshot({ path: join(outDir, file), fullPage: true });
    const size = await tab.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]);
    const ok =
      report.vw === width &&
      report.scrollWidth <= width &&
      report.escaped.length === 0 &&
      (!coarse || hits.coarse) &&
      smallTargets.length === 0 &&
      mainOk &&
      Object.values(reach).every((n) => n >= 0);
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${file} viewport ${width} page ${size[0]}x${size[1]} tabs ${JSON.stringify(reach)} targets ${JSON.stringify(hits)} main ${scroll.main.join("/")}${scroll.scrollers.length ? ` scrollers: ${scroll.scrollers.join(", ")}` : ""}${smallTargets.length ? ` small: ${smallTargets.join(", ")}` : ""}${report.escaped.length ? ` escaped: ${report.escaped.join(", ")}` : ""}`,
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
  console.error(`${failed} screenshot(s) failed the width / preference checks`);
  process.exitCode = 1;
}

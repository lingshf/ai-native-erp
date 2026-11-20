// UI-07d 复审：共享组件 chunk 延迟 / 失败时的稳定性，真实 Chrome（channel=chrome）。
// node design/ui/screenshots/UI-07d/stability.mjs <webDist> <outDir>
// delay：components-*.js/css 延迟 1.5 s，health 网络错误。断言延迟期间 main 内无可见、可操作控件，
//   可访问树（ariaSnapshot）在延迟期间只有 role=status 的加载提示，无标题、无健康状态、无数据警告，且焦点进不去占位内容；
//   加载后标题、状态、警告正常暴露。健康状态 role=status 节点不被替换、其子树只变化一次（加载中 → 结果），「重试连接」出现后聚焦，1 s 后位置与高度不变且 ≥ 44px。
// fail-css / fail-js：阻断 components-*.css 或 .js。断言无未处理拒绝（pageerror / Uncaught），
//   走 labels 的失败提示与「重新加载页面」可见，重试连接 ≥ 44px 且能成功取回状态。
// 宽 390 / 1440 均以粗指针（hasTouch）运行。只用虚构 health 响应，不连 4173、不用 .bak。
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const [webRoot, outDir] = process.argv.slice(2, 4).map((p) => resolve(p));
if (!webRoot || !outDir) throw new Error("usage: stability.mjs <webDist> <outDir>");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const file = normalize(join(webRoot, path === "/" ? "index.html" : path));
  if (!file.startsWith(webRoot)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const healthy = { service: "ai-native-erp", contractVersion: "1", profile: "local", data: "unconfigured" };

function watchStatus() {
  window.__status = { node: null, batches: 0, replaced: false };
  const attach = () => {
    const node = document.querySelector("main .overview-status");
    if (!node) return false;
    if (window.__status.node && window.__status.node !== node) window.__status.replaced = true;
    if (window.__status.node === node) return true;
    window.__status.node = node;
    new MutationObserver(() => {
      window.__status.batches++;
    }).observe(node, { childList: true, subtree: true, characterData: true });
    return true;
  };
  new MutationObserver(attach).observe(document, { childList: true, subtree: true });
}
const statusInfo = () => ({
  batches: window.__status.batches,
  replaced:
    window.__status.replaced || window.__status.node !== document.querySelector("main .overview-status"),
});
function operable() {
  return [...document.querySelectorAll("main button, main a[href], main input, main select")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.pointerEvents !== "none" && Number(style.opacity) > 0;
    })
    .map((el) => el.textContent.trim());
}

const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
const check = (ok, text) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${text}`);
};
try {
  for (const [language, theme, width] of [
    ["zh", "red", 390],
    ["zh", "red", 1440],
    ["en", "green", 390],
    ["en", "green", 1440],
  ]) {
    for (const mode of ["delay", "fail-css", "fail-js"]) {
      const name = `${mode}-${language}-${theme}-${width}`;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: true,
      });
      await context.addInitScript((value) => {
        window.localStorage.setItem("erp.workspace.preferences.v1", value);
      }, JSON.stringify({ language, theme, teaching: true }));
      await context.addInitScript(watchStatus);
      let healthOk = false;
      await context.route("**/api/v1/health", (route) =>
        healthOk
          ? route.fulfill({ contentType: "application/json", body: JSON.stringify(healthy) })
          : route.abort("failed"),
      );
      await context.route(/\/assets\/components-[^/]+\.(js|css)$/, async (route) => {
        const kind = route.request().url().endsWith(".css") ? "css" : "js";
        if (mode === `fail-${kind}`) return route.abort("failed");
        if (mode === "delay") await new Promise((done) => setTimeout(done, 1500));
        return route.continue();
      });
      const tab = await context.newPage();
      const errors = [];
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("console", (message) => {
        if (message.type() === "error" && /Uncaught|Unhandled|preload/i.test(message.text()))
          errors.push(`console: ${message.text()}`);
      });
      await tab.goto(`${origin}/#/`);
      const coarse = await tab.evaluate(() => matchMedia("(pointer: coarse)").matches);
      const retry = tab.getByRole("button", { name: language === "zh" ? "重试连接" : "Retry connection" });
      if (mode === "delay") {
        await tab.waitForTimeout(700);
        const early = await tab.evaluate(operable);
        const note = await tab.locator(".overview-pending-note").isVisible();
        check(early.length === 0 && note, `${name} pending: note visible, operable in main = [${early}]`);
        const loading = language === "zh" ? "正在加载界面组件…" : "Loading interface components…";
        const title = language === "zh" ? "运行状态" : "Runtime status";
        const pendingTree = await tab.locator("main").ariaSnapshot();
        const pendingLines = pendingTree.split("\n").filter((line) => line.trim() && line.trim() !== "- main:");
        await tab.keyboard.press("Tab");
        await tab.keyboard.press("Tab");
        const focusInContent = await tab.evaluate(() => !!document.activeElement?.closest(".overview-content"));
        check(
          pendingLines.length === 1 &&
            pendingLines[0].includes(`status: ${loading}`) &&
            !focusInContent,
          `${name} pending a11y tree = ${JSON.stringify(pendingLines)} focusInContent=${focusInContent}`,
        );
        await retry.waitFor({ timeout: 10_000 });
        const readyTree = await tab.locator("main").ariaSnapshot();
        check(
          readyTree.includes(`heading "${title}"`) &&
            /status:/.test(readyTree) &&
            /region "/.test(readyTree) &&
            !readyTree.includes(loading),
          `${name} ready a11y tree exposes heading/status/warning region:\n${readyTree}`,
        );
        await retry.focus();
        const first = await retry.boundingBox();
        await tab.waitForLoadState("networkidle");
        await tab.waitForTimeout(1000);
        const later = await retry.boundingBox();
        const focused = await retry.evaluate((el) => el === document.activeElement);
        const status = await tab.evaluate(statusInfo);
        check(
          focused &&
            first.y === later.y &&
            first.x === later.x &&
            first.height === later.height &&
            later.height >= 44 &&
            !status.replaced &&
            status.batches === 1,
          `${name} coarse=${coarse} retry y ${first.y}→${later.y} h ${first.height}→${later.height} focused=${focused} status replaced=${status.replaced} batches=${status.batches}`,
        );
      } else {
        const alert = tab.getByRole("alert").filter({ hasText: language === "zh" ? "界面组件加载失败" : "failed to load" });
        await alert.waitFor({ timeout: 10_000 });
        await retry.waitFor();
        const reload = await tab.getByRole("button", { name: language === "zh" ? "重新加载页面" : "Reload page" }).boundingBox();
        const box = await retry.boundingBox();
        await tab.screenshot({ path: join(outDir, `overview-${name}.png`), fullPage: true });
        healthOk = true;
        await retry.click();
        const connected = await tab
          .getByText(language === "zh" ? "本地 API 已连接" : "Local API connected")
          .waitFor({ timeout: 5000 })
          .then(() => true, () => false);
        const overflow = await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        await tab.waitForTimeout(300);
        check(
          errors.length === 0 && box.height >= 44 && reload.height >= 44 && connected && overflow,
          `${name} coarse=${coarse} retry h ${box.height} reload h ${reload.height} reconnected=${connected} no-overflow=${overflow} errors=[${errors.join(" | ")}]`,
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exitCode = 1;
}

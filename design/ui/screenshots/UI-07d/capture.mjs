// UI-07d 改前 / 改后截图：node design/ui/screenshots/UI-07d/capture.mjs <webDist> <outDir> [after]
// 只读的运行状态页不需要账套：本地静态服务托管 <webDist>，/api/v1/health 由 page.route 返回虚构响应
// （已连接 = data configured，未配置 = data unconfigured，网络错误 = 请求中止），不连 4173、不用 .bak。
// 系统 Chrome（channel=chrome），DPR = 1，整页，PNG 宽 = 视口宽。
// 每张断言：scrollWidth ≤ 视口宽、溢出元素只在自身滚动容器内、main 自身不横向滚动；
// 390 宽另列出 main 内高度 < 44px 的交互目标（after 要求为空）。
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const [webRoot, outDir] = process.argv.slice(2, 4).map((p) => resolve(p));
const after = process.argv[4] === "after";
if (!webRoot || !outDir) throw new Error("usage: capture.mjs <webDist> <outDir> [after]");

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

const health = (data) => ({ service: "ai-native-erp", contractVersion: "1", profile: "local", data });
// [name, health body (null = network error), selector that marks the settled state]
const states = [
  ["connected", health("configured"), "dl"],
  ["unconfigured", health("unconfigured"), "dl"],
  ["network-error", null, "button"],
];
const variants = [
  ["zh", "red", 1440],
  ["zh", "red", 390],
  ["en", "green", 1440],
  ["en", "green", 390],
];
const shots = states.flatMap((state) =>
  variants.map(([language, theme, width]) => [...state, language, theme, width, true]),
);
shots.push(
  [...states[1], "zh", "red", 1440, false],
  [...states[2], "en", "green", 390, false],
);

const browser = await chromium.launch({ channel: "chrome" });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const [name, body, ready, language, theme, width, teaching] of shots) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript((value) => {
      window.localStorage.setItem("erp.workspace.preferences.v1", value);
    }, JSON.stringify({ language, theme, teaching }));
    await context.route("**/api/v1/health", (route) =>
      body === null
        ? route.abort("failed")
        : route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }),
    );
    const file = `overview-${name}-${language}-${theme}-${width}${teaching ? "" : "-teaching-off"}.png`;
    const tab = await context.newPage();
    await tab.goto(`${origin}/#/`);
    await tab.locator(`main ${ready}`).first().waitFor({ timeout: 10_000 });
    await tab.waitForLoadState("networkidle");
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
  server.close();
}
if (failed) {
  console.error(`${failed} screenshot(s) failed the width/target checks`);
  process.exitCode = 1;
}

// Demo v0.5.0 截图脚本：用系统 Chrome 走真实页面，演示 S5 的用户可见变化（#112 迁移核对页键值表、#117 订单保存后焦点、#123 凭证查看焦点）。
// 用法：node docs/demo/v0.5.0/scripts/capture.mjs <模式> <地址> <输出目录>
//   模式 main：订单保存（焦点）、凭证查看（焦点），连接 seed 后的演示账套
//   模式 migration：迁移核对页，连接导入后的目标库
// 每张截图前断言语言、主题、宽度、教学开关、scrollY（见 docs/demo/TEMPLATE.md）。
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const [mode, base, out] = process.argv.slice(2);
if (!["main", "migration"].includes(mode) || !base || !out) throw new Error("usage: capture.mjs <main|migration> <address> <outDir>");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const combos = [
  ["zh", "red", 1440, "PO-S5-A"],
  ["zh", "red", 390, "PO-S5-B"],
  ["en", "green", 1440, "PO-S5-C"],
  ["en", "green", 390, "PO-S5-D"],
];
const text = {
  zh: { order: ["订单号", "伙伴", "商品", "税码", "数量", "单价"], save: "保存订单", view: "查看", newJournal: "新建凭证" },
  en: { order: ["Order number", "Partner", "Product", "Tax code", "Quantity", "Unit price"], save: "Save order", view: "View", newJournal: "New journal" },
};

async function assertState(page, want) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const got = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    teaching: document.querySelector("#workspace-teaching")?.checked,
    scrollY: window.scrollY,
  }));
  const wanted = { scrollY: 0, ...want };
  const bad = Object.entries(wanted).filter(([key, value]) => got[key] !== value);
  if (bad.length > 0) throw new Error("截图状态与文件名不符：" + JSON.stringify({ wanted, got }));
}
async function open(context, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} @ ${page.url()}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  await page.goto(`${base}/#/${path}`);
  await page.locator("main h2").first().waitFor();
  await page.waitForLoadState("networkidle");
  page.errors = errors;
  return page;
}
const describeActive = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, id: el?.id || null, role: el?.getAttribute("role"), text: (el?.textContent ?? "").trim().slice(0, 40) };
  });
async function shot(page, name, want) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await assertState(page, want);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  log.push({ name, overflowPx: overflow });
}

for (const [lang, theme, width, orderId] of combos) {
  const tag = `${lang}-${theme}-${width}`;
  const want = { lang, theme, width, teaching: true };
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(
    (value) => window.localStorage.setItem("erp.workspace.preferences.v1", value),
    JSON.stringify({ language: lang, theme, teaching: true }),
  );
  const t = text[lang];
  if (mode === "main") {
    // #117：保存订单后，焦点落在“已保存”提示上（只记录最终 DOM 焦点，不测读屏播报）
    let page = await open(context, "trade-orders");
    await page.locator("#tord-orderId").fill(orderId);
    await page.locator("#tord-party").fill("PARTY");
    const line = (label, role = "textbox") => page.getByRole(role, { name: `${label} L1`, exact: true });
    await line(t.order[2], "combobox").fill("EXPENSE");
    await line(t.order[3], "combobox").fill("VAT");
    await line(t.order[4]).fill("10");
    await line(t.order[5]).fill("10");
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/trade/orders" && r.request().method() === "POST");
    await page.getByRole("button", { name: t.save, exact: true }).click();
    const response = await saved;
    await page.getByRole("status").first().waitFor();
    const active = await describeActive(page);
    const noticeFocused = await page.evaluate(() => document.activeElement?.classList.contains("tord-saved") ?? false);
    log.push({ page: "orders-focus", tag, order: orderId, status: response.status(), active, noticeFocused });
    await shot(page, `trade-orders-saved-focus-${tag}`, want);
    log.push({ page: "orders", errors: page.errors });

    // #123：凭证页两条路径，只记录最终 DOM 焦点落在哪里（不测时序、不测读屏播报）
    // (a) 点“查看”已过账凭证：忙碌结束后，焦点应回到刚点的那个按钮，而不是留在 body
    page = await open(context, "journals");
    await page.locator(".jv-status select").selectOption("posted");
    await page.getByRole("row").nth(1).waitFor();
    const viewButton = page.getByRole("button", { name: t.view }).first();
    const viewLabel = await viewButton.getAttribute("aria-label");
    await viewButton.click();
    await page.waitForTimeout(500);
    const viewActive = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    log.push({ page: "journal-view-focus", tag, clicked: viewLabel, activeAriaLabel: viewActive, returnedToButton: viewActive === viewLabel });
    await shot(page, `journals-view-${tag}`, want);
    // (b) 点“新建凭证”：打开草稿编辑器，焦点应落在表单第一个输入框
    await page.getByRole("button", { name: t.newJournal, exact: true }).click();
    await page.waitForTimeout(500);
    const draftActive = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName, insideForm: Boolean(el?.closest("form")), label: el?.getAttribute("aria-label") ?? el?.id ?? null };
    });
    log.push({ page: "journal-new-focus", tag, active: draftActive });
    await shot(page, `journals-new-draft-${tag}`, want);
    log.push({ page: "journals", errors: page.errors });
  } else {
    // #112：展开所有核对详情，量表格容器与页面溢出
    const page = await open(context, "migration");
    for (const summary of await page.locator("main details > summary:visible").all()) await summary.click().catch(() => {});
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(() => {
      const wraps = [...document.querySelectorAll(".migration-page .grid-wrap:has(.kv)")].filter((el) => el.getClientRects().length > 0);
      return {
        visibleKvTables: wraps.length,
        wraps: wraps.slice(0, 6).map((wrap) => {
          const details = wrap.closest("details")?.getBoundingClientRect();
          const box = wrap.getBoundingClientRect();
          return {
            clientWidth: wrap.clientWidth,
            scrollWidth: wrap.scrollWidth,
            rightOverDetails: details ? Math.round(box.right - details.right) : null,
          };
        }),
        pageOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    log.push({ page: "migration-kv", tag, ...metrics });
    // 截图只留第一张键值表所在的详情展开，其余折叠，避免整页过长
    await page.evaluate(() => {
      const open = [...document.querySelectorAll("main details")];
      const first = open.find((d) => d.querySelector(".grid-wrap .kv"));
      for (const d of open) d.open = d === first || d.contains(first);
    });
    await page.waitForTimeout(300);
    await shot(page, `migration-${tag}`, want);
    log.push({ page: "migration", errors: page.errors });
  }
  await context.close();
}
await browser.close();
await writeFile(join(out, `capture-log-${mode}.json`), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.filter((l) => (l.overflowPx !== undefined && l.overflowPx > 0) || l.errors?.length)));
console.log("shots", log.filter((l) => l.name).length);

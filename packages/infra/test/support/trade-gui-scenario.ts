import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { build } from "vite";
import { MasterDataService } from "@erp/core/application";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { SqliteExecutor } from "../../src/workers/executor.ts";
import { createApi, type LocalApi } from "../../src/http/index.ts";
import { label } from "../../../web/src/ui/index.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const artifacts = resolve(process.env.ERP_E2E_ARTIFACTS ?? join(root, "artifacts/ci/trade-e2e"));

// All user interaction uses real Tab/Shift+Tab and keyboard events, never focus(), fill(),
// selectOption() or click(). Inspecting the DOM only identifies the next keyboard stop.
export async function tabTo(page: Page, target: Locator) {
  await target.waitFor({ state: "visible" });
  let handle = await target.elementHandle();
  // Keep the direction across document wrap, where activeElement briefly leaves the tab stops.
  let direction: "Tab" | "Shift+Tab" | undefined;
  try {
    for (let count = 0; count < 220; count++) {
      if (!handle) throw new Error("Keyboard target disappeared");
      const key = await handle.evaluate((element, direction) => {
        if (!element.isConnected) return "detached";
        if (element === document.activeElement && document.hasFocus()) return null;
        if (direction) return direction;
        const stops = [
          ...document.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, [tabindex]",
          ),
        ].filter(
          (stop) =>
            stop.tabIndex >= 0 &&
            !stop.matches(":disabled") &&
            !stop.closest("[inert]") &&
            stop.getClientRects().length > 0 &&
            getComputedStyle(stop).visibility !== "hidden",
        );
        const current = stops.indexOf(document.activeElement as HTMLElement);
        const destination = stops.indexOf(element as HTMLElement);
        if (current < 0 || !document.hasFocus()) return "probe";
        if (destination < 0) return "Tab";
        const forward = (destination - current + stops.length) % stops.length;
        const backward = (current - destination + stops.length) % stops.length;
        return backward < forward ? "Shift+Tab" : "Tab";
      }, direction);
      if (key === null) return;
      if (key === "detached") {
        await handle.dispose();
        handle = await target.elementHandle();
      } else if (key === "probe") {
        // Establish a real tab stop before committing to a traversal direction.
        await page.keyboard.press("Tab");
      } else {
        direction ??= key;
        await page.keyboard.press(direction);
      }
    }
    throw new Error(
      `Not keyboard reachable: ${await target.evaluate((element) => element.outerHTML)}`,
    );
  } finally {
    await handle?.dispose();
  }
}
async function type(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
  await page.keyboard.press("Tab");
}
async function choose(page: Page, target: Locator, value: string) {
  await expect
    .poll(
      () =>
        target
          .locator("option")
          .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
      { message: `Missing keyboard-selectable option: ${value}`, timeout: 10_000 },
    )
    .toContain(value);
  const index = await target
    .locator("option")
    .evaluateAll(
      (options, value) =>
        options.findIndex((option) => (option as HTMLOptionElement).value === value),
      value,
    );
  expect(index).toBeGreaterThanOrEqual(0);
  await tabTo(page, target);
  await page.keyboard.press("Home");
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
}
async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}
async function checked(page: Page, target: Locator) {
  await tabTo(page, target);
  if (!(await target.isChecked())) await page.keyboard.press("Space");
}

export function tradeGuiScenario(
  language: "zh" | "en",
  theme: "red" | "green",
  includeKeyboardRegression = false,
) {
  let directory: string;
  let webRoot: string;
  let browser: Browser;
  function phase(name: string, started: number) {
    console.info(
      JSON.stringify({
        event: "trade-gui-phase",
        scenario: `${language}/${theme}`,
        phase: name,
        ms: Math.round(performance.now() - started),
      }),
    );
  }
  beforeAll(async () => {
    let started = performance.now();
    directory = await mkdtemp(join(tmpdir(), "erp-trade-gui-"));
    webRoot = join(directory, "web");
    await mkdir(artifacts, { recursive: true });
    await build({
      root: join(root, "packages/web"),
      configFile: join(root, "packages/web/vite.config.ts"),
      logLevel: "error",
      build: { outDir: webRoot },
    });
    phase("build", started);
    started = performance.now();
    browser = await chromium.launch({
      headless: true,
      channel: process.env.ERP_E2E_BROWSER_CHANNEL,
    });
    phase("browser", started);
  }, 60_000);
  afterAll(async () => {
    const started = performance.now();
    try {
      await browser?.close();
      phase("browser-close", started);
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });

  test(`real trade GUI: ${language}/${theme}, keyboard main path and safe confirmation branches`, async ({
    onTestFinished,
  }) => {
    let started = performance.now();
    const name = `${language}-${theme}`;
    const filename = join(directory, `${name}.sqlite`);
    const storage = createSqliteStorage({ filename });
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    const store = createMasterDataStore({ filename });
    try {
      const master = new MasterDataService(store);
      await master.initialize(2026);
      // Only prerequisite GL accounts are provisioned; trade configuration and all
      // financial commands below go through the rendered application.
      for (const [code, category, reportGroup, controlModule] of [
        ["2100", "LIABILITY", "payables", "AP"],
        ["1250", "ASSET", "prepayments", "AP"],
        ["1300", "ASSET", "receivables", "AR"],
        ["2300", "LIABILITY", "otherLiabilities", "AR"],
        ["1400", "ASSET", "otherAssets", "TAX"],
        ["2200", "LIABILITY", "taxLiabilities", "TAX"],
      ] as const)
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
    phase("database", started);
    let executor: SqliteExecutor | undefined;
    let api: LocalApi | undefined;
    let context: BrowserContext | undefined;
    onTestFinished(async () => {
      const started = performance.now();
      try {
        // Explicit context close also disposes the Node request pool used by route.fetch().
        await context?.close();
      } finally {
        try {
          await api?.close();
        } finally {
          await executor?.close();
        }
      }
      phase("resources", started);
    });
    started = performance.now();
    executor = await SqliteExecutor.create({ filename });
    api = await createApi({
      ...executor.services(),
      webRoot,
      allowPortZero: true,
      environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
    });
    phase("api", started);
    started = performance.now();
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    phase("context", started);
    started = performance.now();
    // Keep explicit PNGs and key/network/source evidence without a continuous screencast.
    await context.tracing.start({ screenshots: false, snapshots: false, sources: true });
    phase("tracing", started);
    started = performance.now();
    const page = await context.newPage();
    phase("page", started);
    const interactionStarted = performance.now();
    const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
      label(language, key);
    const button = (key: Parameters<typeof t>[0]) =>
      page.getByRole("button", { name: t(key), exact: true });
    const address = await api.listen();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.clock.setFixedTime(new Date("2026-01-20T12:00:00Z"));
    // Observe actual persistence and byte-for-byte readback before any confirmation.
    // The failure switch exercises denied storage without mocking financial responses.
    await page.addInitScript(() => {
      const write = Storage.prototype.setItem;
      const read = Storage.prototype.getItem;
      const writes = new Map<string, string>();
      const verified = new Map<string, string>();
      Object.defineProperty(window, "__tradeReadbacks", { value: verified });
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("erp.trade") && Reflect.get(window, "__denyTradeStorage"))
          throw new DOMException("Test: denied session storage", "QuotaExceededError");
        if (writes.get(key) !== value) verified.delete(key);
        write.call(this, key, value);
        writes.set(key, value);
      };
      Storage.prototype.getItem = function (key) {
        const value = read.call(this, key);
        if (value !== null && writes.get(key) === value) verified.set(key, value);
        return value;
      };
    });
    const envelopes: string[] = [];
    let loseNextResult = false;
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (
        request.method() === "POST" &&
        ["/api/v1/trade/invoices", "/api/v1/trade/settlements", "/api/v1/trade/actions"].includes(
          path,
        )
      ) {
        const body = request.postDataJSON();
        const verified = await page.evaluate(() => [
          ...(Reflect.get(window, "__tradeReadbacks") as Map<string, string>).values(),
        ]);
        if (
          !verified.some((raw) => {
            const pending = JSON.parse(raw).pending;
            return (
              pending &&
              JSON.stringify(pending.command) === JSON.stringify(body.command) &&
              pending.fingerprint === body.fingerprint &&
              (pending.idempotencyKey ?? pending.key) === body.idempotencyKey
            );
          })
        )
          failures.push(`Missing durable confirmation readback: ${path}`);
        if (body.confirmation !== "POST") failures.push(`Missing explicit confirmation: ${path}`);
        envelopes.push(request.postData() ?? "");
        if (loseNextResult) {
          loseNextResult = false;
          const persisted = await route.fetch();
          if (persisted.status() !== 201)
            failures.push(`Lost-result setup failed: ${persisted.status()}`);
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    async function post(key: Parameters<typeof t>[0], path: string) {
      const pending = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path && response.request().method() === "POST",
      );
      await activate(page, button(key));
      const response = await pending;
      const body = await response.json();
      expect(response.status(), JSON.stringify(body)).toBeLessThan(300);
      expect(failures).toEqual([]);
      return body;
    }
    async function navigate(path: string) {
      await expect
        .poll(
          () =>
            page.locator('main fieldset:disabled, main select[id$="-company"]:disabled').count(),
          {
            message: "Financial operation must finish before keyboard navigation",
            timeout: 10_000,
          },
        )
        .toBe(0);
      await activate(page, page.locator(`nav a[href="#/${path}"]`));
      await page.waitForURL((url) => url.hash === `#/${path}`);
      await page.locator("main h2").waitFor();
    }
    async function config(kind: string, code: string, fields: Record<string, string>) {
      await choose(page, page.locator("#trade-kind"), kind);
      await activate(page, button("trade.new"));
      await type(page, page.locator("#trade-code"), code);
      await type(page, page.locator("#trade-name"), `Fictional ${code}`);
      for (const [field, value] of Object.entries(fields)) {
        const target = page.locator(`#trade-${field}`);
        if (await target.evaluate((element) => element.tagName === "SELECT"))
          await choose(page, target, value);
        else await type(page, target, value);
      }
      await post("dim.save", `/api/v1/trade/${kind}`);
      await page.locator("#trade-code").waitFor({ state: "detached" });
    }
    async function invoice(side: "AP" | "AR", external: string, matched = false) {
      await navigate("trade-invoices");
      await choose(page, page.locator("#tinv-side"), side);
      await type(page, page.locator("#tinv-party"), "PARTY");
      await type(page, page.locator("#tinv-externalInvoice"), external);
      if (matched) await type(page, page.locator("#tinv-orderId"), "PO-DEMO");
      await type(
        page,
        page.getByRole("textbox", { name: `${t("tinv.product")} L1`, exact: true }),
        side === "AP" ? "EXPENSE" : "SERVICE",
      );
      await type(
        page,
        page.getByRole("textbox", { name: `${t("tinv.taxCode")} L1`, exact: true }),
        "VAT",
      );
      await type(
        page,
        page.getByRole("textbox", { name: `${t("tinv.quantity")} L1`, exact: true }),
        "10",
      );
      await type(
        page,
        page.getByRole("textbox", { name: `${t("tinv.unitPrice")} L1`, exact: true }),
        "10",
      );
      if (matched)
        await type(
          page,
          page.getByRole("textbox", { name: `${t("tinv.orderLineId")} L1`, exact: true }),
          "OL1",
        );
      const preview = await post("tinv.preview", "/api/v1/trade/invoices/preview");
      expect(preview.calculation.gross).toBe(11300);
      expect(preview.poMatch).toBe(matched ? "matched" : "notApplicable");
      // Preference changes must preserve the draft and preview, not post anything.
      const before = envelopes.length;
      await choose(page, page.locator("#workspace-theme"), theme === "red" ? "green" : "red");
      await choose(page, page.locator("#workspace-theme"), theme);
      await choose(page, page.locator("#workspace-language"), language === "zh" ? "en" : "zh");
      await choose(page, page.locator("#workspace-language"), language);
      expect(await page.locator("#tinv-externalInvoice").inputValue()).toBe(external);
      expect(envelopes.length).toBe(before);
      if (matched) {
        await page.evaluate(() => Reflect.set(window, "__denyTradeStorage", true));
        await activate(page, button("tinv.confirm"));
        await page
          .getByRole("alert")
          .filter({ hasText: t("tinv.storageFailed") })
          .waitFor();
        expect(envelopes.length).toBe(before);
        await page.evaluate(() => Reflect.set(window, "__denyTradeStorage", false));
      }
      return await post("tinv.confirm", "/api/v1/trade/invoices");
    }
    async function action(kind: string, fields: Record<string, string> = {}, lostResult = false) {
      await choose(page, page.getByRole("combobox", { name: t("tadj.kind"), exact: true }), kind);
      for (const [key, value] of Object.entries(fields)) {
        const target = page.getByLabel(t(key as Parameters<typeof t>[0]), { exact: true });
        if (await target.evaluate((element) => element.tagName === "SELECT"))
          await choose(page, target, value);
        else await type(page, target, value);
      }
      await post("tinv.preview", "/api/v1/trade/actions/preview");
      if (lostResult) {
        loseNextResult = true;
        await activate(page, button("tadj.confirm"));
        await page
          .getByRole("alert")
          .filter({ hasText: t("tinv.uncertain") })
          .waitFor();
        const result = await post("tinv.retryConfirm", "/api/v1/trade/actions");
        expect(envelopes.at(-1)).toBe(envelopes.at(-2));
        return result;
      }
      return await post("tadj.confirm", "/api/v1/trade/actions");
    }
    try {
      await page.goto(address);
      await choose(page, page.locator("#workspace-language"), language);
      await choose(page, page.locator("#workspace-theme"), theme);
      await navigate("period-close");
      await choose(page, page.locator("#close-month"), "2026-01");
      await checked(page, page.getByLabel(t("trpt.trade"), { exact: true }));
      await checked(page, page.getByLabel(t("trpt.taxModule"), { exact: true }));
      await type(page, page.locator("#trade-period-reason"), "Fictional GUI acceptance");
      const admission = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/v1/periods",
      );
      await activate(page, button("trpt.save"));
      expect((await admission).status()).toBe(200);
      await page
        .getByRole("status")
        .filter({ hasText: t("trpt.saved") })
        .waitFor();
      await navigate("trade");
      await config("tradeTerms", "N30", {});
      await config("taxCode", "VAT", {
        inputAccount: "1400",
        outputAccount: "2200",
        rates: JSON.stringify([
          { id: "STANDARD", from: "2026-01-01", to: "2026-12-31", ratePercent: "13" },
        ]),
      });
      await config("tradeProfile", "PAY", {
        controlAccount: "2100",
        advanceAccount: "1250",
        cashAccount: "1000",
        discountAccount: "4000",
      });
      await config("tradeProfile", "REC", {
        side: "AR",
        controlAccount: "1300",
        advanceAccount: "2300",
        cashAccount: "1000",
        discountAccount: "4000",
      });
      await config("tradeParty", "PARTY", {
        role: "both",
        apProfile: "PAY",
        arProfile: "REC",
        terms: "N30",
        allowedTaxCodes: "VAT",
      });
      await config("tradeProduct", "EXPENSE", { expenseAccount: "5000", allowedTaxCodes: "VAT" });
      await config("tradeProduct", "SERVICE", {
        type: "service",
        revenueAccount: "4000",
        allowedTaxCodes: "VAT",
      });
      // Orders currently have an API, not an order-entry GUI. This explicit prerequisite
      // is the same command documented in README; invoice matching itself is GUI-only.
      const orderResponse = await page.evaluate(async () => {
        const response = await fetch("/api/v1/trade/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            company: "DEFAULT",
            orderId: "PO-DEMO",
            side: "AP",
            party: "PARTY",
            currency: "CNY",
            orderDate: "2026-01-20",
            priceIncludesTax: false,
            rounding: "line",
            lines: [
              {
                lineId: "OL1",
                product: "EXPENSE",
                taxCode: "VAT",
                quantity: "10",
                unitPrice: "10",
                discountPercent: "0",
                taxableCharge: "0",
              },
            ],
          }),
        });
        return { status: response.status, body: await response.json() };
      });
      expect(orderResponse.status, JSON.stringify(orderResponse.body)).toBe(201);
      const ap = await invoice("AP", "AP-DEMO", true);
      await navigate("trade-settlements");
      await type(page, page.locator("#tset-party"), "PARTY");
      await checked(
        page,
        page.getByRole("checkbox", { name: `${t("tset.select")} AP-DEMO`, exact: true }),
      );
      await type(
        page,
        page.getByRole("spinbutton", { name: `${t("tset.amount")} AP-DEMO`, exact: true }),
        "5650",
      );
      await checked(
        page,
        page.getByRole("checkbox", { name: `${t("tset.discount")} AP-DEMO`, exact: true }),
      );
      const payment = await post("tinv.preview", "/api/v1/trade/settlements/preview");
      expect(payment.discount).toBe(75);
      expect(payment.cash).toBe(5575);
      expect(payment.allocations[0].remainingGross).toBe(5650);
      await post("tset.confirm", "/api/v1/trade/settlements");
      await navigate("trade-adjustments");
      const advance = await action("advance", { "tinv.party": "PARTY", "tadj.gross": "2000" });
      await action("apply", {
        "tadj.source": advance.actionId,
        "tadj.target": ap.documentId,
        "tadj.gross": "2000",
      });
      const ar = await invoice("AR", "AR-DEMO");
      await navigate("trade-adjustments");
      const credit = await action(
        "credit",
        { "tadj.source": ar.documentId, "tadj.sourceLine": "L1", "tinv.quantity": "2" },
        true,
      );
      expect(credit.gross).toBe(2260);
      await action("cancel", {
        "tadj.source": credit.actionId,
        "tadj.relatedRevision": "2",
        "tadj.reason": "Fictional correction",
      });
      // An applied invoice cannot be cancelled; a fresh complete invoice can.
      await choose(
        page,
        page.getByRole("combobox", { name: t("tadj.kind"), exact: true }),
        "cancel",
      );
      await choose(page, page.getByLabel(t("tadj.source"), { exact: true }), ap.documentId);
      await type(page, page.getByLabel(t("tadj.relatedRevision"), { exact: true }), "");
      await type(
        page,
        page.getByLabel(t("tadj.reason"), { exact: true }),
        "Fictional dependency check",
      );
      const rejected = page.waitForResponse(
        (response) =>
          response.url().endsWith("/trade/actions/preview") &&
          response.request().method() === "POST",
      );
      await activate(page, button("tinv.preview"));
      expect((await rejected).status()).toBe(400);
      await page.getByRole("alert").waitFor();
      await action("cancel", {
        "tadj.source": ar.documentId,
        "tadj.reason": "Fictional unused sale",
      });
      await navigate("trade-reports");
      // Use the rendered monthly filter and verify the actual returned values, not just text.
      const report = page.waitForResponse(
        (response) =>
          response.url().includes("/trade/reports/open-items?") &&
          response.url().includes("month=2026-01"),
      );
      await tabTo(page, page.locator("#trpt-month"));
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.type("01");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.type("2026");
      await page.keyboard.press("Tab");
      await activate(page, button("trpt.apply"));
      const balances = await (await report).json();
      expect(balances.totals.invoiceGrossMinor).toBe(3650);
      expect(balances.totals.advanceGrossMinor).toBe(0);
      await activate(page, button("trpt.ageing"));
      await page.getByRole("table", { name: t("trpt.ageing"), exact: true }).waitFor();
      expect(balances.totals.notDue).toBe(3650);
      const reconResponse = page.waitForResponse((response) =>
        response.url().includes("/trade/reports/reconciliation?"),
      );
      await activate(page, button("trpt.reconciliation"));
      const reconciliation = await (await reconResponse).json();
      expect(reconciliation.rows.length).toBeGreaterThan(0);
      expect(
        reconciliation.rows.every(
          (row: { tradeDifferenceMinor: number; differenceMinor: number }) =>
            row.tradeDifferenceMinor === 0 && row.differenceMinor === 0,
        ),
      ).toBe(true);
      await page.getByRole("table", { name: t("trpt.reconciliation"), exact: true }).waitFor();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.screenshot({
        path: join(artifacts, `${name}-reconciliation.png`),
        fullPage: true,
      });
      expect(await page.locator(".workspace").getAttribute("data-theme")).toBe(theme);
      expect(await page.locator("html").getAttribute("lang")).toBe(language);
      expect(failures).toEqual([]);
    } finally {
      await page.screenshot({ path: join(artifacts, `${name}-last.png`), fullPage: true });
      await context.tracing.stop({ path: join(artifacts, `${name}-trace.zip`) });
      phase("interaction", interactionStarted);
    }
  }, 180_000);

  if (includeKeyboardRegression) {
    test("chooses the short keyboard path after probing an unknown focus position", async ({
      onTestFinished,
    }) => {
      const page = await browser.newPage();
      onTestFinished(() => page.close());
      await page.setContent(
        Array.from(
          { length: 100 },
          (_, index) => `<button id="stop-${index}">Stop ${index}</button>`,
        ).join(""),
      );
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      const press = vi.spyOn(page.keyboard, "press");
      const target = page.locator("#stop-98");
      await tabTo(page, target);
      expect(
        await target.evaluate(
          (element) => element === document.activeElement && document.hasFocus(),
        ),
      ).toBe(true);
      expect(press.mock.calls.length).toBeLessThanOrEqual(8);
    });
  }
}

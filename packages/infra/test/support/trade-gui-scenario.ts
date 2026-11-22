import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ExpectStatic, afterAll, beforeAll, expect, test } from "vitest";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { build } from "vite";
import { MasterDataService } from "@erp/core/application";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { SqliteExecutor } from "../../src/workers/executor.ts";
import { createApi, type LocalApi } from "../../src/http/index.ts";
import { label, resources } from "../../../web/src/ui/index.ts";
import { orderLabel, type TradeOrderKey } from "../../../web/src/ui/trade-order-labels.ts";
import { formatMinor } from "../../../web/src/reports-data.ts";
import { navigateTitle, targetPageShown, type NavigatePath } from "./navigate-ready.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const artifacts = resolve(process.env.ERP_E2E_ARTIFACTS ?? join(root, "artifacts/ci/trade-e2e"));

// FLAKE-02 diagnostics, off unless ERP_E2E_DIAG=1: one JSON event per line in
// `<artifacts>/flake02-<suite>.jsonl`, written synchronously on passing and failing runs alike
// (Vitest drops a passing run's stdout). They add browser round trips to every poll, so they
// change its sampling rate; when off, `diagnostics()` is undefined and every call site skips
// them (no listeners, no page reads, no file writes). Writing never throws into the test.
export type Diagnostic = (event: string, data?: Record<string, unknown>) => void;
export function diagnostics(suite: string, directory = artifacts): Diagnostic | undefined {
  if (process.env.ERP_E2E_DIAG !== "1") return undefined;
  const file = join(directory, `flake02-${suite}.jsonl`);
  let ready = false;
  return (event, data = {}) => {
    try {
      if (!ready) mkdirSync(directory, { recursive: true });
      ready = true;
      appendFileSync(
        file,
        `${JSON.stringify({
          at: new Date().toISOString(),
          ms: Math.round(performance.now() * 10) / 10,
          pid: process.pid,
          suite,
          event,
          ...data,
        })}\n`,
      );
    } catch {
      // Diagnostics are best effort.
    }
  };
}
// Off: returns run()'s own value, so the caller awaits exactly what main awaited.
export function timed<T>(
  log: Diagnostic | undefined,
  step: string,
  run: () => T,
  data: Record<string, unknown> = {},
): T | Promise<Awaited<T>> {
  return log ? logged(log, step, run, data) : run();
}
async function logged<T>(
  log: Diagnostic,
  step: string,
  run: () => T,
  data: Record<string, unknown>,
) {
  const started = performance.now();
  log("step", { ...data, step, phase: "start" });
  try {
    const result = await run();
    log("step", { ...data, step, phase: "end", duration: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    log("step", {
      ...data,
      step,
      phase: "error",
      duration: Math.round(performance.now() - started),
      error: String(error),
    });
    throw error;
  }
}
// Page state that answers "which page is rendered and what does the select hold" in one round
// trip; `selector` elements are reported with every option, `disabled` and `isConnected`.
async function pageState(page: Page, selector?: string) {
  try {
    return await page.evaluate(
      (selector) => ({
        hash: location.hash,
        h2: [...document.querySelectorAll("main h2")].map((element) => element.textContent),
        status: [...document.querySelectorAll("main [role=status], [role=alert]")].map(
          (element) => element.textContent,
        ),
        selects: selector
          ? [...document.querySelectorAll<HTMLSelectElement>(selector)].map((element) => ({
              disabled: element.disabled,
              value: element.value,
              options: [...element.options].map((option) => option.value),
            }))
          : undefined,
      }),
      selector,
    );
  } catch (error) {
    return { stateError: String(error) };
  }
}
// Requests the period-close select depends on: companies, then periods of the chosen company.
function watchRequests(page: Page, log: Diagnostic, data: Record<string, unknown>) {
  const watched = (url: string) =>
    /^\/api\/v1\/(periods|companies)(\/|$)/u.test(new URL(url).pathname);
  const describe = (request: { method(): string; url(): string }) => {
    const url = new URL(request.url());
    return { ...data, method: request.method(), path: url.pathname + url.search };
  };
  page.on("request", (request) => {
    if (watched(request.url())) log("request", describe(request));
  });
  page.on("response", (response) => {
    if (watched(response.url()))
      log("response", { ...describe(response.request()), status: response.status() });
  });
  page.on("requestfinished", (request) => {
    if (watched(request.url()))
      log("requestfinished", { ...describe(request), timing: request.timing() });
  });
  page.on("requestfailed", (request) => {
    if (watched(request.url()))
      log("requestfailed", { ...describe(request), error: request.failure()?.errorText });
  });
}

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
// Concurrent tests pass their own `expect`: expect.poll needs the current test.
// `observe` only records each polled value list (diagnostics); it never changes the result.
async function choose(
  page: Page,
  target: Locator,
  value: string,
  check: ExpectStatic = expect,
  observe?: (values: string[]) => Promise<void>,
) {
  const read = () =>
    target
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  await check
    .poll(
      observe
        ? async () => {
            const values = await read();
            await observe(values);
            return values;
          }
        : read,
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
  check(index).toBeGreaterThanOrEqual(0);
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

export function guiPhase(scenario: string, name: string, started: number) {
  console.info(
    JSON.stringify({
      event: "trade-gui-phase",
      scenario,
      phase: name,
      ms: Math.round(performance.now() - started),
    }),
  );
}

// `path` keeps the query string; `preview` is the server's full preview response.
type Recorded = { method: string; path: string; body: unknown; preview?: unknown };
const parts = {
  1: "period admission, trade configuration, matched AP invoice and payment",
  2: "advance, AR credit and cancellations, open-item reports, invoicing an order in two steps",
} as const;

// The only values the GUI generates itself (crypto.randomUUID) in the part 1 writes. The replay
// reuses them instead of normalizing anything, so every other field, every ID reference and
// every server-computed preview fingerprint must match the GUI requests exactly.
type GeneratedIds = {
  documentId: string;
  paymentId: string;
  invoiceKey: string;
  settlementKey: string;
};
function generatedIds(recorded: Recorded[]): GeneratedIds {
  const body = (path: string) => {
    const matches = recorded.filter((entry) => entry.method === "POST" && entry.path === path);
    if (matches.length !== 1)
      throw new Error(`Expected one GUI POST ${path}, got ${matches.length}`);
    return matches[0].body as { command: Record<string, unknown>; idempotencyKey: unknown };
  };
  const invoice = body("/api/v1/trade/invoices");
  const settlement = body("/api/v1/trade/settlements");
  const ids = {
    documentId: invoice.command.documentId,
    paymentId: settlement.command.paymentId,
    invoiceKey: invoice.idempotencyKey,
    settlementKey: settlement.idempotencyKey,
  };
  for (const [field, value] of Object.entries(ids))
    if (typeof value !== "string") throw new Error(`GUI request lacks generated ${field}`);
  return ids as GeneratedIds;
}
const freshIds = (): GeneratedIds => ({
  documentId: randomUUID(),
  paymentId: randomUUID(),
  invoiceKey: randomUUID(),
  settlementKey: randomUUID(),
});
// The one server value that cannot repeat: preview fingerprints hash the order's server-side
// `recordedAt` wall-clock time. Each fingerprint must be the one its own preview returned and
// the confirmation right after it must carry exactly that value; only then are the two fields
// (`preview.fingerprint`, `body.fingerprint` of that confirmation) replaced by a shared token.
// Everything else in the preview response is compared as returned.
function linkFingerprints(recorded: Recorded[]) {
  return recorded.map((entry, index) => {
    if (!entry.path.endsWith("/preview")) {
      const previous = recorded[index - 1];
      if (!previous?.path.endsWith("/preview")) return entry;
      const body = entry.body as Record<string, unknown>;
      const fingerprint = (previous.preview as Record<string, unknown> | undefined)?.fingerprint;
      if (
        entry.path !== previous.path.slice(0, -"/preview".length) ||
        body.fingerprint !== fingerprint
      )
        throw new Error(`${entry.path} does not confirm the preceding preview fingerprint`);
      return { ...entry, body: { ...body, fingerprint: `<preview ${index - 1}>` } };
    }
    const preview = entry.preview as Record<string, unknown> | undefined;
    if (typeof preview?.fingerprint !== "string" || !/^[0-9a-f]{64}$/u.test(preview.fingerprint))
      throw new Error(`${entry.path} returned no fingerprint`);
    return { ...entry, preview: { ...preview, fingerprint: `<preview ${index}>` } };
  });
}

const year = { from: "2026-01-01", to: "2026-12-31" };
const trade = (kind: string, code: string, data: Record<string, unknown>): Recorded => ({
  method: "POST",
  path: `/api/v1/trade/${kind}`,
  body: {
    company: "DEFAULT",
    code,
    active: true,
    expectedRevision: 0,
    kind,
    data: { name: `Fictional ${code}`, ...year, ...data },
  },
});
const day = "2026-01-20";
const dates = { currency: "CNY", accountingDate: day, documentDate: day, taxDate: day };
const seedWrites: Recorded[] = [
  {
    method: "PUT",
    path: "/api/v1/periods",
    body: {
      company: "DEFAULT",
      month: "2026-01",
      revision: 1,
      status: "open",
      reason: "Fictional GUI acceptance",
      confirmed: true,
      modules: ["trade", "tax"],
    },
  },
  trade("tradeTerms", "N30", {
    dueDays: 30,
    discountDays: 7,
    discountPercent: "1.5",
    allowPartialDiscount: true,
  }),
  trade("taxCode", "VAT", {
    mode: "ordinary",
    rates: [{ id: "STANDARD", ...year, ratePercent: "13" }],
    deductiblePercent: "100",
    inputAccount: "1400",
    outputAccount: "2200",
  }),
  ...(
    [
      ["PAY", "AP", "2100", "1250"],
      ["REC", "AR", "1300", "2300"],
    ] as const
  ).map(([code, side, controlAccount, advanceAccount]) =>
    trade("tradeProfile", code, {
      side,
      controlAccount,
      advanceAccount,
      cashAccount: "1000",
      discountAccount: "4000",
    }),
  ),
  trade("tradeParty", "PARTY", {
    role: "both",
    apProfile: "PAY",
    arProfile: "REC",
    terms: "N30",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  }),
  ...(
    [
      ["EXPENSE", "expense", "5000", null],
      ["SERVICE", "service", null, "4000"],
    ] as const
  ).map(([code, type, expenseAccount, revenueAccount]) =>
    trade("tradeProduct", code, {
      type,
      expenseAccount,
      revenueAccount,
      allowedTaxCodes: ["VAT"],
      defaultDimensions: {},
    }),
  ),
  {
    method: "POST",
    path: "/api/v1/trade/orders",
    body: {
      company: "DEFAULT",
      orderId: "PO-DEMO",
      side: "AP",
      party: "PARTY",
      currency: "CNY",
      orderDate: day,
      priceIncludesTax: false,
      rounding: "line",
      lines: [
        {
          // The order page numbers lines L1, L2, … itself.
          lineId: "L1",
          product: "EXPENSE",
          taxCode: "VAT",
          quantity: "10",
          unitPrice: "10",
          discountPercent: "0",
          taxableCharge: "0",
        },
      ],
    },
  },
];
const seedInvoice = (documentId: string) => ({
  company: "DEFAULT",
  documentId,
  side: "AP",
  party: "PARTY",
  externalInvoice: "AP-DEMO",
  ...dates,
  orderId: "PO-DEMO",
  priceIncludesTax: false,
  rounding: "line",
  headerDimensions: {},
  matchingException: null,
  lines: [
    {
      lineId: "L1",
      product: "EXPENSE",
      taxCode: "VAT",
      quantity: "10",
      unitPrice: "10",
      discountPercent: "0",
      taxableCharge: "0",
      orderLineId: "L1",
      dimensions: {},
    },
  ],
});
const seedSettlement = (paymentId: string, itemId: string) => ({
  company: "DEFAULT",
  paymentId,
  side: "AP",
  party: "PARTY",
  ...dates,
  items: [{ itemId, revision: 1, gross: 5650, takeDiscount: true }],
});
type Send = (method: string, path: string, body: unknown) => Promise<Record<string, unknown>>;
function httpSend(address: string): Send {
  return async (method, path, body) => {
    const response = await fetch(new URL(path, address), {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(`Seed ${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
    return result;
  };
}
// The longest legal order ID (companyCodeSchema: 60 characters), all wide uppercase letters,
// for the 390 px wrap check.
export const longOrderId = `SO-LONG-REFERENCE-${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(2).slice(0, 42)}`;
// TINV-04: sales orders and AR invoices posted against them, through the real HTTP API. A domain
// rejection fails here at once (httpSend throws on any non-2xx), not later as a missing row.
export async function seedSourceOrders(send: Send) {
  for (const [orderId, externalInvoice] of [
    ["SO-DEMO", "AR-FROM-SO"],
    [longOrderId, "AR-LONG-SO"],
  ] as const)
    await seedSourceOrder(send, orderId, externalInvoice);
}
async function seedSourceOrder(send: Send, orderId: string, externalInvoice: string) {
  const line = seedInvoice("").lines[0];
  await send("POST", "/api/v1/trade/orders", {
    company: "DEFAULT",
    orderId,
    side: "AR",
    party: "PARTY",
    currency: "CNY",
    orderDate: day,
    priceIncludesTax: false,
    rounding: "line",
    lines: [{ ...line, product: "SERVICE" }].map(
      ({ orderLineId: _, dimensions: __, ...rest }) => rest,
    ),
  });
  const sale = {
    ...seedInvoice(randomUUID()),
    side: "AR",
    externalInvoice,
    orderId,
    lines: [{ ...line, product: "SERVICE" }],
  };
  const preview = await send("POST", "/api/v1/trade/invoices/preview", sale);
  if (typeof preview.fingerprint !== "string")
    throw new Error(`No ${externalInvoice} preview fingerprint`);
  const receipt = await send("POST", "/api/v1/trade/invoices", {
    command: sale,
    fingerprint: preview.fingerprint,
    idempotencyKey: randomUUID(),
    confirmation: "POST",
  });
  if (receipt.fingerprint !== preview.fingerprint)
    throw new Error(`${externalInvoice} confirmed ${String(receipt.fingerprint)}`);
}
// Part 2 starts from the exact state part 1 creates through the GUI. The same commands are
// replayed through the real HTTP API (preview, then explicit confirmation with the fingerprint
// that preview returned). Part 1 replays them against a second fresh server with the GUI's own
// generated IDs and asserts the requests and preview fingerprints equal the GUI's exactly.
async function seedPartOne(transport: Send, ids: GeneratedIds) {
  const recorded: Recorded[] = [];
  async function send(method: string, path: string, body: unknown) {
    const entry: Recorded = { method, path, body };
    recorded.push(entry);
    const result = await transport(method, path, body);
    if (path.endsWith("/preview")) entry.preview = result;
    return result;
  }
  async function confirm(path: string, command: unknown, idempotencyKey: string) {
    const preview = await send("POST", `${path}/preview`, command);
    if (typeof preview.fingerprint !== "string") throw new Error(`No preview fingerprint: ${path}`);
    const receipt = await send("POST", path, {
      command,
      fingerprint: preview.fingerprint,
      idempotencyKey,
      confirmation: "POST",
    });
    if (receipt.fingerprint !== preview.fingerprint)
      throw new Error(`Replay ${path} confirmed ${String(receipt.fingerprint)}`);
  }
  for (const write of seedWrites) await send(write.method, write.path, write.body);
  await confirm("/api/v1/trade/invoices", seedInvoice(ids.documentId), ids.invoiceKey);
  await confirm(
    "/api/v1/trade/settlements",
    seedSettlement(ids.paymentId, ids.documentId),
    ids.settlementKey,
  );
  return { ap: { documentId: ids.documentId }, recorded };
}

type Phase = (name: string, started: number) => void;
type Server = { executor: SqliteExecutor; api?: LocalApi };

// One Vite build and one Chrome per file. Chrome starts while Vite builds and the test
// provisions its database and API; all of it still runs inside the Vitest Duration.
function guiHarness(phase: Phase, log: Diagnostic | undefined) {
  const harness = {
    directory: "",
    webRoot: "",
    browser: undefined as Browser | undefined,
    launching: undefined as unknown as Promise<Browser>,
  };
  beforeAll(async () => {
    harness.directory = await mkdtemp(join(tmpdir(), "erp-trade-gui-"));
    harness.webRoot = join(harness.directory, "web");
    await mkdir(artifacts, { recursive: true });
    const launchStarted = performance.now();
    log?.("step", { step: "launch", phase: "start" });
    harness.launching = chromium
      .launch({ headless: true, channel: process.env.ERP_E2E_BROWSER_CHANNEL })
      .then((launched) => {
        harness.browser = launched;
        log?.("step", { step: "launch", phase: "end" });
        if (log) launched.on("disconnected", () => log("browser-disconnected"));
        phase("browser", launchStarted);
        return launched;
      });
    harness.launching.catch(
      log
        ? (error) => log("step", { step: "launch", phase: "error", error: String(error) })
        : () => {},
    );
    const started = performance.now();
    await timed(log, "build", () =>
      build({
        root: join(root, "packages/web"),
        configFile: join(root, "packages/web/vite.config.ts"),
        logLevel: "error",
        build: { outDir: harness.webRoot },
      }),
    );
    phase("build", started);
  }, 60_000);
  afterAll(async () => {
    try {
      await timed(log, "afterAll:launching", () => harness.launching?.catch(() => undefined));
      const started = performance.now();
      await timed(log, "afterAll:browser.close", () => harness.browser?.close());
      phase("browser-close", started);
    } finally {
      if (harness.directory)
        await timed(log, "afterAll:rm", () =>
          rm(harness.directory, { recursive: true, force: true }),
        );
    }
  });
  return harness;
}

async function provisionServer(
  harness: { directory: string; webRoot: string },
  servers: Server[],
  phase: Phase,
  file: string,
  prefix: string,
) {
  const filename = join(harness.directory, `${file}.sqlite`);
  let started = performance.now();
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
  phase(`${prefix}database`, started);
  started = performance.now();
  const server: Server = { executor: await SqliteExecutor.create({ filename }) };
  servers.push(server);
  server.api = await createApi({
    ...server.executor.services(),
    webRoot: harness.webRoot,
    allowPortZero: true,
    environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
  });
  phase(`${prefix}api`, started);
  return await server.api.listen();
}

async function closeAll(context: BrowserContext | undefined, servers: Server[]) {
  // Explicit context close also disposes the Node request pool used by route.fetch().
  const closed = [await Promise.allSettled([context?.close()])].flat();
  closed.push(
    ...(await Promise.allSettled(
      servers.map(async ({ executor, api }) => {
        try {
          await api?.close();
        } finally {
          await executor.close();
        }
      }),
    )),
  );
  for (const result of closed) if (result.status === "rejected") throw result.reason;
}

async function openTracedPage(
  launching: Promise<Browser>,
  phase: Phase,
  created: (context: BrowserContext) => void,
  log: Diagnostic | undefined,
  name: string,
) {
  const launched = await launching;
  let started = performance.now();
  const context = await launched.newContext({ viewport: { width: 1440, height: 1100 } });
  created(context);
  phase("context", started);
  started = performance.now();
  // Keystroke, network and source evidence without DOM snapshots; written only on failure.
  await context.tracing.start({ screenshots: false, snapshots: false, sources: true });
  phase("tracing", started);
  started = performance.now();
  const page = await context.newPage();
  if (log) watchRequests(page, log, { test: name });
  phase("page", started);
  return { context, page };
}

// The trace is kept only for a failure (CI uploads artifacts only then). Main path screenshots
// stay on success as the local UI evidence; smoke screens are written only on failure.
async function finishTrace(
  context: BrowserContext,
  page: Page,
  name: string,
  failed: boolean,
  screenshot = failed,
) {
  if (screenshot)
    await page.screenshot({ path: join(artifacts, `${name}-last.png`), fullPage: true });
  await context.tracing.stop(failed ? { path: join(artifacts, `${name}-trace.zip`) } : undefined);
}

export function tradeGuiScenario(language: "zh" | "en", theme: "red" | "green", part: 1 | 2) {
  const phase = (name: string, started: number) =>
    guiPhase(`${language}/${theme}/${part}`, name, started);
  const log = diagnostics(`${language}-${theme}-part${part}`);
  const harness = guiHarness(phase, log);

  test(`real trade GUI: ${language}/${theme}, keyboard main path and safe confirmation branches (part ${part}/2: ${parts[part]})`, async ({
    onTestFinished,
  }) => {
    const name = `${language}-${theme}-part${part}`;
    const servers: Server[] = [];
    let context: BrowserContext | undefined;
    log?.("test", { test: name, phase: "start" });
    onTestFinished(async () => {
      const started = performance.now();
      await timed(log, "onTestFinished:closeAll", () => closeAll(context, servers), { test: name });
      phase("resources", started);
    });
    const opening = openTracedPage(
      harness.launching,
      phase,
      (created) => {
        context = created;
      },
      log,
      name,
    );
    const provision = (file: string, prefix: string) =>
      provisionServer(harness, servers, phase, file, prefix);
    const serving = (async () => {
      const address = await provision(name, "");
      if (part === 1) return { address, seeded: undefined };
      const started = performance.now();
      const seeded = await seedPartOne(httpSend(address), freshIds());
      phase("seed", started);
      return { address, seeded };
    })();
    // Part 1's replay target: a second, untouched server built the same way, ready by the time
    // the GUI path finishes.
    const replaying = part === 1 ? provision(`${name}-replay`, "replay-") : Promise.resolve("");
    // Wait for all sides so a failure on one never leaves another creating resources.
    const [opened, served, replayed] = await Promise.allSettled([opening, serving, replaying]);
    if (opened.status === "rejected") throw opened.reason;
    if (served.status === "rejected") throw served.reason;
    if (replayed.status === "rejected") throw replayed.reason;
    const { page, context: traced } = opened.value;
    const { address, seeded } = served.value;
    const replayAddress = replayed.value;
    const interactionStarted = performance.now();
    const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
      label(language, key);
    const button = (key: Parameters<typeof t>[0]) =>
      page.getByRole("button", { name: t(key), exact: true });
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
    const recorded: Recorded[] = [];
    let loseNextResult = false;
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const entry: Recorded | undefined =
        request.method() === "GET"
          ? undefined
          : { method: request.method(), path: path + url.search, body: request.postDataJSON() };
      if (entry) recorded.push(entry);
      if (entry && request.method() === "POST" && path.endsWith("/preview")) {
        // Pass the real server response through unchanged, keeping it for the comparison.
        const response = await route.fetch();
        entry.preview = response.ok() ? await response.json() : response.status();
        await route.fulfill({ response });
        return;
      }
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
    async function navigate(path: NavigatePath) {
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
      await page.waitForFunction(targetPageShown, navigateTitle(language, path));
      await page.locator("main h2").waitFor();
      if (log) log("navigated", { test: name, path, ...(await pageState(page)) });
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
    // The purchase order the AP invoice matches, entered on the order page by keyboard. Side
    // (AP), rounding (line), prices excluding tax, discount 0 and the order date (the page's
    // local today under the fixed clock) stay at their defaults; the replay asserts all of them.
    async function purchaseOrder(orderId = "PO-DEMO") {
      const o = (key: TradeOrderKey, params?: Record<string, string>) =>
        orderLabel(language, key, params);
      // Product and tax code offer a datalist, so they are comboboxes.
      const line = (key: TradeOrderKey, role: "textbox" | "combobox" = "textbox") =>
        page.getByRole(role, { name: `${o(key)} L1`, exact: true });
      await navigate("trade-orders");
      expect(await page.locator("#tord-side").inputValue()).toBe("AP");
      expect(await page.locator("#tord-orderDate").inputValue()).toBe("2026-01-20");
      await type(page, page.locator("#tord-orderId"), orderId);
      await type(page, page.locator("#tord-party"), "PARTY");
      await type(page, line("tord.product", "combobox"), "EXPENSE");
      await type(page, line("tord.taxCode", "combobox"), "VAT");
      await type(page, line("tord.quantity"), "10");
      await type(page, line("tord.unitPrice"), "10");
      const saving = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/v1/trade/orders" &&
          response.request().method() === "POST",
      );
      await activate(page, page.getByRole("button", { name: o("tord.save"), exact: true }));
      const response = await saving;
      const saved = await response.json();
      expect(response.status(), JSON.stringify(saved)).toBe(201);
      expect(saved).toMatchObject({
        orderId,
        side: "AP",
        party: "PARTY",
        lines: [{ lineId: "L1", net: 10000, tax: 1300, gross: 11300 }],
      });
      await page
        .getByRole("status")
        .filter({ hasText: o("tord.saved", { orderId }) })
        .waitFor();
      // Only the server's amounts are shown; the page computes no tax itself.
      const amounts = page.getByRole("table", {
        name: `${o("tord.lines")} ${orderId}`,
        exact: true,
      });
      const money = (minor: number) => formatMinor(minor, language);
      for (const row of [amounts.locator("tbody tr").first(), amounts.locator("tr.tord-total")])
        expect(
          (await row.locator("td").allTextContents()).slice(-3).map((text) => text.trim()),
        ).toEqual([money(10000), money(1300), money(11300)]);
      expect(failures).toEqual([]);
    }
    // TINV-02: the order detail's invoiced / not-invoiced quantities and its Invoice entry, which
    // opens the invoice page with a draft carried in from the order (TINV-01 `fromOrder`).
    const ordered = (key: TradeOrderKey) => orderLabel(language, key);
    async function orderQuantities(orderId: string) {
      const detail = page.getByRole("table", {
        name: `${ordered("tord.lines")} ${orderId}`,
        exact: true,
      });
      const cells = async () =>
        (await detail.locator("tbody tr").first().locator("td").allTextContents())
          .slice(4, 7)
          .map((text) => text.trim());
      await expect
        .poll(async () => (await cells()).includes("\u2026"), {
          message: "Invoiced quantities must load",
          timeout: 10_000,
        })
        .toBe(false);
      return await cells();
    }
    async function openOrder(orderId: string) {
      await navigate("trade-orders");
      const list = page.getByRole("table", { name: ordered("tord.list"), exact: true });
      await activate(page, list.getByRole("button", { name: orderId, exact: true }));
      await page.getByRole("region", { name: ordered("tord.lookupTitle"), exact: true }).waitFor();
    }
    async function invoiceFromOrder(
      orderId: string,
      external: string,
      gross: number,
      quantity?: string,
    ) {
      await activate(page, page.getByRole("link", { name: ordered("tord.invoice"), exact: true }));
      await page.waitForURL((url) => url.hash.startsWith("#/trade-invoices"));
      await expect.poll(() => page.locator("#tinv-orderId").inputValue()).toBe(orderId);
      expect(new URL(page.url()).hash).not.toContain("fromOrder=");
      // TINV-01: focus lands on the first header field the user must fill.
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.id))
        .toBe("tinv-externalInvoice");
      await type(page, page.locator("#tinv-externalInvoice"), external);
      // The draft holds only the order's uninvoiced lines, renumbered from L1 (TINV-01).
      if (quantity)
        await type(
          page,
          page.getByRole("textbox", { name: `${t("tinv.quantity")} L1`, exact: true }),
          quantity,
        );
      const preview = await post("tinv.preview", "/api/v1/trade/invoices/preview");
      expect(preview.poMatch).toBe("matched");
      expect(preview.calculation.gross).toBe(gross);
      // The confirm body is the receipt (top-level gross), not the preview's calculation.
      const receipt = await post("tinv.confirm", "/api/v1/trade/invoices");
      expect(receipt).toMatchObject({ poMatch: "matched", gross });
      return receipt;
    }
    async function orderToInvoice() {
      const orderId = "PO-FROM";
      await purchaseOrder(orderId);
      expect(await orderQuantities(orderId)).toEqual(["10", "0", "10"]);
      // First invoice covers only part of the order; the second takes the rest.
      await invoiceFromOrder(orderId, "AP-FROM-1", 4520, "4");
      await openOrder(orderId);
      expect(await orderQuantities(orderId)).toEqual(["10", "4", "6"]);
      await invoiceFromOrder(orderId, "AP-FROM-2", 6780);
      await openOrder(orderId);
      const [quantity, invoiced, remaining] = await orderQuantities(orderId);
      expect([quantity, invoiced]).toEqual(["10", "10"]);
      expect(remaining).toContain(ordered("tord.fullyInvoicedBadge"));
      const entry = page.getByRole("button", { name: ordered("tord.invoice"), exact: true });
      expect(await entry.isDisabled()).toBe(true);
      const reason = page.getByText(ordered("tord.fullyInvoiced"), { exact: true });
      expect(await entry.getAttribute("aria-describedby")).toBe(await reason.getAttribute("id"));
      expect(
        await page.getByRole("link", { name: ordered("tord.invoice"), exact: true }).count(),
      ).toBe(0);
      expect(failures).toEqual([]);
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
          "L1",
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
    let failed = true;
    try {
      await page.goto(address);
      await choose(page, page.locator("#workspace-language"), language);
      await choose(page, page.locator("#workspace-theme"), theme);
      if (part === 1) await setUp();
      else await followUp();
      expect(await page.locator(".workspace").getAttribute("data-theme")).toBe(theme);
      expect(await page.locator("html").getAttribute("lang")).toBe(language);
      expect(failures).toEqual([]);
      failed = false;
    } finally {
      await finishTrace(traced, page, name, failed, true);
      log?.("test", { test: name, phase: "end", failed });
      phase("interaction", interactionStarted);
    }
    async function setUp() {
      await navigate("period-close");
      let poll = 0;
      await timed(
        log,
        "choose:#close-month",
        () =>
          choose(
            page,
            page.locator("#close-month"),
            "2026-01",
            expect,
            log &&
              (async (values) => {
                log("poll", {
                  test: name,
                  poll: poll++,
                  values,
                  ...(await pageState(page, "#close-month")),
                });
              }),
          ),
        { test: name },
      );
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
      await purchaseOrder();
      await invoice("AP", "AP-DEMO", true);
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
      const replay = await seedPartOne(httpSend(replayAddress), generatedIds(recorded));
      expect(linkFingerprints(recorded)).toEqual(linkFingerprints(replay.recorded));
    }
    async function followUp() {
      if (!seeded) throw new Error("Part 2 requires the replayed part 1 state");
      linkFingerprints(seeded.recorded);
      const { ap } = seeded;
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
      // The cleared related revision is valid for an original AP invoice, so the only accepted
      // reason is the applied-invoice rule on the source item, not a shape or revision check.
      const rejection = await rejected;
      expect(rejection.status()).toBe(400);
      expect(await rejection.json()).toMatchObject({
        code: "INVALID_REQUEST",
        fieldErrors: [{ path: "itemId", messageKey: "api.error.tradeDocument.reference" }],
      });
      await page
        .getByRole("alert")
        .filter({ hasText: "itemId: api.error.tradeDocument.reference" })
        .waitFor();
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
      // After the report totals above, so the new AP invoices do not change them.
      await orderToInvoice();
      await sourceOrders();
      await leaveByBack(
        "trade-invoices",
        "#tinv-party",
        t("trade.leaveConfirm"),
        t("tinv.title"),
        2,
        () => page.getByRole("textbox", { name: `${t("tinv.product")} L1`, exact: true }).waitFor(),
      );
      await leaveByBack(
        "trade-orders",
        "#tord-party",
        ordered("tord.leaveConfirm"),
        ordered("tord.title"),
        1,
      );
    }
    // TINV-04: the invoice list's source order column links each invoice to its order detail,
    // purchase (PO-DEMO, seeded) and sales (SO-DEMO, seeded here); AR-DEMO has none ("—").
    async function sourceOrders() {
      await seedSourceOrders(httpSend(address));
      // The GUI caches lists until it writes itself (staleTime: Infinity); load the HTTP writes.
      await page.reload();
      const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
      const row = (external: string) => list.locator("tbody tr").filter({ hasText: external });
      for (const [external, orderId] of [
        ["AP-DEMO", "PO-DEMO"],
        ["AR-FROM-SO", "SO-DEMO"],
      ] as const) {
        await navigate("trade-invoices");
        const link = row(external).getByRole("link", { name: orderId, exact: true });
        await link.waitFor();
        if (orderId === "PO-DEMO") {
          const none = row("AR-DEMO").locator("td.tinv-source");
          expect(await none.locator("a").count()).toBe(0);
          expect(await none.locator('[aria-hidden="true"]').textContent()).toBe("—");
          expect(await none.locator(".visually-hidden").textContent()).toBe(
            t("tinv.noSourceOrder"),
          );
          await page.screenshot({ path: join(artifacts, `${name}-invoice-list.png`) });
          await page.setViewportSize({ width: 390, height: 1100 });
          // The 60-character order ID wraps inside its cell: full text shown (not clipped by
          // the 3-line clamp), the row keeps the virtual list's 44 px, the cell stays bounded.
          const long = row("AR-LONG-SO").getByRole("link", { name: longOrderId, exact: true });
          await long.scrollIntoViewIfNeeded();
          // Lines are counted from the laid-out text (a clamped line is still laid out, just
          // hidden), and the last character must sit inside the link's visible box (1 px slack
          // beyond the half-leading: a 12 px glyph box is taller than the 13 px line box, so its
          // rect overhangs the line by (rect height - 13) / 2 even when nothing is clipped; a 4th
          // line would overhang by a further 13 px). scrollHeight is not used.
          const box = await long.evaluate((element) => {
            const cell = element.closest("td") as HTMLElement;
            const text = element.firstChild as Text;
            const all = document.createRange();
            all.selectNodeContents(text);
            const rects = [...all.getClientRects()].filter((rect) => rect.width > 0);
            const last = document.createRange();
            last.setStart(text, text.length - 1);
            last.setEnd(text, text.length);
            const glyph = last.getBoundingClientRect();
            const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
            const halfLeading = Math.max(0, (glyph.height - lineHeight) / 2);
            return {
              lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
              overhang: glyph.bottom - element.getBoundingClientRect().bottom - halfLeading,
              row: (cell.parentElement as HTMLElement).getBoundingClientRect().height,
              cell: cell.getBoundingClientRect().width,
              title: element.getAttribute("title"),
            };
          });
          expect(box).toMatchObject({ row: 44, title: longOrderId });
          expect(box.lines).toBeGreaterThanOrEqual(1);
          expect(box.lines).toBeLessThanOrEqual(3);
          expect(box.overhang).toBeLessThanOrEqual(1);
          expect(box.cell).toBeLessThanOrEqual(240);
          // The wide column scrolls inside the table, never the page.
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
          ).toBeLessThanOrEqual(0);
          await page.screenshot({ path: join(artifacts, `${name}-invoice-list-390.png`) });
          await page.setViewportSize({ width: 1440, height: 1100 });
        }
        expect(await link.getAttribute("href")).toBe(
          `#/trade-orders?company=DEFAULT&order=${orderId}`,
        );
        await activate(page, link);
        await page.waitForURL(
          (url) => url.hash === `#/trade-orders?company=DEFAULT&order=${orderId}`,
        );
        await page
          .getByRole("table", { name: `${ordered("tord.lines")} ${orderId}`, exact: true })
          .waitFor();
      }
      expect(failures).toEqual([]);
    }
    // TINV-04 acceptance 5a: a real Back from a dirty draft asks exactly once; a cancel keeps the
    // address, the title and the draft; a confirmed Back reaches the previous page. The invoice
    // page cancels twice; the order page (same leave-guard-history.ts gate) cancels once.
    async function leaveByBack(
      path: "trade-invoices" | "trade-orders",
      field: string,
      message: string,
      title: string,
      cancels: number,
      kept?: () => Promise<unknown>,
    ) {
      await navigate("trade-reports");
      await navigate(path);
      await type(page, page.locator(field), "PARTY-BACK");
      let dialogs = 0;
      let accept = false;
      const answer = async (dialog: import("playwright").Dialog) => {
        dialogs += 1;
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe(message);
        await (accept ? dialog.accept() : dialog.dismiss());
      };
      page.on("dialog", answer);
      const back = async (count: number) => {
        // A cancelled same-document traversal may never settle as a navigation.
        await page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
        await expect.poll(() => dialogs, { timeout: 10_000 }).toBe(count);
        await page.waitForTimeout(300);
        expect(dialogs).toBe(count);
      };
      try {
        for (let count = 1; count <= cancels; count += 1) {
          await back(count);
          expect(new URL(page.url()).hash).toBe(`#/${path}`);
          await page.getByRole("heading", { name: title, exact: true }).waitFor();
          expect(await page.locator(field).inputValue()).toBe("PARTY-BACK");
          await kept?.();
        }
        accept = true;
        await back(cancels + 1);
        await page.waitForURL((url) => url.hash === "#/trade-reports");
        await page.waitForFunction(targetPageShown, navigateTitle(language, "trade-reports"));
      } finally {
        page.off("dialog", answer);
      }
      expect(failures).toEqual([]);
    }
  }, 180_000);
}

// Each page's own list query (first load must succeed) and the seeded rows it renders from it.
// Titles, lang and theme render even when the data request fails, so they prove nothing alone.
type Label = (key: string) => string;
const tradePages: readonly {
  path: string;
  title: string;
  request: (url: URL) => boolean;
  loaded: (t: Label) => string;
  // Read-only keyboard step that makes the page show its loaded rows.
  reveal?: (page: Page, check: ExpectStatic) => Promise<void>;
}[] = [
  {
    path: "trade",
    title: "trade.title",
    request: (url) => url.pathname === "/api/v1/trade/tradeParty",
    loaded: (t) => `main table[aria-label="${t("trade.tradeParty")}"] tbody tr`,
  },
  {
    path: "trade-invoices",
    title: "tinv.title",
    request: (url) => url.pathname === "/api/v1/trade/invoices",
    loaded: (t) => `main table[aria-label="${t("tinv.list")}"] tbody tr`,
  },
  {
    path: "trade-settlements",
    title: "tset.title",
    request: (url) =>
      url.pathname === "/api/v1/trade/open-items" && url.searchParams.get("status") === "open",
    loaded: (t) => `main table[aria-label="${t("tset.select")}"] tbody tr`,
  },
  {
    path: "trade-adjustments",
    title: "tadj.title",
    request: (url) =>
      url.pathname === "/api/v1/trade/open-items" && !url.searchParams.has("status"),
    loaded: () => `#tadj-sourceId option:not([value=""])`,
    // The default action (advance) lists no items; cancel lists the open items read-only.
    reveal: (page, check) => choose(page, page.locator("#tadj-kind"), "cancel", check),
  },
  {
    path: "trade-reports",
    title: "trpt.title",
    request: (url) => url.pathname === "/api/v1/trade/reports/open-items",
    loaded: () => "main table tbody tr",
  },
  {
    path: "period-close",
    title: "close.title",
    request: (url) => url.pathname === "/api/v1/periods",
    loaded: () => "#close-month option",
  },
];

// Text the other language would show but this one must not: label values (and the literal
// parts of templates) that differ between the two dictionaries.
function foreignLabels(language: "zh" | "en") {
  const own = resources[language] as Record<string, string>;
  const other = resources[language === "zh" ? "en" : "zh"] as Record<string, string>;
  const ownValues = new Set(Object.values(own));
  const foreign = new Set<string>();
  for (const [key, value] of Object.entries(other)) {
    if (value === own[key]) continue;
    for (const part of value.split(/\{[^{}]+\}/u)) {
      const text = part.trim();
      if (/\p{L}{2}/u.test(text) && !ownValues.has(text)) foreign.add(text);
    }
  }
  return [...foreign];
}

// Page-level smoke for every language/theme combination: each trade page loads from the
// real build and API with the selected `lang` and `data-theme`, shows its translated title and
// renders no text that is hard-coded or leaked from the other language (in zh: no lowercase Latin
// word the dictionary and data do not use). The keyboard main path
// itself runs in full for zh/red and en/green only (trade-gui-<combo>-{1,2}.slow.test.ts).
export function tradeGuiSmoke(combinations: readonly (readonly ["zh" | "en", "red" | "green"])[]) {
  const phase = (name: string, started: number) => guiPhase("smoke", name, started);
  const log = diagnostics("smoke");
  const harness = guiHarness(phase, log);
  const servers: Server[] = [];
  let address = "";
  let data: string[] = [];
  beforeAll(async () => {
    address = await provisionServer(harness, servers, phase, "smoke", "");
    const started = performance.now();
    // Read-only browsing over the same state part 1 creates, so lists and reports have rows.
    await seedPartOne(httpSend(address), freshIds());
    // User data is not UI text: the initialized company name is deliberately bilingual.
    const companies = (await (await fetch(new URL("/api/v1/companies?limit=100", address))).json())
      .items as { name: string }[];
    // Seeded parties, items and memos are named `Fictional <code>`.
    data = [...companies.map((company) => company.name), "Fictional"];
    expect(data.length).toBeGreaterThan(0);
    phase("seed", started);
  }, 60_000);
  afterAll(async () => {
    await timed(log, "afterAll:closeAll", () => closeAll(undefined, servers));
  });

  // Combinations are independent (own context, read-only browsing), so they run concurrently.
  for (const [language, theme] of combinations)
    test.concurrent(`real trade GUI smoke: ${language}/${theme}, every trade page loads its data translated with lang and data-theme`, async ({
      onTestFinished,
      expect,
    }) => {
      const name = `smoke-${language}-${theme}`;
      let context: BrowserContext | undefined;
      log?.("test", { test: name, phase: "start" });
      onTestFinished(async () => {
        await timed(log, "onTestFinished:context.close", () => context?.close(), { test: name });
      });
      const { page } = await openTracedPage(
        harness.launching,
        phase,
        (created) => {
          context = created;
        },
        log,
        name,
      );
      const started = performance.now();
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      let pending = 0;
      page.on("request", (request) => {
        if (request.url().includes("/api/")) pending++;
      });
      const settled = (request: { url(): string }) => {
        if (request.url().includes("/api/")) pending--;
      };
      page.on("requestfinished", settled);
      page.on("requestfailed", settled);
      // Any failed API call fails the smoke, even one the page would later retry successfully.
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400)
          failures.push(`${response.status()} ${response.url()}`);
      });
      page.on("requestfailed", (request) => {
        if (request.url().includes("/api/") && request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push(`${request.failure()?.errorText} ${request.url()}`);
      });
      const t = (key: string) => label(language, key);
      const foreign = foreignLabels(language);
      let failed = true;
      try {
        await page.goto(address);
        await choose(page, page.locator("#workspace-language"), language, expect);
        await choose(page, page.locator("#workspace-theme"), theme, expect);
        for (const { path, title, request, loaded, reveal } of tradePages) {
          const listed = page.waitForResponse((response) => request(new URL(response.url())), {
            timeout: 10_000,
          });
          await page.goto(`${address}#/${path}`);
          await page.waitForURL((url) => url.hash === `#/${path}`);
          expect((await listed).status(), `${path} list request`).toBe(200);
          await expect
            .poll(() => page.locator("main h2").first().textContent(), {
              message: `${path} title`,
              timeout: 10_000,
              intervals: [20],
            })
            .toBe(t(title));
          await reveal?.(page, expect);
          await expect
            .poll(() => page.locator(loaded(t)).count(), {
              message: `${path} seeded rows loaded`,
              timeout: 10_000,
              intervals: [20],
            })
            .toBeGreaterThan(0);
          await expect
            .poll(() => pending, {
              message: `${path} API requests settle`,
              timeout: 10_000,
              intervals: [20],
            })
            .toBe(0);
          expect(await page.locator("html").getAttribute("lang"), path).toBe(language);
          expect(await page.locator(".workspace").getAttribute("data-theme"), path).toBe(theme);
          const alerts = await page
            .locator("[role=alert], .message-bar.danger, .message-bar.warning")
            .filter({ visible: true })
            .allTextContents();
          expect(alerts, `${path} error alerts`).toEqual([]);
          expect(failures, `${path} API or page errors`).toEqual([]);
          const leaked = await page.evaluate(
            ({ foreign, english, own, latin }) => {
              const texts: string[] = [];
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const parent = node.parentElement;
                if (!parent || parent.closest("script, style, [hidden]")) continue;
                if (!parent.closest("option") && parent.getClientRects().length === 0) continue;
                texts.push(node.textContent ?? "");
              }
              for (const element of document.body.querySelectorAll(
                "[placeholder], [aria-label], [title], [alt]",
              ))
                for (const name of ["placeholder", "aria-label", "title", "alt"])
                  texts.push(element.getAttribute(name) ?? "");
              return [
                ...new Set(
                  texts
                    .map((text) => text.trim())
                    .filter(
                      (text) =>
                        text &&
                        !own.includes(text) &&
                        ((english && /\p{Script=Han}/u.test(text)) ||
                          (!english &&
                            (text.match(/[A-Za-z]{3,}/gu) ?? []).some(
                              (word) => word !== word.toUpperCase() && !latin.includes(word),
                            )) ||
                          foreign.some(
                            (value) =>
                              text === value || (value.length >= 12 && text.includes(value)),
                          )),
                    ),
                ),
              ];
            },
            {
              foreign,
              english: language === "en",
              own: [...Object.values(resources[language]), ...data],
              // Latin words the zh dictionary or user data itself uses; all-caps words are codes.
              latin: [
                ...new Set(
                  [...Object.values(resources[language]), ...data]
                    .join(" ")
                    .match(/[A-Za-z]{3,}/gu) ?? [],
                ),
              ],
            },
          );
          expect(leaked, `${language} ${path}: hard-coded or other-language text`).toEqual([]);
        }
        expect(failures).toEqual([]);
        failed = false;
      } finally {
        if (context) await finishTrace(context, page, name, failed);
        log?.("test", { test: name, phase: "end", failed });
        phase(`${language}/${theme}`, started);
      }
    }, 60_000);
}

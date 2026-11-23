import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { BrowserContext } from "playwright";
import type { TradeOrderInvoicingStatus } from "@erp/core/domain";
import { label } from "../../../web/src/ui/index.ts";
import { orderLabel, type TradeOrderKey } from "../../../web/src/ui/trade-order-labels.ts";
import {
  detailLabel,
  type TradeInvoiceDetailKey,
} from "../../../web/src/ui/trade-invoice-detail-labels.ts";
import { formatMinor } from "../../../web/src/reports-data.ts";
import { navigateTitle, targetPageShown, type NavigatePath } from "./navigate-ready.ts";
import { detailBack, invoiceLinks, type InvoiceLinkContext } from "./trade-gui-invoice-links.ts";
import { diagnostics, guiPhase, pageState, timed } from "./trade-gui/diagnostics.ts";
import {
  type Server,
  closeAll,
  finishTrace,
  guiHarness,
  openTracedPage,
  provisionServer,
} from "./trade-gui/harness.ts";
import { activate, checked, choose, tabTo, type } from "./trade-gui/keyboard.ts";
import { artifacts } from "./trade-gui/paths.ts";
import {
  type Recorded,
  freshIds,
  generatedIds,
  httpSend,
  linkFingerprints,
  longOrderId,
  seedPartOne,
  seedSourceOrders,
} from "./trade-gui/seed.ts";

// Public names of the split modules, re-exported one by one so the slow tests keep importing here.
export type { Diagnostic } from "./trade-gui/diagnostics.ts";
export { diagnostics, guiPhase, timed } from "./trade-gui/diagnostics.ts";
export { tabTo } from "./trade-gui/keyboard.ts";
export { longOrderId, seedSourceOrders } from "./trade-gui/seed.ts";
export { tradeGuiSmoke } from "./trade-gui/smoke.ts";

const parts = {
  1: "period admission, trade configuration, matched AP invoice and payment",
  2: "advance, AR credit and cancellations, open-item reports, invoicing an order in two steps",
} as const;

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
    const detailed = (key: TradeInvoiceDetailKey) => detailLabel(language, key);
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
    // TORD-06 (B8) helpers. The order-list filter form is the one holding the invoicing select.
    const orderFilterForm = () =>
      page.locator("form").filter({ has: page.locator("#tord-filter-invoicing") });
    // The filter is component state, so staying on the route keeps it: clear it and wait for a row
    // the filter had hidden.
    async function clearOrderFilters(visibleOrderId: string) {
      await activate(
        page,
        orderFilterForm().getByRole("button", { name: ordered("tord.filterClear"), exact: true }),
      );
      await page
        .getByRole("table", { name: ordered("tord.list"), exact: true })
        .getByRole("button", { name: visibleOrderId, exact: true })
        .waitFor();
    }
    async function applyInvoicingFilter(status: TradeOrderInvoicingStatus) {
      await choose(page, page.locator("#tord-filter-invoicing"), status);
      const response = page.waitForResponse((item) => {
        const url = new URL(item.url());
        return (
          url.pathname === "/api/v1/trade/orders" &&
          url.searchParams.get("invoicing") === status &&
          item.request().method() === "GET"
        );
      });
      await activate(
        page,
        orderFilterForm().getByRole("button", { name: ordered("tord.filterApply"), exact: true }),
      );
      expect((await response).status()).toBe(200);
    }
    /** Listed rows as { orderId, badge }, the badge without its aria-hidden tone symbol. */
    const listedOrderBadges = () =>
      page.locator("table.tord-list tbody tr").evaluateAll((items) =>
        items.map((row) => {
          const badge = row.querySelector("td.tord-invoicing .badge")?.cloneNode(true) as
            | Element
            | undefined;
          for (const mark of badge?.querySelectorAll('[aria-hidden="true"]') ?? []) mark.remove();
          return {
            orderId: row.querySelector("td button")?.textContent ?? "",
            badge: badge?.textContent?.trim() ?? "",
          };
        }),
      );
    async function expectInvoicingFiltered(status: TradeOrderInvoicingStatus, expected: string[]) {
      await expect
        .poll(async () => (await listedOrderBadges()).map((row) => row.orderId).sort(), {
          message: `Orders filtered by invoicing=${status}`,
          timeout: 10_000,
        })
        .toEqual(expected);
      if (expected.length === 0) {
        await page
          .locator("p.empty-state")
          .filter({ hasText: ordered("tord.listNoMatch") })
          .waitFor();
        return;
      }
      const label = ordered(`tord.invoicing.${status}`);
      const shown = (await listedOrderBadges()).sort((a, b) => a.orderId.localeCompare(b.orderId));
      expect(shown).toEqual(expected.map((orderId) => ({ orderId, badge: label })));
    }
    // TORD-06 (B8): the invoicing filter follows posting and cancellation. PO-STATUS is invoiced in
    // part, then in full; cancelling the second invoice brings it back to partial. PO-NONE is
    // never invoiced. Runs after orderToInvoice(): PO-DEMO and PO-FROM are then fully invoiced.
    // Every filtered row's badge shows the filtered status; the address never changes.
    async function orderInvoicingFilter() {
      await purchaseOrder("PO-NONE");
      await purchaseOrder("PO-STATUS");
      expect(await orderQuantities("PO-STATUS")).toEqual(["10", "0", "10"]);
      await invoiceFromOrder("PO-STATUS", "AP-STATUS-1", 4520, "4");
      let stage = 0;
      const listed = async (status: TradeOrderInvoicingStatus, expected: string[]) => {
        stage += 1;
        await navigate("trade-orders");
        const hash = new URL(page.url()).hash;
        await applyInvoicingFilter(status);
        await expectInvoicingFiltered(status, expected);
        expect(new URL(page.url()).hash).toBe(hash);
        await page.screenshot({
          path: join(artifacts, `${name}-order-invoicing-${stage}-${status}.png`),
        });
      };
      await listed("partial", ["PO-STATUS"]);
      await listed("none", ["PO-NONE"]);
      await clearOrderFilters("PO-STATUS");
      await openOrder("PO-STATUS");
      expect(await orderQuantities("PO-STATUS")).toEqual(["10", "4", "6"]);
      const second = await invoiceFromOrder("PO-STATUS", "AP-STATUS-2", 6780);
      await listed("full", ["PO-DEMO", "PO-FROM", "PO-STATUS"]);
      await listed("partial", []);
      await navigate("trade-adjustments");
      await action("cancel", {
        "tadj.source": second.documentId,
        "tadj.reason": "Fictional second invoice cancelled",
      });
      await listed("full", ["PO-DEMO", "PO-FROM"]);
      await listed("partial", ["PO-STATUS"]);
      await listed("none", ["PO-NONE"]);
      await clearOrderFilters("PO-DEMO");
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
    // GATE-01: the invoice page's per-company draft keys in sessionStorage. Declared before the
    // run below, which calls the leave steps that read them.
    const draftPrefix = "erp.tradeInvoices.v1.";
    const drafts = () =>
      page.evaluate(
        (prefix) => Object.keys(sessionStorage).filter((key) => key.startsWith(prefix)).length,
        draftPrefix,
      );
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
      await orderInvoicingFilter();
      await sourceOrders();
      await invoiceFilters();
      await invoiceDetail();
      const invoiceLinkContext: InvoiceLinkContext = {
        page,
        language,
        name,
        address,
        artifacts,
        failures,
        draftPrefix,
        t,
        detailed,
        navigate,
        keys: { tabTo, type, choose, activate },
      };
      await detailBack(invoiceLinkContext);
      await invoiceLinks(invoiceLinkContext);
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
      const invoiceLeave = {
        path: "trade-invoices",
        field: "#tinv-party",
        message: t("trade.leaveConfirm"),
        title: t("tinv.title"),
      } as const;
      const orderLeave = {
        path: "trade-orders",
        field: "#tord-party",
        message: ordered("tord.leaveConfirm"),
        title: ordered("tord.title"),
      } as const;
      await leaveOnFirstKey(invoiceLeave);
      await leaveOnFirstKey(orderLeave);
      await leaveByForward(invoiceLeave);
      await leaveByForward(orderLeave);
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
          await listGeometry(`${name}-invoice-list-geometry.json`);
          // TINV-05 (D323): row height and title measured at 1440. The 240 px bound applies only
          // at 390 (below, unchanged): at 1440 the auto-layout table hands spare width to columns.
          const wide = await sourceCell(row("AR-LONG-SO"));
          console.log(`[tinv05] ${name} 1440 source cell ${JSON.stringify(wide)}`);
          expect(wide).toMatchObject({ row: 44, title: longOrderId });
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
          await listGeometry(`${name}-invoice-list-geometry-390.json`);
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
    // TINV-05 (D323): the list's column geometry (x relative to the table, width) and row heights,
    // logged and written next to the screenshot so the runner compares base and head (±1 px).
    async function listGeometry(file: string) {
      const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
      const geometry = await list.evaluate((table) => {
        const left = table.getBoundingClientRect().left;
        return {
          viewport: window.innerWidth,
          table: table.getBoundingClientRect().width,
          columns: [...table.querySelectorAll("thead th")].map((th) => {
            const rect = th.getBoundingClientRect();
            return { text: th.textContent, x: rect.left - left, width: rect.width };
          }),
          rows: [...table.querySelectorAll("tbody tr")].map(
            (tr) => tr.getBoundingClientRect().height,
          ),
        };
      });
      console.log(`[geometry] ${file} ${JSON.stringify(geometry)}`);
      appendFileSync(join(artifacts, file), `${JSON.stringify(geometry)}\n`);
    }
    // The source order cell of an invoice row: the row's laid-out height, the cell's width and the
    // link's title (the full order ID).
    async function sourceCell(target: import("playwright").Locator) {
      const link = target.locator("td.tinv-source a");
      await link.scrollIntoViewIfNeeded();
      return link.evaluate((element) => {
        const cell = element.closest("td") as HTMLElement;
        return {
          row: (cell.parentElement as HTMLElement).getBoundingClientRect().height,
          cell: cell.getBoundingClientRect().width,
          title: element.getAttribute("title"),
        };
      });
    }
    // TINV-05: the filter bar narrows the list by keyboard (Apply button and Enter) with teaching
    // explanations on and off; TINV-07: each applied filter is written to the address by replace
    // (no history entry) and nothing asks to leave. At 390 px the bar wraps inside the page. Ends
    // unfiltered at 1440 with teaching restored.
    async function invoiceFilters() {
      await navigate("trade-invoices");
      const length = await page.evaluate(() => window.history.length);
      const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
      const bar = page.getByRole("search", { name: t("tinv.filter"), exact: true });
      const row = (external: string) =>
        list.locator("tbody tr").filter({ hasText: external }).first();
      const teaching = page.locator("#workspace-teaching");
      const party = page.locator("#tinv-filter-party");
      const initial = await teaching.isChecked();
      let dialogs = 0;
      const count = async (dialog: import("playwright").Dialog) => {
        dialogs += 1;
        await dialog.dismiss();
      };
      const filtered = (query: string) =>
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/v1/trade/invoices" && url.search.includes(query);
        });
      const addressed = async (filters: Record<string, string>) => {
        await page.waitForTimeout(300);
        const [path, query = ""] = new URL(page.url()).hash.split("?");
        expect(path).toBe("#/trade-invoices");
        expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
          company: "DEFAULT",
          ...filters,
        });
        expect(await page.evaluate(() => window.history.length)).toBe(length);
        expect(dialogs).toBe(0);
      };
      page.on("dialog", count);
      try {
        for (const on of [initial, !initial]) {
          if ((await teaching.isChecked()) !== on) {
            await tabTo(page, teaching);
            await page.keyboard.press("Space");
          }
          await expect.poll(() => teaching.isChecked()).toBe(on);
          await bar.waitFor();
          await row("AP-DEMO").waitFor();
          const mode = on ? "teaching" : "plain";
          // The unfiltered source cell on this page, compared with the filtered one at 1440.
          const unfiltered = await sourceCell(row("AR-LONG-SO"));
          // Direction AR through the Apply button: the AP invoice leaves, the AR ones stay.
          await choose(page, page.locator("#tinv-filter-side"), "AR");
          const ar = filtered("side=AR");
          await activate(page, bar.getByRole("button", { name: t("tinv.filter.apply") }));
          expect((await ar).status()).toBe(200);
          await expect.poll(() => row("AP-DEMO").count()).toBe(0);
          await row("AR-DEMO").waitFor();
          await row("AR-FROM-SO").waitFor();
          await addressed({ side: "AR" });
          // With the bar applied the source order column keeps the TINV-04 row height; at 1440 its
          // width equals the unfiltered one, at 390 it keeps the 240 px bound (D323).
          const filtered1440 = await sourceCell(row("AR-LONG-SO"));
          console.log(
            `[tinv05] ${name} ${mode} 1440 source cell unfiltered ${JSON.stringify(unfiltered)} filtered ${JSON.stringify(filtered1440)}`,
          );
          expect(filtered1440).toMatchObject({ row: 44, title: longOrderId });
          expect(filtered1440.cell).toBe(unfiltered.cell);
          await page.screenshot({ path: join(artifacts, `${name}-invoice-filter-${mode}.png`) });
          await page.setViewportSize({ width: 390, height: 1100 });
          const filtered390 = await sourceCell(row("AR-LONG-SO"));
          console.log(
            `[tinv05] ${name} ${mode} 390 source cell filtered ${JSON.stringify(filtered390)}`,
          );
          expect(filtered390).toMatchObject({ row: 44, title: longOrderId });
          expect(filtered390.cell).toBeLessThanOrEqual(240);
          await bar.scrollIntoViewIfNeeded();
          const layout = await bar.evaluate((element) => {
            const items = [...element.children].map((child) => child.getBoundingClientRect());
            return {
              rows: new Set(items.map((rect) => Math.round(rect.top))).size,
              right: Math.max(...items.map((rect) => rect.right)),
              width: window.innerWidth,
              overflow: document.documentElement.scrollWidth - window.innerWidth,
            };
          });
          expect(layout.rows).toBeGreaterThan(1);
          expect(layout.right).toBeLessThanOrEqual(layout.width);
          expect(layout.overflow).toBeLessThanOrEqual(0);
          await page.screenshot({
            path: join(artifacts, `${name}-invoice-filter-${mode}-390.png`),
          });
          // A party with no invoices through Enter in the field: the filtered empty state.
          await tabTo(page, party);
          await page.keyboard.press("ControlOrMeta+A");
          await page.keyboard.insertText("NOPARTY");
          const none = filtered("party=NOPARTY");
          await page.keyboard.press("Enter");
          expect((await none).status()).toBe(200);
          await page
            .locator("p.empty-state")
            .filter({ hasText: t("tinv.filter.none") })
            .waitFor();
          await addressed({ party: "NOPARTY", side: "AR" });
          await page.setViewportSize({ width: 1440, height: 1100 });
          await activate(page, bar.getByRole("button", { name: t("tinv.filter.clear") }));
          await row("AP-DEMO").waitFor();
          expect(await party.inputValue()).toBe("");
          expect(await page.locator("#tinv-filter-side").inputValue()).toBe("");
          await addressed({});
        }
        if ((await teaching.isChecked()) !== initial) {
          await tabTo(page, teaching);
          await page.keyboard.press("Space");
        }
        await expect.poll(() => teaching.isChecked()).toBe(initial);
      } finally {
        page.off("dialog", count);
      }
      expect(dialogs).toBe(0);
      expect(failures).toEqual([]);
    }
    // TINV-06: the external invoice number opens a read-only detail dialog (Enter and Space), at
    // 1440 and 390. The list's scroll position, the history length, the draft and the column
    // widths are equal before and after; TINV-07: the address carries `invoice=` while open and
    // only `company=` after; nothing asks to leave; focus returns to the row's button; each open
    // sends exactly one GET /invoices/:id. AP-DEMO amounts come from seedInvoice / seedSettlement
    // and the part 2 advance apply (remaining 36.50 = the open-items report above).
    async function invoiceDetail() {
      await navigate("trade-invoices");
      const list = page.getByRole("table", { name: t("tinv.list"), exact: true });
      const scroller = page.locator("section.tinv-list-scroll");
      const trigger = list.getByRole("button", {
        name: `${detailed("tinv.detail.open")} AP-DEMO`,
        exact: true,
      });
      const dialog = page.getByRole("dialog", {
        name: `${detailed("tinv.detail.title")} · AP-DEMO`,
        exact: true,
      });
      const money = (minor: number) => formatMinor(minor, language);
      let dialogs = 0;
      const count = async (event: import("playwright").Dialog) => {
        dialogs += 1;
        await event.dismiss();
      };
      let details = 0;
      const detailRequest = (request: import("playwright").Request) => {
        const url = new URL(request.url());
        if (
          request.method() === "GET" &&
          /^\/api\/v1\/trade\/invoices\/[0-9a-f-]{36}$/.test(url.pathname)
        )
          details += 1;
      };
      const snapshot = () =>
        Promise.all([
          scroller.evaluate((element) => element.scrollTop),
          page.evaluate(() => window.history.length),
          page.evaluate(
            (prefix) =>
              JSON.stringify(
                Object.keys(sessionStorage)
                  .filter((key) => key.startsWith(prefix))
                  .sort()
                  .map((key) => [key, sessionStorage.getItem(key)]),
              ),
            draftPrefix,
          ),
          list.evaluate((table) =>
            [...table.querySelectorAll("thead th")].map((th) => th.getBoundingClientRect().width),
          ),
        ]);
      const focused = () => trigger.evaluate((element) => element === document.activeElement);
      async function open(key: "Enter" | "Space", width: number) {
        const before = await snapshot();
        const sent = details;
        await tabTo(page, trigger);
        await page.keyboard.press(key);
        await dialog.waitFor();
        await dialog.getByRole("table", { name: t("tinv.lines"), exact: true }).waitFor();
        expect(details - sent).toBe(1);
        // TINV-07: the open invoice is in the address (replaced, not pushed).
        expect(new URL(page.url()).hash).toMatch(
          /^#\/trade-invoices\?company=DEFAULT&invoice=[0-9a-f-]{36}$/,
        );
        const headers = await dialog
          .getByRole("table", { name: t("tinv.lines"), exact: true })
          .locator("thead th")
          .allTextContents();
        expect(headers).toEqual([
          detailed("tinv.detail.lineNo"),
          t("tinv.product"),
          t("tinv.quantity"),
          t("tinv.unitPrice"),
          t("tinv.discountPercent"),
          t("tinv.net"),
          t("tinv.tax"),
          t("tinv.gross"),
          detailed("tinv.detail.matchStatus"),
        ]);
        const totals = dialog.getByRole("region", {
          name: detailed("tinv.detail.totals"),
          exact: true,
        });
        expect(await totals.locator("dd").allTextContents()).toEqual([
          money(10000),
          money(1300),
          money(11300),
        ]);
        const remaining = dialog.getByRole("region", {
          name: detailed("tinv.detail.openItem"),
          exact: true,
        });
        expect(await remaining.locator("dd").last().textContent()).toBe(money(3650));
        const settled = dialog.getByRole("table", {
          name: detailed("tinv.detail.settlements"),
          exact: true,
        });
        expect(await settled.locator("tbody tr").first().locator("td").nth(2).textContent()).toBe(
          money(5650),
        );
        const geometry = await dialog.evaluate((element) => ({
          page: document.documentElement.scrollWidth - window.innerWidth,
          dialog: element.getBoundingClientRect().width,
          // The dialog itself never scrolls sideways: wide tables scroll inside their own wrap.
          overflow: element.scrollWidth - element.clientWidth,
          viewport: window.innerWidth,
          lines: (() => {
            const wrap = element.querySelector(".tinv-detail-lines") as HTMLElement;
            return {
              scroll: wrap.scrollWidth,
              client: wrap.clientWidth,
              width: wrap.getBoundingClientRect().width,
            };
          })(),
        }));
        console.log(`[tinv06] ${name} ${width} ${key} ${JSON.stringify(geometry)}`);
        appendFileSync(
          join(artifacts, `${name}-invoice-detail-geometry.json`),
          `${JSON.stringify({ width, key, ...geometry })}\n`,
        );
        expect(geometry.page).toBeLessThanOrEqual(0);
        expect(geometry.dialog).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.overflow).toBeLessThanOrEqual(0);
        expect(geometry.lines.width).toBeLessThanOrEqual(geometry.dialog);
        if (width === 1440)
          expect(geometry.lines.scroll).toBeLessThanOrEqual(geometry.lines.client);
        return before;
      }
      async function closed(before: Awaited<ReturnType<typeof snapshot>>) {
        await dialog.waitFor({ state: "detached" });
        await expect.poll(focused).toBe(true);
        expect(await snapshot()).toEqual(before);
        expect(new URL(page.url()).hash).toBe("#/trade-invoices?company=DEFAULT");
      }
      page.on("dialog", count);
      page.on("request", detailRequest);
      try {
        await trigger.waitFor();
        // Enter opens, Esc closes.
        let before = await open("Enter", 1440);
        await page.screenshot({ path: join(artifacts, `${name}-invoice-detail.png`) });
        await page.keyboard.press("Escape");
        await closed(before);
        // Space opens, the dialog's own Close button closes.
        before = await open("Space", 1440);
        await activate(
          page,
          dialog.getByRole("button", { name: detailed("tinv.detail.close"), exact: true }),
        );
        await closed(before);
        await page.setViewportSize({ width: 390, height: 1100 });
        try {
          before = await open("Enter", 390);
          await page.screenshot({ path: join(artifacts, `${name}-invoice-detail-390.png`) });
          // Review D356: the lines' scroll region is a Tab stop inside the modal, and the
          // keyboard scrolls it until the last column is in view; focus never leaves the dialog.
          const region = dialog.getByRole("region", { name: t("tinv.lines"), exact: true });
          const onRegion = () => region.evaluate((element) => element === document.activeElement);
          for (let count = 0; count < 8 && !(await onRegion()); count++) {
            await page.keyboard.press("Tab");
            expect(
              await dialog.evaluate((element) => element.contains(document.activeElement)),
            ).toBe(true);
          }
          expect(await onRegion()).toBe(true);
          // D360/D363: each ArrowRight may start a smooth-scroll animation (headless Chromium on
          // CI), and rapid presses cancel each other. After every press settle() waits until
          // scrollLeft is unchanged for 3 animation frames ("stable") or a wall-clock cap runs out
          // while it is still moving / rAF never fires ("timeout", fails at once). Stop pressing at
          // the end or when a stable press made no progress; the final poll decides. The whole
          // phase has a 10 s budget: worst case ≈ 10 s, since the deadline is checked before every
          // press and every settle cap / the poll timeout is clipped to the remaining budget.
          const budget = 10_000;
          const deadline = Date.now() + budget;
          const remaining = () => deadline - Date.now();
          const geometry = () =>
            region.evaluate((element) => ({
              scrollLeft: element.scrollLeft,
              max: element.scrollWidth - element.clientWidth,
            }));
          const settle = (cap: number) =>
            region.evaluate(
              (element, limit) =>
                new Promise<"stable" | "timeout">((resolve) => {
                  let last = element.scrollLeft;
                  let same = 0;
                  let done = false;
                  const finish = (result: "stable" | "timeout") => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    resolve(result);
                  };
                  const timer = setTimeout(() => finish("timeout"), limit);
                  const tick = () => {
                    if (done) return;
                    const now = element.scrollLeft;
                    same = now === last ? same + 1 : 0;
                    last = now;
                    if (same >= 3) finish("stable");
                    else requestAnimationFrame(tick);
                  };
                  requestAnimationFrame(tick);
                }),
              Math.max(0, Math.min(1000, cap)),
            );
          let presses = 0;
          const fail = async (reason: string) => {
            expect.unreachable(
              `390 keyboard scroll ${reason}: ${JSON.stringify({ ...(await geometry()), presses, budget })}`,
            );
          };
          if ((await settle(remaining())) === "timeout")
            await fail("did not settle before the first ArrowRight");
          let { scrollLeft: position, max } = await geometry();
          const pressLimit = Math.ceil(max / 40) + 5;
          while (position < max - 1 && presses < pressLimit) {
            if (remaining() <= 0) await fail("exceeded the 10 s budget");
            await page.keyboard.press("ArrowRight");
            presses++;
            if ((await settle(remaining())) === "timeout")
              await fail("still moving after the settle cap");
            const next = await geometry();
            if (next.scrollLeft === position) break;
            position = next.scrollLeft;
            max = next.max;
          }
          if (remaining() <= 0) await fail("exceeded the 10 s budget");
          await expect
            .poll(
              () =>
                region.evaluate(
                  (element) => element.scrollWidth - element.clientWidth - element.scrollLeft,
                ),
              { timeout: remaining() },
            )
            .toBeLessThanOrEqual(1);
          const scrolled = await region.evaluate((element) => {
            const wrap = element.getBoundingClientRect();
            const last = (
              element.querySelector("thead th:last-child") as HTMLElement
            ).getBoundingClientRect();
            return {
              scrollLeft: element.scrollLeft,
              max: element.scrollWidth - element.clientWidth,
              wrap: [wrap.left, wrap.right],
              lastColumn: [last.left, last.right],
              focused: element === document.activeElement,
              inDialog: (element.closest("dialog") as HTMLElement).contains(document.activeElement),
            };
          });
          console.log(
            `[tinv06] ${name} 390 keyboard scroll ${JSON.stringify({ ...scrolled, presses })}`,
          );
          appendFileSync(
            join(artifacts, `${name}-invoice-detail-geometry.json`),
            `${JSON.stringify({ width: 390, keyboardScroll: { ...scrolled, presses } })}\n`,
          );
          expect(scrolled.max).toBeGreaterThan(0);
          expect(scrolled.scrollLeft).toBeGreaterThanOrEqual(scrolled.max - 1);
          expect(scrolled.lastColumn[0]).toBeGreaterThanOrEqual(scrolled.wrap[0] - 1);
          expect(scrolled.lastColumn[1]).toBeLessThanOrEqual(scrolled.wrap[1] + 1);
          expect(scrolled.focused).toBe(true);
          expect(scrolled.inDialog).toBe(true);
          await page.screenshot({
            path: join(artifacts, `${name}-invoice-detail-390-scrolled.png`),
          });
          await page.keyboard.press("Escape");
          await closed(before);
        } finally {
          await page.setViewportSize({ width: 1440, height: 1100 });
        }
      } finally {
        page.off("dialog", count);
        page.off("request", detailRequest);
      }
      expect(details).toBe(3);
      expect(dialogs).toBe(0);
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
    // GATE-01 acceptance 4b/4c. Each branch starts clean (cleanStart): on #/trade-reports with
    // neither guarded page mounted, no invoice draft in sessionStorage (the invoice page restores a
    // dirty draft per company) and no confirmation counted. Every dialog is counted; until a branch
    // registers its cancel/accept answer, a dialog is dismissed and still counted, so an
    // unexpected confirmation fails the count.
    type Leave = {
      path: "trade-invoices" | "trade-orders";
      field: string;
      message: string;
      title: string;
    };
    async function leaveBranches(
      leave: Leave,
      branch: (
        accept: boolean,
        confirmed: (count: number) => Promise<void>,
        register: () => void,
      ) => Promise<void>,
    ) {
      let dialogs = 0;
      let leaving = false;
      let registered: "dismiss" | "accept" | undefined;
      const watch = async (dialog: import("playwright").Dialog) => {
        expect(dialog.type()).toBe("confirm");
        if (leaving) {
          await dialog.accept();
          return;
        }
        dialogs += 1;
        expect(dialog.message()).toBe(leave.message);
        await (registered === "accept" ? dialog.accept() : dialog.dismiss());
      };
      // The cumulative count of this branch, settled: a second confirmation would arrive late.
      const confirmed = async (count: number) => {
        await expect.poll(() => dialogs, { timeout: 10_000 }).toBe(count);
        await page.waitForTimeout(300);
        expect(dialogs).toBe(count);
      };
      page.on("dialog", watch);
      try {
        for (const accept of [false, true]) {
          // cleanStart(path), 1: a branch left on a dirty page leaves it accepting; not counted.
          if (new URL(page.url()).hash !== "#/trade-reports") {
            leaving = true;
            await navigate("trade-reports");
            leaving = false;
          }
          dialogs = 0;
          registered = undefined;
          // 2: drop the invoice drafts while the invoice page is not mounted.
          await page.evaluate((prefix) => {
            for (const key of Object.keys(sessionStorage))
              if (key.startsWith(prefix)) sessionStorage.removeItem(key);
          }, draftPrefix);
          expect(await drafts()).toBe(0);
          // 3: enter the page clean, before any answer is registered or any key is pressed.
          await navigate(leave.path);
          await page.locator(leave.field).waitFor();
          expect(await page.locator(leave.field).inputValue()).toBe("");
          expect(await drafts()).toBe(0);
          await confirmed(0);
          await branch(accept, confirmed, () => {
            registered = accept ? "accept" : "dismiss";
          });
          registered = undefined;
        }
      } finally {
        page.off("dialog", watch);
      }
      expect(failures).toEqual([]);
    }
    // After a leaving traversal: one confirmation, then either the page kept as it was (cancel) or
    // the reports page reached (accept).
    async function settledLeave(
      leave: Leave,
      accept: boolean,
      confirmed: (count: number) => Promise<void>,
      value: string,
    ) {
      await confirmed(1);
      if (accept) {
        await page.waitForURL((url) => url.hash === "#/trade-reports");
        await page.waitForFunction(targetPageShown, navigateTitle(language, "trade-reports"));
        return;
      }
      expect(new URL(page.url()).hash).toBe(`#/${leave.path}`);
      await page.getByRole("heading", { name: leave.title, exact: true }).waitFor();
      expect(await page.locator(leave.field).inputValue()).toBe(value);
    }
    // 4b (D280 + D282): Back right after the first key that makes the draft dirty still asks.
    async function leaveOnFirstKey(leave: Leave) {
      await leaveBranches(leave, async (accept, confirmed, register) => {
        register();
        await tabTo(page, page.locator(leave.field));
        await page.keyboard.press("K");
        // A cancelled same-document traversal may never settle as a navigation.
        await page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
        await settledLeave(leave, accept, confirmed, "K");
      });
    }
    // 4c: a real Forward from a dirty draft asks once. Each branch rebuilds its own history: a
    // cancel drops the entries ahead (D275).
    async function leaveByForward(leave: Leave) {
      await leaveBranches(leave, async (accept, confirmed, register) => {
        await navigate("trade-reports");
        await confirmed(0);
        // Unguarded (the page is clean); the hash is asserted by waitForURL below.
        await page.goBack({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
        await page.waitForURL((url) => url.hash === `#/${leave.path}`);
        await page.waitForFunction(targetPageShown, navigateTitle(language, leave.path));
        await page.locator(leave.field).waitFor();
        await confirmed(0);
        expect(await page.locator(leave.field).inputValue()).toBe("");
        expect(await drafts()).toBe(0);
        register();
        await type(page, page.locator(leave.field), "PARTY-FORWARD");
        await page.goForward({ waitUntil: "commit", timeout: 2_000 }).catch(() => null);
        await settledLeave(leave, accept, confirmed, "PARTY-FORWARD");
      });
    }
  }, 180_000);
}

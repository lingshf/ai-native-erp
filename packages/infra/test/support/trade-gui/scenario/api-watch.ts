// What the scenario observes in the browser: durable confirmation readback in sessionStorage, and
// every API request the page sends.
import type { Page, Route } from "playwright";
import type { Recorded } from "../seed.ts";

/** Observe actual persistence and byte-for-byte readback before any confirmation. */
export async function watchStorageReadback(page: Page) {
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
}

/**
 * Records every non-GET API request (with real preview responses) and checks that each financial
 * POST was read back from storage and explicitly confirmed. `loseNextResult` makes the next
 * financial POST persist on the server while the page sees a network failure.
 */
export async function watchTradeApi(page: Page, failures: string[]) {
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
      await checkConfirmed(page, request.postDataJSON(), path, failures);
      envelopes.push(request.postData() ?? "");
      if (loseNextResult) {
        loseNextResult = false;
        await loseResult(route, failures);
        return;
      }
    }
    await route.continue();
  });
  return {
    envelopes,
    recorded,
    loseNextResult: () => {
      loseNextResult = true;
    },
  };
}

// The server persists the POST; the page sees a network failure instead of the result.
async function loseResult(route: Route, failures: string[]) {
  const persisted = await route.fetch();
  if (persisted.status() !== 201) failures.push(`Lost-result setup failed: ${persisted.status()}`);
  await route.abort("failed");
}

// Each financial POST must match a pending command read back from storage, and carry the explicit confirmation.
async function checkConfirmed(
  page: Page,
  body: { command: unknown; fingerprint: string; idempotencyKey: string; confirmation: string },
  path: string,
  failures: string[],
) {
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
}

export type TradeApi = Awaited<ReturnType<typeof watchTradeApi>>;

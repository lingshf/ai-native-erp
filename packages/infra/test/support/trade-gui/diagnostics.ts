// FLAKE-02 diagnostics log, timed steps, phase timings and request watching.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { artifacts } from "./paths.ts";

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
): Promise<Awaited<T>> {
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
export async function pageState(page: Page, selector?: string) {
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
export function watchRequests(page: Page, log: Diagnostic, data: Record<string, unknown>) {
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

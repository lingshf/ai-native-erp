import type { Page } from "playwright";

export type PageTraffic = {
  // Page errors and failed API calls seen so far.
  failures: string[];
  // API requests started but not yet finished or failed.
  pending: () => number;
};

// Registers the page's error and API listeners; call before the first navigation.
export function watchPageTraffic(page: Page): PageTraffic {
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
  return { failures, pending: () => pending };
}

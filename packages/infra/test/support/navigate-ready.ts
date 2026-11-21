import { label } from "../../../web/src/ui/index.ts";
import { orderLabel } from "../../../web/src/ui/trade-order-labels.ts";

// FLAKE-03: the hash changes before the lazy target page renders, so "some `main h2` exists"
// can still be the previous page's title. Ready means the first `main h2` is the target's own.
// Runs inside the page (Playwright serializes it), so it only uses the DOM.
export function targetPageShown(title: string) {
  return document.querySelector("main h2")?.textContent === title;
}

export const navigateTitles = {
  trade: "trade.title",
  "trade-orders": "tord.title",
  "trade-invoices": "tinv.title",
  "trade-settlements": "tset.title",
  "trade-adjustments": "tadj.title",
  "trade-reports": "trpt.title",
  "period-close": "close.title",
} as const;
export type NavigatePath = keyof typeof navigateTitles;

export function navigateTitle(language: "zh" | "en", path: NavigatePath) {
  const key = navigateTitles[path];
  return key === "tord.title" ? orderLabel(language, key) : label(language, key);
}
